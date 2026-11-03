import { NextResponse } from 'next/server';
import { listFiras } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** GET /api/receivables/sheets/:id/firas — the FIRAs of the sheet's foreign receipts, awaited first. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ firas: await listFiras(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}
