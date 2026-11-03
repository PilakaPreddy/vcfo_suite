import { NextResponse } from 'next/server';
import { fxDesk } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/sheets/:id/fx-desk — everything the FX tab shows (Phase 10): the rate card
 * and 90 days of history per currency in use, exposure, hedge cover, the what-if, the bank
 * spreads and the rate alerts. Shapes are in src/lib/receivables/fx-desk-wire.ts.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json(await fxDesk(guard.ctx, id));
  } catch (e) {
    return receivablesError(e);
  }
}
