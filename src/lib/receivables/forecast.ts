import { daysToPayByClient } from './ageing';
import { addDaysIso, daysBetweenIso } from './dates';
import { round2 } from './fx';
import type { SheetInvoice } from './model';

/**
 * RECEIVABLES CASH FORECAST — the cash the open invoices should bring in, by ISO week
 * (docs/specs/receivables/PLAN.md, Phase 9).
 *
 * Each open invoice gets one expected date:
 *   1. the date the client promised (`promisedOn`), when the partner recorded one;
 *   2. otherwise the due date plus the client's average days late, worked out from that
 *      client's received invoices (an early payer counts as on time, never earlier);
 *   3. otherwise the due date.
 * No expected date is before today, so an overdue invoice with no history lands in the current
 * week. Weeks run Monday to Sunday. Invoices expected after the last week are totalled in
 * `later`. Disputed invoices are left out of the weeks and reported separately, because nobody
 * should count on them until the dispute is settled.
 */

export type ForecastRow = Pick<SheetInvoice, 'id' | 'clientName' | 'invoiceNo' | 'dueDate' | 'amountInr' | 'status' | 'paidOn'> & {
  promisedOn?: string | null;
  disputed?: boolean | null;
};

export type ExpectedBasis = 'promised' | 'history' | 'due';

export type ForecastItem = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  dueDate: string;
  amountInr: number;
  expectedOn: string;
  basis: ExpectedBasis;
};

export type ForecastWeek = {
  /** The Monday that starts the week. */
  weekStart: string;
  /** The Sunday that ends it. */
  weekEnd: string;
  count: number;
  inr: number;
  items: ForecastItem[];
};

export type CashForecast = {
  weeks: ForecastWeek[];
  later: { count: number; inr: number; items: ForecastItem[] };
  disputed: { count: number; inr: number; items: Array<Omit<ForecastItem, 'expectedOn' | 'basis'>> };
  /** Everything in the weeks plus `later`; disputed invoices are not in it. */
  total: { count: number; inr: number };
};

const DEFAULT_FORECAST_WEEKS = 8;

/** The Monday of the ISO week that holds `iso`. */
export function isoWeekStart(iso: string): string {
  const day = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return addDaysIso(iso, -((day + 6) % 7));
}

/** The expected date and its basis for one open invoice; `avgLate` is the client's average days late, if known. */
export function expectedDate(row: Pick<ForecastRow, 'dueDate' | 'promisedOn'>, avgLate: number | null | undefined, today: string): { expectedOn: string; basis: ExpectedBasis } {
  let expectedOn: string;
  let basis: ExpectedBasis;
  if (row.promisedOn) {
    expectedOn = row.promisedOn;
    basis = 'promised';
  } else if (typeof avgLate === 'number' && Number.isFinite(avgLate)) {
    expectedOn = addDaysIso(row.dueDate, Math.max(0, Math.round(avgLate)));
    basis = 'history';
  } else {
    expectedOn = row.dueDate;
    basis = 'due';
  }
  if (daysBetweenIso(today, expectedOn) < 0) expectedOn = today;
  return { expectedOn, basis };
}

export function cashForecast(rows: ForecastRow[], today: string, weeks: number = DEFAULT_FORECAST_WEEKS): CashForecast {
  const n = Math.max(1, Math.min(52, Math.floor(weeks) || DEFAULT_FORECAST_WEEKS));
  const late = new Map(daysToPayByClient(rows).map((c) => [c.client, c.avgDaysLate]));
  const first = isoWeekStart(today);
  const out: CashForecast = {
    weeks: Array.from({ length: n }, (_, i) => ({ weekStart: addDaysIso(first, i * 7), weekEnd: addDaysIso(first, i * 7 + 6), count: 0, inr: 0, items: [] })),
    later: { count: 0, inr: 0, items: [] },
    disputed: { count: 0, inr: 0, items: [] },
    total: { count: 0, inr: 0 },
  };
  for (const r of rows) {
    if (r.status !== 'open') continue;
    const amountInr = Number(r.amountInr) || 0;
    const base = { id: r.id, clientName: r.clientName, invoiceNo: r.invoiceNo, dueDate: r.dueDate, amountInr };
    if (r.disputed) {
      out.disputed.items.push(base);
      out.disputed.count += 1;
      out.disputed.inr = round2(out.disputed.inr + amountInr);
      continue;
    }
    const item: ForecastItem = { ...base, ...expectedDate(r, late.get(r.clientName), today) };
    const idx = Math.floor(daysBetweenIso(first, item.expectedOn) / 7);
    const bucket = idx < n ? out.weeks[idx] : out.later;
    bucket.items.push(item);
    bucket.count += 1;
    bucket.inr = round2(bucket.inr + amountInr);
    out.total.count += 1;
    out.total.inr = round2(out.total.inr + amountInr);
  }
  for (const b of [...out.weeks, out.later]) b.items.sort((a, z) => a.expectedOn.localeCompare(z.expectedOn) || z.amountInr - a.amountInr);
  return out;
}
