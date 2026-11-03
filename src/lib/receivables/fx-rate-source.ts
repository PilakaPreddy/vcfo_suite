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
 */

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
