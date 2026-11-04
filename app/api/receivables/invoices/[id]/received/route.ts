import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createAwaitedFira, markReceived, reopenInvoice } from '@/db/repositories/receivables';
import { isForeign } from '@/lib/receivables/fx';
import { amount, denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST   /api/receivables/invoices/:id/received — record a full or part payment. `amount` is the
 *        INR credited; a foreign invoice also sends `receivedFc` (the foreign amount that arrived)
 *        and an INR invoice may send `tdsInr`. A foreign invoice marked received gets its awaited
 *        FIRA row at once. A foreign receipt may name `forwardId`, an open forward contract of the
 *        same currency it is delivered against (Phase 10).
 * DELETE /api/receivables/invoices/:id/received — undo: the invoice is open again.
 */
const schema = z.object({
  paidOn: isoDate,
  amount,
  part: z.boolean().optional(),
  receivedFc: z.number().positive('fc_amount').max(1e12, 'fc_amount').nullable().optional(),
  tdsInr: z.number().min(0, 'tds').max(1e12, 'tds').nullable().optional(),
  forwardId: z.string().uuid('forward').nullable().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const invoice = await markReceived(guard.ctx, id, body.data);
    if (invoice.status === 'received' && isForeign({ currency: invoice.currency ?? 'INR' })) {
      // The FIRA row is a follow-up record: the receipt is saved even if it cannot be made now,
      // and the FIRA list creates any missing row when it is next read.
      await createAwaitedFira(guard.ctx, id).catch((e) => console.error('[receivables] awaited FIRA not created', e instanceof Error ? e.message : e));
    }
    return NextResponse.json({ invoice });
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
