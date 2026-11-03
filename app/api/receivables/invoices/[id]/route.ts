import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { deleteInvoice, updateInvoice } from '@/db/repositories/receivables';
import { amount, denied, fxFields, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../_respond';

/**
 * PATCH  /api/receivables/invoices/:id — an inline edit from the sheet (one or more fields).
 * DELETE /api/receivables/invoices/:id — remove the invoice from the draft (published versions keep it).
 */
const schema = z.object({
  invoiceMonth: isoDate.optional(),
  clientName: z.string().min(1, 'client').max(120, 'client').optional(),
  invoiceNo: z.string().max(40, 'invoice_no').nullable().optional(),
  partnerId: z.string().uuid('partner').nullable().optional(),
  dueDate: isoDate.optional(),
  amountInr: amount.optional(),
  ...fxFields,
});

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ invoice: await updateInvoice(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    await deleteInvoice(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return receivablesError(e);
  }
}
