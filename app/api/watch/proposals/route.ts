import { NextResponse } from 'next/server';
import { listCalendarChanges, listCalendarProposals } from '@/db/repositories/reg-proposals';
import { publicErrorMessage } from '@/lib/api-error';
import { watchStaff } from '../_guard';

/**
 * GET /api/watch/proposals: the change cards the viewer may see. With `?applied=1`, the approved moves
 * alone, for the screens that work dates out from the rules in the browser.
 */
export async function GET(request: Request) {
  const guard = await watchStaff();
  if (guard.ok === false) return guard.response;
  try {
    if (new URL(request.url).searchParams.has('applied')) return NextResponse.json({ changes: await listCalendarChanges(guard.ctx) });
    return NextResponse.json({ proposals: await listCalendarProposals(guard.ctx) });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'read_failed') }, { status: 500 });
  }
}
