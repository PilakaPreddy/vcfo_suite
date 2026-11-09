/**
 * The month a labour register file is for, read from its names: the file name, a sheet name and the
 * folders above it. Payroll files are named in many ways ("Aug-2026", "August 2026", "08-2026",
 * "2026-08", "Oct'26", "Payroll_Oct26"), and a register batch is one month, so the answer is always a
 * whole month as ISO dates.
 *
 * Names are tried in the order given, so a caller passes the most specific first (the file, then the
 * sheet, then the folders from the deepest up). When no single name holds both a month and a year, a
 * month in one name and a year in another ("2026/Aug/pay.xlsx") still count. A name with a month and
 * no year anywhere gives no hint, because guessing the year would file a sheet into the wrong batch.
 */

export interface PeriodHint {
  from: string;
  to: string;
}

const MONTHS: ReadonlyArray<readonly [number, readonly string[]]> = [
  [1, ['january', 'jan']],
  [2, ['february', 'feb']],
  [3, ['march', 'mar']],
  [4, ['april', 'apr']],
  [5, ['may']],
  [6, ['june', 'jun']],
  [7, ['july', 'jul']],
  [8, ['august', 'aug']],
  [9, ['september', 'sept', 'sep']],
  [10, ['october', 'oct']],
  [11, ['november', 'nov']],
  [12, ['december', 'dec']],
];

const MONTH_BY_WORD = new Map(MONTHS.flatMap(([n, words]) => words.map((w) => [w, n] as const)));
/** Longest first, so "september" wins over "sep". */
const MONTH_WORDS = [...MONTH_BY_WORD.keys()].sort((a, b) => b.length - a.length).join('|');

const pad = (n: number) => String(n).padStart(2, '0');

function monthOf(year: number, month: number): PeriodHint | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2000 || year > 2099 || month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

const fullYear = (raw: string) => (raw.length === 2 ? 2000 + Number(raw) : Number(raw));

/*
 * A month word must not touch another letter ("Octopus", "summary"), and a number must not touch
 * another digit. Underscores, dots, dashes, spaces and apostrophes separate.
 */
const NOT_LETTER_BEFORE = '(?<![a-z])';
const NOT_LETTER_AFTER = '(?![a-z])';
const SEP = "[\\s._\\-'’/,]*";

const NAMED_PATTERNS: ReadonlyArray<{ re: RegExp; month: number; year: number }> = [
  // "August 2026", "Aug-2026", "Oct'26", "Payroll_Oct26", "aug_26"
  { re: new RegExp(`${NOT_LETTER_BEFORE}(${MONTH_WORDS})${NOT_LETTER_AFTER}${SEP}(20\\d{2}|\\d{2})(?!\\d)`, 'i'), month: 1, year: 2 },
  // "2026 August", "2026-Aug"
  { re: new RegExp(`(?<!\\d)(20\\d{2})${SEP}(${MONTH_WORDS})${NOT_LETTER_AFTER}`, 'i'), month: 2, year: 1 },
];

const NUMERIC_PATTERNS: ReadonlyArray<{ re: RegExp; read: (m: RegExpExecArray) => PeriodHint | null }> = [
  // A whole ISO date, "2026-08-15": its month.
  { re: /(?<!\d)(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/, read: (m) => monthOf(Number(m[1]), Number(m[2])) },
  // A whole Indian date, "15-08-2026": day first, so its month is the middle number.
  { re: /(?<!\d)(\d{1,2})[-_./](\d{1,2})[-_./](20\d{2})(?!\d)/, read: (m) => monthOf(Number(m[3]), Number(m[2])) },
  // "2026-08", "2026_8"
  { re: /(?<!\d)(20\d{2})[-_./](\d{1,2})(?![\d])/, read: (m) => monthOf(Number(m[1]), Number(m[2])) },
  // "08-2026", "8.2026"
  { re: /(?<!\d)(\d{1,2})[-_./](20\d{2})(?!\d)/, read: (m) => monthOf(Number(m[2]), Number(m[1])) },
];

/** The month one name gives on its own, or null. */
function hintInName(name: string): PeriodHint | null {
  for (const { re, read } of NUMERIC_PATTERNS) {
    const m = re.exec(name);
    const hint = m ? read(m) : null;
    if (hint) return hint;
  }
  for (const { re, month, year } of NAMED_PATTERNS) {
    const m = re.exec(name);
    if (!m) continue;
    const hint = monthOf(fullYear(m[year]!), MONTH_BY_WORD.get(m[month]!.toLowerCase()) ?? 0);
    if (hint) return hint;
  }
  return null;
}

const MONTH_ALONE = new RegExp(`${NOT_LETTER_BEFORE}(${MONTH_WORDS})${NOT_LETTER_AFTER}`, 'i');
const YEAR_ALONE = /(?<!\d)(20\d{2})(?!\d)/;

/**
 * The month the names point to, or null when they do not say. Each argument is one name (a file
 * name, a sheet name or a folder name); a path is split into its names first.
 */
export function parsePeriodHint(...names: ReadonlyArray<string | null | undefined>): PeriodHint | null {
  const parts = names.flatMap((n) => (n ? n.split(/[\\/]/) : [])).map((n) => n.replace(/\.(xlsx|xlsm|xls|csv|pdf|ods)$/i, '').trim()).filter(Boolean);
  for (const name of parts) {
    const hint = hintInName(name);
    if (hint) return hint;
  }
  // A month in one name and the year in another.
  const month = parts.map((n) => MONTH_ALONE.exec(n)?.[1]).find(Boolean);
  const year = parts.map((n) => YEAR_ALONE.exec(n)?.[1]).find(Boolean);
  if (month && year) return monthOf(Number(year), MONTH_BY_WORD.get(month.toLowerCase()) ?? 0);
  return null;
}
