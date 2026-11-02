/**
 * LABOUR REGISTERS — header normalisation.
 *
 * Indian payroll systems write the same column a dozen ways: `Date_of_Joining`, `Date of
 * joining`, `DOJ`, `Date of Appointment`. Everything the matcher does starts by reducing a
 * heading to a comparable form, so this file is deliberately small, pure and well tested.
 *
 * The rules were derived from real headings in filed workbooks, not invented: the paysheet of
 * one client uses underscores and title case, its attendance export uses spaces and mixed
 * case, and its overtime report abbreviates. Each transformation below exists because a real
 * pair of headings needed it.
 */

/**
 * Words that carry no distinguishing meaning in a payroll heading. They are dropped before
 * comparison so `Name of the Employee` and `Employee Name` reduce to the same tokens.
 *
 * `total`, `gross` and `net` are deliberately NOT in this list: `Total deductions` and
 * `Deductions` are different columns, and confusing them would put the wrong number in a
 * statutory register.
 */
const NOISE = new Set([
  'of',
  'the',
  'a',
  'an',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
  'by',
  'with',
  'no',
  'nos',
  'number',
  'sno',
  'rs',
  'inr',
  'value',
  'details',
  'detail',
  'if',
  'any',
  'as',
  'per',
  'during',
  'col',
  'column',
]);

/** Abbreviations seen in payroll exports, expanded so they can match a spelt-out heading. */
const EXPANSIONS: Record<string, string> = {
  emp: 'employee',
  empno: 'employee',
  empid: 'employee',
  dob: 'birth date',
  doj: 'joining date',
  dol: 'leaving date',
  hra: 'house rent allowance',
  da: 'dearness allowance',
  nsa: 'night shift allowance',
  ot: 'overtime',
  pf: 'provident fund',
  epf: 'provident fund',
  vpf: 'voluntary provident fund',
  esi: 'employee state insurance',
  esic: 'employee state insurance',
  pt: 'profession tax',
  ptax: 'profession tax',
  tds: 'income tax',
  lwf: 'labour welfare fund',
  lop: 'loss pay',
  lwp: 'loss pay',
  nfh: 'holiday',
  wo: 'week off',
  uan: 'universal account',
  pan: 'permanent account',
  ifsc: 'ifsc',
  nps: 'national pension',
  ctc: 'cost to company',
  fnf: 'final settlement',
  sme: 'subject matter expert',
};

/** Crude singularisation: enough for headings, and it never touches a word under four letters. */
function singular(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * A heading reduced to lower-case words separated by single spaces, with punctuation,
 * underscores, bracketed asides and accents removed. This is the form stored in a remembered
 * mapping, so changing it is a migration, not a tweak.
 */
export function normaliseHeader(raw: string): string {
  return String(raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/[_\-/\\.,:;'"`*#[\]{}]+/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The comparable token set of a heading: normalised, expanded, singularised, with noise words
 * dropped. An empty result falls back to the normalised words, so a heading made entirely of
 * noise (`Details`) still has something to compare.
 */
export function headerTokens(raw: string): string[] {
  const words = normaliseHeader(raw).split(' ').filter(Boolean);
  const expanded: string[] = [];
  for (const w of words) {
    const exp = EXPANSIONS[w];
    if (exp) expanded.push(...exp.split(' '));
    else expanded.push(w);
  }
  const kept = expanded.map(singular).filter((w) => w && !NOISE.has(w));
  return kept.length > 0 ? kept : expanded.map(singular);
}

/** The token set as a `Set`, for intersection work. */
export function tokenSet(raw: string): Set<string> {
  return new Set(headerTokens(raw));
}

/**
 * Character trigrams of a normalised heading, used to catch a typo or a run-together heading
 * that tokens alone would miss (`Dateofjoining`).
 */
export function trigrams(raw: string): Set<string> {
  const s = ` ${normaliseHeader(raw).replace(/\s+/g, ' ')} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i += 1) out.add(s.slice(i, i + 3));
  return out;
}

/** The Dice coefficient of two sets: twice the shared members over the two sizes. */
export function dice<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** The Jaccard index of two sets: shared members over the union. */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}
