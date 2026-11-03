import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { meetingStats } from '@/db/repositories/board-meetings';
import { meetingError } from '../_respond';

/** GET /api/board-meetings/stats — the Home "Board meetings" card (admin, super admin, manager, lead). */
export async function GET() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    return NextResponse.json(await meetingStats(guard.ctx));
  } catch (e) {
    return meetingError(e);
  }
}
