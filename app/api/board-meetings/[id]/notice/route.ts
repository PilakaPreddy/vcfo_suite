import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { getMeeting } from '@/db/repositories/board-meetings';
import { noticeDocx } from '@/lib/board-meetings/notice-docx';
import { meetingError, type RouteContext } from '../../_respond';

/** GET /api/board-meetings/:id/notice — the notice and agenda as a Word file (what the preview shows). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    const meeting = await getMeeting(guard.ctx, id);
    const file = `Notice_and_Agenda_${meeting.meetingNo.replace(/[^\w-]+/g, '_')}.docx`;
    return new Response(new Uint8Array(noticeDocx(meeting.notice)), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${file}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return meetingError(e);
  }
}
