import { NextResponse } from 'next/server';
import { listVersions } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** GET /api/receivables/sheets/:id/versions — every Update, newest first, without snapshots. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ versions: await listVersions(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}
