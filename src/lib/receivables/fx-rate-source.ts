/**
 * RECEIVABLES FX RATE SOURCE — the daily reference rate, INR per one unit of a foreign currency
 * (docs/specs/receivables/PLAN.md, Phase 9).
 *
 * The official rate is the FBIL reference rate, published on Indian business days around 13:30
 * IST. FBIL has no stable public JSON API, so the primary source is pluggable: set
 * `FX_RATE_SOURCE_URL` to an FBIL-compatible endpoint (a mirror, a vendor feed or an internal
 * proxy) and its answer is read defensively, whatever reasonable JSON shape it has. When that is
 * unset or gives nothing usable, the Frankfurter API (European Central Bank reference rates) is
 * the fallback, and the rate is stored with source `ecb` so the manager can tell the two apart.
 *
 * Frankfurter's documented answer to `GET /v1/latest?base=USD&symbols=INR` is
 * `{ "amount": 1.0, "base": "USD", "date": "2026-10-30", "rates": { "INR": 84.12 } }`.
 * Nothing here throws: every failure returns null so the job can log and move on.
 *
 * Phase 10: `fetchReferenceRates` asks for several currencies at once. The FBIL-compatible source
 * is still asked once per currency (its URL takes `{currency}`), and whatever it leaves out comes
 * from one Frankfurter call with base EUR (the ECB's own quotes, so the cross rate loses no
 * precision): INR per X is the EUR/INR rate divided by the EUR/X rate. The ECB does not publish
 * the UAE dirham, so a currency pegged to the dollar is worked out from the USD rate at its peg.
 */
import { currencyInfo } from './currencies';

export type FetchedRate = {
  currency: string;
  /** The day the rate is for, `YYYY-MM-DD`. */
  rateDate: string;
  /** INR per one unit of `currency`. */
  rate: number;
  source: 'fbil' | 'ecb';
};

export type RateSourceOptions = {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  /** Milliseconds before a source counts as down. */
  timeoutMs?: number;
};

const DEFAULT_FRANKFURTER_URL = 'https://api.frankfurter.dev/v1';

/** Rates outside this band are treated as a parsing mistake, not a market move. */
const MIN_RATE = 0.0001;
const MAX_RATE = 100_000;

const MON: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

function saneRate(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '').trim()) : NaN;
  return Number.isFinite(n) && n >= MIN_RATE && n <= MAX_RATE ? n : null;
}

/** `2026-10-30`, `30-10-2026`, `30/10/2026`, `30-Oct-2026` or `30 Oct 2026` → `2026-10-30`; anything else → null. */
export function parseRateDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return valid(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2,4})$/.exec(s);
  if (m && MON[m[2].toUpperCase()]) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return valid(`${year}-${MON[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`);
  }
  return null;
}

