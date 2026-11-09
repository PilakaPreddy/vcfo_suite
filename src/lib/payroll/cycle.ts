/**
 * Payroll cycles. A cycle is one calendar month. It carries three dates: the period it covers,
 * the cut-off (the last day the client can change salaries) and the payment date. The cut-off
 * defaults to the 16th and the payment date to the 27th, which matches the cycle the firm
 * already runs for its clients on Papaya; both can be changed per cycle.
 *
 * Dates are plain `YYYY-MM-DD` strings so they compare as text and never shift with the
 * browser's time zone. The cut-off time is 21:00 UTC (02:30 IST the next morning).
 */

export const DEFAULT_CUTOFF_DAY = 16;
export const DEFAULT_PAYMENT_DAY = 27;
export const CUTOFF_TIME_UTC = '21:00';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface PayrollCycle {
  /** `YYYY-MM`. */
  key: string;
  year: number;
  month: number;
  /** First and last day of the month, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** "01–30 Nov 2026", the label the cycle picker shows. */
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function cycleFor(year: number, month: number): PayrollCycle {
  const last = daysInMonth(year, month);
  return {
    key: `${year}-${pad(month)}`,
    year,
    month,
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last)}`,
    label: `01–${pad(last)} ${MONTHS_SHORT[month - 1]} ${year}`,
  };
}

/** Parse `YYYY-MM`; anything else falls back to the month that contains `today`. */
export function parseCycleKey(key: string | undefined, today: Date = new Date()): PayrollCycle {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? '');
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return cycleFor(Number(m[1]), month);
  }
  return cycleFor(today.getUTCFullYear(), today.getUTCMonth() + 1);
}

/** The cycles the picker offers: `back` months before the current one and `ahead` after it. */
export function cycleOptions(today: Date = new Date(), back = 6, ahead = 2): PayrollCycle[] {
  const out: PayrollCycle[] = [];
  for (let i = ahead; i >= -back; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
    out.push(cycleFor(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }
  return out;
}

/** The default cut-off and payment dates, clamped to the month's last day. */
export function defaultDates(cycle: PayrollCycle): { cutoff: string; payment: string } {
  const last = daysInMonth(cycle.year, cycle.month);
  const day = (d: number) => `${cycle.key}-${pad(Math.min(d, last))}`;
  return { cutoff: day(DEFAULT_CUTOFF_DAY), payment: day(DEFAULT_PAYMENT_DAY) };
}

export interface DateCheck {
  ok: boolean;
  message?: string;
}

/**
 * The rules a picked date must meet: both dates sit inside the cycle month, and the payment
 * date is on or after the cut-off (salaries are frozen before money moves).
 */
export function checkDates(cycle: PayrollCycle, cutoff: string, payment: string): DateCheck {
  const inMonth = (d: string) => d >= cycle.from && d <= cycle.to;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || !/^\d{4}-\d{2}-\d{2}$/.test(payment)) {
    return { ok: false, message: 'Pick both dates.' };
  }
  if (!inMonth(cutoff)) return { ok: false, message: `The cut-off date must fall inside ${cycle.label}.` };
  if (!inMonth(payment)) return { ok: false, message: `The payment date must fall inside ${cycle.label}.` };
  if (payment < cutoff) return { ok: false, message: 'The payment date cannot be before the cut-off date.' };
  return { ok: true };
}

/** "16 Nov 2026". */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

/** The cut-off moment as a real instant: the cut-off day at 21:00 UTC. */
export function cutoffInstant(cutoff: string): Date {
  return new Date(`${cutoff}T${CUTOFF_TIME_UTC}:00Z`);
}

/** Whole days from `now` to the cut-off moment, rounded down; negative once it has passed. */
export function daysToCutoff(cutoff: string, now: Date = new Date()): number {
  return Math.floor((cutoffInstant(cutoff).getTime() - now.getTime()) / 86_400_000);
}

/** The cut-off moment in India time, "17 Nov 02:30". */
export function cutoffLocalLabel(cutoff: string): string {
  const d = new Date(cutoffInstant(cutoff).getTime() + 330 * 60_000);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
