import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { raiseDispute, resolveDispute } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST   /api/receivables/invoices/:id/dispute — mark the invoice disputed (reminders pause).
 * DELETE /api/receivables/invoices/:id/dispute — the dispute is resolved (a dispute pause lifts).
 */
const schema = z.object({ reason: z.string().trim().min(1, 'reason').max(300, 'reason') });

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ invoice: await raiseDispute(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ invoice: await resolveDispute(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}
