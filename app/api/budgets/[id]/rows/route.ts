import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addRow } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

const schema = z.object({ kind: z.enum(['role', 'benefit', 'admin_rec', 'admin_once', 'finance_rec', 'finance_once']), data: z.unknown().optional() });

/** POST /api/budgets/[id]/rows — add a row to a tab this person may edit. */
export async function POST(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json(await addRow(guard.ctx, id, body.data.kind, body.data.data), { status: 201 });
  } catch (e) {
    return budgetError(e);
  }
}
