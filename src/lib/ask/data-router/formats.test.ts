import { describe, expect, it } from 'vitest';
import { checkFormat, formatOfValue } from './formats';

describe('checkFormat', () => {
  it.each([
    ['pan', 'abcde1234f', 'ABCDE1234F'],
    ['din', '0012 3456', '00123456'],
    ['cin', 'u62011ka2024ptc123456', 'U62011KA2024PTC123456'],
    ['gstin', '29ABCDE1234F1Z5', '29ABCDE1234F1Z5'],
    ['ifsc', 'hdfc0001234', 'HDFC0001234'],
    ['pin', '560 001', '560001'],
    ['aadhaar', '2345 6789 0123', '234567890123'],
    ['passport', 'k1234567', 'K1234567'],
  ] as const)('accepts and tidies a %s', (format, raw, value) => {
    expect(checkFormat({ format }, raw)).toEqual({ ok: true, value });
  });

  it.each([
    ['pan', 'ABCD1234F'],
    ['din', '1234567'],
    ['cin', 'U62011KA2024'],
    ['gstin', '29ABCDE1234F1X5'],
    ['ifsc', 'HDFC1001234'],
    ['pin', '060001'],
    ['aadhaar', '123456789012'],
  ] as const)('refuses a wrong %s and repairs nothing', (format, raw) => {
    const result = checkFormat({ format }, raw);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('reads dates day first and refuses dates that do not exist', () => {
    expect(checkFormat({ format: 'date' }, '03/04/1985').value).toBe('1985-04-03');
    expect(checkFormat({ format: 'date' }, '3 April 1985').value).toBe('1985-04-03');
    expect(checkFormat({ format: 'date' }, '1985-04-03').value).toBe('1985-04-03');
    expect(checkFormat({ format: 'date' }, '31/02/1985').ok).toBe(false);
    expect(checkFormat({ format: 'date' }, '13/13/1985').ok).toBe(false);
  });

  it('matches a choice by value or label, and asks when it fits neither', () => {
    const entry = { format: 'choice' as const, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] };
    expect(checkFormat(entry, 'YES').value).toBe('yes');
    expect(checkFormat(entry, 'maybe').ok).toBe(false);
  });

  it('tidies amounts and mobile numbers', () => {
    expect(checkFormat({ format: 'amount' }, '₹ 1,00,000').value).toBe('100000');
    expect(checkFormat({ format: 'mobile' }, '+91 98765 43210').value).toBe('9876543210');
    expect(checkFormat({ format: 'mobile' }, '12345').ok).toBe(false);
  });
});

describe('formatOfValue', () => {
  it('names only shapes that nothing else shares', () => {
    expect(formatOfValue('ABCDE1234F')).toBe('pan');
    expect(formatOfValue('29ABCDE1234F1Z5')).toBe('gstin');
    expect(formatOfValue('Asha Rao')).toBeNull();
    expect(formatOfValue('12345678')).toBeNull();
  });
});
