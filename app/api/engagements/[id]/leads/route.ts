import { notifyTeamAssignmentSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { internIdSchema } from '@/lib/api/engagement-schemas';
import {
  addEngagementLead,
  listEngagementLeads,
  removeEngagementLead,
  replaceEngagementLead,
} from '@/db/repositories/engagement-leads';
import { getEngagementById, toAppEngagement } from '@/db/repositories/engagements';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { emptyEmailDispatch } from '@/lib/email/email-dispatch';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const addSchema = z.object({
  internId: internIdSchema,
});

const replaceSchema = z.object({
  fromInternId: internIdSchema,
  toInternId: internIdSchema,
});

const removeSchema = z.object({
  internId: internIdSchema,
});

/** GET /api/engagements/:id/leads — list delivery leads on a project. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  try {
    const leads = await listEngagementLeads(guard.ctx, id);
    return NextResponse.json({ leads });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    const status =
      message.includes('not found') || message.includes('not permitted') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/engagements/:id/leads — add a lead, or replace one.
 * Body: { internId } to add, or { fromInternId, toInternId } to replace.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const actor = {
    userId: guard.ctx.userId,
    name: guard.ctx.name,
    email: guard.ctx.email,
  };

  try {
    if ('fromInternId' in json || 'toInternId' in json) {
      const body = replaceSchema.safeParse(json);
      if (!body.success) {
        return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
      }
      const before = await listEngagementLeads(guard.ctx, id);
      const removed = before.find((l) => l.internId === body.data.fromInternId);
      const leads = await replaceEngagementLead(
        guard.ctx,
        id,
        body.data.fromInternId,
        body.data.toInternId,
      );
      const added = leads.find((l) => l.internId === body.data.toInternId);
      const row = await getEngagementById(guard.ctx, engagementDbId(id));
      const eng = row ? toAppEngagement(row) : null;
      const email = emptyEmailDispatch();
      if (eng && removed?.profileId && removed.email) {
        const part = await notifyTeamAssignmentSoon({
          engagementAppId: eng.id,
          engagementSlug: eng.slug,
          companyName: eng.companyName,
          role: 'project lead',
          party: {
            userId: removed.profileId,
            email: removed.email,
            name: removed.name,
          },
          action: 'removed',
          actor,
        });
        email.attempted += part.attempted;
        email.sent.push(...part.sent);
        email.skipped.push(...part.skipped);
        email.failed.push(...part.failed);
      }
      if (eng && added?.profileId && added.email) {
        const part = await notifyTeamAssignmentSoon({
          engagementAppId: eng.id,
          engagementSlug: eng.slug,
          companyName: eng.companyName,
          role: 'project lead',
          party: {
            userId: added.profileId,
            email: added.email,
            name: added.name,
          },
          action: 'assigned',
          actor,
        });
        email.attempted += part.attempted;
        email.sent.push(...part.sent);
        email.skipped.push(...part.skipped);
        email.failed.push(...part.failed);
      }
      return NextResponse.json({ leads, email });
    }

    const body = addSchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
    }
    const leads = await addEngagementLead(guard.ctx, id, body.data.internId);
    const added = leads.find((l) => l.internId === body.data.internId) ?? leads.at(-1);
    const row = await getEngagementById(guard.ctx, engagementDbId(id));
    const eng = row ? toAppEngagement(row) : null;
    let email = emptyEmailDispatch();
    if (eng && added?.profileId && added.email) {
      email = await notifyTeamAssignmentSoon({
        engagementAppId: eng.id,
        engagementSlug: eng.slug,
        companyName: eng.companyName,
        role: 'project lead',
        party: {
          userId: added.profileId,
          email: added.email,
          name: added.name,
        },
        action: 'assigned',
        actor,
      });
    }
    return NextResponse.json({ leads, email });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    const status =
      message.includes('not found') || message.includes('not permitted')
        ? 404
        : message.includes('Not permitted')
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/engagements/:id/leads — body { internId } removes that lead. */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, removeSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const before = await listEngagementLeads(guard.ctx, id);
    const removed = before.find((l) => l.internId === body.data.internId);
    const leads = await removeEngagementLead(guard.ctx, id, body.data.internId);
    const row = await getEngagementById(guard.ctx, engagementDbId(id));
    const eng = row ? toAppEngagement(row) : null;
    let email = emptyEmailDispatch();
    if (eng && removed?.profileId && removed.email) {
      email = await notifyTeamAssignmentSoon({
        engagementAppId: eng.id,
        engagementSlug: eng.slug,
        companyName: eng.companyName,
        role: 'project lead',
        party: {
          userId: removed.profileId,
          email: removed.email,
          name: removed.name,
        },
        action: 'removed',
        actor: {
          userId: guard.ctx.userId,
          name: guard.ctx.name,
          email: guard.ctx.email,
        },
      });
    }
    return NextResponse.json({ leads, email });
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    const status =
      message.includes('not found') || message.includes('not permitted') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
