import { regOf, type Regulator } from '@/lib/ui/regulator';
import { filingStatus, monthKeyOf, sortByDueDate, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import { filingMonths, type FilingRecord } from '@/lib/metrics/filing-metrics';
import { daysUntil, filingWord, plainDate, worstStatus, type SixWord } from '@/views/compliances/spectrum-status';
import { companyInitials } from '@/components/super/parts/super-text';
import { waitingOnClient } from '@/views/compliances/obligation-groups';

/**
 * THE STAFF FILINGS BOARD (prototype C-05 to C-07, C-0118) — pure logic.
 *
 * Every number here is counted from the register rows the page already holds
 * (`/api/filings`, scoped by the caller's `AuthContext`) and, by instance id,
 * the side-table facts from `/api/client/compliances`. Nothing is stored and
 * nothing is invented: a row without facts simply has no note.
 */

/* ------------------------------------------------------------------ tiles */

/** The four KPI tiles over the list (C-06). '' means no tile is picked. */
export type BoardTile = '' | 'month' | 'filed' | 'week' | 'late';

const BOARD_TILES: readonly Exclude<BoardTile, ''>[] = ['month', 'filed', 'week', 'late'];

export function isBoardTile(value: string | null | undefined): value is Exclude<BoardTile, ''> {
  return BOARD_TILES.includes(value as Exclude<BoardTile, ''>);
}

/** "Due in 7 days" counts unfiled rows due today or in the next seven days. */
const WEEK_DAYS = 7;

export function matchesTile(row: FilingRow, tile: BoardTile, now: Date): boolean {
  const thisMonth = monthKeyOf(row.dueDate) === monthKeyOf(now.toISOString());
  switch (tile) {
    case '':
      return true;
    case 'month':
      return thisMonth;
    case 'filed':
      return thisMonth && filingStatus(row, now) === 'filed';
    case 'week': {
      if (row.filedOn) return false;
      const d = daysUntil(row.dueDate, now);
      return d !== null && d >= 0 && d <= WEEK_DAYS;
    }
    case 'late':
      return filingStatus(row, now) === 'overdue';
  }
}

export function tileCounts(rows: FilingRow[], now: Date): Record<Exclude<BoardTile, ''>, number> {
  const out = { month: 0, filed: 0, week: 0, late: 0 };
  for (const row of rows) for (const t of BOARD_TILES) if (matchesTile(row, t, now)) out[t] += 1;
  return out;
}

/* ----------------------------------------------------------------- status */

/**
 * The Status filter chip. The register's own four (`overdue`, `due-soon`,
 * `upcoming`, `filed`) keep their old `?status=` values; "Not done" (`open`)
 * and "In progress" (`in-progress`) are the two the board adds.
 */
export type BoardStatus = '' | 'open' | 'overdue' | 'due-soon' | 'in-progress' | 'waiting' | 'upcoming' | 'filed';

export const BOARD_STATUS_OPTIONS: Array<{ value: Exclude<BoardStatus, ''>; label: string }> = [
  { value: 'open', label: 'Not done' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due-soon', label: 'Due soon' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'upcoming', label: 'Not started' },
  { value: 'filed', label: 'Done' },
];

/**
 * The six-word status of a board row. A row that is neither filed nor late and is waiting
 * on the client's data (`waitingOnClient`: no data received, due within 15 days) reads
 * "Waiting"; every other row keeps `filingWord`.
 */
export function boardWord(row: FilingRow, detail: PortalFiling | undefined, now: Date): SixWord {
  const word = filingWord(row, now);
  if (word === 'Done' || word === 'Overdue') return word;
  return waitingOnClient(row, detail, now) ? 'Waiting' : word;
}

export function parseBoardStatus(value: string | null | undefined): BoardStatus {
  return BOARD_STATUS_OPTIONS.some((o) => o.value === value) ? (value as BoardStatus) : '';
}

export function matchesStatus(row: FilingRow, status: BoardStatus, now: Date, detail?: PortalFiling): boolean {
  if (!status) return true;
  if (status === 'open') return filingStatus(row, now) !== 'filed';
  if (status === 'in-progress') return boardWord(row, detail, now) === 'In progress';
  if (status === 'waiting') return boardWord(row, detail, now) === 'Waiting';
  if (status === 'upcoming' || status === 'due-soon') return filingStatus(row, now) === status && boardWord(row, detail, now) !== 'Waiting';
  return filingStatus(row, now) === status;
}

/* ----------------------------------------------------------------- period */

/** The time window of the list (prototype Filings): two months, a quarter, or the year. */
export type BoardPeriod = 'monthly' | 'quarterly' | 'annual';

export function isBoardPeriod(value: string | null | undefined): value is BoardPeriod {
  return value === 'monthly' || value === 'quarterly' || value === 'annual';
}

export interface PeriodWindow {
  /** First and last month index in the financial year (0 = April). */
  start: number;
  end: number;
  /** The month keys (yyyy-mm) in the window. */
  keys: string[];
}

/**
 * The window that holds the anchor month: monthly shows the anchor and the month before it
 * ("Sep to Oct"), quarterly the quarter of the anchor, annual the whole year. An anchor
 * outside the year starts at April.
 */
export function periodWindow(monthKeys: readonly string[], period: BoardPeriod, anchorKey: string): PeriodWindow {
  const last = monthKeys.length - 1;
  const idx = Math.max(0, monthKeys.indexOf(anchorKey));
  let start = 0;
  let end = last;
  if (period === 'monthly') {
    end = Math.max(Math.min(1, last), idx);
    start = Math.max(0, end - 1);
  } else if (period === 'quarterly') {
    start = Math.floor(idx / 3) * 3;
    end = Math.min(last, start + 2);
  }
  return { start, end, keys: monthKeys.slice(start, end + 1) };
}

/** The anchor month after a step of one window to the left or the right, kept inside the year. */
export function stepAnchor(monthKeys: readonly string[], period: BoardPeriod, win: PeriodWindow, dir: 1 | -1): string | null {
  if (period === 'annual') return null;
  const step = period === 'monthly' ? 1 : 3;
  const at = (period === 'monthly' ? win.end : win.start) + dir * step;
  const min = period === 'monthly' ? Math.min(1, monthKeys.length - 1) : 0;
  if (at < min || at > monthKeys.length - 1) return null;
  return monthKeys[at] ?? null;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep to Oct 2026", "Oct to Dec 2026", or the FY label for the year. */
export function windowLabel(win: PeriodWindow, period: BoardPeriod, fyLabel: string): string {
  if (period === 'annual' || win.keys.length === 0) return fyLabel;
  const first = win.keys[0]!;
  const lastKey = win.keys[win.keys.length - 1]!;
  return `${SHORT[Number(first.slice(5, 7)) - 1]} to ${SHORT[Number(lastKey.slice(5, 7)) - 1]} ${lastKey.slice(0, 4)}`;
}

/* ------------------------------------------------------------ tile lines */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The line under each KPI tile (C-06), counted from the same rows as the tiles:
 * "3 filings · 2 clients", the filed share of the month, the last day of the 7-day
 * window, and the late forms with the client initials.
 */
export function tileSubs(rows: FilingRow[], now: Date): Record<Exclude<BoardTile, ''>, string> {
  const month = rows.filter((r) => matchesTile(r, 'month', now));
  const filed = month.filter((r) => matchesTile(r, 'filed', now)).length;
  const filings = new Set(month.map((r) => `${r.obligationId}|${r.dueDate.slice(0, 10)}`)).size;
  const clients = new Set(month.map((r) => r.engagementId)).size;
  const weekEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + WEEK_DAYS));
  const late = sortByDueDate(rows.filter((r) => matchesTile(r, 'late', now)));
  const lateWords = late.slice(0, 3).map((r) => `${r.particular} · ${companyInitials(r.companyName)}`);
  return {
    month: `${plural(filings, 'filing')} · ${plural(clients, 'client')}`,
    filed: month.length ? `${Math.round((filed / month.length) * 100)}%` : '—',
    week: `by ${DOW[weekEnd.getUTCDay()]} ${plainDate(weekEnd.toISOString(), now)}`,
    late: late.length ? `${lateWords.join(', ')}${late.length > 3 ? ` +${late.length - 3}` : ''}` : 'None',
  };
}

/* -------------------------------------------------------------- regulator */

/** The six regulators in the order of the "By regulator" card (C-07). */
export const REGULATORS: ReadonlyArray<{ key: Regulator; label: string }> = [
  { key: 'gst', label: 'GST' },
  { key: 'it', label: 'Income tax' },
  { key: 'mca', label: 'MCA' },
  { key: 'fema', label: 'FEMA' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'labour', label: 'Labour' },
];

/**
 * `?area=` holds a regulator key. An old link that carries an area word
 * ("Income Tax", "GST") still lands on its regulator.
 */
export function parseRegulator(value: string | null | undefined): Regulator | '' {
  const v = value?.trim();
  if (!v || v === 'all') return '';
  if (REGULATORS.some((r) => r.key === v)) return v as Regulator;
  return regOf(v) ?? '';
}

export function regulatorOf(row: Pick<FilingRow, 'compliance'>): Regulator | undefined {
  return regOf(row.compliance);
}

/** Filed and total per regulator; every one of the six is present, at 0 of 0 when there is none. */
export function regulatorCounts(rows: FilingRow[], now: Date): Array<{ key: Regulator; label: string; filed: number; total: number }> {
  return REGULATORS.map((r) => {
    const list = rows.filter((row) => regulatorOf(row) === r.key);
    return { ...r, filed: list.filter((row) => filingStatus(row, now) === 'filed').length, total: list.length };
  });
}

/* ---------------------------------------------------------------- groups */

export interface BoardGroup {
  /** Group key: the obligation and its due date (one filing period), or the engagement id. */
  key: string;
  label: string;
  /** Rows that pass every filter. */
  rows: FilingRow[];
  /** Filed and total of the group before the chip filters, for the "x of y filed" bar. */
  filed: number;
  total: number;
  /** Worst status of the group's rows, for the date tile. */
  status: FilingStatus;
  /** The first row, for the band (name, area, period, due date, company). */
  first: FilingRow;
}

function build(all: FilingRow[], shown: FilingRow[], keyOf: (row: FilingRow) => string, labelOf: (row: FilingRow) => string, now: Date): BoardGroup[] {
  const byKey = new Map<string, FilingRow[]>();
  for (const row of sortByDueDate(all)) {
    const k = keyOf(row);
    const list = byKey.get(k) ?? [];
    list.push(row);
    byKey.set(k, list);
  }
  const shownIds = new Set(shown.map((r) => r.id));
  return [...byKey.entries()].map(([key, list]) => {
    const statuses = list.map((r) => filingStatus(r, now));
    return {
      key,
      label: labelOf(list[0]!),
      rows: list.filter((r) => shownIds.has(r.id)),
      filed: statuses.filter((s) => s === 'filed').length,
      total: list.length,
      status: worstStatus(statuses),
      first: list[0]!,
    };
  });
}

/** "By filing": one band per obligation and due date, its client rows by company name. */
export function groupByFiling(all: FilingRow[], shown: FilingRow[], now: Date): BoardGroup[] {
  return build(all, shown, (r) => `${r.obligationId}|${r.dueDate.slice(0, 10)}`, (r) => r.particular, now)
    .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => a.companyName.localeCompare(b.companyName)) }))
    .sort((a, b) => a.first.dueDate.localeCompare(b.first.dueDate) || a.label.localeCompare(b.label));
}