function valid(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function pickKey(obj: Record<string, unknown>, test: RegExp): unknown {
  const key = Object.keys(obj).find((k) => test.test(k));
  return key === undefined ? undefined : obj[key];
}

/** True when some text field of the record names the currency (e.g. "USD", "INR / 1 USD"). */
function namesCurrency(obj: Record<string, unknown>, currency: string): boolean {
  const re = new RegExp(`\\b${currency}\\b`, 'i');
  return Object.values(obj).some((v) => typeof v === 'string' && re.test(v));
}

function fromRecord(obj: Record<string, unknown>, currency: string): { rate: number; rateDate: string | null } | null {
  // { rates: { USD: 84.1 } } or { rates: { INR: 84.1 }, base: "USD" }.
  const rates = obj.rates;
  if (rates && typeof rates === 'object' && !Array.isArray(rates)) {
    const r = rates as Record<string, unknown>;
    const base = typeof obj.base === 'string' ? obj.base.toUpperCase() : null;
    const direct = base === currency ? saneRate(r.INR) : saneRate(r[currency]);
    if (direct !== null) return { rate: direct, rateDate: parseRateDate(pickKey(obj, /date/i)) };
  }
  // { USD: 84.1, date: "..." }
  const own = saneRate(obj[currency] ?? obj[currency.toLowerCase()]);
  if (own !== null) return { rate: own, rateDate: parseRateDate(pickKey(obj, /date/i)) };
  // { currency: "USD", rate: "84.1", date: "30-Oct-2026" } or FBIL's { "Currency Pairs": "INR / 1 USD", "Rate": ... }.
  const rate = saneRate(pickKey(obj, /^(rate|value|reference.?rate|ref.?rate)$/i) ?? pickKey(obj, /rate/i));
  if (rate !== null && namesCurrency(obj, currency)) return { rate, rateDate: parseRateDate(pickKey(obj, /date/i)) };
  return null;
}

/**
 * Reads an FBIL-compatible answer: a record, an array of records, or a record that wraps the
 * array (`data`, `result`, `rates`, `items`). Returns null when no believable rate is found.
 */
export function parseFbilLike(body: unknown, currency: string, fallbackDate: string): Omit<FetchedRate, 'source'> | null {
  const cur = currency.toUpperCase();
  const seen = new Set<unknown>();
  const visit = (node: unknown, depth: number): { rate: number; rateDate: string | null } | null => {
    if (!node || typeof node !== 'object' || depth > 4 || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    const hit = fromRecord(obj, cur);
    if (hit) return hit;
    for (const k of ['data', 'result', 'results', 'items', 'rates', 'referenceRates']) {
      if (k in obj) {
        const inner = visit(obj[k], depth + 1);
        if (inner) return { rate: inner.rate, rateDate: inner.rateDate ?? parseRateDate(pickKey(obj, /date/i)) };
      }
    }
    return null;
  };
  const hit = visit(body, 0);
  if (!hit) return null;
  return { currency: cur, rate: hit.rate, rateDate: hit.rateDate ?? fallbackDate };
}

/** Reads Frankfurter's `{ amount, base, date, rates: { INR } }`; the rate is per one unit even if `amount` is not 1. */
export function parseFrankfurter(body: unknown, currency: string): Omit<FetchedRate, 'source'> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { amount?: unknown; base?: unknown; date?: unknown; rates?: unknown };
  const cur = currency.toUpperCase();
  if (typeof b.base === 'string' && b.base.toUpperCase() !== cur) return null;
  const rates = b.rates && typeof b.rates === 'object' ? (b.rates as Record<string, unknown>) : null;
  const inr = saneRate(rates?.INR);
  const rateDate = parseRateDate(b.date);
  if (inr === null || !rateDate) return null;
  const amount = typeof b.amount === 'number' && b.amount > 0 ? b.amount : 1;
  return { currency: cur, rateDate, rate: Math.round((inr / amount) * 1e6) / 1e6 };
}

async function getJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  try {
    // AbortSignal.timeout is missing in some test environments; without it the request simply has no deadline.
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Fills `{currency}` and `{date}` in a configured URL, so one env value can serve any currency. */
function fillUrl(template: string, currency: string, date: string): string {
  return template.replace(/\{currency\}/gi, encodeURIComponent(currency)).replace(/\{date\}/gi, encodeURIComponent(date));
}

/**
 * Today's reference rate for `currency`: the configured FBIL-compatible source first, then
 * Frankfurter. `today` (IST, `YYYY-MM-DD`) is the date given to a primary answer that carries
 * none. Null when neither source answers with a believable rate.
 */
export async function fetchReferenceRate(currency: string, today: string, opts: RateSourceOptions = {}): Promise<FetchedRate | null> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const cur = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur) || cur === 'INR') return null;

  const primary = env.FX_RATE_SOURCE_URL?.trim();
  if (primary) {
    const parsed = parseFbilLike(await getJson(fillUrl(primary, cur, today), fetchImpl, timeoutMs), cur, today);
    if (parsed) return { ...parsed, source: 'fbil' };
  }

  const base = (env.FX_FRANKFURTER_URL?.trim() || DEFAULT_FRANKFURTER_URL).replace(/\/+$/, '');
  const parsed = parseFrankfurter(await getJson(`${base}/latest?base=${encodeURIComponent(cur)}&symbols=INR`, fetchImpl, timeoutMs), cur);
  return parsed ? { ...parsed, source: 'ecb' } : null;
}

