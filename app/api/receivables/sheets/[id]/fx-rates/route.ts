import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { todayIst } from '@/lib/receivables/dates';
import type { FxRatesDto } from '@/lib/receivables/reports-wire';
import { listRates, setManualRate, systemRateFor } from '@/db/repositories/receivables';
import { denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET  /api/receivables/sheets/:id/fx-rates?days=30[&date=YYYY-MM-DD] — the stored daily rates,
 *      today's rate in force and, with `date`, the USD rate in force on that day (`onDate`).
 * POST /api/receivables/sheets/:id/fx-rates — the manager's override for one day (source `manual`).
 */
const schema = z.object({
  currency: z.string().regex(/^[A-Za-z]{3}$/, 'currency'),
  rateDate: isoDate,
  rate: z.number().positive('rate').max(100_000, 'rate'),
  note: z.string().max(200, 'note').nullable().optional(),
});

export async function GET(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const url = new URL(request.url);
  const days = Number(url.searchParams.get('days') ?? 30);
  const date = url.searchParams.get('date');
  try {
    const rates = await listRates(guard.ctx, id, days);
    const body: FxRatesDto = { rates, today: await systemRateFor('USD', todayIst()) };
    if (date && isoDate.safeParse(date).success) body.onDate = await systemRateFor('USD', date);
    return NextResponse.json(body);
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
    return NextResponse.json({ rate: await setManualRate(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}
