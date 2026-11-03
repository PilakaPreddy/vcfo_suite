import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createResolution, getMeeting } from '@/db/repositories/board-meetings';
import { meetingError, resolutionSchema, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/resolutions — a resolution added after the meeting. Staff. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, resolutionSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    await createResolution(guard.ctx, id, body.data);
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, id) }, { status: 201 });
  } catch (e) {
    return meetingError(e);
  }
}
