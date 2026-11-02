import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { rescheduleMeeting } from '@/db/repositories/board-meetings';
import { hhmm, isoDate, meetingError, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/reschedule — new date and time go back to the manager for approval. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, z.object({ meetingDate: isoDate, meetingTime: hhmm, reason: z.string().max(500).default('') }));
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ meeting: await rescheduleMeeting(guard.ctx, id, body.data) });
  } catch (e) {
    return meetingError(e);
  }
}
