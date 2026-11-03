import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { submitMeeting } from '@/db/repositories/board-meetings';
import { meetingError, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/submit — the lead sends the notice for approval. Blocks on blank fields. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    return NextResponse.json({ meeting: await submitMeeting(guard.ctx, id) });
  } catch (e) {
    return meetingError(e);
  }
}
