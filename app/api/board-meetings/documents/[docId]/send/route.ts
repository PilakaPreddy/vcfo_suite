import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { getMeeting, markSentForSignature, systemMeetingBundle, systemMeetingPeople } from '@/db/repositories/board-meetings';
import { sendForSignature } from '@/lib/board-meetings/send';
import { meetingError, type DocContext } from '../../../_respond';

/**
 * POST /api/board-meetings/documents/:docId/send[?reminder=1] — email the MoM or resolution to
 * the signing directors (reply to the lead) and log the signature events. Staff.
 */
export async function POST(request: Request, context: DocContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { docId } = await context.params;
  const reminder = new URL(request.url).searchParams.get('reminder') === '1';
  try {
    const { doc } = await markSentForSignature(guard.ctx, docId, reminder);
    const bundle = await systemMeetingBundle(doc.meetingId);
    const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
    const sent = await sendForSignature(doc.id, { lead: team?.lead ?? { name: guard.ctx.name, email: guard.ctx.email }, reminder });
    return NextResponse.json({ sent, meeting: await getMeeting(guard.ctx, doc.meetingId) });
  } catch (e) {
    return meetingError(e);
  }
}
