import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createForward, listForwards } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';
import { forwardFields } from '../../../_fx';

/**
 * GET  /api/receivables/sheets/:id/fx-forwards — the sheet's forward contracts, latest maturity first.
 * POST /api/receivables/sheets/:id/fx-forwards — book a forward contract (Phase 10).
 */
const schema = z.object(forwardFields);

export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ forwards: await listForwards(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ forward: await createForward(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}
