import { NextResponse } from 'next/server';
import { listWatchSources, systemEnsureWatchSources } from '@/db/repositories/reg-sources';
import { publicErrorMessage } from '@/lib/api-error';
import { WATCH_SOURCES } from '@/lib/watch/sources-seed';
import { watchStaff } from '../_guard';

/** GET /api/watch/sources: every source with its health, so silence never reads as no news. */
export async function GET() {
  const guard = await watchStaff();
  if (guard.ok === false) return guard.response;
  try {
    await systemEnsureWatchSources(WATCH_SOURCES);
    return NextResponse.json({ sources: await listWatchSources(guard.ctx) });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'list_failed') }, { status: 500 });
  }
}
