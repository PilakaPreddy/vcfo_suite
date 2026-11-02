import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { approveMeeting, getMeeting, systemMeetingBundle, systemMeetingPeople } from '@/db/repositories/board-meetings';
import { sendNotice } from '@/lib/board-meetings/send';
import { meetingError, type RouteContext } from '../../_respond';

/**
 * POST /api/board-meetings/:id/approve — admin, super admin or manager approves; VCFO then
 * emails the notice (Word file, .ics, Teams link from the lead's Outlook when it can). A second
 * approval after a reschedule sends an update with the same calendar UID.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    const approved = await approveMeeting(guard.ctx, id);
    const bundle = await systemMeetingBundle(approved.id);
    const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
    const result = await sendNotice(approved.id, {
      leadId: team?.lead?.id ?? null,
      notifyIds: [team?.lead?.id, team?.manager?.id].filter((x): x is string => Boolean(x)),
      update: Boolean(approved.rescheduledFrom) || Boolean(approved.sentAt),
    });
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, id), send: result });
  } catch (e) {
    return meetingError(e);
  }
}
