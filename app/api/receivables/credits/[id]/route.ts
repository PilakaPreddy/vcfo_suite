import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { confirmCredit, ignoreCredit } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';

/**
 * POST /api/receivables/credits/:id — the manager decides on a credit the matcher was not sure of:
 * `confirm` marks the chosen invoices received (in the draft), `ignore` records it as not a receipt.
 */
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm'), invoiceIds: z.array(z.string().uuid()).min(1, 'invoice').max(20) }),
  z.object({ action: z.literal('ignore') }),
]);

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const credit = body.data.action === 'confirm' ? await confirmCredit(guard.ctx, id, body.data.invoiceIds) : await ignoreCredit(guard.ctx, id);
    return NextResponse.json({ ok: true, status: credit.status });
  } catch (e) {
    return receivablesError(e);
  }
}
