import { describe, expect, it } from 'vitest';
import { bookedInr, fxChange, inrAtRate, isForeign, realisedFx } from './fx';

const usd = (fcAmount: number | null, invoiceRate: number | null, amountInr = 0) => ({ currency: 'USD', fcAmount, invoiceRate, amountInr });
const inr = (amountInr: number) => ({ currency: 'INR', fcAmount: null, invoiceRate: null, amountInr });

describe('isForeign', () => {
  it('treats anything but INR as foreign, and blank as INR', () => {
    expect(isForeign({ currency: 'USD' })).toBe(true);
    expect(isForeign({ currency: 'usd' })).toBe(true);
    expect(isForeign({ currency: 'INR' })).toBe(false);
    expect(isForeign({ currency: '' })).toBe(false);
  });
});

describe('bookedInr and inrAtRate', () => {
  it('books a USD invoice at the invoice rate', () => {
    expect(bookedInr(usd(10000, 83.4567, 834567))).toBe(834567);
    expect(bookedInr(usd(1234.56, 83.123))).toBe(102620.33);
  });

  it('falls back to amountInr when the foreign figures are missing or invalid', () => {
    expect(bookedInr(usd(null, 83, 500000))).toBe(500000);
    expect(bookedInr(usd(1000, 0, 500000))).toBe(500000);
    expect(bookedInr(usd(-5, 83, 500000))).toBe(500000);
    expect(bookedInr(inr(123.456))).toBe(123.46);
  });

  it('values a USD invoice at a given rate and leaves INR alone', () => {
    expect(inrAtRate(usd(10000, 83, 830000), 85.5)).toBe(855000);
    expect(inrAtRate(usd(10000, 83, 830000), null)).toBe(830000);
    expect(inrAtRate(usd(10000, 83, 830000), -1)).toBe(830000);
    expect(inrAtRate(inr(100000), 85)).toBe(100000);
  });
});

describe('fxChange', () => {
  it('shows the gain at today’s rate in rupees and percent', () => {
    expect(fxChange(usd(10000, 83, 830000), 85)).toEqual({ inrToday: 850000, changeInr: 20000, changePct: 2.41 });
  });

  it('shows a loss as negative', () => {
    expect(fxChange(usd(10000, 85, 850000), 84)).toEqual({ inrToday: 840000, changeInr: -10000, changePct: -1.18 });
  });

  it('is null for INR, a missing rate or a missing amount', () => {
    expect(fxChange(inr(100000), 85)).toBeNull();
    expect(fxChange(usd(10000, 83, 830000), null)).toBeNull();
    expect(fxChange(usd(10000, 83, 830000), 0)).toBeNull();
    expect(fxChange(usd(null, 83, 830000), 85)).toBeNull();
  });

  it('uses booked amountInr when the invoice rate is missing', () => {
    expect(fxChange(usd(10000, null, 830000), 85)).toEqual({ inrToday: 850000, changeInr: 20000, changePct: 2.41 });
  });
});

describe('realisedFx', () => {
  it('works out the effective rate, realised gain and a USD 25 bank charge', () => {
    const r = realisedFx({ fcAmount: 10000, invoiceRate: 83, receivedFc: 9975, receivedInr: 847875 });
    expect(r).toEqual({ effectiveRate: 85, bookedInrForReceived: 827925, realisedInr: 19950, bankChargesFc: 25, bankChargesInr: 2125 });
  });

  it('shows a realised loss and no charges when paid in full', () => {
    const r = realisedFx({ fcAmount: 10000, invoiceRate: 85, receivedFc: 10000, receivedInr: 840000 });
    expect(r).toMatchObject({ effectiveRate: 84, realisedInr: -10000, bankChargesFc: 0, bankChargesInr: 0 });
  });

  it('never shows negative charges when more arrives than was invoiced', () => {
    expect(realisedFx({ fcAmount: 100, invoiceRate: 80, receivedFc: 110, receivedInr: 8800 })?.bankChargesFc).toBe(0);
  });

  it('reads a missing invoiced amount as no charges', () => {
    expect(realisedFx({ fcAmount: null, invoiceRate: 80, receivedFc: 100, receivedInr: 8100 })).toMatchObject({ realisedInr: 100, bankChargesFc: 0 });
  });

  it('is null when nothing was received or the invoice rate is unknown', () => {
    expect(realisedFx({ fcAmount: 100, invoiceRate: 80, receivedFc: 0, receivedInr: 8000 })).toBeNull();
    expect(realisedFx({ fcAmount: 100, invoiceRate: 80, receivedFc: 100, receivedInr: null })).toBeNull();
    expect(realisedFx({ fcAmount: 100, invoiceRate: null, receivedFc: 100, receivedInr: 8000 })).toBeNull();
    expect(realisedFx({ fcAmount: 100, invoiceRate: -2, receivedFc: 100, receivedInr: 8000 })).toBeNull();
  });
});
