import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import {
  createClientChangeRequest,
  createClientTimelineRequest,
} from '@/db/repositories/client-change-requests';
import type { TimelinePhaseDates } from '@/lib/client/client-home';
import {
  checklistStateForViewer,
  clientRequestStepChange,
} from '@/db/repositories/engagements';
import { isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * POST /api/client/change-requests — the client asks the firm to change
 * something on a checklist step.
 *
 * Three things happen, in this order:
 *   1. the ask is recorded as a task in the delivery lead's queue
 *   2. the step moves to `change_requested` and REOPENS, reusing the existing
 *      reject/unlock mechanics so every step after it re-locks the same way a
 *      manager rejection re-locks them
 *   3. the lead and the managers are emailed with the client's own words
 *
 * Step 2 only applies to a step that is actually with the client. A note about
 * a step still in the firm's hands is recorded and mailed, but changes no
 * state — there is nothing to reopen.
 *
 * The repository runs `assertEngagementAccess`, so a request naming an
 * engagement the caller cannot see comes back 404 rather than a 403 that would
 * confirm it exists.
 */
export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let body: {
    engagementId?: string;
    stepId?: string;
    note?: string;
    kind?: 'step' | 'timeline';
    phases?: TimelinePhaseDates[];
    coiBefore?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // kind 'timeline' (client portal v7 Home › Timeline › Edit): the client asks
  // for new phase dates. Recorded as a pending request + a task for the lead;
  // the schedule changes only when the Project Manager approves it.
  if (body.kind === 'timeline') {
    if (!body.engagementId?.trim() || !body.note?.trim()) {
      return NextResponse.json({ error: 'Add a short reason so the project manager can approve it' }, { status: 400 });
    }
    try {
      const created = await createClientTimelineRequest(
        guard.ctx,
        { engagementId: body.engagementId.trim(), reason: body.note, phases: body.phases ?? [] },
        { coiTo: body.coiBefore },
      );
      if (!created) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      const email = await notifyEngagementEventSoon({
        engagementId: body.engagementId.trim(),
        itemId: 'pre-12',
        event: 'client_change_requested',
        requestLabel: 'the timeline',
        note: `Timeline change request: ${created.reason}`,
        actorUserId: guard.ctx.userId,
      }).catch(() => null);
      return NextResponse.json({ request: created, email }, { status: 201 });
    } catch (error) {
      const message = publicErrorMessage(error, 'Could not send the request');
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const { engagementId, stepId, note } = body;
  if (!engagementId?.trim() || !stepId?.trim() || !note?.trim()) {
    return NextResponse.json({ error: 'Tell us what you would like changed' }, { status: 400 });
  }

  try {
    const created = await createClientChangeRequest(guard.ctx, {
      engagementId: engagementId.trim(),
      stepId: stepId.trim(),
      note,
    });
    if (!created) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Reopen the step when it was actually with the client. A note on a step
    // the firm still holds is recorded and mailed, but reopens nothing.
    let checklistState = null;
    try {
      const reopened = await clientRequestStepChange(
        guard.ctx,
        engagementId.trim(),
        stepId.trim(),
        note,
      );
      checklistState = checklistStateForViewer(guard.ctx, reopened.checklistState);
      if (isDirectFlowStep(stepId.trim())) {
        // The client reopened a submitted step: every party hears it.
        await notifyEngagementEventSoon({
          engagementId: engagementId.trim(),
          itemId: stepId.trim(),
          event: 'step_reopened',
          actorUserId: guard.ctx.userId,
          actorName: guard.ctx.name,
          actorRole: guard.ctx.role,
        }).catch(() => null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message !== 'step_not_with_client') throw err;
    }

    // The lead did the work and the manager approved it, so both hear about it.
    const email = await notifyEngagementEventSoon({
      engagementId: engagementId.trim(),
      itemId: stepId.trim(),
      event: 'client_change_requested',
      note,
      actorUserId: guard.ctx.userId,
    }).catch(() => null);

    return NextResponse.json({ request: created, checklistState, email }, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, 'Could not send the request');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
