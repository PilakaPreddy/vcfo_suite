import 'server-only';

import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { budgetActuals, budgetSectionOwners, budgetSections, budgets, engagements, profiles } from '@/db/schema';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { budgetVsActual, computeBudget } from '@/lib/budget/engine';
import { fyIndexOfPeriod, fyName, type BudgetSection, type BudgetSettings } from '@/lib/budget/model';
import { loadRows, stateOf } from './shared';

/**
 * Helpers for the budget jobs and notifications. They run without a session, so they take no
 * AuthContext and return only names, addresses and totals for the budgets' own people.
 */

export interface BudgetParty {
  userId: string;
  email: string;
  name: string;
}

export interface BudgetParties {
  budgetId: string;
  engagementId: string;
  companyName: string;
  fyName: string;
  ownersBySection: Partial<Record<BudgetSection, BudgetParty[]>>;
  staff: BudgetParty[];
  leads: BudgetParty[];
  managers: BudgetParty[];
  clients: BudgetParty[];
}

export async function systemBudgetParties(budgetId: string): Promise<BudgetParties | null> {
  const [row] = await db
    .select({ id: budgets.id, engagementId: budgets.engagementId, settings: budgets.settings, companyName: engagements.companyName })
    .from(budgets)
    .innerJoin(engagements, eq(engagements.id, budgets.engagementId))
    .where(eq(budgets.id, budgetId))
    .limit(1);
  if (!row) return null;
  const owners = await db
    .select({ section: budgetSectionOwners.section, userId: budgetSectionOwners.userId, email: profiles.email, name: profiles.name })
    .from(budgetSectionOwners)
    .innerJoin(profiles, eq(profiles.id, budgetSectionOwners.userId))
    .where(eq(budgetSectionOwners.budgetId, budgetId));
  const ownersBySection: BudgetParties['ownersBySection'] = {};
  for (const o of owners) (ownersBySection[o.section as BudgetSection] ??= []).push({ userId: o.userId, email: o.email, name: o.name?.trim() || o.email });
  const r = await resolveEngagementRecipients(row.engagementId);
  const party = (p: { userId: string; email: string; name: string }): BudgetParty => ({ userId: p.userId, email: p.email, name: p.name });
  const staff = new Map([...(r?.leads ?? []), ...(r?.managers ?? [])].map((p) => [p.userId, party(p)]));
  return {
    budgetId,
    engagementId: row.engagementId,
    companyName: row.companyName ?? '',
    fyName: fyName(row.settings as BudgetSettings),
    ownersBySection,
    staff: [...staff.values()],
    leads: (r?.leads ?? []).map(party),
    managers: (r?.managers ?? []).map(party),
    clients: (r?.clients ?? []).map(party),
  };
}

/** Tabs that are due within `throughDate` and not done, with no reminder since `remindedBefore`. */
export async function systemListSectionsToRemind(throughDate: string, remindedBefore: Date) {
  return db
    .select({ budgetId: budgetSections.budgetId, section: budgetSections.section, dueDate: budgetSections.dueDate })
    .from(budgetSections)
    .innerJoin(budgets, eq(budgets.id, budgetSections.budgetId))
    .where(
      and(
        isNull(budgets.deletedAt),
        eq(budgets.status, 'draft'),
        isNotNull(budgetSections.dueDate),
        lte(budgetSections.dueDate, throughDate),
        ne(budgetSections.status, 'done'),
        or(isNull(budgetSections.lastRemindedAt), lte(budgetSections.lastRemindedAt, remindedBefore)),
      ),
    );
}

export async function systemMarkSectionReminded(budgetId: string, section: string): Promise<void> {
  await db.update(budgetSections).set({ lastRemindedAt: new Date() }).where(and(eq(budgetSections.budgetId, budgetId), eq(budgetSections.section, section)));
}

export interface OverspendAlert {
  budgetId: string;
  period: string;
  lines: { name: string; budget: number; actual: number; variancePct: number | null }[];
}

/** Budgets whose latest actual month has lines over their limit and no alert for that month yet. */
export async function systemFindOverspends(): Promise<OverspendAlert[]> {
  const live = await db
    .select()
    .from(budgets)
    .where(and(isNull(budgets.deletedAt), inArray(budgets.status, ['published', 'approved'])));
  if (!live.length) return [];
  const actuals = await db.select().from(budgetActuals).where(inArray(budgetActuals.budgetId, live.map((b) => b.id)));
  const out: OverspendAlert[] = [];
  for (const b of live) {
    const own = actuals.filter((a) => a.budgetId === b.id);
    const settings = b.settings as BudgetSettings;
    const periods = own.map((a) => a.period).filter((p) => fyIndexOfPeriod(settings, p) >= 0).sort();
    const period = periods[periods.length - 1];
    if (!period || period === b.lastAlertPeriod) continue;
    const state = stateOf(b, await loadRows(b.id));
    const report = budgetVsActual(state, computeBudget(state), own.map((a) => ({ period: a.period, lineId: a.lineId, amount: a.amount })), (p) => fyIndexOfPeriod(settings, p));
    const lines = report.rows.filter((r) => r.overLimit).map((r) => ({ name: r.name, budget: r.budget, actual: r.actual, variancePct: r.variancePct }));
    if (lines.length) out.push({ budgetId: b.id, period, lines });
    else await systemMarkAlertRun(b.id, period);
  }
  return out;
}

export async function systemMarkAlertRun(budgetId: string, period: string): Promise<void> {
  await db.update(budgets).set({ lastAlertPeriod: period }).where(eq(budgets.id, budgetId));
}
