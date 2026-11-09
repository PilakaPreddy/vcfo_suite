import { NextResponse } from 'next/server';
import { z } from 'zod';
import { actOnVarianceMonth } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { notifyVarianceMonth } from '@/lib/budget/notify';
import { VARIANCE_ACTIONS } from '@/lib/budget/variance';
import { budgetError, denied, guardBudgets } from '../../../_respond';

const schema = z.object({ action: z.enum(VARIANCE_ACTIONS), note: z.string().trim().max(2000).nullable().optional() });

type Context = { params: Promise<{ id: string; month: string }> };

/** POST /api/budgets/[id]/variance/[month] — submit, approve, send back or reopen one month (0 to 11). */
export async function POST(request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, month } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const note = body.data.note || null;
  try {
    const result = await actOnVarianceMonth(guard.ctx, id, Number(month), body.data.action, note);
    await notifyVarianceMonth(id, body.data.action, result.monthLabel, note, { id: guard.ctx.userId, name: guard.ctx.name });
    return NextResponse.json(result);
  } catch (e) {
    return budgetError(e);
  }
}
