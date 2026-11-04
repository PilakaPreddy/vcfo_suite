import { NextResponse } from 'next/server';
import { invoiceHistory } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/invoices/:id/history — one invoice's history, newest first (Phase 10):
 * its change trail, the reminders queued or sent for it and its notes. Who may read is decided in
 * the repository (`scopedInvoice`): the sheet's own manager and the firm-wide admins.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json(await invoiceHistory(guard.ctx, id));
  } catch (e) {
    return receivablesError(e);
  }
}
