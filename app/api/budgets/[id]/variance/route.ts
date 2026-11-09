import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getVariance, saveVarianceDraft } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

const amount = z.number().min(-1e13).max(1e13).nullable();
const schema = z.object({
  monthIndex: z.number().int().min(0).max(11),
  entries: z.array(z.object({ lineId: z.string().max(60), amount, reason: z.string().max(500).nullable() })).max(400),
  headcount: z.number().min(0).max(1e6).nullable(),
  advanceTaxPaid: amount,
  advanceTaxReason: z.string().max(500).nullable(),
});

/** GET /api/budgets/[id]/variance — the twelve months, their log and the actual cost. Staff only. */
export async function GET(_request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  try {
    return NextResponse.json(await getVariance(guard.ctx, id));
  } catch (e) {
    return budgetError(e);
  }
}

/** PUT — save one month as a draft: actual cost, reasons, headcount and advance tax paid. */
export async function PUT(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const d = body.data;
  const input = {
    entries: d.entries.map((e) => ({ lineId: e.lineId, amount: e.amount ?? null, reason: e.reason ?? null })),
    headcount: d.headcount ?? null,
    advanceTaxPaid: d.advanceTaxPaid ?? null,
    advanceTaxReason: d.advanceTaxReason ?? null,
  };
  try {
    return NextResponse.json({ status: await saveVarianceDraft(guard.ctx, id, d.monthIndex, input) });
  } catch (e) {
    return budgetError(e);
  }
}
