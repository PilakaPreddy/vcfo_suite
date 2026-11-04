import type { ChipTone } from '@/components/ui/spectrum-chip';
import {
  filingStatus,
  parseIsoDate,
  type FilingRow,
  type FilingStatus,
} from '@/lib/compliance/filings';
import type { FilingStatusFilter } from '@/views/compliances/compliance-scope';

/**
 * SPECTRUM STATUS WORDS for the staff compliance screens (rule R-13).
 *
 * The register keeps its own derived status (`filingStatus`: filed, overdue,
 * due soon, upcoming). On screen every status is one of the six words: Not
 * started, In progress, Waiting, Due soon, Overdue, Done. "Filed" reads as
 * Done and "Upcoming" as Not started. An instance the team has marked
 * `in-progress` reads as In progress while it is neither filed nor late.
 * Nothing here is stored; it is a view of the rows already in hand.
 */

export type SixWord = 'Not started' | 'In progress' | 'Waiting' | 'Due soon' | 'Overdue' | 'Done';

export const SIX_TONE: Record<SixWord, ChipTone> = {
  'Not started': 'idle',
  'In progress': 'prog',
  Waiting: 'teal',
  'Due soon': 'warn',
  Overdue: 'bad',
  Done: 'ok',
};

export const FILING_WORD: Record<FilingStatus, SixWord> = {
  filed: 'Done',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  upcoming: 'Not started',
};

/** The status filter options in the order the prototype shows them. */
const STATUS_FILTER_ORDER: readonly FilingStatusFilter[] = ['all', 'overdue', 'due-soon', 'upcoming', 'filed'];

const STATUS_FILTER_LABEL: Record<FilingStatusFilter, string> = {
  all: 'All',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  upcoming: 'Not started',
  filed: 'Done',
};

/** The four register statuses in chart order (R-25: charts use status colours only). */
export const CHART_STATUSES: readonly FilingStatus[] = ['overdue', 'due-soon', 'upcoming', 'filed'];

/** Bar and swatch fills per status. */
export const STATUS_FILL: Record<FilingStatus, string> = {
  filed: 'bg-positive-mid',
  overdue: 'bg-danger-mid',
  'due-soon': 'bg-warning-mid',
  upcoming: 'bg-upcoming-mid',
};

/** SVG stroke colours per status, from the same tokens. */
export const STATUS_STROKE: Record<FilingStatus, string> = {
  filed: 'oklch(var(--positive-mid))',
  overdue: 'oklch(var(--danger-mid))',
  'due-soon': 'oklch(var(--warning-mid))',
  upcoming: 'oklch(var(--upcoming-mid))',
};

/** Date tile colours: red late, amber soon, green done, grey later. */
export const STATUS_TILE: Record<FilingStatus, string> = {
  filed: 'bg-positive-soft text-positive',
  overdue: 'bg-danger-soft text-danger',
  'due-soon': 'bg-warning-soft text-warning',
  upcoming: 'bg-surface-sunken text-ink-2',
};

const RANK: Record<FilingStatus, number> = { overdue: 3, 'due-soon': 2, upcoming: 1, filed: 0 };

/** The worst status of a set: one late client makes the whole day or filing late. */
export function worstStatus(statuses: readonly FilingStatus[]): FilingStatus {
  let worst: FilingStatus = 'filed';
  for (const s of statuses) if (RANK[s] > RANK[worst]) worst = s;
  return statuses.length ? worst : 'upcoming';
}

/** The six-word reading of one register row. */
export function filingWord(row: Pick<FilingRow, 'filedOn' | 'dueDate' | 'rawStatus'>, now: Date): SixWord {
  const status = filingStatus(row, now);
  if ((status === 'upcoming' || status === 'due-soon') && row.rawStatus === 'in-progress') return 'In progress';
  return FILING_WORD[status];
}

/** "Income Tax" reads "Income tax"; acronyms (GST, MCA, TDS) keep their capitals. */
export function areaLabel(area: string): string {
  const words = area.trim().split(/\s+/);
  return words.map((w, i) => (i > 0 && !/^[A-Z0-9&/-]{2,}$/.test(w) ? w.toLowerCase() : w)).join(' ');
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Plain dates (R-05): "14 Oct", with the year only when it is not this year. */
export function plainDate(iso: string | null | undefined, now: Date = new Date()): string {
  const d = parseIsoDate(iso);
  if (!d) return '—';
  const base = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
}

/** Day of month and short month for a 44px date tile. */
export function tileParts(iso: string): { day: string; month: string } {
  const d = parseIsoDate(iso);
  if (!d) return { day: '—', month: '' };
  return { day: String(d.getUTCDate()), month: MON[d.getUTCMonth()]! };
}

/** Whole days from today (UTC) to an ISO date; negative when it is past. */
export function daysUntil(iso: string, now: Date): number | null {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - today) / 86_400_000);
}

/** One CSV cell, quoted. */
function cell(value: string | number | null | undefined): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

/** CSV text from a head row and body rows. */
export function toCsv(head: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
}

/** Hand the viewer a CSV file. Browser only. */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function emptyCounts(): Record<FilingStatus, number> {
  return { filed: 0, overdue: 0, 'due-soon': 0, upcoming: 0 };
}

/** R-28: Roboto Mono only for identifiers (GSTIN, PAN, CIN, ARN): long runs of capitals and digits. */
export function isIdentifier(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9/-]{7,}$/.test(value.trim()) && /\d/.test(value);
}
