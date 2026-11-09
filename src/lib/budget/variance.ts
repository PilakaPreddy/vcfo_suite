import type { BudgetResult } from './engine';
import { fyIndexOfPeriod, type BudgetSettings, type BudgetState } from './model';
import { advanceTaxBudgetByMonth, type TaxActuals } from './tax';

/**
 * VARIANCE — the month-by-month check of actual cost against an approved budget. The project lead
 * enters the actual cost of each line, a reason for each difference, the closing headcount and
 * the advance tax paid, and submits the month. A manager or firm admin approves it or sends it
 * back. An approved month is locked and keeps the budget figures it was approved against.
 *
 * Variance = Budget - Actual, so a negative figure means more was spent than budgeted. Any
 * difference that is not 0 after rounding to the rupee needs a reason. Every line with a budget
 * needs an actual; 0 is a valid actual.
 *
 * Pure: the repository and the screen both use it, so the rules cannot differ.
 */

export const VARIANCE_STATUSES = ['open', 'draft', 'submitted', 'approved', 'returned'] as const;
export type VarianceStatus = (typeof VARIANCE_STATUSES)[number];

export const VARIANCE_STATUS_LABEL: Record<VarianceStatus, string> = {
  open: 'Not started',
  draft: 'Draft',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  returned: 'Sent back',
};

export const VARIANCE_ACTIONS = ['submit', 'approve', 'send_back', 'reopen'] as const;
export type VarianceAction = (typeof VARIANCE_ACTIONS)[number];

export const VARIANCE_LOG_LABEL: Record<string, string> = {
  submitted: 'Submitted for approval',
  approved: 'Approved',
  sent_back: 'Sent back',
  reopened: 'Reopened',
};

/** The budget figures of one month, kept with the month when it is approved. */
export interface MonthBudget {
  lines: Record<string, number>;
  advanceTax: number;
  headcount: number;
}

export interface VarianceMonth {
  monthIndex: number;
  period: string;
  status: VarianceStatus;
  headcount: number | null;
  advanceTaxPaid: number | null;
  advanceTaxReason: string | null;
  note: string | null;
  budgetSnapshot: MonthBudget | null;
  submittedAt: string | null;
  decidedAt: string | null;
}

