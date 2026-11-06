import type { CatalogEntry, FieldFormat } from '@/lib/ask/field-catalog/types';

/**
 * Exact format checks. Code decides whether a value has the right shape, and it never repairs one:
 * a value that fails goes back to the person as a question.
 */
export interface FormatResult {
  ok: boolean;
  /** The value in the shape the screen stores. */
  value: string;
  message?: string;
}

const PATTERNS: Partial<Record<FieldFormat, readonly [RegExp, string]>> = {
  pan: [/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN has five letters, four digits and a letter.'],
  din: [/^\d{8}$/, 'A DIN has eight digits.'],
  cin: [/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, 'A CIN has 21 characters, such as U62011KA2024PTC123456.'],
  gstin: [/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'A GSTIN has 15 characters, starting with the state code and the PAN.'],
  ifsc: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'An IFSC has four letters, a zero and six letters or digits.'],
  pin: [/^[1-9]\d{5}$/, 'A PIN code has six digits.'],
  tan: [/^[A-Z]{4}\d{5}[A-Z]$/, 'A TAN has four letters, five digits and a letter.'],
  llpin: [/^[A-Z]{3}-?\d{4}$/, 'An LLPIN looks like AAA-1234.'],
  aadhaar: [/^[2-9]\d{11}$/, 'An Aadhaar number has twelve digits.'],
  passport: [/^[A-Z][1-9]\d{6}$/, 'A passport number has a letter and seven digits.'],
};

const COMPACT: ReadonlySet<FieldFormat> = new Set(['pan', 'din', 'cin', 'gstin', 'ifsc', 'pin', 'tan', 'llpin', 'aadhaar', 'passport']);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Indian documents write the day first, so `03/04/1985` is 3 April. */
function toIsoDate(raw: string): string | null {
  const text = raw.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const worded = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,})\.?,?[\s-]+(\d{4})$/.exec(text);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (numeric) [day, month, year] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
  else if (worded) [day, month, year] = [Number(worded[1]), MONTHS.indexOf(worded[2]!.slice(0, 3).toLowerCase()) + 1, Number(worded[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function checkFormat(entry: Pick<CatalogEntry, 'format' | 'options'>, raw: string): FormatResult {
  const trimmed = raw.trim();
  const { format } = entry;
  const fail = (message: string): FormatResult => ({ ok: false, value: trimmed, message });
  if (!trimmed) return fail('This needs a value.');
  if (COMPACT.has(format)) {
    const value = trimmed.replace(/[\s.]/g, '').toUpperCase();
    const [pattern, message] = PATTERNS[format]!;
    const compact = format === 'aadhaar' ? value.replace(/-/g, '') : value;
    return pattern.test(compact) ? { ok: true, value: compact } : fail(message);
  }
  switch (format) {
    case 'date': {
      const iso = toIsoDate(trimmed);
      return iso ? { ok: true, value: iso } : fail('This is not a date I can read. Use DD/MM/YYYY.');
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? { ok: true, value: trimmed } : fail('This is not an e-mail address.');
    case 'mobile': {
      const digits = trimmed.replace(/[\s()-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
      return /^[6-9]\d{9}$/.test(digits) ? { ok: true, value: digits } : fail('An Indian mobile number has ten digits.');
    }
    case 'amount': {
      const value = trimmed.replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/,/g, '').replace(/\/-$/, '');
      return /^\d+(\.\d{1,2})?$/.test(value) ? { ok: true, value } : fail('This is not an amount.');
    }
    case 'choice': {
      const wanted = trimmed.toLowerCase();
      const match = entry.options?.find((o) => o.value.toLowerCase() === wanted || o.label.toLowerCase() === wanted);
      if (match) return { ok: true, value: match.value };
      return entry.options?.length ? fail(`Choose one of: ${entry.options.map((o) => o.label).join(', ')}.`) : { ok: true, value: trimmed };
    }
    case 'file':
      return fail('A file cannot be typed in.');
    case 'longtext':
      return trimmed.length <= 5000 ? { ok: true, value: trimmed } : fail('This is too long.');
    default:
      return trimmed.length <= 500 ? { ok: true, value: trimmed } : fail('This is too long.');
  }
}

/** The format a value plainly has, whatever it was labelled; only shapes nothing else shares. */
export function formatOfValue(raw: string): FieldFormat | null {
  const value = raw.replace(/[\s.-]/g, '').toUpperCase();
  for (const format of ['pan', 'cin', 'gstin', 'ifsc', 'tan', 'aadhaar', 'passport'] as const) {
    if (PATTERNS[format]![0].test(value)) return format;
  }
  return null;
}
