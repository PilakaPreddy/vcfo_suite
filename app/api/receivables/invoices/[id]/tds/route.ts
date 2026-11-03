import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setTds } from '@/db/repositories/receivables';
import { denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/** PATCH /api/receivables/invoices/:id/tds — the TDS deducted (INR) and the date its certificate arrived (null: awaited). */
const schema = z
  .object({ tdsInr: z.number().min(0, 'tds').max(1e12, 'tds').optional(), certificateOn: isoDate.nullable().optional() })
  .refine((b) => b.tdsInr !== undefined || b.certificateOn !== undefined, 'tds');

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ invoice: await setTds(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}
