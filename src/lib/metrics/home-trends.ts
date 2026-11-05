/**
 * HOME CARD TREND LINES (VCFO Spectrum R-18, C-0122, M-01) — the pure part.
 *
 * Each home card tile may draw a small line of its last few values. The rule is strict: a past
 * value is drawn only when it can be rebuilt from what the database stores. Nothing here
 * estimates, fills a gap or interpolates. A period whose value cannot be known ends the series:
 * only the run of known values that reaches today is kept (`trailingKnown`).
 *
 * The repository (`src/db/repositories/home-trends.ts`) reads the rows; this file turns them
 * into numbers. The screen appends the live count, so a series here never holds today.
 *
 * Periods are India calendar days (the firm's day), or calendar months on the super admin home.
 * A value "as of" a period is the state at the end of that period.
 */

/** The homes that ask for trends. */
export const HOME_TREND_HOMES = ['lead', 'manager', 'admin', 'super', 'dev', 'client'] as const;
export type HomeTrendHome = (typeof HOME_TREND_HOMES)[number];

/** Tile key to past values, oldest first, without the live point. A tile with no history is absent. */
export type HomeTrends = Record<string, number[]>;

/**
 * Past days per daily series (owner item B2, 2026-10-31): the 30 India days before today, one
 * point per day. A line starts later when its history starts later (an engagement created 10
 * days ago draws 10 past points), because an unknown day ends the line (`trailingKnown`).
 */
export const TREND_DAYS = 30;

/** Past months on the super admin home, whose tiles compare against last month. */
const TREND_MONTHS = 4;

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** One past period: its last calendar day and the instant it ended. */
export interface TrendPeriod {
  /** The last India calendar day of the period, `YYYY-MM-DD`. */
  ymd: string;
  /** The instant the period ended (midnight India time after `ymd`). */
  end: Date;
}

/** The India calendar day of an instant, `YYYY-MM-DD`. */
export function istYmd(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `ymd` moved by `n` calendar days. */
export function addDaysYmd(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** The instant an India calendar day ends: midnight India time after it. */
export function istDayEnd(ymd: string): Date {
  return new Date(Date.parse(`${addDaysYmd(ymd, 1)}T00:00:00Z`) - IST_OFFSET_MS);
}

/** The `n` India days before today, oldest first (30 by default). */
export function pastDays(now: Date, n = TREND_DAYS): TrendPeriod[] {
  const today = istYmd(now);
  return Array.from({ length: n }, (_, i) => {
    const ymd = addDaysYmd(today, i - n);
    return { ymd, end: istDayEnd(ymd) };
  });
}

/** The `n` calendar months before the current India month, oldest first, each as its last day. */
export function pastMonthEnds(now: Date, n = TREND_MONTHS): TrendPeriod[] {
  const [y, m] = istYmd(now).split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    // Day 0 of the next month is the last day of this one.
    const last = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 0)).toISOString().slice(0, 10);
    return { ymd: last, end: istDayEnd(last) };
  });
}

/**
 * The run of known values that reaches the latest period, oldest first. `null` marks a period
 * whose value cannot be rebuilt; it and everything before it are dropped, so the line never
 * jumps over a gap.
 */
export function trailingKnown(values: Array<number | null>): number[] {
  const out: number[] = [];
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (v === null || v === undefined) break;
    out.unshift(v);
  }
  return out;
}

/**
 * One day's value per period: the stored snapshot of that India day when there is one, else
 * the value rebuilt from the records (`null` when it cannot be rebuilt). A stored snapshot is
 * what the tile really showed that day, so it wins over the rebuild for the same day.
 */
export function withSnapshots(
  periods: TrendPeriod[],
  rebuilt: Array<number | null> | undefined,
  snapshots: ReadonlyMap<string, number> | undefined,
): Array<number | null> {
  return periods.map((p, i) => {
    const stored = snapshots?.get(p.ymd);
    if (stored !== undefined && Number.isFinite(stored)) return stored;
    return rebuilt?.[i] ?? null;
  });
}

/**
 * Counts per India day (`YYYY-MM-DD` to count) summed over the `days` days that end with each
 * period's day. A period ends at midnight India time, so "the 7 days before the day end" are
 * exactly that day and the 6 days before it.
 */
export function rollingDaySum(byDay: ReadonlyMap<string, number>, periods: TrendPeriod[], days: number): number[] {
  return periods.map((p) => {
    let n = 0;
    for (let i = 0; i < days; i += 1) n += byDay.get(addDaysYmd(p.ymd, -i)) ?? 0;
    return n;
  });
}

