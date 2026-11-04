import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  checklistStateForViewer,
  submitChecklistItem,
  submitDirectFlowStep,
} from '@/db/repositories/engagements';
import { isDirectFlowStep, MANAGER_APPROVAL_STEP_ID } from '@/lib/incorporation/pre-inc-direct-flow';
import {
  BOARD_RESOLUTION_WITH_MANAGER,
  requestBoardResolutionApproval,
} from '@/db/repositories/board-resolution';
import { BoardResolutionError, boardResolutionErrorJson } from '@/lib/api/board-resolution-errors';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  itemId: z.string().trim().min(1),
  responses: z.record(z.string(), z.string()).default({}),
});

const FRIENDLY: Record<string, string> = {
  step_already_submitted: 'This step is already submitted. Ask for a change to edit it.',
  step_waiting_on_lead: 'Your project lead is finishing this step.',
  board_resolution_not_generated: 'Generate the board resolution first.',
  [BOARD_RESOLUTION_WITH_MANAGER]: BOARD_RESOLUTION_WITH_MANAGER,
};

function errorStatus(message: string): number {
  if (message.includes('Only clients') || message.includes('Only the client or the project lead')) return 403;
  if (message.includes('not found') || message.includes('not permitted')) return 404;
  if (message in FRIENDLY) return 409;
  return 400;
}

/**
 * POST /api/engagements/:id/checklist/submit
 *
 * - Pre-incorporation direct-flow step, client or project lead: the submit
 *   completes the step (or leaves it waiting on the lead's NIC codes). A field
 *   the caller can fix that is still wrong returns 422 with `fieldErrors`.
 * - Every other step: the client locks it for the firm's review, as before.
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

  const { itemId, responses } = body.data;
  const direct = isDirectFlowStep(itemId) && (guard.ctx.role === 'client' || guard.ctx.role === 'intern');

  try {
    // "Send for manager approval" on the board resolution (lead only).
    if (itemId === MANAGER_APPROVAL_STEP_ID && guard.ctx.role === 'intern') {
      try {
        const checklistState = await requestBoardResolutionApproval(guard.ctx, id);
        const email = await notifyEngagementEventSoon({
          engagementId: id,
          itemId,
          event: 'lead_requested_review',
          actorUserId: guard.ctx.userId,
          outlookCtx: guard.ctx,
        });
        return NextResponse.json({
          checklistState: checklistStateForViewer(guard.ctx, checklistState),
          outcome: 'sent_for_approval',
          email,
        });
      } catch (err) {
        if (err instanceof BoardResolutionError) {
          return NextResponse.json(boardResolutionErrorJson(err), { status: err.status });
        }
        throw err;
      }
    }

    if (direct) {
      const result = await submitDirectFlowStep(guard.ctx, id, itemId, responses);
      const checklistState = checklistStateForViewer(guard.ctx, result.checklistState);
      if (result.outcome === 'invalid') {
        return NextResponse.json(
          { error: 'validation_failed', fieldErrors: result.fieldErrors, checklistState },
          { status: 422 },
        );
      }
      // Every party hears a completed submit; a client's submit that stopped
      // on the NIC codes is the lead's news. Autosave never reaches here.
      const email = await notifyEngagementEventSoon({
        engagementId: id,
        itemId,
        event: result.outcome === 'waiting_on_lead' ? 'step_waiting_on_lead' : 'step_submitted',
        actorUserId: guard.ctx.userId,
        actorName: guard.ctx.name,
        actorRole: guard.ctx.role,
      });
      return NextResponse.json({ checklistState, outcome: result.outcome, email });
    }

    const checklistState = await submitChecklistItem(guard.ctx, id, itemId, responses);
    const email = await notifyEngagementEventSoon({
      engagementId: id,
      itemId,
      event: 'client_submitted',
      actorUserId: guard.ctx.userId,
    });
    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'submit_failed';
    return NextResponse.json({ error: FRIENDLY[message] ?? message }, { status: errorStatus(message) });
  }
}