export interface VarianceLogEntry {
  id: string;
  monthIndex: number;
  action: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

/** One actual of a month: null means not entered. */
export interface MonthEntry {
  lineId: string;
  amount: number | null;
  reason: string | null;
}

export interface VarianceData {
  months: VarianceMonth[];
  log: VarianceLogEntry[];
  actuals: { period: string; lineId: string; amount: number; reason: string | null; source: string }[];
}

export interface MonthIssues {
  missingActual: string[];
  missingReason: string[];
  missingHeadcount: boolean;
  missingAdvanceTax: boolean;
  missingAdvanceReason: boolean;
}

export const LOCKED_STATUSES: VarianceStatus[] = ['submitted', 'approved'];

const blankMonth = (monthIndex: number, period: string): VarianceMonth => ({
  monthIndex,
  period,
  status: 'open',
  headcount: null,
  advanceTaxPaid: null,
  advanceTaxReason: null,
  note: null,
  budgetSnapshot: null,
  submittedAt: null,
  decidedAt: null,
});

/** Twelve months in financial-year order, filling the months with no record. */
export function fillMonths(periods: string[], stored: VarianceMonth[]): VarianceMonth[] {
  return periods.map((period, i) => stored.find((m) => m.monthIndex === i) ?? blankMonth(i, period));
}

/** The budget of a month: the kept figures once approved, otherwise the live budget. */
export function monthBudget(state: BudgetState, result: BudgetResult, monthIndex: number, snapshot?: MonthBudget | null): MonthBudget {
  if (snapshot) return snapshot;
  const lines: Record<string, number> = {};
  for (const l of state.settings.lines) lines[l.id] = Math.round(result.lines[l.id]?.[monthIndex] ?? 0);
  const advance = advanceTaxBudgetByMonth(state.settings, state.rows, result);
  return { lines, advanceTax: advance[monthIndex] ?? 0, headcount: Math.round((result.headcount.closing[monthIndex] ?? 0) * 10) / 10 };
}

const differs = (budget: number, actual: number) => Math.round(budget - actual) !== 0;
const blank = (s: string | null | undefined) => !s || !s.trim();

/** What stops a month from being submitted or approved. */
export function checkMonth(budget: MonthBudget, entries: MonthEntry[], month: Pick<VarianceMonth, 'headcount' | 'advanceTaxPaid' | 'advanceTaxReason'>): MonthIssues {
  const byLine = new Map(entries.map((e) => [e.lineId, e]));
  const missingActual: string[] = [];
  const missingReason: string[] = [];
  for (const [lineId, b] of Object.entries(budget.lines)) {
    const e = byLine.get(lineId);
    if (e?.amount == null) {
      if (Math.round(b) !== 0) missingActual.push(lineId);
      continue;
    }
    if (differs(b, e.amount) && blank(e.reason)) missingReason.push(lineId);
  }
  const advanceBudget = Math.round(budget.advanceTax);
  const missingAdvanceTax = advanceBudget !== 0 && month.advanceTaxPaid == null;
  const missingAdvanceReason = month.advanceTaxPaid != null && differs(advanceBudget, month.advanceTaxPaid) && blank(month.advanceTaxReason);
  return { missingActual, missingReason, missingHeadcount: month.headcount == null, missingAdvanceTax, missingAdvanceReason };
}

export function hasIssues(i: MonthIssues): boolean {
  return i.missingActual.length > 0 || i.missingReason.length > 0 || i.missingHeadcount || i.missingAdvanceTax || i.missingAdvanceReason;
}

/** One sentence for the person who pressed Submit. */
export function issuesMessage(i: MonthIssues): string {
  const parts: string[] = [];
  const actuals = i.missingActual.length + (i.missingAdvanceTax ? 1 : 0);
  const reasons = i.missingReason.length + (i.missingAdvanceReason ? 1 : 0);
  if (actuals) parts.push(`enter an actual for ${actuals} budgeted line${actuals === 1 ? '' : 's'} (type 0 if nothing was spent)`);
  if (reasons) parts.push(`add a reason for ${reasons} line${reasons === 1 ? '' : 's'} with a variance`);
  if (i.missingHeadcount) parts.push('enter the closing headcount');
  if (!parts.length) return '';
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} before submitting.`;
}

/** Actual cost entries of one month, from the stored actuals. */
export function entriesOfMonth(settings: BudgetSettings, actuals: { period: string; lineId: string; amount: number; reason: string | null }[], monthIndex: number): MonthEntry[] {
  return actuals.filter((a) => fyIndexOfPeriod(settings, a.period) === monthIndex).map((a) => ({ lineId: a.lineId, amount: a.amount, reason: a.reason }));
}

/** The approved months as the tax computation needs them. */
export function taxActualsOf(settings: BudgetSettings, months: VarianceMonth[], actuals: { period: string; lineId: string; amount: number }[]): TaxActuals {
  const approved = Array.from({ length: 12 }, (_, i) => months[i]?.status === 'approved');
  const lines: Record<string, number[]> = {};
  for (const a of actuals) {
    const i = fyIndexOfPeriod(settings, a.period);
    if (i < 0 || !approved[i]) continue;
    (lines[a.lineId] ??= Array(12).fill(0))[i] += a.amount;
  }
  return {
    approved,
    lines,
    headcount: approved.map((ok, i) => (ok ? (months[i]?.headcount ?? null) : null)),
    advancePaid: approved.map((ok, i) => (ok ? (months[i]?.advanceTaxPaid ?? null) : null)),
  };
}
