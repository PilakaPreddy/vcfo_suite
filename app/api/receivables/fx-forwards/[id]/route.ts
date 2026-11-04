import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { cancelForward, updateForward } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';
import { forwardFields } from '../../_fx';

/**
 * PATCH  /api/receivables/fx-forwards/:id — edit a forward contract's terms, or close or reopen it
 *        (`status`).
 * DELETE /api/receivables/fx-forwards/:id — cancel it. The row stays for the record (Phase 10).
 */
const schema = z.object({ ...forwardFields, status: z.enum(['open', 'closed'], { message: 'status' }) }).partial();

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ forward: await updateForward(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ forward: await cancelForward(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}
