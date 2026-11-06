import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listActuals, saveActuals } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

const schema = z.object({
  entries: z
    .array(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), lineId: z.string().max(60), amount: z.number().min(-1e13).max(1e13), reason: z.string().max(500).nullable().optional() }))
    .max(2000),
});

export async function GET(_request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  try {
    return NextResponse.json({ actuals: await listActuals(guard.ctx, id) });
  } catch (e) {
    return budgetError(e);
  }
}

/** POST — set actual cost and variance reasons. Staff only. */
export async function POST(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ saved: await saveActuals(guard.ctx, id, body.data.entries) });
  } catch (e) {
    return budgetError(e);
  }
}
