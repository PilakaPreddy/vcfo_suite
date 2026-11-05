import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { addCreditNote, listCreditNotes } from '@/db/repositories/receivables';
import { amount, denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET  /api/receivables/invoices/:id/credit-notes — the invoice's credit notes, newest first.
 * POST /api/receivables/invoices/:id/credit-notes — record one; it lowers the open balance.
 */
const schema = z.object({
  number: z.string().max(40, 'number').nullable().optional(),
  issuedOn: isoDate,
  amountInr: amount,
  reason: z.string().max(300, 'reason').nullable().optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ creditNotes: await listCreditNotes(guard.ctx, id) });
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
    return NextResponse.json(await addCreditNote(guard.ctx, id, body.data));
  } catch (e) {
    return receivablesError(e);
  }
}
