import { sep } from '@/lib/date-format';
import { DUE_SOON_DAYS } from '@/lib/compliance/filings';
import { ACT_SWATCH, type StatutoryAct } from '@/data/statutory-calendar-fy2627';

const ACT_ORDER = Object.keys(ACT_SWATCH) as StatutoryAct[];

export type StatutoryMonthCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

/** DOM id for a statutory agenda day group — calendar clicks scroll here. */
export function statutoryAgendaId(isoDate: string): string {
  return `statutory-agenda-${isoDate}`;
}

export function isoFromDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Six-week Sunday-start grid so month height stays stable. */
export function buildStatutoryMonthGrid(viewMonth: Date, weeks = 6): StatutoryMonthCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const count = weeks * 7;
  const out: StatutoryMonthCell[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month, 1 - firstWeekday + i);
    out.push({
      iso: isoFromDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }
  return out;
}

const KEY_STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/** Spatial move across a 7-column month grid. Returns null when the key is not a move. */
export function calendarCellIndexAfterKey(
  from: number,
  key: string,
  length: number,
  cols = 7,
): number | null {
  if (length <= 0 || from < 0 || from >= length) return null;
  if (key === 'Home') return from - (from % cols);
  if (key === 'End') return Math.min(length - 1, from - (from % cols) + (cols - 1));
  const step = KEY_STEP[key];
  if (step == null) return null;
  const next = from + step;
  if (next < 0 || next >= length) return from;
  return next;
}

/** Prefer the next in-month cell in the same direction; stay put at the edge. */
export function nextInMonthCellIndex(
  cells: readonly { inMonth: boolean }[],
  from: number,
  key: string,
): number | null {
  const raw = calendarCellIndexAfterKey(from, key, cells.length);
  if (raw == null) return null;
  if (key === 'Home' || key === 'End') {
    if (cells[raw]?.inMonth) return raw;
    const step = key === 'Home' ? 1 : -1;
    let i = raw;
    while (i >= 0 && i < cells.length) {
      if (cells[i].inMonth) return i;
      i += step;
    }
    return from;
  }
  const step = KEY_STEP[key] ?? 0;
  if (step === 0) return raw;
  let i = raw;
  while (i >= 0 && i < cells.length) {
    if (cells[i].inMonth) return i;
    i += Math.sign(step);
  }
  return from;
}

export function uniqueActsInCatalogOrder(acts: readonly StatutoryAct[]): StatutoryAct[] {
  const present = new Set(acts);
  return ACT_ORDER.filter((act) => present.has(act));
}

export function statutoryActTextClass(act: StatutoryAct): string {
  return ACT_SWATCH[act].chip.split(' ').find((c) => c.startsWith('text-stat-')) ?? 'text-ink';
}

/** Select-all is on when no category is muted. */
export function isSelectAllActive(mutedActs: ReadonlySet<unknown>): boolean {
  return mutedActs.size === 0;
}

export function toggleMutedAct<T>(muted: Iterable<T>, act: T): Set<T> {
  const next = new Set(muted);
  if (next.has(act)) next.delete(act);
  else next.add(act);
  return next;
}

/** Empty muted set = every category included. */
export function selectAllActs<T>(): Set<T> {
  return new Set();
}

/** Mute every category so the calendar shows no deadlines. */
export function muteAllActs<T>(acts: Iterable<T>): Set<T> {
  return new Set(acts);
}

export function dateHasAgendaItems(
  isoDate: string,
  byDate: ReadonlyMap<string, readonly unknown[]>,
): boolean {
  const items = byDate.get(isoDate);
  return Boolean(items && items.length > 0);
}

/** Four GitHub-style luminance steps: empty / 1 / 2–3 / 4+. */
export type StatutoryHeatLevel = 0 | 1 | 2 | 3;

export function statutoryHeatLevel(count: number): StatutoryHeatLevel {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

export function statutoryCountByDate(items: readonly { date: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.date, (map.get(item.date) ?? 0) + 1);
  }
  return map;
}

export type StatutoryFyHeatCell = {
  iso: string;
  inFy: boolean;
};

