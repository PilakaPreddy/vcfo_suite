import { publicErrorMessage } from '@/lib/api-error';
import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  checklistStateForViewer,
  decideClientFillRequest,
  requestClientFill,
} from '@/db/repositories/engagements';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  itemId: z.string().trim().min(1),
  action: z.enum(['request', 'approve', 'decline']),
  note: z.string().trim().max(2000).optional(),
});

/**
 * POST /api/engagements/:id/checklist/client-fill
 *
 * `request` — project lead asks the client to fill a step. Managers get an
 * approval email; the client is told nothing yet.
 * `approve` — manager sends the ask to the client from their own mailbox.
 * `decline` — manager turns it down; only the lead hears about it.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const { itemId, action, note } = body.data;

  try {
    if (action === 'request') {
      const { checklistState, request: fillRequest } = await requestClientFill(
        guard.ctx,
        id,
        itemId,
        note,
      );
      const email = await notifyEngagementEventSoon({
        engagementId: id,
        itemId,
        event: 'client_fill_requested',
        note: fillRequest.note,
        actorUserId: guard.ctx.userId,
        outlookCtx: guard.ctx,
      });
      return NextResponse.json({
        checklistState: checklistStateForViewer(guard.ctx, checklistState),
        request: fillRequest,
        email,
      });
    }

    const decision = action === 'approve' ? 'approve' : 'decline';
    const { checklistState, request: fillRequest } = await decideClientFillRequest(
      guard.ctx,
      id,
      itemId,
      decision,
      note,
    );
    const email = await notifyEngagementEventSoon({
      engagementId: id,
      itemId,
      event: decision === 'approve' ? 'client_fill_approved' : 'client_fill_declined',
      // Approved mail carries the lead's ask; a decline carries the manager's reason.
      note: decision === 'approve' ? fillRequest.note : fillRequest.decisionNote,
      actorUserId: guard.ctx.userId,
      outlookCtx: guard.ctx,
    });
    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      request: fillRequest,
      email,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'client_fill_failed');
    const friendly: Record<string, string> = {
      client_fill_already_pending: 'This step is already waiting on manager approval.',
      client_fill_already_with_client: 'The client has already been asked to fill this step.',
      client_fill_not_pending: 'There is no pending request on this step.',
      step_has_no_approval: 'The client and the project lead fill this step directly. There is nothing to approve.',
    };
    const status =
      message.startsWith('client_fill_already') ||
      message === 'client_fill_not_pending' ||
      message === 'step_has_no_approval'
        ? 409
        : message.includes('Only the project')
          ? 403
          : message.includes('not found') || message.includes('not permitted')
            ? 404
            : 400;
    return NextResponse.json({ error: friendly[message] ?? message }, { status });
  }
}
