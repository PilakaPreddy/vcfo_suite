import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import {
  assertEngagementBoardResolutionAccess,
} from '@/lib/api/board-resolution-access';
import { requireAnyRole } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { approveBoardResolution } from '@/db/repositories/board-resolution';
import { checklistStateForViewer, toAppEngagement } from '@/db/repositories/engagements';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/engagements/:id/board-resolution/finalize — "Approve and send to
 * client". The one pre-incorporation approval: a manager or admin approves the
 * draft the project lead sent, which finalizes it and releases it to the
 * client. A lead cannot call this; they send the draft for approval instead.
 */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('admin', 'manager', 'super_admin');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id: engagementParam } = await context.params;
  const access = await assertEngagementBoardResolutionAccess(auth.ctx, engagementParam);
  if (access.notFound) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (access.forbidden || !access.row) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const engagement = toAppEngagement(access.row);

  try {
    const { boardResolution, checklistState, firstApproval } = await approveBoardResolution(
      auth.ctx,
      access.dbId,
    );

    if (firstApproval) {
      await recordAuditEvent(auth.ctx, {
        engagementId: engagement.id,
        action: 'board_resolution.finalize',
        summary: 'Board resolution approved and released to client',
        actorEmail: auth.ctx.email,
        actorName: auth.ctx.name,
      });
    }

    const email = await notifyEngagementEventSoon({
      engagementId: engagement.id,
      itemId: 'pre-2',
      event: 'board_resolution_shared',
      actorUserId: auth.ctx.userId,
      skipInAppNotifications: !firstApproval,
    });

    return NextResponse.json({
      boardResolution,
      checklistState: checklistStateForViewer(auth.ctx, checklistState),
      email,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'finalize_failed');
    if (message === 'board_resolution_not_pending') {
      return NextResponse.json(
        { ok: false, error: 'The project lead has not sent the board resolution for approval.' },
        { status: 409 },
      );
    }
    const status =
      message.includes('not found') ? 404
      : message.includes('may not') || message.includes('Only the project') ? 403
      : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
