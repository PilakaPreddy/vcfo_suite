import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getMeeting, updateResolution } from '@/db/repositories/board-meetings';
import { meetingError, resolutionSchema, type DocContext } from '../../_respond';

/** PATCH /api/board-meetings/documents/:docId — edit a resolution until it is locked (it must be signed again). */
export async function PATCH(request: Request, context: DocContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { docId } = await context.params;
  const body = await parseJsonBody(request, resolutionSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const doc = await updateResolution(guard.ctx, docId, body.data);
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, doc.meetingId) });
  } catch (e) {
    return meetingError(e);
  }
}
