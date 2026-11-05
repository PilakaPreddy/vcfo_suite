import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  cancelSiblingRequests,
  decideChangeRequest,
  getChangeRequest,
  reopenChangeRequest,
  type ChangeRequestKind,
} from '@/db/repositories/engagement-change-requests';
import { applyChangeRequest } from '@/lib/projects/project-change-requests';
import { isFirmWideAdmin } from '@/lib/auth';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const decideSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'cancelled']),
  note: z.string().trim().max(1000).optional(),
});

/**
 * PATCH /api/engagement-change-requests/:id — decide one request.
 *
 * `approved` APPLIES the stored payload immediately, under the admin's own
 * context, so the change can never diverge from the diff the admin reviewed.
 * If execution throws, the request is re-opened rather than left claiming a
 * change that did not happen.
 *
 * `cancelled` is the requesting manager withdrawing their own request.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('admin', 'super_admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, decideSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const existing = await getChangeRequest(guard.ctx, id);
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'already_decided' }, { status: 409 });
  }

  const isAdmin = isFirmWideAdmin(guard.ctx.role);
  if (body.data.decision !== 'cancelled' && !isAdmin) {
    return NextResponse.json({ error: 'decide_admin_only' }, { status: 403 });
  }
  if (body.data.decision === 'cancelled' && existing.requestedBy !== guard.ctx.userId) {
    return NextResponse.json({ error: 'cancel_requester_only' }, { status: 403 });
  }

  try {
    const decided = await decideChangeRequest(
      guard.ctx,
      id,
      body.data.decision,
      body.data.note,
    );
    if (!decided) {
      // Another admin (or a double-click) got there first.
      return NextResponse.json({ error: 'already_decided' }, { status: 409 });
    }

    if (body.data.decision !== 'approved') {
      return NextResponse.json({ request: decided, applied: null });
    }

    try {
      const applied = await applyChangeRequest(guard.ctx, decided);
      await cancelSiblingRequests(
        decided.engagementId,
        decided.kind as ChangeRequestKind,
        decided.id,
      ).catch(() => undefined);
      return NextResponse.json({ request: decided, applied });
    } catch (applyErr) {
      await reopenChangeRequest(id).catch(() => undefined);
      const message = applyErr instanceof Error ? applyErr.message : 'apply_failed';
      return NextResponse.json({ error: message, reopened: true }, { status: 400 });
    }
  } catch (err) {
    const message = publicErrorMessage(err, 'decide_failed');
    const status = message === 'not_permitted' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** GET /api/engagement-change-requests/:id — one request, for the decision view. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('admin', 'super_admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const row = await getChangeRequest(guard.ctx, id);
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ request: row });
}
