import { describe, expect, it } from 'vitest';
import {
  WHAT_IF_MOVES,
  alertCrossed,
  bankSpreads,
  exposureByCurrency,
  hedgeCover,
  movedRate,
  rateOn,
  rateTrend,
  shouldTrigger,
  spreadSummary,
  unutilised,
  whatIf,
  type DeskForward,
  type DeskInvoice,
} from './fx-desk';
import { rateAlertEmail } from './fx-alert-email';

const TODAY = '2026-11-03';

const inv = (over: Partial<DeskInvoice> = {}): DeskInvoice => ({
  id: 'i1',
  clientName: 'Acme',
  invoiceNo: 'A-1',
  currency: 'USD',
  status: 'open',
  fcAmount: 1000,
  fxRate: 83,
  amountInr: 83000,
  dueDate: '2026-11-30',
  paidOn: null,
  receivedFc: null,
  paidAmount: null,
  ...over,
});

const fwd = (over: Partial<DeskForward> = {}): DeskForward => ({
  id: 'f1',
  currency: 'USD',
  bank: 'HSBC',
  contractNo: 'FW-1',
  amountFc: 1000,
  forwardRate: 85,
  bookedOn: '2026-10-01',
  maturityOn: '2026-12-31',
  utilisedFc: 0,
  status: 'open',
  note: '',
  ...over,
});

describe('exposureByCurrency', () => {
  it('sums open foreign invoices per currency at booked and today’s rate', () => {
    const rows = exposureByCurrency(
      [
        inv(),
        inv({ id: 'i2', fcAmount: 500, fxRate: 84, amountInr: 42000 }),
        inv({ id: 'i3', currency: 'EUR', fcAmount: 200, fxRate: 90, amountInr: 18000 }),
        inv({ id: 'i4', status: 'received' }),
        inv({ id: 'i5', currency: 'INR', fcAmount: null }),
      ],
      { USD: 84, EUR: null },
    );
    expect(rows.map((r) => r.currency)).toEqual(['USD', 'EUR']);
    expect(rows[0]).toEqual({ currency: 'USD', invoices: 2, openFc: 1500, bookedInr: 125000, spotRate: 84, inrToday: 126000, changeInr: 1000, changePct: 0.8 });
    expect(rows[1]).toMatchObject({ openFc: 200, bookedInr: 18000, spotRate: null, inrToday: null, changeInr: null, changePct: null });
  });

  it('uses the open INR when an invoice has no booked rate', () => {
    expect(exposureByCurrency([inv({ fxRate: null, amountInr: 80000 })], { USD: 84 })[0].bookedInr).toBe(80000);
  });
});

describe('hedgeCover', () => {
  it('covers exposure with open forwards, weighting the rate by what is left', () => {
    const exposure = exposureByCurrency([inv({ fcAmount: 2000, amountInr: 166000 })], { USD: 84 });
    const rows = hedgeCover(exposure, [fwd(), fwd({ id: 'f2', forwardRate: 86, amountFc: 1000, utilisedFc: 500 }), fwd({ id: 'f3', status: 'cancelled' }), fwd({ id: 'f4', currency: 'GBP', amountFc: 300, forwardRate: 110, maturityOn: '2026-10-31' })], { USD: 84, GBP: 109 }, TODAY);
    const usd = rows.find((r) => r.currency === 'USD')!;
    expect(usd).toMatchObject({ exposureFc: 2000, hedgedFc: 1500, unhedgedFc: 500, coverPct: 75, openForwards: 2, maturedForwards: 0 });
    expect(usd.weightedForwardRate).toBeCloseTo((1000 * 85 + 500 * 86) / 1500, 6);
    expect(usd.forwardVsSpotInr).toBeCloseTo(1500 * ((1000 * 85 + 500 * 86) / 1500 - 84), 1);
    // A forward with no exposure still shows, with no cover percentage, and counts as matured.
    expect(rows.find((r) => r.currency === 'GBP')).toMatchObject({ exposureFc: 0, hedgedFc: 300, coverPct: null, maturedForwards: 1, forwardVsSpotInr: 300 });
  });

  it('reads an unutilised amount that never goes negative', () => {
    expect(unutilised({ amountFc: 100, utilisedFc: 150 })).toBe(0);
    expect(unutilised({ amountFc: 100, utilisedFc: 40.5 })).toBe(59.5);
  });
});

