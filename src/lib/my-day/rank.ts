/**
 * "My day" ranking (IDEAS-PLAN wave 2, section F). Pure: no database, no clock of its own, so the
 * Today card, the morning email and Ask VCFO's "plan my day" all order the same list the same way.
 *
 * SCORING. Every item gets `score = BAND[kind] + clamp(weight, 0, 999)`. The band puts each kind in
 * its own block of 1000 points, so a kind higher up the list always beats one lower down, and the
 * weight orders items inside one block. The gatherer sets the weight as follows:
 *
 *   1. overdue       days late (a filing, task, notice reply or expiry whose date has passed)
 *   2. due_today     0, so due-today items keep the date and title order
 *   3. approval      days the approval has waited on me
 *   4. client_reply  days since the client replied or uploaded (waiting for my review)
 *   5. expiry        7 minus days left (expiring within 7 days; the soonest weighs most)
 *   6. notice        7 minus days to the response date (within 7 days; the soonest weighs most)
 *   7. request_list  days since the last move on a stalled client request list
 *   8. task          days since the task was last touched, so a forgotten task floats up
 *
 * Ties break on the due date (earliest first, undated last), then the company, then the title,
 * so the order is stable between the card and the email.
 */

export const MY_DAY_KINDS = [
  'overdue',
  'due_today',
  'approval',
  'client_reply',
  'expiry',
  'notice',
  'request_list',
  'task',
] as const;
export type MyDayKind = (typeof MY_DAY_KINDS)[number];

export interface MyDayItem {
  /** Stable key across reloads, for example `filing:<id>` or `task:<id>`. */
  id: string;
  kind: MyDayKind;
  title: string;
  /** A short second line: the source area and the reason ("GST · 3 days late"). */
  detail?: string;
  /** The project's route key (slug or app id). */
  engagementId: string;
  companyName: string;
  /** ISO day (YYYY-MM-DD) when the item has one. */
  dueOn?: string;
  href: string;
  /** The within-band measure described above; higher ranks first. */
  weight: number;
}

export interface RankedMyDayItem extends MyDayItem {
  score: number;
}

const BAND_SIZE = 1000;

/** Higher bands rank first: overdue is 8000, other tasks 1000. */
export const MY_DAY_BAND: Record<MyDayKind, number> = Object.fromEntries(
  MY_DAY_KINDS.map((kind, i) => [kind, (MY_DAY_KINDS.length - i) * BAND_SIZE]),
) as Record<MyDayKind, number>;

/** The short word the card and the email show beside each item. */
export const MY_DAY_LABEL: Record<MyDayKind, string> = {
  overdue: 'Overdue',
  due_today: 'Due today',
  approval: 'Approval',
  client_reply: 'Client reply',
  expiry: 'Expiring',
  notice: 'Notice',
  request_list: 'Request list',
  task: 'Task',
};

export function myDayScore(item: Pick<MyDayItem, 'kind' | 'weight'>): number {
  const w = Number.isFinite(item.weight) ? Math.min(Math.max(Math.floor(item.weight), 0), BAND_SIZE - 1) : 0;
  return MY_DAY_BAND[item.kind] + w;
}

function compare(a: RankedMyDayItem, b: RankedMyDayItem): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.dueOn !== b.dueOn) {
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    return a.dueOn.localeCompare(b.dueOn);
  }
  const company = a.companyName.localeCompare(b.companyName);
  if (company !== 0) return company;
  return a.title.localeCompare(b.title);
}

/** Orders the items by score, drops duplicate ids (the first kept), and keeps at most `limit`. */
export function rankMyDay(items: readonly MyDayItem[], limit?: number): RankedMyDayItem[] {
  const seen = new Set<string>();
  const ranked: RankedMyDayItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ranked.push({ ...item, score: myDayScore(item) });
  }
  ranked.sort(compare);
  return typeof limit === 'number' && limit >= 0 ? ranked.slice(0, limit) : ranked;
}

/** Counts per kind, for the card's head and the email's opening line. */
export function countMyDay(items: readonly Pick<MyDayItem, 'kind'>[]): Record<MyDayKind, number> {
  const out = Object.fromEntries(MY_DAY_KINDS.map((k) => [k, 0])) as Record<MyDayKind, number>;
  for (const item of items) out[item.kind] += 1;
  return out;
}

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** Today's date in India (YYYY-MM-DD); the firm works on IST whatever the server's zone. */
export function istDay(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD); negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/**
 * The band for a dated item: overdue once the date has passed, due today on the day, and the
 * item's own kind otherwise.
 */
export function bandForDate(dueOn: string | undefined | null, today: string, otherwise: MyDayKind): MyDayKind {
  if (!dueOn) return otherwise;
  const left = daysBetween(today, dueOn);
  if (left < 0) return 'overdue';
  if (left === 0) return 'due_today';
  return otherwise;
}
