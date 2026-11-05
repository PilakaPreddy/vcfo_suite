/**
 * FILINGS — the compliance register, as pure logic.
 *
 * No `db`, no `server-only`, no React: the repository calls this after reading
 * rows, the views import the same types, and every derivation here is unit
 * testable. The source of truth is the existing Inngest-generated
 * `compliance_instances`; this module only shapes and groups them.
 *
 * Indian financial year: 1 April → 31 March. Every period helper below is built
 * on that, because the board sheets this feature mirrors are laid out FY-first
 * (Apr…Mar columns, Q1 = Apr-Jun).
 */

export type FilingsCadence = 'monthly' | 'quarterly' | 'annual';

function isFilingsCadence(value: string | null | undefined): value is FilingsCadence {
  return value === 'monthly' || value === 'quarterly' || value === 'annual';
}

/** Status shown on screen. Derived, never stored as a fabricated value. */
export type FilingStatus = 'filed' | 'overdue' | 'due-soon' | 'upcoming';

export interface FilingRow {
  id: string;
  engagementId: string;
  companyName: string;
  /** `compliance_obligations.compliance_area` — "GST", "Income Tax", … */
  compliance: string;
  /** `compliance_obligations.particular` — "GSTR-3B", "Advance Tax Payment Q1". */
  particular: string;
  authority: string;
  frequency: string;
  /** ISO date. */
  dueDate: string;
  /** ISO date, or null when the filing has not been made. */
  filedOn: string | null;
  periodLabel: string | null;
  fyLabel: string | null;
  /** Raw stored status; the display status is derived by `filingStatus`. */
  rawStatus: string;
  /** `compliance_obligations.id` — joins a register row to the client-side filing id. */
  obligationId: string;
  /** Manager-set working window (ISO dates), or null when unset. */
  windowFrom: string | null;
  windowTo: string | null;
}

// ---------------------------------------------------------------------------
// Financial year + periods
// ---------------------------------------------------------------------------

export interface FinancialYear {
  /** April of the start year, e.g. 2026 for FY 2026-27. */
  startYear: number;
  label: string;
}

export function financialYearForDate(date: Date): FinancialYear {
  const year = date.getUTCFullYear();
  // Jan–Mar belong to the FY that started the previous April.
  const startYear = date.getUTCMonth() >= 3 ? year : year - 1;
  return { startYear, label: financialYearLabel(startYear) };
}

export function financialYearLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** `YYYY-MM` for a date, in UTC so a timezone never shifts the month. */
export function monthKeyOf(iso: string): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyForDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface FilingsMonth {
  key: string;
  /** "Apr 2026" */
  label: string;
  /** "Apr" — the deck matrix column head. */
  shortLabel: string;
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** The twelve months of an Indian FY, in deck order: Apr → Mar. */
export function financialYearMonths(startYear: number): FilingsMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = (3 + index) % 12;
    const year = startYear + (monthIndex < 3 ? 1 : 0);
    return {
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      label: `${MONTH_SHORT[monthIndex]} ${year}`,
      shortLabel: MONTH_SHORT[monthIndex]!,
    };
  });
}

export interface FilingsQuarter {
  key: string;
  /** "Q1" */
  label: string;
  /** "Apr–Jun 2026" */
  rangeLabel: string;
  monthKeys: string[];
}

/** Q1 = Apr-Jun … Q4 = Jan-Mar, the Indian convention the deck uses. */
export function financialYearQuarters(startYear: number): FilingsQuarter[] {
  const months = financialYearMonths(startYear);
  return [0, 1, 2, 3].map((index) => {
    const slice = months.slice(index * 3, index * 3 + 3);
    const first = slice[0]!;
    const last = slice[2]!;
    return {
      key: `${startYear}-Q${index + 1}`,
      label: `Q${index + 1}`,
      rangeLabel: `${first.shortLabel}–${last.shortLabel} ${last.key.slice(0, 4)}`,
      monthKeys: slice.map((month) => month.key),
    };
  });
}

export function quarterForMonthKey(monthKey: string, startYear: number): FilingsQuarter | null {
  return financialYearQuarters(startYear).find((q) => q.monthKeys.includes(monthKey)) ?? null;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Days before the due date that an unfiled obligation reads as "due soon". This is
 * the one window for every compliance screen, client and staff (owner spec:
 * docs/specs/client-pages/BUILD-INVENTORY.md, "due within 15 days and not filed").
 */
export const DUE_SOON_DAYS = 15;

/** Today in India as `YYYY-MM-DD`; the firm works on IST dates, never the UTC day. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * Display status. `filedOn` wins outright; everything else is a function of the
 * due date against today. Nothing is invented: an instance with no filed date
 * and a future due date is simply "upcoming".
 */
export function filingStatus(row: Pick<FilingRow, 'filedOn' | 'dueDate'>, now = new Date()): FilingStatus {
  if (row.filedOn?.trim()) return 'filed';
  const due = parseIsoDate(row.dueDate);
  if (!due) return 'upcoming';
  const today = parseIsoDate(todayIST(now))!;
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'upcoming';
}

const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  filed: 'Filed',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  upcoming: 'Upcoming',
};

