/**
 * LABOUR REGISTERS — the per-day attendance block.
 *
 * An attendance export is twenty or so fixed columns followed by one column per calendar day,
 * then a total. Every muster roll in the catalogue needs that block, and the research found
 * that **no dedicated import product handles a repeating column group at all** — Flatfile,
 * OneSchema, Dromo, CSVbox and nuvo all map one heading to one field. The pattern is solved a
 * layer earlier by data-preparation tools, as an explicit unpivot on the preview, and Altair
 * Monarch has the clearest vocabulary for it: which columns to unpivot, which to keep as
 * identity, and what to call the outputs.
 *
 * So this file detects the run of date headings and offers it as one decision — "treat columns
 * 21 to 51 as the daily block" — which the preparer accepts or rejects. It is reversible, and
 * the detected date format is offered as a choice rather than guessed silently, because
 * 03/04/2026 is the third of April in one export and the fourth of March in another.
 */

/** How a run of day headings was understood. */
export interface DayColumn {
  /** Position in the uploaded sheet. */
  index: number;
  /** The heading as written. */
  header: string;
  /** The day of the month it resolves to, 1 to 31. */
  day: number;
  /** The resolved ISO date, when the heading carried a month and year. */
  date?: string;
}

export interface GridDetection {
  /** True when a run long enough to be a month was found. */
  found: boolean;
  /** The columns of the block, in sheet order. */
  days: DayColumn[];
  /** The ambiguity that had to be resolved, and how. */
  format: 'iso' | 'day-month-year' | 'month-day-year' | 'day-only' | 'weekday-day' | 'none';
  /**
   * True when the headings could be read either day-first or month-first and the choice
   * changes the result. The screen must then ask rather than assume.
   */
  ambiguous: boolean;
  /** Indices that are inside the run but did not parse as a day — a stray subtotal. */
  gaps: number[];
}

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/** A heading read as a day of the month, with whatever else it carried. */
function readDay(raw: string): { day: number; month?: number; year?: number; order?: 'dmy' | 'mdy' | 'iso' } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  /* A spreadsheet date cell arrives as an ISO timestamp: `2026-09-01 00:00:00`. */
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return { day: Number(d), month: Number(m), year: Number(y), order: 'iso' };
  }

  /* `01/09/2026` or `1-9-26`: the order is genuinely unknown from one heading alone. */
  const slash = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : undefined;
    /* One of the two numbers being above twelve settles it. */
    if (a > 12 && b <= 12) return { day: a, month: b, year, order: 'dmy' };
    if (b > 12 && a <= 12) return { day: b, month: a, year, order: 'mdy' };
    return { day: a, month: b, year, order: 'dmy' };
  }

  /* `1 Sep`, `Sep 1`, `01-Sep-2026`. */
  const named = s.match(/^(\d{1,2})[\s-]*([a-z]{3,})|^([a-z]{3,})[\s-]*(\d{1,2})$/i);
  if (named) {
    const dayFirst = named[1];
    const monthWord = (named[2] ?? named[3] ?? '').slice(0, 3).toLowerCase();
    const monthIdx = MONTHS.indexOf(monthWord);
    if (monthIdx >= 0) {
      const day = Number(dayFirst ?? named[4]);
      if (day >= 1 && day <= 31) return { day, month: monthIdx + 1, order: 'dmy' };
    }
  }

  /* `Mon 1`, `M 1`, `1 Mon` — a weekday beside the number, which some biometric exports emit. */
  const weekday = s.match(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(\d{1,2})$|^(\d{1,2})\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i);
  if (weekday) {
    const day = Number(weekday[1] ?? weekday[2]);
    if (day >= 1 && day <= 31) return { day };
  }

  /* A bare `1` … `31`. Only meaningful inside a long run, which the caller checks. */
  const bare = s.match(/^(\d{1,2})$/);
  if (bare) {
    const day = Number(bare[1]);
    if (day >= 1 && day <= 31) return { day };
  }

  return null;
}

