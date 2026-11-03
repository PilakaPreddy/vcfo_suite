/**
 * RECEIVABLES DATES — ISO `YYYY-MM-DD` strings in India time, compared as UTC midnights so no
 * local timezone can shift a day.
 */

const DAY = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function D(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** Today in India time as `YYYY-MM-DD`. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, n: number): string {
  return new Date(D(iso).getTime() + n * DAY).toISOString().slice(0, 10);
}

/** `to` minus `from`, in whole days. */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((D(toIso).getTime() - D(fromIso).getTime()) / DAY);
}

/** Days until the due date: positive before it, 0 on it, negative once overdue. */
export function daysLeft(dueDate: string, today: string): number {
  return daysBetweenIso(today, dueDate);
}

export function isWeekendIso(iso: string): boolean {
  const w = D(iso).getUTCDay();
  return w === 0 || w === 6;
}

/** `2026-11-02` → `02-Nov-26`, the sheet's own date format. */
export function sheetDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const x = D(iso);
  return `${String(x.getUTCDate()).padStart(2, '0')}-${MON[x.getUTCMonth()]}-${String(x.getUTCFullYear()).slice(2)}`;
}

/** `2026-09-01` → `September 2026`. */
export function monthLong(monthIso: string): string {
  const x = D(monthIso);
  return `${MON_LONG[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

/** `2026-09-01` → `September-26 Receivables`, the block title in the sheet and the email. */
export function monthBlockTitle(monthIso: string): string {
  const x = D(monthIso);
  return `${MON_LONG[x.getUTCMonth()]}-${String(x.getUTCFullYear()).slice(2)} Receivables`;
}

/** `2026-09-01` → `Sep'26`, the block total label. */
export function monthShort(monthIso: string): string {
  const x = D(monthIso);
  return `${MON[x.getUTCMonth()]}'${String(x.getUTCFullYear()).slice(2)}`;
}

/** Any ISO date → the first day of its month. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
