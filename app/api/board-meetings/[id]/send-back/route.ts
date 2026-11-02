import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { sendBackMeeting } from '@/db/repositories/board-meetings';
import { meetingError, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/send-back { note } — the manager returns the notice to the lead. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, z.object({ note: z.string().min(1, 'note_required').max(2000) }));
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ meeting: await sendBackMeeting(guard.ctx, id, body.data.note) });
  } catch (e) {
    return meetingError(e);
  }
}
