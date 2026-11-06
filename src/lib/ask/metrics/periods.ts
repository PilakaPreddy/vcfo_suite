import { financialYearForDate, financialYearLabel, parseIsoDate, todayIST } from '@/lib/compliance/filings';
import type { MetricFilters, MetricPeriod } from './types';

/**
 * Period words and their date ranges. India counts in financial years (1 April to 31 March), so
 * "this year" means this financial year here, and the answer always names the year it counted.
 */

export interface PeriodRange {
  /** ISO dates, both inclusive. */
  from: string;
  to: string;
  /** "in FY 2026-27", to sit inside a sentence. */
  label: string;
}

const THIS = '(?:this|current|is|iss|ye|yeh)';
const LAST = '(?:last|previous|pichle|pichhle|pichla|pichhla)';
const YEAR = '(?:financial year|fin year|fiscal year|fy|year|saal|sal)';
const MONTH = '(?:month|mahine|mahina|maheene)';
const QUARTER = '(?:quarter|qtr)';

/** Normalised text to period, longest phrases first. */
const PERIOD_WORDS: ReadonlyArray<[RegExp, MetricPeriod]> = [
  [new RegExp(`\\b${THIS} ${YEAR}\\b`), 'this_fy'],
  [new RegExp(`\\b${LAST} ${YEAR}\\b`), 'last_fy'],
  [new RegExp(`\\b${THIS} ${QUARTER}\\b`), 'this_quarter'],
  [new RegExp(`\\b${THIS} ${MONTH}\\b`), 'this_month'],
  [new RegExp(`\\b${LAST} ${MONTH}\\b`), 'last_month'],
  [/\b(?:overall|all time|till date|to date|till now|so far|ab tak|abhi tak|in total|total|ever)\b/, 'all_time'],
];

/** "fy 2025-26", "2025-26" or "financial year 2025-2026". */
const NAMED_FY = /\b(?:(?:fy|financial year)\s*)?(20\d{2})\s*-\s*(\d{2}|20\d{2})\b/;

/** Any other way of naming a time, which no filter here can honour. */
const OTHER_TIME = /\b(?:(?:19|20)\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|yesterday|today|tomorrow|week|month|quarter|year|kal|aaj)\b/g;

export interface PeriodRead {
  filters: Pick<MetricFilters, 'period' | 'fyStartYear'>;
  /** The text with the period words taken out. */
  rest: string;
}

/** `text` is already lowercase; the hyphen in a named year must still be there. */
export function readPeriod(text: string): PeriodRead {
  const named = NAMED_FY.exec(text);
  if (named) {
    const start = Number(named[1]);
    const end = named[2]!;
    const ends = end.length === 2 ? Number(end) === (start + 1) % 100 : Number(end) === start + 1;
    if (ends) return { filters: { fyStartYear: start }, rest: text.replace(named[0], ' ') };
  }
  for (const [pattern, period] of PERIOD_WORDS) {
    if (pattern.test(text)) return { filters: { period }, rest: text.replace(pattern, ' ') };
  }
  return { filters: {}, rest: text };
}

/** The time words still in `text`, for the router path, where nothing checks that every word was consumed. */
export function otherTimeWords(text: string): string[] {
  return text.match(OTHER_TIME) ?? [];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fyRange(startYear: number): PeriodRange {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31`, label: `in ${financialYearLabel(startYear)}` };
}

function monthRange(year: number, month: number): PeriodRange {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const mm = String(month + 1).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}`, label: `in ${MONTH_NAMES[month]} ${year}` };
}

/** The range a metric counts over, or null when it counts everything to date. */
export function periodRange(filters: MetricFilters, now: Date): PeriodRange | null {
  if (filters.fyStartYear !== undefined) return fyRange(filters.fyStartYear);
  const today = parseIsoDate(todayIST(now))!;
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const fy = financialYearForDate(today).startYear;
  switch (filters.period) {
    case 'this_fy':
      return fyRange(fy);
    case 'last_fy':
      return fyRange(fy - 1);
    case 'this_month':
      return monthRange(year, month);
    case 'last_month':
      return month === 0 ? monthRange(year - 1, 11) : monthRange(year, month - 1);
    case 'this_quarter': {
      // Quarters run April to June, July to September, October to December, January to March.
      const quarter = Math.floor(((month + 9) % 12) / 3);
      const first = (quarter * 3 + 3) % 12;
      const firstYear = first >= 3 ? fy : fy + 1;
      const end = monthRange(firstYear, first + 2);
      return {
        from: `${firstYear}-${String(first + 1).padStart(2, '0')}-01`,
        to: end.to,
        label: `in Q${quarter + 1} of ${financialYearLabel(fy)}`,
      };
    }
    default:
      return null;
  }
}

/** The months of a range that holds at most a year, as `YYYY-MM` with a short label. */
export function monthsOf(range: PeriodRange): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const cursor = new Date(`${range.from.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= range.to && out.length < 12) {
    out.push({ key: cursor.toISOString().slice(0, 7), label: MONTH_NAMES[cursor.getUTCMonth()]!.slice(0, 3) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
