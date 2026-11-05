import { NextResponse } from 'next/server';
import { requirePartner } from '@/auth/guards';
import { partnerInvoiceDetail } from '@/db/repositories/receivables';
import { denied, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/partner/invoices/:id — one of the partner's own published invoices, with
 * its reminders, the current pause and the notes. Any other invoice reads as not found.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePartner();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json(await partnerInvoiceDetail(guard.ctx, id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return receivablesError(e);
  }
}
