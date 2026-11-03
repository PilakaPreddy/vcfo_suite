import { describe, expect, it } from 'vitest';
import { FOREIGN_CURRENCY_CODES, INVOICE_CURRENCY_CODES, currencyInfo, fcLabel, fcNumber, foreignAmountHeader, isInvoiceCurrency, isSupportedForeign, sortCurrencies } from './currencies';

describe('the supported currencies', () => {
  it('lists the nine foreign currencies, INR only for invoices', () => {
    expect(FOREIGN_CURRENCY_CODES).toEqual(['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'CHF', 'JPY']);
    expect(INVOICE_CURRENCY_CODES[0]).toBe('INR');
    expect(isSupportedForeign('eur')).toBe(true);
    expect(isSupportedForeign('INR')).toBe(false);
    expect(isSupportedForeign('XYZ')).toBe(false);
    expect(isInvoiceCurrency(' inr ')).toBe(true);
    expect(isInvoiceCurrency('GBP')).toBe(true);
    expect(isInvoiceCurrency('BTC')).toBe(false);
    expect(isInvoiceCurrency(null)).toBe(false);
  });

  it('formats amounts with each currency’s decimals', () => {
    expect(fcNumber(12000, 'EUR')).toBe('12,000.00');
    expect(fcNumber(12000.4, 'JPY')).toBe('12,000');
    expect(fcLabel(1500.5, 'gbp')).toBe('GBP 1,500.50');
    expect(fcLabel(null, 'USD')).toBe('—');
    expect(currencyInfo('AED').peggedToUsd).toBeCloseTo(3.6725);
    expect(currencyInfo('XYZ')).toMatchObject({ code: 'XYZ', decimals: 2 });
  });

  it('sorts codes in list order with unknown codes last and no duplicates', () => {
    expect(sortCurrencies(['jpy', 'EUR', 'ZZZ', 'USD', 'EUR'])).toEqual(['USD', 'EUR', 'JPY', 'ZZZ']);
  });
});

describe('foreignAmountHeader', () => {
  it('names the one currency, or reads Foreign when mixed', () => {
    expect(foreignAmountHeader(['INR', 'USD', 'usd'])).toBe('USD Amount');
    expect(foreignAmountHeader(['EUR', 'GBP'], 'amount')).toBe('Foreign amount');
    expect(foreignAmountHeader([null, 'INR'])).toBe('Foreign Amount');
  });
});
