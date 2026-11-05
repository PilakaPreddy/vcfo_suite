import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { assertEngagementBoardResolutionAccess } from '@/lib/api/board-resolution-access';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { markBoardResolutionSentToClient } from '@/db/repositories/board-resolution';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/engagements/:id/board-resolution/sent — "Send to client" (S-573). Staff record that
 * the finalized board resolution went to the client for signing; the email itself opens in the
 * sender's mail app. Returns `{ boardResolution }` with `sentToClientAt`.
 */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  const access = await assertEngagementBoardResolutionAccess(auth.ctx, id);
  if (access.notFound) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  if (access.forbidden || !access.row) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  try {
    const boardResolution = await markBoardResolutionSentToClient(auth.ctx, access.dbId);
    await recordAuditEvent(auth.ctx, {
      engagementId: access.dbId,
      action: 'board_resolution.sent_to_client',
      summary: 'Board resolution sent to the client for signing',
      actorEmail: auth.ctx.email,
      actorName: auth.ctx.name,
    });
    return NextResponse.json({ ok: true, boardResolution });
  } catch (err) {
    const message = publicErrorMessage(err, 'send_failed');
    const status = message.includes('not found') ? 404 : message.includes('Only staff') ? 403 : 409;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
