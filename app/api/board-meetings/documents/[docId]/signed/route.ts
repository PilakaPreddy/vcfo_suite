import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { getMeeting, systemMeetingBundle, systemMeetingPeople, uploadSigned } from '@/db/repositories/board-meetings';
import { sendFinalCopy } from '@/lib/board-meetings/send';
import { meetingError, pdfFrom, type DocContext } from '../../../_respond';

/**
 * POST /api/board-meetings/documents/:docId/signed — the signed copy (multipart `file`, PDF).
 * Locks the document (no edit, no replace) and emails the final copy to all current directors,
 * CC admin and lead. Staff.
 */
export async function POST(request: Request, context: DocContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const tooLarge = rejectLargeBody(request, 22 * 1024 * 1024);
  if (tooLarge) return tooLarge;
  const { docId } = await context.params;
  const file = await pdfFrom(request);
  if (!file) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  try {
    const { doc } = await uploadSigned(guard.ctx, docId, file);
    const bundle = await systemMeetingBundle(doc.meetingId);
    const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
    const sent = await sendFinalCopy(doc.id, {
      ccEmails: [team?.admin?.email, team?.lead?.email].filter((x): x is string => Boolean(x)),
      notifyIds: [team?.lead?.id, team?.manager?.id].filter((x): x is string => Boolean(x)),
    });
    return NextResponse.json({ sent, meeting: await getMeeting(guard.ctx, doc.meetingId) });
  } catch (e) {
    return meetingError(e);
  }
}
