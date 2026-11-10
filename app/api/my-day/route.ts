import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { gatherMyDay } from '@/lib/my-day/gather';
import { countMyDay, istDay } from '@/lib/my-day/rank';

/**
 * GET /api/my-day — the caller's ranked plan for today (IDEAS-PLAN section F). Staff only; every
 * source is read through the caller's own scoped repositories. `?limit=` caps the list (default
 * 50, at most 200); `total` and `counts` always describe the whole plan.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const raw = new URL(request.url).searchParams.get('limit');
  const limit = raw && /^\d{1,3}$/.test(raw) ? Math.min(Math.max(Number(raw), 1), 200) : 50;
  const now = new Date();
  const ranked = await gatherMyDay(guard.ctx, { now });
  return NextResponse.json({ today: istDay(now), total: ranked.length, counts: countMyDay(ranked), items: ranked.slice(0, limit) });
}
