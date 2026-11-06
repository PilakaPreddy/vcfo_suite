import { NextResponse } from 'next/server';
import { requireAdminOrManager, requireAnyRole, type GuardResult } from '@/auth/guards';
import { askFlags } from '@/lib/ask/config';

/**
 * Every Watch route sits behind the owner's flag. Staff read; project leads may also add an update;
 * only super admin, admin and manager review.
 */
export type WatchGuard = { ok: true; ctx: Extract<GuardResult, { ok: true }>['ctx'] } | { ok: false; response: NextResponse };

async function checked(guard: Promise<GuardResult>): Promise<WatchGuard> {
  if (!askFlags().watch) return { ok: false, response: NextResponse.json({ error: 'watch_off' }, { status: 404 }) };
  const result = await guard;
  if (result.ok === false) return { ok: false, response: NextResponse.json({ error: result.error }, { status: result.status }) };
  return { ok: true, ctx: result.ctx };
}

export const watchStaff = (): Promise<WatchGuard> => checked(requireAnyRole('super_admin', 'admin', 'manager', 'intern'));
export const watchReviewer = (): Promise<WatchGuard> => checked(requireAdminOrManager());
