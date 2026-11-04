import { NextResponse } from 'next/server';
import { listPendingChanges } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/sheets/:id/changes — the changes the next Update publishes (Phase 10):
 * every page-affecting change since the last Update, newest first. Who may read is decided in
 * the repository: the sheet's own manager and the firm-wide admins.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json(await listPendingChanges(guard.ctx, id));
  } catch (e) {
    return receivablesError(e);
  }
}
