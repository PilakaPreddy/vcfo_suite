/**
 * BOARD MEETING DATES — the 10-day notice window, the 30-day MoM window and the 120-day gap.
 * Dates are ISO `YYYY-MM-DD` strings in India time; times are `HH:MM` 24-hour IST.
 *
 *   T-10  VCFO tells the lead to prepare the notice.
 *   T-7   the notice must be sent (Sec 173(3)).
 *   T+30  the signed MoM must be on file (SS-1).
 *   last + 120 days: the latest date for the next board meeting (Sec 173(1)).
 */

const DAY = 86_400_000;

function D(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function addDaysIso(iso: string, n: number): string {
  return new Date(D(iso).getTime() + n * DAY).toISOString().slice(0, 10);
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((D(toIso).getTime() - D(fromIso).getTime()) / DAY);
}

/** Today in India time as `YYYY-MM-DD`. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

const PREPARE_DAYS = 10;
const NOTICE_DAYS = 7;
const MOM_DAYS = 30;
const GAP_DAYS = 120;

export function prepareDate(meetingDate: string): string {
  return addDaysIso(meetingDate, -PREPARE_DAYS);
}
export function noticeSendDate(meetingDate: string): string {
  return addDaysIso(meetingDate, -NOTICE_DAYS);
}
export function momDueDate(meetingDate: string): string {
  return addDaysIso(meetingDate, MOM_DAYS);
}
export function nextMeetingLimit(lastMeetingDate: string): string {
  return addDaysIso(lastMeetingDate, GAP_DAYS);
}

/** Notice sent on `sendDate` for a meeting on `meetingDate` is short notice (under 7 days). */
export function isShortNotice(sendDate: string, meetingDate: string): boolean {
  return daysBetweenIso(sendDate, meetingDate) < NOTICE_DAYS;
}

/** The planned meeting breaks the 120-day gap after the last board meeting. */
export function breaksGap(lastMeetingDate: string | null, meetingDate: string): boolean {
  if (!lastMeetingDate) return false;
  return meetingDate > nextMeetingLimit(lastMeetingDate);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: string): { y: number; m: number; d: number; wd: number } {
  const dt = D(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), wd: dt.getUTCDay() };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "10 September 2026" */
export function longDate(iso: string): string {
  const p = parts(iso);
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.m]} ${p.y}`;
}

/** "Thursday, 10th September 2026" */
export function noticeDate(iso: string): string {
  const p = parts(iso);
  return `${WEEKDAYS[p.wd]}, ${ordinal(p.d)} ${MONTHS[p.m]} ${p.y}`;
}

/** "Thu 10 Sep 2026" */
export function shortDate(iso: string): string {
  const p = parts(iso);
  return `${WEEKDAYS[p.wd]!.slice(0, 3)} ${p.d} ${SHORT_MONTHS[p.m]} ${p.y}`;
}

/** "07:30 P.M." from "19:30". */
export function noticeTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map((x) => Number(x));
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${pm ? 'P.M.' : 'A.M.'}`;
}

/** Valid `YYYY-MM-DD`. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return !Number.isNaN(D(v).getTime()) && D(v).toISOString().slice(0, 10) === v;
}

/** Valid `HH:MM` 24-hour. */
export function isHhmm(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}
