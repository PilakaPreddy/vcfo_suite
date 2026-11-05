import { after, NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { approveMeeting, getMeeting, systemMeetingBundle, systemMeetingPeople } from '@/db/repositories/board-meetings';
import { sendNotice } from '@/lib/board-meetings/send';
import { meetingError, type RouteContext } from '../../_respond';

/**
 * POST /api/board-meetings/:id/approve — admin, super admin or manager approves; VCFO then
 * emails the notice (Word file, .ics, Teams link from the lead's Outlook when it can). A second
 * approval after a reschedule sends an update with the same calendar UID.
 *
 * The route answers as soon as the approval is saved. The Teams meeting, the Word notice and the
 * email run after the response (`after` from next/server, because Inngest cloud keys are not set
 * on App Runner); the meeting turns `sent` when they are done, and the lead, the manager and the
 * approver get a bell saying whether the email went out.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    const approved = await approveMeeting(guard.ctx, id);
    const bundle = await systemMeetingBundle(approved.id);
    const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
    const opts = {
      leadId: team?.lead?.id ?? null,
      notifyIds: [...new Set([team?.lead?.id, team?.manager?.id, guard.ctx.userId].filter((x): x is string => Boolean(x)))],
      update: Boolean(approved.rescheduledFrom) || Boolean(approved.sentAt),
    };
    after(() => sendNotice(approved.id, opts).catch((err) => console.error('[board-meetings] notice send failed', approved.id, err)));
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, id), queued: true });
  } catch (e) {
    return meetingError(e);
  }
}
