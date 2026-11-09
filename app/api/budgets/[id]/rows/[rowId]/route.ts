import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteRow, updateRow } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { budgetError, denied, guardBudgets } from '../../../_respond';

type Context = { params: Promise<{ id: string; rowId: string }> };
const schema = z.object({ version: z.number().int(), data: z.unknown() });

/** PATCH — save one row. A stale version returns 409 with the other person's row. */
export async function PATCH(request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, rowId } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json(await updateRow(guard.ctx, id, rowId, { version: body.data.version, data: body.data.data }));
  } catch (e) {
    return budgetError(e);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, rowId } = await params;
  try {
    await deleteRow(guard.ctx, id, rowId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return budgetError(e);
  }
}
