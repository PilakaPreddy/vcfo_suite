import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { askFlags } from '@/lib/ask/config';
import { isWatchStaff } from '@/lib/watch/recipients';

/** GET /api/watch/status: whether the sidebar shows Official updates. Read at runtime, so the flag flips without a rebuild. */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  return NextResponse.json({ enabled: askFlags().watch && isWatchStaff(guard.ctx.role) }, { headers: { 'Cache-Control': 'no-store' } });
}
