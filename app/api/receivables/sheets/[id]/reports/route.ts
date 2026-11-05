import { NextResponse } from 'next/server';
import { reportData } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** GET /api/receivables/sheets/:id/reports — the Reports tab: ageing, days to pay, forecast, FX, TDS and FIRAs. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json(await reportData(guard.ctx, id));
  } catch (e) {
    return receivablesError(e);
  }
}
