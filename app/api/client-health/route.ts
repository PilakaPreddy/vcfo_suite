import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { getClientHealth, listClientHealth } from '@/db/repositories/client-health';
import { healthError, STAFF } from './_respond';

/**
 * GET /api/client-health — the computed health of every client in the caller's scope, worst
 * first. `?engagementId=` returns `{ item }` for one client (null until the nightly job has run).
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const engagementId = new URL(request.url).searchParams.get('engagementId');
  try {
    if (engagementId) return NextResponse.json({ item: await getClientHealth(guard.ctx, engagementId) });
    return NextResponse.json({ items: await listClientHealth(guard.ctx) });
  } catch (e) {
    return healthError(e);
  }
}
