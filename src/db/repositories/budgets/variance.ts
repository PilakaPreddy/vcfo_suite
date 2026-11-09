import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { budgetActuals, budgetVarianceLog, budgetVarianceMonths } from '@/db/schema';
import { computeBudget } from '@/lib/budget/engine';
import { fyIndexOfPeriod, periodOfFyIndex, type BudgetSettings } from '@/lib/budget/model';
import { checkMonth, entriesOfMonth, fillMonths, hasIssues, issuesMessage, LOCKED_STATUSES, monthBudget, type MonthBudget, type VarianceAction, type VarianceData, type VarianceMonth, type VarianceStatus } from '@/lib/budget/variance';

export type { VarianceData };
import { BudgetError, loadBudget, loadRows, stateOf, type LoadedBudget } from './shared';

/**
 * The Variance tab. Rules sit here, not in the screen: only the project lead (or a manager when
 * the client has no lead) enters and submits a month, only managers and firm admins approve, send
 * back or reopen, and Submit and Approve both re-check that every budgeted line has an actual and
 * every difference has a reason. Actual cost lives in `budget_actuals`, the same store as the
 * Actuals tab and the import, which refuse a month that is submitted or approved.
 */

type MonthRecord = typeof budgetVarianceMonths.$inferSelect;

const toMonth = (settings: BudgetSettings, r: MonthRecord): VarianceMonth => ({
  monthIndex: r.monthIndex,
  period: periodOfFyIndex(settings, r.monthIndex),
  status: r.status as VarianceStatus,
  headcount: r.headcount,
  advanceTaxPaid: r.advanceTaxPaid,
  advanceTaxReason: r.advanceTaxReason,
  note: r.note,
  budgetSnapshot: (r.budgetSnapshot as MonthBudget | null) ?? null,
  submittedAt: r.submittedAt?.toISOString() ?? null,
  decidedAt: r.decidedAt?.toISOString() ?? null,
});

async function loadForVariance(ctx: AuthContext, budgetId: string): Promise<LoadedBudget> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canSeeVariance) throw new BudgetError('forbidden', 403);
  return loaded;
}

function assertMonth(monthIndex: number) {
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) throw new BudgetError('bad_month', 400);
}

async function monthRecord(budgetId: string, monthIndex: number): Promise<MonthRecord | null> {
  const [r] = await db.select().from(budgetVarianceMonths).where(and(eq(budgetVarianceMonths.budgetId, budgetId), eq(budgetVarianceMonths.monthIndex, monthIndex))).limit(1);
  return r ?? null;
}

/** Financial-year positions that no one may change through the Actuals tab or the import. */
export async function lockedMonthIndexes(budgetId: string): Promise<Set<number>> {
  const rows = await db
    .select({ monthIndex: budgetVarianceMonths.monthIndex })
    .from(budgetVarianceMonths)
    .where(and(eq(budgetVarianceMonths.budgetId, budgetId), inArray(budgetVarianceMonths.status, LOCKED_STATUSES)));
  return new Set(rows.map((r) => r.monthIndex));
}

export async function getVariance(ctx: AuthContext, budgetId: string): Promise<VarianceData> {
  const { row } = await loadForVariance(ctx, budgetId);
  const settings = row.settings as BudgetSettings;
  const [stored, log, actuals] = await Promise.all([
    db.select().from(budgetVarianceMonths).where(eq(budgetVarianceMonths.budgetId, budgetId)),
    db.select().from(budgetVarianceLog).where(eq(budgetVarianceLog.budgetId, budgetId)).orderBy(asc(budgetVarianceLog.createdAt)),
    db.select().from(budgetActuals).where(eq(budgetActuals.budgetId, budgetId)),
  ]);
  const periods = Array.from({ length: 12 }, (_, i) => periodOfFyIndex(settings, i));
  return {
    months: fillMonths(periods, stored.map((r) => toMonth(settings, r))),
    log: log.map((l) => ({ id: l.id, monthIndex: l.monthIndex, action: l.action, note: l.note, actorName: l.actorName, createdAt: l.createdAt.toISOString() })),
    actuals: actuals.map((a) => ({ period: a.period, lineId: a.lineId, amount: a.amount, reason: a.reason, source: a.source })),
  };
}

export interface VarianceDraftInput {
  entries: { lineId: string; amount: number | null; reason: string | null }[];
  headcount: number | null;
  advanceTaxPaid: number | null;
  advanceTaxReason: string | null;
}

