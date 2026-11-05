/**
 * RECEIVABLES CURRENCIES — the one list of foreign currencies an invoice, a forward contract or a
 * rate alert may use (docs/specs/receivables/PLAN.md, Phase 10). INR is the home currency and is
 * not in the list. Every screen, route and job reads this list, so adding a currency here is the
 * whole change, provided the rate source publishes it.
 *
 * `decimals` is how many places the currency's amounts show (JPY has none). `peggedToUsd` marks a
 * currency the European Central Bank does not publish: its INR rate is worked out from the USD
 * rate at the fixed peg.
 */

export type CurrencyInfo = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Units of this currency per one USD, for a currency fixed to the dollar. */
  peggedToUsd?: number;
};

export const FOREIGN_CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'USD', name: 'US dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'Pound sterling', symbol: '£', decimals: 2 },
  { code: 'AED', name: 'UAE dirham', symbol: 'AED', decimals: 2, peggedToUsd: 3.6725 },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$', decimals: 2 },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$', decimals: 2 },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'C$', decimals: 2 },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF', decimals: 2 },
  { code: 'JPY', name: 'Japanese yen', symbol: '¥', decimals: 0 },
];

/** The codes in display order, for selects and zod enums. */
export const FOREIGN_CURRENCY_CODES = FOREIGN_CURRENCIES.map((c) => c.code) as [string, ...string[]];

/** INR first, then the foreign currencies: what an invoice may be raised in. */
export const INVOICE_CURRENCY_CODES = ['INR', ...FOREIGN_CURRENCY_CODES] as [string, ...string[]];

const BY_CODE = new Map(FOREIGN_CURRENCIES.map((c) => [c.code, c]));

function clean(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

/** True for a supported foreign currency (never INR). */
export function isSupportedForeign(code: unknown): boolean {
  return BY_CODE.has(clean(code));
}

/** True for INR or a supported foreign currency. */
export function isInvoiceCurrency(code: unknown): boolean {
  const c = clean(code);
  return c === 'INR' || BY_CODE.has(c);
}

/** The currency's details; an unknown code gets plain defaults so a display never breaks. */
export function currencyInfo(code: unknown): CurrencyInfo {
  const c = clean(code);
  return BY_CODE.get(c) ?? { code: c || 'INR', name: c || 'Indian rupee', symbol: c === 'INR' || !c ? '₹' : c, decimals: 2 };
}

const FORMATS = new Map<number, Intl.NumberFormat>();
function format(decimals: number): Intl.NumberFormat {
  let f = FORMATS.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    FORMATS.set(decimals, f);
  }
  return f;
}

/** 12000 in EUR → "12,000.00"; in JPY → "12,000". Missing reads as zero. */
export function fcNumber(n: number | null | undefined, code: unknown): string {
  return format(currencyInfo(code).decimals).format(n ?? 0);
}

/** "EUR 12,000.00", or "—" when the amount is missing. */
export function fcLabel(n: number | null | undefined, code: unknown): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${currencyInfo(code).code} ${fcNumber(n, code)}`;
}

/** Sorts currency codes into the list's order, unknown codes last, without duplicates. */
export function sortCurrencies(codes: Iterable<string>): string[] {
  const order = (c: string) => {
    const i = FOREIGN_CURRENCY_CODES.indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...new Set([...codes].map(clean).filter(Boolean))].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}

/**
 * The header of a foreign amount column: "EUR Amount" when every foreign row is in one currency,
 * "Foreign Amount" when they are mixed (each row then names its own currency in the Currency
 * column). `word` lets a caller keep its own casing, e.g. "amount".
 */
export function foreignAmountHeader(codes: Iterable<string | null | undefined>, word = 'Amount'): string {
  const foreign = sortCurrencies([...codes].map((c) => clean(c)).filter((c) => c && c !== 'INR'));
  return foreign.length === 1 ? `${foreign[0]} ${word}` : `Foreign ${word}`;
}
