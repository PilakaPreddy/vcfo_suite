import { describe, expect, it } from 'vitest';
import { fcAmountFit, matchCredit, payerScore } from './match';

const inv = (id: string, clientName: string, amountInr: number, dueDate = '2026-10-30', status: 'open' | 'received' = 'open') => ({ id, clientName, amountInr, dueDate, status });

const OPEN = [
  inv('emburse', 'Emburse', 22757764),
  inv('bupa1', 'Bupa', 1976259, '2026-11-14'),
  inv('bupa2', 'Bupa', 1643932, '2026-11-14'),
  inv('inspired', 'Inspired', 3141743),
  inv('kh', 'KH ANSR', 4830372, '2026-10-25'),
  inv('comply', 'ANSR Comply', 2134928, '2026-11-08'),
  inv('nd', 'Net Documents', 1630448, '2026-10-15'),
  inv('vena', 'Vena', 1000000),
];

describe('payerScore', () => {
  it('ignores legal suffixes and prefers a full match', () => {
    expect(payerScore('EMBURSE INC', 'Emburse')).toBe(2);
    expect(payerScore('NETDOCUMENTS LLC', 'Net Documents')).toBe(2);
    expect(payerScore('ANSR COMPLY PVT LTD', 'ANSR Comply')).toBe(2);
    expect(payerScore('ANSR COMPLY PVT LTD', 'KH ANSR')).toBe(1);
    expect(payerScore('RAPTOR TECHNOLOGIES LLC', 'Emburse')).toBe(0);
  });
});

describe('matchCredit', () => {
  it('auto-matches payer and exact amount', () => {
    expect(matchCredit({ payer: 'EMBURSE INC', inrAmount: 22757764 }, OPEN)).toMatchObject({ status: 'auto', invoiceIds: ['emburse'] });
  });

  it('auto-matches one credit that pays all of a client’s open invoices', () => {
    expect(matchCredit({ payer: 'BUPA GLOBAL', inrAmount: 1976259 + 1643932 }, OPEN)).toMatchObject({ status: 'auto', invoiceIds: ['bupa1', 'bupa2'] });
  });

  it('asks to confirm a small bank-charge shortfall', () => {
    const r = matchCredit({ payer: 'INSPIRED EDUCATION LTD', inrAmount: 3138560 }, OPEN);
    expect(r).toMatchObject({ status: 'to_confirm', invoiceIds: ['inspired'] });
    expect(r.note).toContain('₹3,183 short');
  });

  it('asks to confirm a 10% TDS deduction', () => {
    const r = matchCredit({ payer: 'VENA SOLUTIONS', inrAmount: 900000 }, OPEN);
    expect(r).toMatchObject({ status: 'to_confirm', invoiceIds: ['vena'] });
    expect(r.note).toContain('TDS');
  });

  it('picks the fully matching ANSR entity, not every ANSR client', () => {
    expect(matchCredit({ payer: 'ANSR COMPLY PVT LTD', inrAmount: 2134928 }, OPEN)).toMatchObject({ status: 'auto', invoiceIds: ['comply'] });
  });

  it('suggests by amount alone when the payer is unknown, but never auto-matches', () => {
    expect(matchCredit({ payer: 'SOME BANK REMITTANCE', inrAmount: 4830372 }, OPEN)).toMatchObject({ status: 'to_confirm', invoiceIds: ['kh'] });
  });

  it('leaves an unknown payer with an unknown amount unmatched', () => {
    expect(matchCredit({ payer: 'REFUND', inrAmount: 12345 }, OPEN)).toMatchObject({ status: 'unmatched', invoiceIds: [] });
  });

  it('skips received invoices and uses aliases', () => {
    const list = [inv('nd', 'Net Documents', 1630448, '2026-10-15', 'received'), inv('nd2', 'Net Documents', 500000)];
    expect(matchCredit({ payer: 'ND INC', inrAmount: 500000 }, list, { 'Net Documents': ['ND'] })).toMatchObject({ status: 'auto', invoiceIds: ['nd2'] });
  });
});