/** Save the month as typed. A new month becomes a draft; a sent-back month stays sent back. */
export async function saveVarianceDraft(ctx: AuthContext, budgetId: string, monthIndex: number, input: VarianceDraftInput): Promise<VarianceStatus> {
  assertMonth(monthIndex);
  const { row, access } = await loadForVariance(ctx, budgetId);
  if (!access.canEnterVariance) throw new BudgetError('forbidden', 403);
  const settings = row.settings as BudgetSettings;
  const current = await monthRecord(budgetId, monthIndex);
  const status = (current?.status ?? 'open') as VarianceStatus;
  if (LOCKED_STATUSES.includes(status)) throw new BudgetError('month_locked', 409);
  const next: VarianceStatus = status === 'returned' ? 'returned' : 'draft';
  const period = periodOfFyIndex(settings, monthIndex);
  const known = new Set(settings.lines.map((l) => l.id));
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const e of input.entries) {
      if (!known.has(e.lineId)) continue;
      const key = and(eq(budgetActuals.budgetId, budgetId), eq(budgetActuals.period, period), eq(budgetActuals.lineId, e.lineId));
      if (e.amount == null) {
        await tx.delete(budgetActuals).where(key);
        continue;
      }
      const reason = e.reason?.trim() || null;
      await tx
        .insert(budgetActuals)
        .values({ budgetId, period, lineId: e.lineId, amount: e.amount, reason, source: 'variance', updatedBy: ctx.userId })
        .onConflictDoUpdate({ target: [budgetActuals.budgetId, budgetActuals.period, budgetActuals.lineId], set: { amount: e.amount, reason, source: 'variance', updatedBy: ctx.userId, updatedAt: now } });
    }
    const values = { headcount: input.headcount, advanceTaxPaid: input.advanceTaxPaid, advanceTaxReason: input.advanceTaxReason?.trim() || null, status: next, updatedBy: ctx.userId, updatedAt: now };
    await tx
      .insert(budgetVarianceMonths)
      .values({ budgetId, monthIndex, ...values })
      .onConflictDoUpdate({ target: [budgetVarianceMonths.budgetId, budgetVarianceMonths.monthIndex], set: values });
  });
  return next;
}

export interface VarianceActionResult {
  status: VarianceStatus;
  period: string;
  monthLabel: string;
}

/** Submit, approve, send back or reopen a month. Throws `variance_incomplete` with the reasons. */
export async function actOnVarianceMonth(ctx: AuthContext, budgetId: string, monthIndex: number, action: VarianceAction, note: string | null): Promise<VarianceActionResult> {
  assertMonth(monthIndex);
  const loaded = await loadForVariance(ctx, budgetId);
  const { row, access } = loaded;
  const settings = row.settings as BudgetSettings;
  const current = await monthRecord(budgetId, monthIndex);
  const status = (current?.status ?? 'open') as VarianceStatus;
  const period = periodOfFyIndex(settings, monthIndex);
  const state = stateOf(row, await loadRows(budgetId));
  const result = computeBudget(state);
  const monthLabel = result.labels[monthIndex] ?? period;

  const check = async () => {
    const budget = monthBudget(state, result, monthIndex, null);
    const actuals = await db.select().from(budgetActuals).where(and(eq(budgetActuals.budgetId, budgetId), eq(budgetActuals.period, period)));
    const entries = entriesOfMonth(settings, actuals, monthIndex);
    const issues = checkMonth(budget, entries, { headcount: current?.headcount ?? null, advanceTaxPaid: current?.advanceTaxPaid ?? null, advanceTaxReason: current?.advanceTaxReason ?? null });
    if (hasIssues(issues)) throw new BudgetError('variance_incomplete', 422, { message: issuesMessage(issues), issues });
    return budget;
  };

  let next: VarianceStatus;
  let logAction: string;
  const now = new Date();
  const set: Partial<typeof budgetVarianceMonths.$inferInsert> = { updatedBy: ctx.userId, updatedAt: now };
  if (action === 'submit') {
    if (!access.canEnterVariance) throw new BudgetError('forbidden', 403);
    if (LOCKED_STATUSES.includes(status)) throw new BudgetError('month_locked', 409);
    await check();
    next = 'submitted';
    logAction = 'submitted';
    Object.assign(set, { submittedBy: ctx.userId, submittedAt: now });
  } else if (action === 'approve') {
    if (!access.canApproveVariance) throw new BudgetError('forbidden', 403);
    if (status !== 'submitted') throw new BudgetError('not_submitted', 409);
    const budget = await check();
    next = 'approved';
    logAction = 'approved';
    Object.assign(set, { decidedBy: ctx.userId, decidedAt: now, budgetSnapshot: budget, note: null });
  } else if (action === 'send_back') {
    if (!access.canApproveVariance) throw new BudgetError('forbidden', 403);
    if (status !== 'submitted') throw new BudgetError('not_submitted', 409);
    if (!note?.trim()) throw new BudgetError('note_required', 400);
    next = 'returned';
    logAction = 'sent_back';
    Object.assign(set, { decidedBy: ctx.userId, decidedAt: now, note: note.trim() });
  } else {
    if (!access.canApproveVariance) throw new BudgetError('forbidden', 403);
    if (status !== 'approved') throw new BudgetError('not_approved', 409);
    if (!note?.trim()) throw new BudgetError('note_required', 400);
    next = 'returned';
    logAction = 'reopened';
    Object.assign(set, { decidedBy: ctx.userId, decidedAt: now, note: note.trim(), budgetSnapshot: null });
  }
  set.status = next;

  await db.transaction(async (tx) => {
    await tx
      .insert(budgetVarianceMonths)
      .values({ budgetId, monthIndex, status: next, ...set })
      .onConflictDoUpdate({ target: [budgetVarianceMonths.budgetId, budgetVarianceMonths.monthIndex], set });
    await tx.insert(budgetVarianceLog).values({ budgetId, monthIndex, action: logAction, note: note?.trim() || null, actorId: ctx.userId, actorName: ctx.name });
  });
  return { status: next, period, monthLabel };
}

/** Throws when any entry falls in a month that is submitted or approved. */
export async function assertActualsUnlocked(budgetId: string, settings: BudgetSettings, periods: string[]): Promise<void> {
  const locked = await lockedMonthIndexes(budgetId);
  if (!locked.size) return;
  const hit = [...new Set(periods)].filter((p) => locked.has(fyIndexOfPeriod(settings, p)));
  if (hit.length) throw new BudgetError('month_locked', 409, { periods: hit.sort() });
}
