import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { deleteAlert, updateAlert } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';
import { alertFields } from '../../_fx';

/**
 * PATCH  /api/receivables/fx-alerts/:id — change a rate alert's level or direction, or turn it on or off.
 * DELETE /api/receivables/fx-alerts/:id — remove it (Phase 10).
 */
const schema = z.object({ ...alertFields, active: z.boolean() }).partial();

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ alert: await updateAlert(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    await deleteAlert(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return receivablesError(e);
  }
}