describe('whatIf', () => {
  it('revalues exposure at each move, with the hedged part at the forward rate', () => {
    const exposure = exposureByCurrency([inv({ fcAmount: 1000 })], { USD: 84 });
    const hedges = hedgeCover(exposure, [fwd({ amountFc: 400, forwardRate: 85 })], { USD: 84 }, TODAY);
    const [row] = whatIf(exposure, hedges);
    expect(row.cells).toHaveLength(WHAT_IF_MOVES.length);
    const minus3 = row.cells.find((c) => c.key === 'r-3')!;
    expect(minus3).toEqual({ key: 'r-3', rate: 81, inr: 81000, changeVsToday: -3000, inrNetOfHedges: 600 * 81 + 400 * 85 });
    const plus2pct = row.cells.find((c) => c.key === 'p+2')!;
    expect(plus2pct.rate).toBeCloseTo(85.68, 4);
    expect(plus2pct.changeVsToday).toBeCloseTo(1680, 2);
  });

  it('blanks a rupee move that would take a small rate to zero', () => {
    expect(movedRate(0.55, { kind: 'rupee', delta: -1 })).toBeNull();
    expect(movedRate(0.55, { kind: 'pct', delta: -1 })).toBeCloseTo(0.5445, 6);
    const exposure = exposureByCurrency([inv({ currency: 'JPY', fcAmount: 100000, fxRate: 0.56, amountInr: 56000 })], { JPY: 0.55 });
    const [row] = whatIf(exposure, []);
    expect(row.cells.find((c) => c.key === 'r-1')).toMatchObject({ rate: null, inr: null });
    expect(row.cells.find((c) => c.key === 'r+1')?.inr).toBe(155000);
  });

  it('gives nulls when there is no rate today', () => {
    const [row] = whatIf(exposureByCurrency([inv()], {}), []);
    expect(row.cells.every((c) => c.rate === null)).toBe(true);
  });
});

describe('rateOn and bank spreads', () => {
  const history = { USD: [ { date: '2026-10-28', rate: 84.2 }, { date: '2026-10-30', rate: 84.4 } ], EUR: [] };

  it('finds the rate in force on a day within the lookback', () => {
    expect(rateOn(history.USD, '2026-11-01')).toBe(84.4);
    expect(rateOn(history.USD, '2026-10-29')).toBe(84.2);
    expect(rateOn(history.USD, '2026-10-20')).toBeNull();
    expect(rateOn(history.USD, '2026-11-20')).toBeNull();
  });

  it('works out the spread on each receipt and averages it per bank', () => {
    const rows = bankSpreads(
      [
        inv({ id: 'a', status: 'received', paidOn: '2026-10-30', receivedFc: 1000, paidAmount: 84000, bank: 'HSBC' }),
        inv({ id: 'b', status: 'received', paidOn: '2026-10-31', receivedFc: 3000, paidAmount: 252600, bank: 'HSBC' }),
        inv({ id: 'c', status: 'received', paidOn: '2026-10-31', currency: 'EUR', receivedFc: 100, paidAmount: 9000, bank: '' }),
        inv({ id: 'd', status: 'received', paidOn: '2026-10-31', receivedFc: null, paidAmount: 84000 }),
        inv({ id: 'e', status: 'open' }),
      ],
      history,
    );
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    const a = rows.find((r) => r.id === 'a')!;
    expect(a).toMatchObject({ effectiveRate: 84, referenceRate: 84.4, spreadPerUnit: 0.4, spreadPct: 0.47, costInr: 400 });
    const b = rows.find((r) => r.id === 'b')!;
    expect(b).toMatchObject({ effectiveRate: 84.2, spreadPerUnit: 0.2, costInr: 600 });
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ bank: 'Not recorded', referenceRate: null, spreadPerUnit: null, costInr: null });

    const summary = spreadSummary(rows);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ bank: 'HSBC', currency: 'USD', receipts: 2, receivedFc: 4000, avgSpreadPerUnit: 0.25, costInr: 1000 });
    expect(summary[0].avgSpreadPct).toBeCloseTo(0.3, 2);
  });
});

