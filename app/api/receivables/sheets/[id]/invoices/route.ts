import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { addInvoice } from '@/db/repositories/receivables';
import { amount, denied, fxFields, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST /api/receivables/sheets/:id/invoices — add an invoice to the draft. A USD invoice sends
 * `currency`, `fcAmount`, `fxRate` and `invoiceDate`; its INR is then booked at that rate.
 */
const schema = z.object({
  invoiceMonth: isoDate,
  clientName: z.string().min(1, 'client').max(120, 'client'),
  invoiceNo: z.string().max(40, 'invoice_no').nullable().optional(),
  partnerId: z.string().uuid('partner').nullable().optional(),
  dueDate: isoDate,
  amountInr: amount,
  ...fxFields,
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ invoice: await addInvoice(guard.ctx, id, body.data) }, { status: 201 });
  } catch (e) {
    return receivablesError(e);
  }
}