/** Counts rows that match; `null` when any row's answer is unknown. */
export function countKnown<T>(rows: T[], matches: (row: T) => boolean | null): number | null {
  let n = 0;
  for (const row of rows) {
    const hit = matches(row);
    if (hit === null) return null;
    if (hit) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ filings */

/** A compliance instance as the trends read it. */
export interface FilingHistoryRow {
  id: string;
  engagementId: string;
  dueDate: string;
  status: string;
  filedOn: string | null;
  createdAt: Date;
}

/** One reopen (`compliance.reopened` audit event): the filing was filed on `previousFiledOn` until `at`. */
export interface FilingReopen {
  instanceId: string;
  previousFiledOn: string | null;
  at: Date;
}

/**
 * Was the filing filed at the end of `period`? `true` or `false` when the stored dates say so,
 * `null` when they cannot: a row marked filed without a filed date. A reopen clears `filed_on`,
 * so the reopen audit events give back the filed spell it ended.
 */
export function filedAsOf(row: FilingHistoryRow, reopens: FilingReopen[], period: TrendPeriod): boolean | null {
  if (row.filedOn && row.filedOn.slice(0, 10) <= period.ymd) return true;
  for (const r of reopens) {
    if (r.instanceId !== row.id || !r.previousFiledOn) continue;
    if (r.previousFiledOn.slice(0, 10) <= period.ymd && r.at.getTime() >= period.end.getTime()) return true;
  }
  if (row.status === 'filed' && !row.filedOn) return null;
  return false;
}

/** The instance existed in the tool at the end of the period. */
function existed(row: { createdAt: Date }, period: TrendPeriod): boolean {
  return row.createdAt.getTime() < period.end.getTime();
}

/**
 * Super admin "Filings due" as of a month end, counted as `buildFilingBuckets` counts it live:
 * not filed, due no more than 90 days before the moment and at most 30 whole days after it
 * (overdue, this week and this month together).
 */
export function superFilingsDueAsOf(
  rows: FilingHistoryRow[],
  reopens: FilingReopen[],
  period: TrendPeriod,
  liveEngagements: Set<string>,
): number | null {
  const at = period.end.getTime();
  const floor = new Date(at - 90 * DAY_MS).toISOString().slice(0, 10);
  return countKnown(rows, (row) => {
    if (!liveEngagements.has(row.engagementId) || !existed(row, period)) return false;
    const due = row.dueDate.slice(0, 10);
    if (due < floor) return false;
    const days = Math.floor((Date.parse(`${due}T00:00:00Z`) - at) / DAY_MS);
    if (days > 30) return false;
    const filed = filedAsOf(row, reopens, period);
    return filed === null ? null : !filed;
  });
}

/** The Indian financial year start of a calendar day (April to March). */
export function fyStartOfYmd(ymd: string): number {
  const [y, m] = ymd.split('-').map(Number) as [number, number];
  return m >= 4 ? y : y - 1;
}

/**
 * Client home "Due soon" as of a day, counted as `bucketOf` counts it live: filings of the
 * financial year that were not filed, not past due, and due within 15 days.
 */
export function clientDueSoonAsOf(rows: FilingHistoryRow[], reopens: FilingReopen[], period: TrendPeriod): number | null {
  const fy = fyStartOfYmd(period.ymd);
  const from = `${fy}-04-01`;
  const to = `${fy + 1}-03-31`;
  return countKnown(rows, (row) => {
    if (!existed(row, period)) return false;
    const due = row.dueDate.slice(0, 10);
    if (due < from || due > to || due < period.ymd) return false;
    if (daysBetweenYmd(period.ymd, due) > 15) return false;
    const filed = filedAsOf(row, reopens, period);
    return filed === null ? null : !filed;
  });
}

/* ------------------------------------------------------------------ engagements */

/** An engagement row as the client count reads it, with its delete and restore audit events. */
export interface EngagementHistoryRow {
  id: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface EngagementDeleteEvent {
  engagementId: string;
  action: 'project.deleted' | 'project.restored';
  at: Date;
}

/**
 * Was the engagement in the firm's list at the end of the period? It must exist by then and not
 * be deleted: either it is still deleted since before the end, or the last delete or restore
 * event before the end was a delete.
 */
export function engagementLiveAt(row: EngagementHistoryRow, events: EngagementDeleteEvent[], period: TrendPeriod): boolean {
  const end = period.end.getTime();
  if (row.createdAt.getTime() >= end) return false;
  if (row.deletedAt && row.deletedAt.getTime() < end) return false;
  let last: EngagementDeleteEvent | null = null;
  for (const e of events) {
    if (e.engagementId !== row.id || e.at.getTime() >= end) continue;
    if (!last || e.at.getTime() > last.at.getTime()) last = e;
  }
  return last?.action !== 'project.deleted';
}

/* ------------------------------------------------------------------ rolling windows */

/** A logged message: when it was written and when its status last changed. */
export interface MessageHistoryRow {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Developer "Messages failed" at the end of a day, counted as the live tile counts it: messages
 * written in the 24 hours before the moment that had failed by then. A failure is the last
 * change to a row, so `updated_at` dates it.
 */
export function messagesFailedAsOf(failed: MessageHistoryRow[], period: TrendPeriod): number {
  const end = period.end.getTime();
  const start = end - DAY_MS;
  return failed.filter((m) => {
    const created = m.createdAt.getTime();
    return created >= start && created < end && m.updatedAt.getTime() < end;
  }).length;
}