/**
 * Find the per-day block in a sheet's headings.
 *
 * A run has to be at least `minRun` columns long to count, so a sheet with a single `Date`
 * column is not mistaken for a muster roll. Twenty is deliberately below twenty-eight: a
 * part-month export, or one with a stray subtotal in the middle, should still be recognised,
 * and the gaps are reported rather than silently absorbed.
 */
export function detectAttendanceGrid(headers: string[], minRun = 20): GridDetection {
  const parsed = headers.map((h) => readDay(h));

  let bestStart = -1;
  let bestEnd = -1;
  let start = -1;
  let misses = 0;

  for (let i = 0; i <= parsed.length; i += 1) {
    const hit = i < parsed.length ? parsed[i] : null;
    if (hit) {
      if (start === -1) start = i;
      misses = 0;
    } else if (start !== -1) {
      /* Tolerate one non-day column inside a run — a subtotal between fortnights. */
      misses += 1;
      if (misses > 1 || i === parsed.length) {
        const end = i - misses;
        if (end - start + 1 > bestEnd - bestStart) {
          bestStart = start;
          bestEnd = end;
        }
        start = -1;
        misses = 0;
      }
    }
  }

  if (bestStart === -1 || bestEnd - bestStart + 1 < minRun) {
    return { found: false, days: [], format: 'none', ambiguous: false, gaps: [] };
  }

  const days: DayColumn[] = [];
  const gaps: number[] = [];
  for (let i = bestStart; i <= bestEnd; i += 1) {
    const hit = parsed[i];
    if (!hit) {
      gaps.push(i);
      continue;
    }
    const date =
      hit.year && hit.month
        ? `${hit.year}-${String(hit.month).padStart(2, '0')}-${String(hit.day).padStart(2, '0')}`
        : undefined;
    days.push({ index: i, header: headers[i], day: hit.day, date });
  }

  const orders = new Set(days.map((_, k) => parsed[days[k].index]?.order).filter(Boolean));
  const format: GridDetection['format'] = orders.has('iso')
    ? 'iso'
    : orders.has('mdy')
      ? 'month-day-year'
      : orders.has('dmy')
        ? 'day-month-year'
        : days.every((d) => /^\d{1,2}$/.test(d.header.trim()))
          ? 'day-only'
          : 'weekday-day';

  /* Ambiguous when every heading could be read either way: all day and month parts are twelve
     or below, so nothing in the data settles the order. */
  const ambiguous =
    (format === 'day-month-year' || format === 'month-day-year') &&
    days.every((d) => {
      const p = parsed[d.index];
      return p && p.month !== undefined && p.day <= 12 && p.month <= 12;
    });

  return { found: true, days, format, ambiguous, gaps };
}

/** The sheet positions the grid occupies, so the column matcher can leave them alone. */
export function gridIndices(detection: GridDetection): number[] {
  if (!detection.found) return [];
  const first = detection.days[0]?.index ?? 0;
  const last = detection.days[detection.days.length - 1]?.index ?? first;
  const out: number[] = [];
  for (let i = first; i <= last; i += 1) out.push(i);
  return out;
}

/**
 * The sentence the screen shows about a detected block. Written here so the upload screen and
 * the reconciliation screen cannot describe the same detection differently.
 */
export function describeGrid(detection: GridDetection): string {
  if (!detection.found) return 'No daily attendance block found in this sheet.';
  const first = detection.days[0];
  const last = detection.days[detection.days.length - 1];
  const span = `columns ${first.index + 1} to ${last.index + 1}`;
  const count = `${detection.days.length} days`;
  if (detection.ambiguous) {
    return `${span} look like a daily block of ${count}, but the date order cannot be read from the headings. Choose day-first or month-first.`;
  }
  const gaps = detection.gaps.length > 0 ? `, with ${detection.gaps.length} column(s) inside the run that are not days` : '';
  return `${span} read as a daily block of ${count}${gaps}.`;
}