/** Sunday-start weeks covering the fiscal year (GitHub-style contribution grid). */
export function buildStatutoryFyWeeks(
  fyStartIso: string,
  fyEndIso: string,
): StatutoryFyHeatCell[][] {
  const start = new Date(`${fyStartIso}T12:00:00`);
  const end = new Date(`${fyEndIso}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const stop = new Date(end);
  stop.setDate(stop.getDate() + (6 - stop.getDay()));

  const weeks: StatutoryFyHeatCell[][] = [];
  const d = new Date(cursor);
  while (d.getTime() <= stop.getTime() && weeks.length < 54) {
    const week: StatutoryFyHeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoFromDate(d);
      week.push({ iso, inFy: iso >= fyStartIso && iso <= fyEndIso });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function statutoryFyMonthLabels(
  weeks: readonly (readonly StatutoryFyHeatCell[])[],
): { weekIndex: number; label: string; prefix: string }[] {
  const labels: { weekIndex: number; label: string; prefix: string }[] = [];
  let prev = '';
  weeks.forEach((week, weekIndex) => {
    const monthStart = week.find((c) => c.inFy && c.iso.endsWith('-01'));
    const first = monthStart ?? week.find((c) => c.inFy);
    if (!first) return;
    const prefix = first.iso.slice(0, 7);
    if (prefix === prev) return;
    if (!monthStart && labels.length > 0) return;
    prev = prefix;
    const d = new Date(`${first.iso}T12:00:00`);
    labels.push({
      weekIndex,
      label: sep(d.toLocaleDateString('en-IN', { month: 'short' })),
      prefix,
    });
  });
  return labels;
}

export function isoInStatutoryFy(iso: string, fyStartIso: string, fyEndIso: string): boolean {
  return iso >= fyStartIso && iso <= fyEndIso;
}

/**
 * Soft cell wash for a day that has deadlines.
 * Single-act only — multi-act days skip the wash so stacked stripes stay distinct.
 */
export function statutoryCellWash(acts: readonly StatutoryAct[]): string | null {
  if (acts.length !== 1) return null;
  const lead = acts[0];
  return lead ? ACT_SWATCH[lead].soft : null;
}

/* ── Row presentation ───────────────────────────────────────────────────────
   The FY master calendar carries no status, owner, or period column — it is a
   fixed list of dates. Everything below derives display-only values from the
   date and title so the redesigned list can show a status pill and a return
   period without touching the source rows.                                  */

/** Filing state as the list pill shows it. `filed` is unreachable here — a
    master-calendar entry is a deadline, not a submission. */
export type StatutoryStatus = 'overdue' | 'due-soon' | 'upcoming';


const MS_PER_DAY = 86_400_000;

/** Whole days from `todayIso` to `dateIso`; negative once the date is past. */
export function statutoryDaysUntil(dateIso: string, todayIso: string): number {
  const from = Date.parse(`${todayIso}T12:00:00Z`);
  const to = Date.parse(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / MS_PER_DAY);
}

export function statutoryStatus(dateIso: string, todayIso: string): StatutoryStatus {
  const days = statutoryDaysUntil(dateIso, todayIso);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'upcoming';
}

/** Status pill copy — "Today" / "3 days" carry more than a repeated word. */
export function statutoryStatusLabel(dateIso: string, todayIso: string): string {
  const days = statutoryDaysUntil(dateIso, todayIso);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= DUE_SOON_DAYS) return `${days} days`;
  return 'Upcoming';
}

/** Trailing parenthetical in a deadline title is its return period —
    "Form 141 challan-cum-statement (Jul ’26)" → "Jul ’26". */
export function statutoryReturnPeriod(title: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(title);
  const inner = match?.[1]?.trim();
  return inner ? inner : null;
}

/** The same title with its return period removed, so the row does not say it twice. */
export function statutoryFilingName(title: string): string {
  return statutoryReturnPeriod(title) ? title.replace(/\s*\([^()]+\)\s*$/, '').trim() : title;
}

/** Category dots a calendar cell shows, in catalog order, capped for tidy cells. */
export function statutoryCellActs(
  items: readonly { act: StatutoryAct }[],
  cap = 3,
): { acts: StatutoryAct[]; overflow: number } {
  const ordered = uniqueActsInCatalogOrder(items.map((i) => i.act));
  return { acts: ordered.slice(0, cap), overflow: Math.max(0, ordered.length - cap) };
}

/* ── Maximized month view ─────────────────────────────────────────────────── */

export type StatutoryCalendarMode = 'minimized' | 'maximized';

const CALENDAR_VIEW_STORAGE_KEY = 'vcfo.statutory-calendar.view.v1';

export type StatutoryCalendarViewPrefs = {
  mode: StatutoryCalendarMode;
};

const DEFAULT_CALENDAR_VIEW_PREFS: StatutoryCalendarViewPrefs = {
  mode: 'minimized',
};

export function parseCalendarViewPrefs(raw: unknown): StatutoryCalendarViewPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_CALENDAR_VIEW_PREFS;
  }
  const value = raw as Record<string, unknown>;
  return { mode: value.mode === 'maximized' ? 'maximized' : 'minimized' };
}

export function readCalendarViewPrefs(): StatutoryCalendarViewPrefs {
  if (typeof window === 'undefined') return DEFAULT_CALENDAR_VIEW_PREFS;
  try {
    const raw = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_CALENDAR_VIEW_PREFS;
    return parseCalendarViewPrefs(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_CALENDAR_VIEW_PREFS;
  }
}

export function writeCalendarViewPrefs(prefs: StatutoryCalendarViewPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked — the toggle still works for this session.
  }
}

/**
 * Compact pill label for a grid cell — catalogue titles list every variant
 * ("GSTR-7 & GSTR-8; Form A & B (EOU); MOOWR return"), the cell shows the
 * first clause and the full title lives in the tooltip.
 */
export function statutoryPillLabel(title: string): string {
  const first = title
    .split(';')
    .map((part) => part.trim())
    .find(Boolean);
  return first ?? title.trim();
}