/** Canonical `TONE_BADGE` tones — no new pill variant for this feature. */
const FILING_STATUS_TONE: Record<FilingStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  filed: 'success',
  overdue: 'danger',
  'due-soon': 'warning',
  upcoming: 'neutral',
};

export interface FilingsSummary {
  dueThisMonth: number;
  overdue: number;
  filed: number;
}

export function summarise(
  rows: FilingRow[],
  monthKey: string,
  now = new Date(),
): FilingsSummary {
  let dueThisMonth = 0;
  let overdue = 0;
  let filed = 0;
  for (const row of rows) {
    const status = filingStatus(row, now);
    const inMonth = monthKeyOf(row.dueDate) === monthKey;
    if (inMonth) dueThisMonth += 1;
    if (status === 'overdue') overdue += 1;
    if (status === 'filed' && inMonth) filed += 1;
  }
  return { dueThisMonth, overdue, filed };
}

// ---------------------------------------------------------------------------
// Grouping for the three tabs
// ---------------------------------------------------------------------------

/** Instances whose own frequency belongs on a given tab. */
export function rowsForCadence(rows: FilingRow[], cadence: FilingsCadence): FilingRow[] {
  return rows.filter((row) => {
    const frequency = row.frequency.trim().toLowerCase();
    if (cadence === 'monthly') return frequency === 'monthly';
    if (cadence === 'quarterly') return frequency === 'quarterly' || frequency === 'half-yearly';
    return frequency === 'annual' || frequency === 'one-time';
  });
}

export function rowsInMonth(rows: FilingRow[], monthKey: string): FilingRow[] {
  return rows.filter((row) => monthKeyOf(row.dueDate) === monthKey);
}

export function rowsInFinancialYear(rows: FilingRow[], startYear: number): FilingRow[] {
  const keys = new Set(financialYearMonths(startYear).map((month) => month.key));
  return rows.filter((row) => {
    const key = monthKeyOf(row.dueDate);
    return key ? keys.has(key) : false;
  });
}

interface FilingsMatrixCell {
  dueDate: string | null;
  filedOn: string | null;
  status: FilingStatus | null;
}

export interface FilingsMatrixRow {
  key: string;
  compliance: string;
  particular: string;
  /** Set only when the matrix is built per company (firm-scope "All companies"). */
  engagementId?: string;
  companyName?: string;
  cells: FilingsMatrixCell[];
}

export interface FilingsMatrixOptions {
  /**
   * Key rows by company as well as obligation. A firm-scope register holds the
   * same obligation for many companies; without this their cells would
   * overwrite each other in one row.
   */
  perCompany?: boolean;
}

/**
 * The deck matrix: one row per obligation, one column per period. Cells are
 * null where that obligation has nothing due in that period — an honest blank,
 * not a zero.
 */
export function buildMatrix(
  rows: FilingRow[],
  periodKeys: string[],
  /** Maps a row to the period column it belongs in. */
  periodKeyOf: (row: FilingRow) => string | null,
  now = new Date(),
  options: FilingsMatrixOptions = {},
): FilingsMatrixRow[] {
  const byObligation = new Map<string, FilingsMatrixRow>();
  const columnIndex = new Map(periodKeys.map((key, index) => [key, index]));
  const perCompany = options.perCompany === true;

  for (const row of rows) {
    const key = perCompany
      ? `${row.engagementId}::${row.compliance}::${row.particular}`
      : `${row.compliance}::${row.particular}`;
    let entry = byObligation.get(key);
    if (!entry) {
      entry = {
        key,
        compliance: row.compliance,
        particular: row.particular,
        ...(perCompany ? { engagementId: row.engagementId, companyName: row.companyName } : {}),
        cells: periodKeys.map(() => ({ dueDate: null, filedOn: null, status: null })),
      };
      byObligation.set(key, entry);
    }
    const period = periodKeyOf(row);
    const index = period ? columnIndex.get(period) : undefined;
    if (index === undefined) continue;
    entry.cells[index] = {
      dueDate: row.dueDate,
      filedOn: row.filedOn,
      status: filingStatus(row, now),
    };
  }

  return [...byObligation.values()].sort(
    (a, b) =>
      (a.companyName ?? '').localeCompare(b.companyName ?? '') ||
      a.compliance.localeCompare(b.compliance) ||
      a.particular.localeCompare(b.particular),
  );
}

export function sortByDueDate(rows: FilingRow[]): FilingRow[] {
  return [...rows].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.particular.localeCompare(b.particular),
  );
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

/** `?period=2026-04` (monthly) or `?period=2026` (an FY start year). */
export function parseMonthParam(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim()) ? value.trim() : null;
}

export function parseFyParam(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.trim(), 10);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function parseIsoDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "11 Sep 2026" — the register's date face. */
export function formatFilingDate(iso: string | null | undefined): string {
  const date = parseIsoDate(iso);
  if (!date) return '—';
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function monthLabelOf(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const index = Number.parseInt(month ?? '', 10) - 1;
  return `${MONTH_SHORT[index] ?? '—'} ${year}`;
}
