/**
 * RECEIVABLES KPIs (Phase 10, docs/specs/receivables/PLAN.md): the headline numbers on the
 * manager sheet's summary card. Pure functions over the draft invoices, so the card, a test and
 * any later email agree on one definition of each number.
 *
 * - Open receivables: every open invoice and its open balance in INR.
 * - Overdue: open invoices past their due date, the amount and the oldest in days.
 * - Due in the next 7 days: open invoices due today up to seven days ahead.
 * - Collected this month: invoices marked received with a paid-on date in this IST month. A part
 *   payment carries no date of its own, so it counts only once the invoice is fully received.
 * - DSO (days sales outstanding), the standard formula over a 90-day window:
 *   open balance ÷ amount billed in the window × 90. An invoice is billed on its invoice date, or
 *   on the first day of its invoice month when the date is not known (imported rows). The amount
 *   billed is the open balance plus what was part-paid, so a later payment does not shrink it.
 * - Promises: open invoices whose promised payment date falls today or in the next six days,
 *   and the open invoices whose promised date has passed (broken promises).
 */
import { addDaysIso, daysLeft, monthStart } from './dates';
import type { SheetInvoice } from './model';

export type KpiInvoice = Pick<SheetInvoice, 'status' | 'dueDate' | 'amountInr' | 'partPaid' | 'paidOn' | 'paidAmount' | 'invoiceMonth'> & {
  invoiceDate?: string | null;
  promisedOn?: string | null;
};

export type SheetKpis = {
  openCount: number;
  openInr: number;
  overdueCount: number;
  overdueInr: number;
  oldestOverdueDays: number;
  dueSoonCount: number;
  dueSoonInr: number;
  collectedMonthCount: number;
  collectedMonthInr: number;
  /** Null when nothing was billed in the window. */
  dsoDays: number | null;
  billedWindowInr: number;
  promisesWeekCount: number;
  promisesWeekInr: number;
  promisesBrokenCount: number;
};

export const DSO_WINDOW_DAYS = 90;
export const DUE_SOON_DAYS = 7;

const amount = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** What the invoice was billed for: the open balance plus any part payments already received. */
export function billedInr(r: Pick<KpiInvoice, 'amountInr' | 'partPaid'>): number {
  return amount(r.amountInr) + amount(r.partPaid);
}

/** The day an invoice counts as billed: its invoice date, else the first day of its month. */
export function billedOn(r: Pick<KpiInvoice, 'invoiceDate' | 'invoiceMonth'>): string {
  return (r.invoiceDate || r.invoiceMonth).slice(0, 10);
}

/**
 * Days sales outstanding over the last `windowDays` days, today included, rounded to a whole
 * day. Null when nothing was billed in the window (the number would be meaningless).
 */
export function dsoDays(rows: KpiInvoice[], today: string, windowDays = DSO_WINDOW_DAYS): { days: number | null; billedInr: number } {
  const from = addDaysIso(today, -(windowDays - 1));
  const billed = rows.filter((r) => {
    const on = billedOn(r);
    return on >= from && on <= today;
  });
  const billedSum = billed.reduce((a, r) => a + billedInr(r), 0);
  const openSum = rows.filter((r) => r.status === 'open').reduce((a, r) => a + amount(r.amountInr), 0);
  if (!(billedSum > 0)) return { days: null, billedInr: 0 };
  return { days: Math.round((openSum / billedSum) * windowDays), billedInr: billedSum };
}

export function sheetKpis(rows: KpiInvoice[], today: string): SheetKpis {
  const open = rows.filter((r) => r.status === 'open');
  const overdue = open.filter((r) => daysLeft(r.dueDate, today) < 0);
  const soon = open.filter((r) => {
    const d = daysLeft(r.dueDate, today);
    return d >= 0 && d <= DUE_SOON_DAYS;
  });
  const monthFrom = monthStart(today);
  const collected = rows.filter((r) => r.status === 'received' && r.paidOn && r.paidOn >= monthFrom && r.paidOn <= today);
  const weekEnd = addDaysIso(today, 6);
  const promised = open.filter((r) => r.promisedOn && r.promisedOn >= today && r.promisedOn <= weekEnd);
  const broken = open.filter((r) => r.promisedOn && r.promisedOn < today);
  const sum = (list: KpiInvoice[]) => list.reduce((a, r) => a + amount(r.amountInr), 0);
  const dso = dsoDays(rows, today);
  return {
    openCount: open.length,
    openInr: sum(open),
    overdueCount: overdue.length,
    overdueInr: sum(overdue),
    oldestOverdueDays: overdue.reduce((m, r) => Math.max(m, -daysLeft(r.dueDate, today)), 0),
    dueSoonCount: soon.length,
    dueSoonInr: sum(soon),
    collectedMonthCount: collected.length,
    collectedMonthInr: collected.reduce((a, r) => a + amount(r.paidAmount), 0),
    dsoDays: dso.days,
    billedWindowInr: dso.billedInr,
    promisesWeekCount: promised.length,
    promisesWeekInr: sum(promised),
    promisesBrokenCount: broken.length,
  };
}

const GROUP = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** A rupee figure short enough for a summary tile: ₹2.60 Cr, ₹18.45 L, ₹64,000. */
export function compactInr(n: number): string {
  const v = Math.round(amount(n));
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${GROUP.format(a)}`;
}
