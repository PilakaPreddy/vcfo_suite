import { describe, expect, it } from 'vitest';
import { matchCredit, payerScore } from './match';

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