/** "By client": one band per company, its filings by due date. */
export function groupByClient(all: FilingRow[], shown: FilingRow[], now: Date): BoardGroup[] {
  return build(all, shown, (r) => r.engagementId, (r) => r.companyName, now).sort((a, b) => a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ note */

/**
 * The short note of a client row, from the facts the team records on the
 * filing: the ARN once filed, otherwise how far the work has got. A row
 * waiting on the client's data says so. Empty when nothing is recorded.
 */
export function noteFor(row: FilingRow, detail: PortalFiling | undefined, now: Date): string {
  if (!detail) return '';
  if (row.filedOn) return detail.acknowledgementNo?.trim() ? `ARN ${detail.acknowledgementNo.trim()}` : '';
  if (detail.approvedOn) return `Approved ${plainDate(detail.approvedOn, now)}`;
  if (detail.preparingSince) return `Preparing since ${plainDate(detail.preparingSince, now)}`;
  if (detail.dataReceivedOn) return `Data in ${plainDate(detail.dataReceivedOn, now)}`;
  if (waitingOnClient(row, detail, now)) return 'Waiting on client data';
  return '';
}

/* --------------------------------------------------------------- on time */

export interface OnTimeMonth {
  key: string;
  label: string;
  onTime: number;
  late: number;
}

/**
 * C4 "On time vs late": the filed-on date against the due date, by due month,
 * for the last `months` months to today. The same counting as Analytics
 * (`filingMonths` in `src/lib/metrics/filing-metrics.ts`).
 */
export function onTimeByMonth(rows: FilingRow[], now: Date, months: number): OnTimeMonth[] {
  const records: FilingRecord[] = rows.map((r) => ({
    engagementId: r.engagementId,
    dueDate: r.dueDate.slice(0, 10),
    filedOn: r.filedOn ? r.filedOn.slice(0, 10) : null,
    status: r.rawStatus,
  }));
  return filingMonths(records, now, months).map((m) => ({ key: m.key, label: m.label.split(' ')[0]!, onTime: m.onTime, late: m.late }));
}
