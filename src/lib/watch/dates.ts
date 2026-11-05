/**
 * Dates in official Indian documents, read by code. `datesIn` finds every date in a text as an ISO
 * string, whichever way it was written, so the code check can compare a model's date with the
 * source's dates and listing adapters can read a row's date.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const ORD = '(?:st|nd|rd|th)?';

const NUMERIC = /(?<![\d/.-])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d/-])/g;
const YEAR_FIRST = /(?<![\d/.-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g;
const DAY_MONTH = new RegExp(`(?<![\\d])(\\d{1,2})${ORD}[\\s-]*(?:of\\s+)?${MONTH_WORD}[\\s,-]*(\\d{4})`, 'gi');
const MONTH_DAY = new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2})${ORD},?\\s+(\\d{4})`, 'gi');
const MONTH_YEAR = new RegExp(`\\b${MONTH_WORD},?\\s+(\\d{4})`, 'gi');

function iso(year: number, month: number, day: number): string | null {
  const when = new Date(Date.UTC(year, month - 1, day));
  if (when.getUTCMonth() !== month - 1 || when.getUTCDate() !== day) return null;
  return when.toISOString().slice(0, 10);
}

const monthIndex = (word: string): number => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

export interface FoundDates {
  /** Full dates, `YYYY-MM-DD`. */
  days: Set<string>;
  /** `YYYY-MM` for every full date and every "March 2027" with no day. */
  months: Set<string>;
  /** The text with each date cut out, so its parts are not read again as numbers. */
  rest: string;
}

export function datesIn(text: string): FoundDates {
  const days = new Set<string>();
  const months = new Set<string>();
  const add = (date: string | null) => {
    if (!date) return;
    days.add(date);
    months.add(date.slice(0, 7));
  };
  let rest = text.replace(YEAR_FIRST, (_all, y: string, m: string, d: string) => {
    add(iso(Number(y), Number(m), Number(d)));
    return ' ';
  });
  rest = rest.replace(NUMERIC, (_all, d: string, m: string, y: string) => {
    add(iso(y.length === 2 ? 2000 + Number(y) : Number(y), Number(m), Number(d)));
    return ' ';
  });
  rest = rest.replace(DAY_MONTH, (_all, d: string, word: string, y: string) => {
    add(iso(Number(y), monthIndex(word), Number(d)));
    return ' ';
  });
  rest = rest.replace(MONTH_DAY, (_all, word: string, d: string, y: string) => {
    add(iso(Number(y), monthIndex(word), Number(d)));
    return ' ';
  });
  rest = rest.replace(MONTH_YEAR, (_all, word: string, y: string) => {
    months.add(`${y}-${String(monthIndex(word)).padStart(2, '0')}`);
    return ' ';
  });
  return { days, months, rest };
}

/** The first full date in a listing cell or title, or null. */
export function firstDateIn(text: string): string | null {
  return [...datesIn(text).days][0] ?? null;
}

/** The calendar day in India for an instant. */
export function istDay(when: Date): string {
  return when.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
