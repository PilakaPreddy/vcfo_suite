import { addDaysIso, daysLeft } from './dates';
import type { SheetInvoice } from './model';

/**
 * RECEIVABLES TOTALS — the numbers the sheet, the public page and the summary email share.
 * "Received this week" is the last seven IST days, today included.
 */

type Row = Pick<SheetInvoice, 'status' | 'dueDate' | 'amountInr' | 'paidOn' | 'paidAmount' | 'invoiceMonth'>;

export function isOpen(r: Pick<SheetInvoice, 'status'>): boolean {
  return r.status === 'open';
}

export function isOverdue(r: Pick<SheetInvoice, 'status' | 'dueDate'>, today: string): boolean {
  return isOpen(r) && daysLeft(r.dueDate, today) < 0;
}

export function receivedThisWeek(r: Pick<SheetInvoice, 'status' | 'paidOn'>, today: string): boolean {
  return r.status === 'received' && Boolean(r.paidOn) && r.paidOn! >= addDaysIso(today, -6) && r.paidOn! <= today;
}

export function sumInr(rows: Array<Pick<SheetInvoice, 'amountInr'>>): number {
  return rows.reduce((a, r) => a + (Number(r.amountInr) || 0), 0);
}

export type SheetTotals = {
  openInr: number;
  openCount: number;
  overdueInr: number;
  overdueCount: number;
  oldestOverdueDays: number;
  receivedWeekInr: number;
  receivedWeekCount: number;
};

export function sheetTotals(rows: Row[], today: string): SheetTotals {
  const open = rows.filter(isOpen);
  const overdue = open.filter((r) => daysLeft(r.dueDate, today) < 0);
  const week = rows.filter((r) => receivedThisWeek(r, today));
  return {
    openInr: sumInr(open),
    openCount: open.length,
    overdueInr: sumInr(overdue),
    overdueCount: overdue.length,
    oldestOverdueDays: overdue.reduce((m, r) => Math.max(m, -daysLeft(r.dueDate, today)), 0),
    receivedWeekInr: week.reduce((a, r) => a + (r.paidAmount ?? 0), 0),
    receivedWeekCount: week.length,
  };
}

/** Invoice months present in `rows`, oldest first. */
export function monthsOf(rows: Array<Pick<SheetInvoice, 'invoiceMonth'>>): string[] {
  return [...new Set(rows.map((r) => r.invoiceMonth))].sort();
}

/** "2 days late", "On the due date", "3 days early". */
export function payTiming(r: Pick<SheetInvoice, 'dueDate' | 'paidOn'>): string {
  if (!r.paidOn) return '';
  const late = -daysLeft(r.dueDate, r.paidOn);
  if (late > 0) return `${late} day${late === 1 ? '' : 's'} late`;
  if (late === 0) return 'On the due date';
  return `${-late} day${late === -1 ? '' : 's'} early`;
}
