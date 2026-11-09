import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createBudget, listBudgetClients, listBudgets } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { budgetError, denied, guardBudgets } from './_respond';

const createSchema = z.object({
  engagementId: z.string().min(1),
  fyStartYear: z.number().int().min(2000).max(2100),
  fyStartMonth: z.number().int().min(1).max(12),
  templateKey: z.string().max(40).default('blank'),
  copyFromBudgetId: z.string().nullable().optional(),
});

/** GET /api/budgets — the budgets in the caller's scope, and the clients staff can start one for. */
export async function GET() {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  try {
    const [budgets, clients] = await Promise.all([listBudgets(guard.ctx), listBudgetClients(guard.ctx)]);
    return NextResponse.json({ budgets, clients });
  } catch (e) {
    return budgetError(e);
  }
}

/** POST /api/budgets — start a budget from a template or from an earlier year. Staff only. */
export async function POST(request: Request) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json(await createBudget(guard.ctx, body.data), { status: 201 });
  } catch (e) {
    return budgetError(e);
  }
}
