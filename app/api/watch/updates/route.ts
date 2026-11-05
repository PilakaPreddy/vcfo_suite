import { NextResponse } from 'next/server';
import { listRegUpdates } from '@/db/repositories/reg-updates';
import { publicErrorMessage } from '@/lib/api-error';
import type { RegUpdateStatus } from '@/lib/watch/types';
import { watchStaff } from '../_guard';

const VIEWS: Record<string, readonly RegUpdateStatus[] | undefined> = {
  queue: ['queued', 'read', 'unreviewed', 'needs_attention', 'failed'],
  published: ['published'],
  rejected: ['rejected'],
  all: undefined,
};

/** GET /api/watch/updates?view=queue: the review queue, for every staff role. */
export async function GET(request: Request) {
  const guard = await watchStaff();
  if (guard.ok === false) return guard.response;
  const view = new URL(request.url).searchParams.get('view') ?? 'queue';
  try {
    return NextResponse.json({ updates: await listRegUpdates(guard.ctx, { statuses: VIEWS[view] }) });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'list_failed') }, { status: 500 });
  }
}
