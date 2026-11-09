import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { checklistStateForViewer, clientApproveStep } from '@/db/repositories/engagements';
import { notifyEngagementEvent } from '@/lib/email/notify-engagement-event';
import { openFileRequestsForStep } from '@/db/repositories/client-incorporation';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ stepId: string }> };

/**
 * POST /api/client/steps/:stepId/approve — the client signs off a step a
 * manager handed them.
 *
 * The client has exactly one engagement, so the id comes in the body rather
 * than the path, and `clientApproveStep` runs the access check: a caller naming
 * an engagement they cannot see gets "not found", never a row from another
 * firm's file. Role scoping is in the repository, not here.
 *
 * Every approval reaches the project leads and the managers. Approving the last
 * outstanding step in a phase sends ONE phase-approved email and bell row to
 * them; any other approval is a bell row ("{Step} approved"). The repository
 * stamps the completing step before returning, so a double-click, a refresh or
 * a retry finds the stamp and sends nothing; a second approve of the same step
 * is a no-op there too.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { stepId } = await context.params;

  let body: { engagementId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const engagementId = body.engagementId?.trim();
  if (!engagementId || !stepId?.trim()) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Client portal v7: a step cannot be approved while a file the firm asked
  // the client for is still missing (DECISIONS › "Approve without NOC: blocked").
  const missing = await openFileRequestsForStep(guard.ctx, engagementId, stepId.trim()).catch(() => []);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Upload ${missing[0]!.label} first.`, code: 'requested_files_missing', missing: missing.map((m) => m.id) },
      { status: 409 },
    );
  }

  try {
    const { checklistState, phaseCompleted, alreadyApproved } = await clientApproveStep(
      guard.ctx,
      engagementId,
      stepId.trim(),
    );

    let email: Awaited<ReturnType<typeof notifyEngagementEvent>> | null = null;
    if (!phaseCompleted && !alreadyApproved) {
      // The lead and the managers hear every approval, not only the last one
      // of a phase. Bell only; a send failure never reaches the client.
      email = await notifyEngagementEvent({
        engagementId,
        itemId: stepId.trim(),
        event: 'client_approved_step',
        actorUserId: guard.ctx.userId,
        actorName: guard.ctx.name,
        actorRole: guard.ctx.role,
      }).catch(() => null);
    }
    if (phaseCompleted) {
      // One email for the whole phase, to the lead and the managers. The
      // approval itself is already committed, so a send failure is reported,
      // never thrown back at the client.
      email = await notifyEngagementEventSoon({
        engagementId,
        itemId: stepId.trim(),
        event: 'phase_approved',
        requestLabel: phaseCompleted.title,
        actorUserId: guard.ctx.userId,
      }).catch(() => null);
    }

    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      phaseApproved: phaseCompleted ? { id: phaseCompleted.id, title: phaseCompleted.title } : null,
      email,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'approve_failed');
    const friendly: Record<string, string> = {
      step_not_awaiting_client_approval: 'This step is not waiting for your approval yet.',
      step_has_no_approval: 'You submit this step yourself. There is nothing to approve.',
    };
    const status =
      message === 'Only the client may approve a step'
        ? 403
        : message.includes('not found') || message.includes('not permitted')
          ? 404
          : 400;
    return NextResponse.json({ error: friendly[message] ?? message }, { status });
  }
}
