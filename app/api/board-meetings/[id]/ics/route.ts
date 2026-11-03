import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { getMeeting } from '@/db/repositories/board-meetings';
import { meetingIcs } from '@/lib/board-meetings/calendar';
import { meetingError, type RouteContext } from '../../_respond';

/** GET /api/board-meetings/:id/ics — "Add to calendar" for the meeting (same UID as the emailed invite). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    const m = await getMeeting(guard.ctx, id);
    const ics = meetingIcs(
      {
        uid: `board-meeting-${m.id}@vcfo-suite`,
        sequence: m.icsSequence,
        date: m.meetingDate,
        time: m.meetingTime,
        summary: `${m.kindLabel} · ${m.company.name}`,
        description: m.meetingNo,
        location: m.mode === 'in_person' ? m.venue : m.teamsLink ? 'Microsoft Teams' : 'Video conference',
        url: m.teamsLink,
      },
      m.status === 'cancelled' ? 'CANCEL' : 'PUBLISH',
    );
    return new Response(ics, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${m.meetingNo.replace(/[^\w-]+/g, '_')}.ics"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return meetingError(e);
  }
}