describe('rateTrend', () => {
  it('gives 30 and 90 day low, high, average and change', () => {
    const pts = [
      { date: '2026-08-10', rate: 83 },
      { date: '2026-10-05', rate: 84 },
      { date: '2026-10-20', rate: 85 },
      { date: '2026-11-02', rate: 84.5 },
      { date: '2026-11-10', rate: 99 },
    ];
    const t = rateTrend(pts, TODAY);
    expect(t.last).toEqual({ date: '2026-11-02', rate: 84.5 });
    expect(t.d30).toMatchObject({ points: 3, first: 84, min: 84, max: 85, avg: 84.5, change: 0.5, changePct: 0.6 });
    expect(t.d90).toMatchObject({ points: 4, first: 83, min: 83, max: 85, change: 1.5 });
    expect(rateTrend([], TODAY).d30).toMatchObject({ points: 0, avg: null, change: null });
  });
});

describe('rate alerts', () => {
  it('fires when crossed, once a day, only while active', () => {
    const above = { active: true, direction: 'above', threshold: 85, lastTriggeredOn: null };
    expect(alertCrossed(above, 85)).toBe(true);
    expect(alertCrossed(above, 84.99)).toBe(false);
    expect(alertCrossed({ direction: 'below', threshold: 84 }, 83.5)).toBe(true);
    expect(alertCrossed({ direction: 'sideways', threshold: 84 }, 83.5)).toBe(false);
    expect(alertCrossed(above, null)).toBe(false);
    expect(shouldTrigger(above, 86, TODAY)).toBe(true);
    expect(shouldTrigger({ ...above, lastTriggeredOn: TODAY }, 86, TODAY)).toBe(false);
    expect(shouldTrigger({ ...above, lastTriggeredOn: '2026-11-02' }, 86, TODAY)).toBe(true);
    expect(shouldTrigger({ ...above, active: false }, 86, TODAY)).toBe(false);
  });

  it('writes a short email with the rate, the level and the exposure', () => {
    const mail = rateAlertEmail({
      managerName: 'Meera Iyer',
      clientOrgName: 'Summit Consulting',
      currency: 'EUR',
      direction: 'above',
      threshold: 97,
      rate: 97.4321,
      rateDate: TODAY,
      source: 'ecb',
      exposureFc: 10000,
      exposureBookedInr: 960000,
      url: 'https://app.example/receivables/manager?tab=fx',
    });
    expect(mail.subject).toBe('EUR at ₹97.4321, above your ₹97.0000 level · Summit Consulting');
    expect(mail.text).toContain('Hi Meera,');
    expect(mail.text).toContain('EUR 10,000.00, worth ₹9,74,321 at this rate (+₹14,321 against the booked rates)');
    expect(mail.text).toContain('(ECB)');
    expect(mail.html).toContain('Open the FX tab');
    const none = rateAlertEmail({ managerName: 'M', clientOrgName: 'S', currency: 'GBP', direction: 'below', threshold: 100, rate: 99, rateDate: TODAY, source: 'manual', exposureFc: 0, exposureBookedInr: 0, url: 'u' });
    expect(none.text).toContain('no open GBP invoices');
  });
});
