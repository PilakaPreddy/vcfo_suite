import { daysBetweenIso } from './dates';
import type { SheetInvoice } from './model';
import { round2 } from './fx';

/**
 * RECEIVABLES AGEING — open invoices grouped by days past due, and how late each client pays
 * (docs/specs/receivables/PLAN.md, Phase 9).
 *
 * An invoice not yet due sits in `not_due`. On the due date and up to 30 days after it, it is in
 * `0-30`; then `31-60`, `61-90` and `90+`. Disputed invoices are left out of the ageing, because
 * they are not chased until the dispute is settled. Days to pay is the paid date minus the due
 * date, so a negative number means the client paid early.
 */

export type AgeingBucket = 'not_due' | '0-30' | '31-60' | '61-90' | '90+';

/** The buckets in display order, with their labels. */
export const AGEING_BUCKETS: ReadonlyArray<{ bucket: AgeingBucket; label: string }> = [
  { bucket: 'not_due', label: 'Not yet due' },
  { bucket: '0-30', label: '0–30 days' },
  { bucket: '31-60', label: '31–60 days' },
  { bucket: '61-90', label: '61–90 days' },
  { bucket: '90+', label: 'Over 90 days' },
];

export type AgeingRow = Pick<SheetInvoice, 'status' | 'dueDate' | 'amountInr'> & { disputed?: boolean | null };
export type BucketTotal = { count: number; inr: number };
export type AgeingSummary = Record<AgeingBucket, BucketTotal> & { total: BucketTotal };

/** The bucket for an invoice due on `dueDate`, seen on `today`. */
export function ageingBucket(dueDate: string, today: string): AgeingBucket {
  const past = daysBetweenIso(dueDate, today);
  if (past < 0) return 'not_due';
  if (past <= 30) return '0-30';
  if (past <= 60) return '31-60';
  if (past <= 90) return '61-90';
  return '90+';
}

/** Counts and INR per bucket over open, undisputed rows, with a grand total. */
export function ageingSummary(rows: AgeingRow[], today: string): AgeingSummary {
  const out = {
    not_due: { count: 0, inr: 0 },
    '0-30': { count: 0, inr: 0 },
    '31-60': { count: 0, inr: 0 },
    '61-90': { count: 0, inr: 0 },
    '90+': { count: 0, inr: 0 },
    total: { count: 0, inr: 0 },
  } as AgeingSummary;
  for (const r of rows) {
    if (r.status !== 'open' || r.disputed) continue;
    const amount = Number(r.amountInr) || 0;
    const b = out[ageingBucket(r.dueDate, today)];
    b.count += 1;
    b.inr = round2(b.inr + amount);
    out.total.count += 1;
    out.total.inr = round2(out.total.inr + amount);
  }
  return out;
}

export type DaysToPayRow = Pick<SheetInvoice, 'status' | 'clientName' | 'dueDate' | 'paidOn'>;
export type ClientDaysToPay = {
  client: string;
  count: number;
  /** Average of paid date minus due date, 1 decimal. Negative means early. */
  avgDaysLate: number;
  maxDaysLate: number;
};

/** Average and worst days late per client over received rows with a paid date, the latest payer first. */
export function daysToPayByClient(rows: DaysToPayRow[]): ClientDaysToPay[] {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (r.status !== 'received' || !r.paidOn || !r.dueDate) continue;
    const late = daysBetweenIso(r.dueDate, r.paidOn);
    if (!Number.isFinite(late)) continue;
    const list = by.get(r.clientName) ?? [];
    list.push(late);
    by.set(r.clientName, list);
  }
  return [...by.entries()]
    .map(([client, days]) => ({
      client,
      count: days.length,
      avgDaysLate: Math.round((days.reduce((a, d) => a + d, 0) / days.length) * 10) / 10,
      maxDaysLate: Math.max(...days),
    }))
    .sort((a, b) => b.avgDaysLate - a.avgDaysLate || b.maxDaysLate - a.maxDaysLate || a.client.localeCompare(b.client));
}
