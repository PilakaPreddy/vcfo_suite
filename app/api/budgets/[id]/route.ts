import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBudgetView, listSiblingBudgets, removeBudget, updateSettings } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { budgetError, denied, guardBudgets, type IdContext } from '../_respond';

const patchSchema = z.object({ version: z.number().int(), settings: z.unknown() });

/** GET /api/budgets/[id] — the budget as this person may see it. */
export async function GET(_request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  try {
    const view = await getBudgetView(guard.ctx, id);
    return NextResponse.json({ ...view, siblings: await listSiblingBudgets(guard.ctx, view.engagementId) });
  } catch (e) {
    return budgetError(e);
  }
}

/** PATCH /api/budgets/[id] — save the Settings tab. */
export async function PATCH(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json(await updateSettings(guard.ctx, id, { version: body.data.version, settings: body.data.settings }));
  } catch (e) {
    return budgetError(e);
  }
}

/** DELETE /api/budgets/[id] — remove a budget that is not approved. Manager or admin. */
export async function DELETE(_request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  try {
    await removeBudget(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return budgetError(e);
  }
}