describe('USD credits', () => {
  const usd = (id: string, clientName: string, fcAmount: number, amountInr: number, dueDate = '2026-10-30') => ({ ...inv(id, clientName, amountInr, dueDate), currency: 'USD', fcAmount });
  const BOOK = [usd('emb-usd', 'Emburse', 27000, 2268000), usd('bupa-usd1', 'Bupa', 10000, 840000, '2026-11-01'), usd('bupa-usd2', 'Bupa', 5000, 420000, '2026-11-14'), inv('bupa-inr', 'Bupa', 100000)];

  it('reads the bank-charge tolerance as the larger of USD 50 and 2%', () => {
    expect(fcAmountFit(1000, 1000)).toBe('exact');
    expect(fcAmountFit(955, 1000)).toBe('charges');
    expect(fcAmountFit(940, 1000)).toBeNull();
    expect(fcAmountFit(9810, 10000)).toBe('charges');
    expect(fcAmountFit(9790, 10000)).toBeNull();
    expect(fcAmountFit(1010, 1000)).toBeNull();
  });

  it('auto-matches the exact USD amount whatever the rupees credited', () => {
    expect(matchCredit({ payer: 'EMBURSE INC', inrAmount: 2290500, currency: 'USD', fcAmount: 27000 }, BOOK)).toMatchObject({ status: 'auto', invoiceIds: ['emb-usd'], note: 'Payer and USD amount match.' });
  });

  it('asks to confirm a USD shortfall within bank charges', () => {
    const r = matchCredit({ payer: 'EMBURSE INC', inrAmount: 2280000, currency: 'USD', fcAmount: 26975 }, BOOK);
    expect(r).toMatchObject({ status: 'to_confirm', invoiceIds: ['emb-usd'] });
    expect(r.note).toContain('USD 25 short');
  });

  it('auto-matches one USD credit for all of a client’s USD invoices', () => {
    expect(matchCredit({ payer: 'BUPA GLOBAL', inrAmount: 1260000, currency: 'USD', fcAmount: 15000 }, BOOK)).toMatchObject({ status: 'auto', invoiceIds: ['bupa-usd1', 'bupa-usd2'] });
  });

  it('suggests by USD amount alone when the payer is unknown', () => {
    expect(matchCredit({ payer: 'WIRE 0042', inrAmount: 1, currency: 'USD', fcAmount: 27000 }, BOOK)).toMatchObject({ status: 'to_confirm', invoiceIds: ['emb-usd'] });
  });

  it('falls back to the INR rules when no USD amount fits', () => {
    expect(matchCredit({ payer: 'BUPA GLOBAL', inrAmount: 100000, currency: 'USD', fcAmount: 1190 }, BOOK)).toMatchObject({ status: 'auto', invoiceIds: ['bupa-inr'] });
  });

  it('never matches a rupee credit by foreign amount', () => {
    expect(matchCredit({ payer: 'EMBURSE INC', inrAmount: 27000 }, BOOK).status).not.toBe('auto');
  });
});

describe('foreign matching in any supported currency (Phase 10)', () => {
  const fx = (id: string, currency: string, fcAmount: number, amountInr: number) => ({ ...inv(id, 'Bosch GmbH', amountInr), currency, fcAmount });

  it('matches a EUR credit on the EUR amount and never across currencies', () => {
    const invoices = [fx('e1', 'EUR', 5000, 485000), fx('g1', 'GBP', 5000, 560000)];
    expect(matchCredit({ payer: 'BOSCH GMBH', inrAmount: 486100, currency: 'EUR', fcAmount: 5000 }, invoices)).toMatchObject({ status: 'auto', invoiceIds: ['e1'] });
    expect(matchCredit({ payer: 'BOSCH GMBH', inrAmount: 559000, currency: 'GBP', fcAmount: 4980 }, invoices)).toMatchObject({ status: 'to_confirm', invoiceIds: ['g1'] });
    expect(matchCredit({ payer: 'BOSCH GMBH', inrAmount: 559000, currency: 'GBP', fcAmount: 4980 }, invoices).note).toContain('GBP 20');
  });
});
