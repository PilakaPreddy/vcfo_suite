/**
 * FILING METRICS — pure helpers over filed-against-due history (G-14, G-27).
 *
 * The history is the stored rows themselves: every `compliance_instances` and
 * `compliance_events` row carries its statutory `due_date` and, once filed, `filed_on`.
 * A filing is on time when `filed_on <= due_date`. A row marked filed without a filing date
 * has no evidence of when it was filed, so it is left out of on-time and delay figures rather
 * than guessed.
 */

import { DAY_MS } from '@/lib/metrics/step-timing';

export interface FilingRecord {
  engagementId: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** YYYY-MM-DD, when filed. */
  filedOn: string | null;
  status: string;
}

export interface OnTimeStats {
  /** Filings with a filing date inside the window. */
  filed: number;
  onTime: number;
  /** Rounded percentage; null when nothing was filed. */
  pct: number | null;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first day (YYYY-MM-DD) of the month `months - 1` months before `now`'s month. */
export function windowStart(now: Date, months: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return ymd(d);
}

/** The same day twelve months back, for "the last 12 months". */
export function twelveMonthsBack(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  return ymd(d);
}

function dayOnly(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

export function isOnTime(record: Pick<FilingRecord, 'dueDate' | 'filedOn'>): boolean | null {
  const filed = dayOnly(record.filedOn);
  if (!filed) return null;
  return filed <= record.dueDate;
}

/** Days past the due date (0 when on time); null when not filed. */
export function delayDays(record: Pick<FilingRecord, 'dueDate' | 'filedOn'>): number | null {
  const filed = dayOnly(record.filedOn);
  if (!filed) return null;
  const diff = Math.round((Date.parse(`${filed}T00:00:00Z`) - Date.parse(`${record.dueDate}T00:00:00Z`)) / DAY_MS);
  return Math.max(0, diff);
}

/** On time over filed, for filings with a filing date on or after `since` (YYYY-MM-DD). */
export function onTimeStats(records: FilingRecord[], since: string): OnTimeStats {
  let filed = 0;
  let onTime = 0;
  for (const record of records) {
    const day = dayOnly(record.filedOn);
    if (!day || day < since) continue;
    filed += 1;
    if (day <= record.dueDate) onTime += 1;
  }
  return { filed, onTime, pct: filed ? Math.round((onTime / filed) * 100) : null };
}

export interface FilingMonth {
  /** YYYY-MM */
  key: string;
  /** "Oct 26" */
  label: string;
  /** Filings due in the month. */
  due: number;
  /** Of those, filed on or before the due date. */
  onTime: number;
  /** Of those, filed after the due date. */
  late: number;
  /** Of those, past due and still not filed. */
  overdue: number;
  /** On time over the filings whose due date has passed; null when none has. */
  completionPct: number | null;
  /** Average days past due over the filings filed; null when none was. */
  avgDelayDays: number | null;
}

/** The last `months` months, oldest first, bucketed by due month. */
export function filingMonths(records: FilingRecord[], now: Date, months: number): FilingMonth[] {
  const today = ymd(now);
  const out = new Map<string, FilingMonth & { delays: number[]; pastDue: number }>();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.set(key, {
      key,
      label: `${MONTH_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      due: 0,
      onTime: 0,
      late: 0,
      overdue: 0,
      completionPct: null,
      avgDelayDays: null,
      delays: [],
      pastDue: 0,
    });
  }
  for (const record of records) {
    const month = out.get(record.dueDate.slice(0, 7));
    if (!month) continue;
    month.due += 1;
    const onTime = isOnTime(record);
    const delay = delayDays(record);
    if (onTime === true) month.onTime += 1;
    else if (onTime === false) month.late += 1;
    else if (record.dueDate < today && record.status !== 'filed') month.overdue += 1;
    if (delay !== null) month.delays.push(delay);
    if (record.dueDate < today) month.pastDue += 1;
  }
  return [...out.values()].map(({ delays, pastDue, ...month }) => ({
    ...month,
    completionPct: pastDue ? Math.round((month.onTime / pastDue) * 100) : null,
    avgDelayDays: delays.length
      ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
      : null,
  }));
}

export type LoadTone = 'ok' | 'warn' | 'bad' | 'none';

export interface LoadValue {
  open: number;
  capacity: number | null;
  /** Open over capacity in percent; null without a capacity. */
  pct: number | null;
  tone: LoadTone;
}

/** Load against capacity: over 100% red, over 80% amber, otherwise blurple. */
export function loadOf(open: number, capacity: number | null | undefined): LoadValue {
  if (!capacity || capacity <= 0) return { open, capacity: null, pct: null, tone: 'none' };
  const pct = Math.round((open / capacity) * 100);
  return { open, capacity, pct, tone: pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok' };
}