/**
 * Reads Frankfurter's `{ base: "EUR", date, rates: { INR, USD, GBP, ... } }` into INR per one unit
 * of each asked currency. EUR itself is the INR quote. A currency missing from the answer is left
 * out; null when the answer has no INR quote or no date.
 */
export function parseFrankfurterCross(body: unknown, currencies: string[]): Array<Omit<FetchedRate, 'source'>> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { amount?: unknown; base?: unknown; date?: unknown; rates?: unknown };
  const base = typeof b.base === 'string' ? b.base.toUpperCase() : '';
  const rates = b.rates && typeof b.rates === 'object' ? (b.rates as Record<string, unknown>) : null;
  const rateDate = parseRateDate(b.date);
  const inr = saneRate(rates?.INR);
  if (!base || !rates || !rateDate || inr === null) return null;
  const out: Array<Omit<FetchedRate, 'source'>> = [];
  for (const raw of currencies) {
    const cur = raw.toUpperCase();
    // INR per one unit of the base, then per one unit of the asked currency.
    const perBase = cur === base ? 1 : saneRate(rates[cur]);
    if (perBase === null) continue;
    const amount = typeof b.amount === 'number' && b.amount > 0 ? b.amount : 1;
    out.push({ currency: cur, rateDate, rate: Math.round((inr / perBase / (cur === base ? amount : 1)) * 1e6) / 1e6 });
  }
  return out;
}

/**
 * Today's reference rates for every currency in `currencies` (INR and bad codes are skipped):
 * the FBIL-compatible source per currency first, then one Frankfurter call for the rest, then a
 * dollar-pegged currency from the USD rate. A currency no source answers is simply absent; the
 * job reports it as missing.
 */
export async function fetchReferenceRates(currencies: Iterable<string>, today: string, opts: RateSourceOptions = {}): Promise<FetchedRate[]> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const wanted = [...new Set([...currencies].map((c) => String(c ?? '').trim().toUpperCase()))].filter((c) => /^[A-Z]{3}$/.test(c) && c !== 'INR');
  const found = new Map<string, FetchedRate>();

  const primary = env.FX_RATE_SOURCE_URL?.trim();
  if (primary) {
    for (const cur of wanted) {
      const parsed = parseFbilLike(await getJson(fillUrl(primary, cur, today), fetchImpl, timeoutMs), cur, today);
      if (parsed) found.set(cur, { ...parsed, source: 'fbil' });
    }
  }

  const pegged = (c: string) => Boolean(currencyInfo(c).peggedToUsd);
  // A pegged currency needs the USD rate, so USD is asked for whenever one is wanted.
  const ask = [...new Set([...wanted.filter((c) => !found.has(c) && !pegged(c)), ...(wanted.some((c) => !found.has(c) && pegged(c)) && !found.has('USD') ? ['USD'] : [])])];
  if (ask.length) {
    const base = (env.FX_FRANKFURTER_URL?.trim() || DEFAULT_FRANKFURTER_URL).replace(/\/+$/, '');
    const symbols = [...new Set(['INR', ...ask.filter((c) => c !== 'EUR')])].join(',');
    const cross = parseFrankfurterCross(await getJson(`${base}/latest?base=EUR&symbols=${encodeURIComponent(symbols)}`, fetchImpl, timeoutMs), ask);
    for (const r of cross ?? []) found.set(r.currency, { ...r, source: 'ecb' });
    // When the one call fails, each currency is asked on its own, so one bad symbol cannot lose them all.
    if (!cross) {
      for (const cur of ask) {
        const one = await fetchReferenceRate(cur, today, { fetchImpl, timeoutMs, env: { ...env, FX_RATE_SOURCE_URL: '' } });
        if (one) found.set(cur, one);
      }
    }
  }

  const usd = found.get('USD');
  for (const cur of wanted) {
    const peg = currencyInfo(cur).peggedToUsd;
    if (found.has(cur) || !peg || !usd) continue;
    found.set(cur, { currency: cur, rateDate: usd.rateDate, rate: Math.round((usd.rate / peg) * 1e6) / 1e6, source: usd.source });
  }
  return wanted.filter((c) => found.has(c)).map((c) => found.get(c)!);
}
