import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { getMeeting } from '@/db/repositories/board-meetings';
import { remindNonResponders } from '@/lib/board-meetings/send';
import { meetingError, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/remind — email the directors who have not replied. Staff. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    const meeting = await getMeeting(guard.ctx, id);
    if (!meeting.can.remind) return NextResponse.json({ error: 'not_sent' }, { status: 409 });
    const sent = await remindNonResponders(id, meeting.replies.filter((r) => r.reply).map((r) => r.directorId));
    return NextResponse.json({ sent });
  } catch (e) {
    return meetingError(e);
  }
}
