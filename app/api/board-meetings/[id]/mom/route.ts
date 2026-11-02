import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { getMeeting, uploadMom } from '@/db/repositories/board-meetings';
import { meetingError, pdfFrom, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/mom — Upload MoM (multipart `file`, PDF). Staff, after the meeting date. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const tooLarge = rejectLargeBody(request, 22 * 1024 * 1024);
  if (tooLarge) return tooLarge;
  const { id } = await context.params;
  const file = await pdfFrom(request);
  if (!file) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  try {
    await uploadMom(guard.ctx, id, file);
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, id) }, { status: 201 });
  } catch (e) {
    return meetingError(e);
  }
}
