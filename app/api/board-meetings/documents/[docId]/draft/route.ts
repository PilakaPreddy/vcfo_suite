import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { getMeeting, systemDocument } from '@/db/repositories/board-meetings';
import { resolutionDocx } from '@/lib/board-meetings/resolution';
import { meetingError, type DocContext } from '../../../_respond';

/** GET /api/board-meetings/documents/:docId/draft — a resolution as a Word file to sign. Staff. */
export async function GET(_request: Request, context: DocContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { docId } = await context.params;
  try {
    const row = await systemDocument(docId);
    if (!row || row.kind !== 'resolution') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // Access check: the meeting must be readable by this staff member.
    const meeting = await getMeeting(guard.ctx, row.meetingId);
    const signers = row.signerIds.map((id) => meeting.directors.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
    const buf = resolutionDocx({
      companyName: meeting.company.name,
      cin: meeting.company.cin,
      address: meeting.company.address,
      title: row.title,
      description: row.description,
      resolutionDate: row.resolutionDate ?? meeting.dates.today,
      meetingNo: meeting.meetingNo,
      meetingDate: meeting.meetingDate,
      changesItem: row.changesItem,
      signers: signers.map((s) => ({ name: s.name, din: s.din })),
    });
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="Resolution_${row.title.replace(/[^\w-]+/g, '_').slice(0, 60)}.docx"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return meetingError(e);
  }
}
