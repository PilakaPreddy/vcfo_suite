import { describe, expect, it, vi } from 'vitest';
import { fetchReferenceRate, fetchReferenceRates, parseFbilLike, parseFrankfurter, parseFrankfurterCross, parseRateDate } from './fx-rate-source';

const TODAY = '2026-11-03';

function fakeFetch(answers: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const key = Object.keys(answers).find((k) => u.startsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    const body = answers[key];
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('parseRateDate', () => {
  it('reads the common date shapes and refuses impossible days', () => {
    expect(parseRateDate('2026-10-30')).toBe('2026-10-30');
    expect(parseRateDate('2026-10-30T13:30:00+05:30')).toBe('2026-10-30');
    expect(parseRateDate('30-10-2026')).toBe('2026-10-30');
    expect(parseRateDate('30/10/2026')).toBe('2026-10-30');
    expect(parseRateDate('30-Oct-2026')).toBe('2026-10-30');
    expect(parseRateDate('3 November 2026')).toBe('2026-11-03');
    expect(parseRateDate('2026-02-30')).toBeNull();
    expect(parseRateDate(42)).toBeNull();
  });
});

describe('parseFrankfurter', () => {
  it('reads the documented shape', () => {
    expect(parseFrankfurter({ amount: 1, base: 'USD', date: '2026-10-30', rates: { INR: 84.12 } }, 'USD')).toEqual({ currency: 'USD', rateDate: '2026-10-30', rate: 84.12 });
  });

  it('divides by amount and refuses another base or a missing rate', () => {
    expect(parseFrankfurter({ amount: 10, base: 'USD', date: '2026-10-30', rates: { INR: 841.2 } }, 'USD')?.rate).toBe(84.12);
    expect(parseFrankfurter({ amount: 1, base: 'EUR', date: '2026-10-30', rates: { INR: 91 } }, 'USD')).toBeNull();
    expect(parseFrankfurter({ amount: 1, base: 'USD', date: '2026-10-30', rates: {} }, 'USD')).toBeNull();
    expect(parseFrankfurter('nope', 'USD')).toBeNull();
  });
});

describe('parseFbilLike', () => {
  it('reads an FBIL-style list of currency pairs', () => {
    const body = [
      { 'Currency Pairs': 'INR / 1 EUR', Rate: '91.2001', Date: '30-Oct-2026' },
      { 'Currency Pairs': 'INR / 1 USD', Rate: '84.0927', Date: '30-Oct-2026' },
    ];
    expect(parseFbilLike(body, 'USD', TODAY)).toEqual({ currency: 'USD', rate: 84.0927, rateDate: '2026-10-30' });
  });

  it('reads wrapped and keyed shapes and falls back to today for the date', () => {
    expect(parseFbilLike({ data: [{ currency: 'USD', rate: 84.1, date: '2026-10-30' }] }, 'USD', TODAY)).toMatchObject({ rate: 84.1, rateDate: '2026-10-30' });
    expect(parseFbilLike({ date: '2026-10-30', rates: { USD: '84.2' } }, 'USD', TODAY)).toMatchObject({ rate: 84.2, rateDate: '2026-10-30' });
    expect(parseFbilLike({ USD: 84.3 }, 'USD', TODAY)).toMatchObject({ rate: 84.3, rateDate: TODAY });
  });

  it('refuses nonsense', () => {
    expect(parseFbilLike({ message: 'maintenance' }, 'USD', TODAY)).toBeNull();
    expect(parseFbilLike([{ currency: 'USD', rate: 'n/a' }], 'USD', TODAY)).toBeNull();
    expect(parseFbilLike([{ currency: 'EUR', rate: 91 }], 'USD', TODAY)).toBeNull();
    expect(parseFbilLike(null, 'USD', TODAY)).toBeNull();
  });
});

describe('fetchReferenceRate', () => {
  const frank = { amount: 1, base: 'USD', date: '2026-10-30', rates: { INR: 84.12 } };

  it('uses Frankfurter when no primary source is configured', async () => {
    const f = fakeFetch({ 'https://api.frankfurter.dev/v1/latest': frank });
    await expect(fetchReferenceRate('usd', TODAY, { fetchImpl: f, env: {} })).resolves.toEqual({ currency: 'USD', rateDate: '2026-10-30', rate: 84.12, source: 'ecb' });
    expect(String(f.mock.calls[0][0])).toBe('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  });

  it('prefers the configured FBIL source and fills its placeholders', async () => {
    const f = fakeFetch({ 'https://fx.example/ref': [{ pair: 'INR / 1 USD', rate: '84.09' }] });
    const r = await fetchReferenceRate('USD', TODAY, { fetchImpl: f, env: { FX_RATE_SOURCE_URL: 'https://fx.example/ref?c={currency}&d={date}' } });
    expect(r).toEqual({ currency: 'USD', rateDate: TODAY, rate: 84.09, source: 'fbil' });
    expect(String(f.mock.calls[0][0])).toBe('https://fx.example/ref?c=USD&d=2026-11-03');
  });

  it('falls back when the primary source fails or answers badly', async () => {
    const down = fakeFetch({ 'https://fx.example': new Error('ECONNRESET'), 'https://frank.example/v1/latest': frank });
    await expect(fetchReferenceRate('USD', TODAY, { fetchImpl: down, env: { FX_RATE_SOURCE_URL: 'https://fx.example/ref', FX_FRANKFURTER_URL: 'https://frank.example/v1/' } })).resolves.toMatchObject({ source: 'ecb', rate: 84.12 });
    const bad = fakeFetch({ 'https://fx.example': { status: 'maintenance' }, 'https://api.frankfurter.dev': frank });
    await expect(fetchReferenceRate('USD', TODAY, { fetchImpl: bad, env: { FX_RATE_SOURCE_URL: 'https://fx.example/ref' } })).resolves.toMatchObject({ source: 'ecb' });
  });

  it('returns null when nothing answers, and never asks for INR', async () => {
    const none = fakeFetch({});
    await expect(fetchReferenceRate('USD', TODAY, { fetchImpl: none, env: {} })).resolves.toBeNull();
    await expect(fetchReferenceRate('INR', TODAY, { fetchImpl: none, env: {} })).resolves.toBeNull();
    expect(none).toHaveBeenCalledTimes(1);
  });
});

describe('parseFrankfurterCross', () => {
  const body = { amount: 1, base: 'EUR', date: '2026-11-03', rates: { INR: 97.5, USD: 1.16, GBP: 0.875, JPY: 176.4 } };

  it('turns EUR-based quotes into INR per unit of each currency', () => {
    const rows = parseFrankfurterCross(body, ['EUR', 'USD', 'GBP', 'JPY', 'CHF']);
    expect(rows?.map((r) => r.currency)).toEqual(['EUR', 'USD', 'GBP', 'JPY']);
    expect(rows?.find((r) => r.currency === 'EUR')?.rate).toBe(97.5);
    expect(rows?.find((r) => r.currency === 'USD')?.rate).toBeCloseTo(97.5 / 1.16, 6);
    expect(rows?.find((r) => r.currency === 'JPY')?.rate).toBeCloseTo(0.552721, 6);
    expect(rows?.every((r) => r.rateDate === '2026-11-03')).toBe(true);
  });

  it('refuses an answer without INR or a date', () => {
    expect(parseFrankfurterCross({ ...body, rates: { USD: 1.1 } }, ['USD'])).toBeNull();
    expect(parseFrankfurterCross({ ...body, date: 'soon' }, ['USD'])).toBeNull();
    expect(parseFrankfurterCross(null, ['USD'])).toBeNull();
  });
});

describe('fetchReferenceRates', () => {
  const ecb = { amount: 1, base: 'EUR', date: TODAY, rates: { INR: 97.5, USD: 1.16, GBP: 0.875 } };

  it('asks Frankfurter once for every currency and derives AED from the USD peg', async () => {
    const f = fakeFetch({ 'https://api.frankfurter.dev/v1/latest?base=EUR': ecb });
    const rows = await fetchReferenceRates(['usd', 'EUR', 'GBP', 'AED', 'INR', 'bad!'], TODAY, { fetchImpl: f, env: {} });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('symbols=INR%2CUSD%2CGBP');
    expect(rows.map((r) => r.currency)).toEqual(['USD', 'EUR', 'GBP', 'AED']);
    expect(rows.every((r) => r.source === 'ecb')).toBe(true);
    const usd = rows.find((r) => r.currency === 'USD')!.rate;
    expect(rows.find((r) => r.currency === 'AED')!.rate).toBeCloseTo(usd / 3.6725, 5);
  });

  it('prefers the FBIL-compatible source per currency and fills the rest from Frankfurter', async () => {
    const f = fakeFetch({ 'https://fbil.example/USD': { currency: 'USD', rate: '84.2000', date: '03-11-2026' }, 'https://api.frankfurter.dev/v1/latest?base=EUR': ecb });
    const rows = await fetchReferenceRates(['USD', 'GBP'], TODAY, { fetchImpl: f, env: { FX_RATE_SOURCE_URL: 'https://fbil.example/{currency}' } });
    expect(rows).toEqual([
      { currency: 'USD', rateDate: TODAY, rate: 84.2, source: 'fbil' },
      expect.objectContaining({ currency: 'GBP', source: 'ecb' }),
    ]);
    expect(String(f.mock.calls.at(-1)![0])).toContain('symbols=INR%2CGBP');
  });

  it('falls back to one call per currency when the combined call fails, and leaves out what no source has', async () => {
    const f = fakeFetch({
      'https://api.frankfurter.dev/v1/latest?base=USD': { amount: 1, base: 'USD', date: TODAY, rates: { INR: 84.1 } },
    });
    const rows = await fetchReferenceRates(['USD', 'CHF'], TODAY, { fetchImpl: f, env: {} });
    expect(rows).toEqual([{ currency: 'USD', rateDate: TODAY, rate: 84.1, source: 'ecb' }]);
  });
});
