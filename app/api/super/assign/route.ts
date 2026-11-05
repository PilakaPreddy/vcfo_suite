import { notifyTeamAssignmentsSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { internIdSchema } from '@/lib/api/engagement-schemas';
import {
  getEngagementById,
  toAppEngagement,
  updateEngagement,
} from '@/db/repositories/engagements';
import {
  ensureEngagementManager,
  removeEngagementManager,
} from '@/db/repositories/engagement-managers-membership';
import {
  addEngagementLead,
  listEngagementLeads,
  replaceEngagementLead,
} from '@/db/repositories/engagement-leads';
import { listManagerOptions, listStaffContactsByIds } from '@/db/repositories/profiles';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import type { TeamAssignmentParty, TeamRoleLabel } from '@/lib/email/notify-team-assignment';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * POST /api/super/assign — "Assign client" and "Reassign" on the super admin surface (G-20).
 *
 * Sets an engagement's project manager, its delivery lead, or both, through the same
 * repositories the admin project shell uses (`updateEngagement` with the manager membership
 * helpers, `addEngagementLead` / `replaceEngagementLead`), sends the same assignment emails,
 * and writes one audit event per change with the old and the new person (R-40), which the
 * older PATCH routes do not.
 *
 * Body: `{ engagementId, managerId?, internId? }`. Absent means "leave it".
 */
const bodySchema = z
  .object({
    engagementId: z.string().trim().min(1).max(80),
    managerId: z.string().uuid().optional(),
    internId: internIdSchema.optional(),
  })
  .refine((b) => b.managerId !== undefined || b.internId !== undefined, 'Pick a manager or a lead');

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const { ctx } = guard;
  const { engagementId, managerId, internId } = body.data;

  try {
    const before = await getEngagementById(ctx, engagementDbId(engagementId));
    if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const app = toAppEngagement(before);

    const assigned: Array<{ role: TeamRoleLabel; party: TeamAssignmentParty }> = [];
    const removed: Array<{ role: TeamRoleLabel; party: TeamAssignmentParty }> = [];
    const changed: string[] = [];

    if (managerId !== undefined && managerId !== before.managerId) {
      const managers = await listManagerOptions(ctx);
      if (!managers.some((m) => m.id === managerId)) {
        return NextResponse.json({ error: 'manager_not_found' }, { status: 400 });
      }
      const prevId = before.managerId ?? null;
      await updateEngagement(ctx, before.id, { managerId });
      if (prevId) {
        await removeEngagementManager({ engagementDbId: before.id, managerId: prevId }).catch(() => undefined);
      }
      await ensureEngagementManager({ engagementDbId: before.id, managerId, invitedBy: ctx.userId });

      const contacts = await listStaffContactsByIds(ctx, [managerId, ...(prevId ? [prevId] : [])]);
      const next = contacts.find((c) => c.id === managerId);
      const prev = prevId ? contacts.find((c) => c.id === prevId) : undefined;
      if (next) assigned.push({ role: 'project manager', party: { userId: next.id, email: next.email, name: next.name } });
      if (prev) removed.push({ role: 'project manager', party: { userId: prev.id, email: prev.email, name: prev.name } });

      await recordAuditEvent(ctx, {
        engagementId: before.id,
        action: 'engagement.assign_manager',
        summary: `${before.companyName}: manager ${prev ? `${prev.name} to ` : ''}${next?.name ?? 'set'}`,
        metadata: { field: 'managerId', old: prevId, new: managerId },
      });
      changed.push('manager');
    }

    if (internId !== undefined) {
      const leadsBefore = await listEngagementLeads(ctx, before.id);
      const primary = leadsBefore.find((l) => l.isPrimary) ?? null;
      const alreadyPrimary = primary && (primary.internId === internId || primary.profileId === internId);
      if (!alreadyPrimary) {
        const leadsAfter = primary
          ? await replaceEngagementLead(ctx, before.id, primary.internId, internId)
          : await addEngagementLead(ctx, before.id, internId);
        const next = leadsAfter.find((l) => l.isPrimary) ?? leadsAfter.find((l) => l.internId === internId || l.profileId === internId);
        if (next?.profileId && next.email) {
          assigned.push({ role: 'project lead', party: { userId: next.profileId, email: next.email, name: next.name } });
        }
        if (primary?.profileId && primary.email) {
          removed.push({ role: 'project lead', party: { userId: primary.profileId, email: primary.email, name: primary.name } });
        }
        await recordAuditEvent(ctx, {
          engagementId: before.id,
          action: 'engagement.assign_lead',
          summary: `${before.companyName}: lead ${primary ? `${primary.name} to ` : ''}${next?.name ?? internId}`,
          metadata: { field: 'internId', old: primary?.internId ?? null, new: next?.internId ?? internId },
        });
        changed.push('lead');
      }
    }

    const email =
      assigned.length + removed.length > 0
        ? await notifyTeamAssignmentsSoon({
            engagementAppId: app.id,
            engagementSlug: app.slug,
            companyName: before.companyName,
            actor: { userId: ctx.userId, name: ctx.name, email: ctx.email },
            assigned,
            removed,
          })
        : null;

    return NextResponse.json({ ok: true, changed, email });
  } catch (err) {
    const message = publicErrorMessage(err, 'assign_failed');
    const status = message.includes('not found') || message.includes('not permitted') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
