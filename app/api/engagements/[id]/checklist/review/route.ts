import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { checklistStateForViewer, reviewChecklistItem } from '@/db/repositories/engagements';
import { notifyEngagementEvent } from '@/lib/email/notify-engagement-event';
import { approveBoardResolution } from '@/db/repositories/board-resolution';
import { MANAGER_APPROVAL_STEP_ID } from '@/lib/incorporation/pre-inc-direct-flow';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  itemId: z.string().trim().min(1),
  action: z.enum(['accept', 'reject']),
  note: z.string().trim().max(2000).nullable().optional(),
});

/** POST /api/engagements/:id/checklist/review — manager/admin accept/reject submission. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  // The board resolution: Accept is "Approve and send to client" (the same
  // function as the step's own button); Reject is "Send back" and needs a note.
  if (body.data.itemId === MANAGER_APPROVAL_STEP_ID) {
    return reviewBoardResolution(guard.ctx, id, body.data.action, body.data.note ?? null);
  }

  try {
    const checklistState = await reviewChecklistItem(
      guard.ctx,
      id,
      body.data.itemId,
      body.data.action,
      body.data.note,
    );
    const email = await notifyEngagementEventSoon({
      engagementId: id,
      itemId: body.data.itemId,
      event: body.data.action === 'accept' ? 'review_accepted' : 'review_rejected',
      note: body.data.note,
      actorUserId: guard.ctx.userId,
      outlookCtx: guard.ctx,
    });

    // Accepting also hands the step to the client, so they are told it is their
    // turn. Separate from `review_accepted`, which is the team's own record of
    // the decision. A failure here must not fail the review that already
    // committed, so it is reported alongside rather than thrown.
    let clientApprovalEmail: Awaited<ReturnType<typeof notifyEngagementEvent>> | null = null;
    if (body.data.action === 'accept') {
      clientApprovalEmail = await notifyEngagementEventSoon({
        engagementId: id,
        itemId: body.data.itemId,
        event: 'step_awaiting_client_approval',
        actorUserId: guard.ctx.userId,
        outlookCtx: guard.ctx,
      }).catch(() => null);
    }

    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      email,
      clientApprovalEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'review_failed';
    if (message === 'step_has_no_approval') {
      return NextResponse.json(
        { error: 'The client and the project lead submit this step directly. There is nothing to approve.' },
        { status: 409 },
      );
    }
    const status =
      message.includes('may not review') ? 403
      : message.includes('not found') || message.includes('not permitted') ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

async function reviewBoardResolution(
  ctx: Parameters<typeof reviewChecklistItem>[0],
  engagementId: string,
  action: 'accept' | 'reject',
  note: string | null,
) {
  try {
    if (action === 'accept') {
      const { checklistState, firstApproval } = await approveBoardResolution(ctx, engagementId);
      const email = await notifyEngagementEventSoon({
        engagementId,
        itemId: MANAGER_APPROVAL_STEP_ID,
        event: 'board_resolution_shared',
        actorUserId: ctx.userId,
        skipInAppNotifications: !firstApproval,
      });
      return NextResponse.json({ checklistState: checklistStateForViewer(ctx, checklistState), email });
    }
    if (!note?.trim()) {
      return NextResponse.json({ error: 'Add a note so the project lead knows what to change.' }, { status: 400 });
    }
    const checklistState = await reviewChecklistItem(ctx, engagementId, MANAGER_APPROVAL_STEP_ID, 'reject', note);
    // Sent back to the lead only: the client never hears about a draft.
    const email = await notifyEngagementEventSoon({
      engagementId,
      itemId: MANAGER_APPROVAL_STEP_ID,
      event: 'review_rejected',
      note,
      actorUserId: ctx.userId,
    });
    return NextResponse.json({ checklistState: checklistStateForViewer(ctx, checklistState), email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'review_failed';
    if (message === 'board_resolution_not_pending') {
      return NextResponse.json(
        { error: 'The project lead has not sent the board resolution for approval.' },
        { status: 409 },
      );
    }
    const status =
      message.includes('Only the project') ? 403
      : message.includes('not found') || message.includes('not permitted') ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
