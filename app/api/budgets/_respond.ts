import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { BudgetError } from '@/db/repositories/budgets';

/**
 * Shared parts of the /api/budgets routes (docs/specs/budget/PLAN.md). The guard only keeps other
 * roles out early; who may touch which budget and tab is decided in the repository.
 */
export function guardBudgets() {
  return requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
}

export function denied(guard: { status: number; error: string }) {
  return NextResponse.json({ error: guard.error }, { status: guard.status });
}

export function budgetError(e: unknown) {
  if (e instanceof BudgetError) return NextResponse.json({ error: e.code, detail: e.detail ?? null }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  console.error('[budgets] route failed', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}

export type IdContext = { params: Promise<{ id: string }> };

/** Largest spreadsheet the import routes read. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
