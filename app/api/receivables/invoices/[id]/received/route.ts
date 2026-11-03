import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { markReceived, reopenInvoice } from '@/db/repositories/receivables';
import { amount, denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST   /api/receivables/invoices/:id/received — record a full or part payment.
 * DELETE /api/receivables/invoices/:id/received — undo: the invoice is open again.
 */
const schema = z.object({ paidOn: isoDate, amount, part: z.boolean().optional() });

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ invoice: await markReceived(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ invoice: await reopenInvoice(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}
