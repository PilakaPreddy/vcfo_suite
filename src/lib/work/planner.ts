/**
 * Planner maths for the lead's week calendar (Plan my week, G-17). Time blocks are
 * stored as timestamps; the calendar reads them in India Standard Time, which has a
 * fixed +05:30 offset and no daylight saving, so plain arithmetic is exact.
 */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Hours the week grid shows. Blocks outside are clipped to the grid edge. */
export const PLAN_DAY_START = 8;
export const PLAN_DAY_END = 20;
/** Shortest and longest block. */
const MIN_BLOCK_MINUTES = 15;
const MAX_BLOCK_HOURS = 12;
/** A day over this many planned hours is heavy (prototype WorkPlan). */
export const HEAVY_DAY_HOURS = 6;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface PlannerBlock {
  id: string;
  itemKey: string | null;
  engagementId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
}

function isYmd(value: string): boolean {
  return YMD_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isHhmm(value: string): boolean {
  return HHMM_RE.test(value);
}

/** IST calendar date of a timestamp. */
export function istYmdOf(iso: string | Date): string {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(ms + IST_MS).toISOString().slice(0, 10);
}

/** IST hour of a timestamp as a fraction, for example 10.5 for 10:30. */
export function istHourOf(iso: string): number {
  const shifted = new Date(Date.parse(iso) + IST_MS);
  return shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
}

/** IST wall time `HH:MM` of a timestamp. */
export function istTimeOf(iso: string): string {
  return new Date(Date.parse(iso) + IST_MS).toISOString().slice(11, 16);
}

/** The ISO timestamp of an IST date and wall time. */
export function istIso(ymd: string, hhmm: string): string {
  return new Date(Date.parse(`${ymd}T${hhmm}:00+05:30`)).toISOString();
}

export function addDaysYmd(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayIndex(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function weekdayShort(ymd: string): string {
  return WEEKDAYS[weekdayIndex(ymd)]!;
}

export function isWeekend(ymd: string): boolean {
  const d = weekdayIndex(ymd);
  return d === 0 || d === 6;
}

/** A week's range as timestamps: its first day 00:00 to seven days later, IST. */
export function weekRange(days: readonly string[]): { from: string; to: string } {
  return { from: istIso(days[0]!, '00:00'), to: istIso(addDaysYmd(days[0]!, 7), '00:00') };
}

/** `14 Oct` (R-29). */
export function dayMonth(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Monday of the week that holds `ymd`. */
export function mondayOf(ymd: string): string {
  const offset = (weekdayIndex(ymd) + 6) % 7;
  return addDaysYmd(ymd, -offset);
}

/** Seven IST dates from the Monday of the week that holds `ymd`. */
export function weekOf(ymd: string): string[] {
  const monday = mondayOf(ymd);
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i));
}

/** `9 AM`, `12 PM`, `6 PM`. */
export function hourLabel(hour: number): string {
  const h = Math.floor(hour);
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** `10:00 to 11:30` in IST. */
export function timeRangeLabel(startsAt: string, endsAt: string): string {
  return `${istTimeOf(startsAt)} to ${istTimeOf(endsAt)}`;
}

/**
 * A block may be saved when it ends after it starts, lasts 15 minutes to 12 hours,
 * and starts and ends on the same IST day (the calendar draws one column per day).
 */
export function isValidBlockRange(startsAt: string, endsAt: string): boolean {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const minutes = (end - start) / 60_000;
  if (minutes < MIN_BLOCK_MINUTES || minutes > MAX_BLOCK_HOURS * 60) return false;
  return istYmdOf(new Date(start)) === istYmdOf(new Date(end - 1));
}

/** Where a block sits on a week grid, in hours from the grid top; null when off the grid. */
export function placeBlock(
  block: Pick<PlannerBlock, 'startsAt' | 'endsAt'>,
  days: readonly string[],
  dayStart = PLAN_DAY_START,
  dayEnd = PLAN_DAY_END,
): { dayIdx: number; top: number; height: number } | null {
  const dayIdx = days.indexOf(istYmdOf(block.startsAt));
  if (dayIdx < 0) return null;
  const start = Math.max(istHourOf(block.startsAt), dayStart);
  const endYmd = istYmdOf(new Date(Date.parse(block.endsAt) - 1));
  const rawEnd = endYmd === days[dayIdx] ? istHourOf(block.endsAt) || 24 : 24;
  const end = Math.min(rawEnd, dayEnd);
  if (end <= start) return null;
  return { dayIdx, top: start - dayStart, height: end - start };
}

/** Planned hours per day of `days`. */
export function dayLoadHours(
  blocks: ReadonlyArray<Pick<PlannerBlock, 'startsAt' | 'endsAt'>>,
  days: readonly string[],
): number[] {
  const out = days.map(() => 0);
  for (const b of blocks) {
    const idx = days.indexOf(istYmdOf(b.startsAt));
    if (idx < 0) continue;
    out[idx]! += Math.max(0, Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 3_600_000;
  }
  return out;
}

export interface PlanCandidate {
  itemKey: string;
  title: string;
  /** A filing goes first with `filingsFirst`. */
  filing?: boolean;
  /** The client, for `groupByClient`. */
  client?: string;
  /** IST due date, when the item has one. */
  dueYmd?: string;
  overdue: boolean;
}

export interface SuggestedBlock {
  itemKey: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Plan my week: one block per open item in the first free working-hours slot of the
 * week, overdue items first and then by due date, never in the past, never over an
 * existing block, and never past the item's due date when a slot before it is free.
 * Weekends are skipped and no day goes over `HEAVY_DAY_HOURS`.
 */
export function suggestWeekBlocks(input: {
  candidates: readonly PlanCandidate[];
  busy: ReadonlyArray<Pick<PlannerBlock, 'startsAt' | 'endsAt'>>;
  days: readonly string[];
  now: Date;
  minutes?: number;
  slotStart?: number;
  slotEnd?: number;
  /** Plan options (Plan my week): keep 9 to 11 AM free, filings first, one client's items together. */
  keepMorning?: boolean;
  filingsFirst?: boolean;
  groupByClient?: boolean;
  /** Hours a day may hold (default `HEAVY_DAY_HOURS`). */
  maxDayHours?: number;
  /** Reshuffle: start the search on a later working day (0 = the first). */
  shuffle?: number;
}): SuggestedBlock[] {
  const minutes = input.minutes ?? 60;
  const slotStart = Math.max(input.slotStart ?? 10, input.keepMorning ? 11 : 0);
  const maxDay = input.maxDayHours ?? HEAVY_DAY_HOURS;
  const slotEnd = input.slotEnd ?? 18;
  const nowMs = input.now.getTime();
  const todayYmd = istYmdOf(input.now);
  const open = input.days.filter((d) => !isWeekend(d) && d >= todayYmd);
  const turn = open.length ? (input.shuffle ?? 0) % open.length : 0;
  const workDays = [...open.slice(turn), ...open.slice(0, turn)];

  const taken: Array<[number, number]> = input.busy.map((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)]);
  const load = new Map<string, number>();
  for (const b of input.busy) {
    const d = istYmdOf(b.startsAt);
    load.set(d, (load.get(d) ?? 0) + (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 3_600_000);
  }

  const ordered = [...input.candidates]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      if (a.c.overdue !== b.c.overdue) return a.c.overdue ? -1 : 1;
      if (input.filingsFirst && Boolean(a.c.filing) !== Boolean(b.c.filing)) return a.c.filing ? -1 : 1;
      if (input.groupByClient && (a.c.client ?? '') !== (b.c.client ?? '')) return (a.c.client ?? '').localeCompare(b.c.client ?? '');
      const ad = a.c.dueYmd ?? '9999-12-31';
      const bd = b.c.dueYmd ?? '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.c);

  const findSlot = (days: string[]): { start: number; end: number; day: string } | null => {
    for (const day of days) {
      if ((load.get(day) ?? 0) + minutes / 60 > maxDay) continue;
      for (let h = slotStart * 60; h + minutes <= slotEnd * 60; h += 30) {
        const hhmm = `${String(Math.floor(h / 60)).padStart(2, '0')}:${String(h % 60).padStart(2, '0')}`;
        const start = Date.parse(istIso(day, hhmm));
        const end = start + minutes * 60_000;
        if (start < nowMs) continue;
        if (taken.some(([s, e]) => overlaps(start, end, s, e))) continue;
        return { start, end, day };
      }
    }
    return null;
  };

  const out: SuggestedBlock[] = [];
  for (const c of ordered) {
    const beforeDue = c.dueYmd && c.dueYmd >= todayYmd ? workDays.filter((d) => d <= c.dueYmd!) : [];
    const slot = (beforeDue.length ? findSlot(beforeDue) : null) ?? findSlot(workDays);
    if (!slot) continue;
    taken.push([slot.start, slot.end]);
    load.set(slot.day, (load.get(slot.day) ?? 0) + minutes / 60);
    out.push({
      itemKey: c.itemKey,
      title: c.title,
      startsAt: new Date(slot.start).toISOString(),
      endsAt: new Date(slot.end).toISOString(),
    });
  }
  return out;
}
