import { describe, expect, it } from 'vitest';
import { maskIdentityNumbers } from './mask';

describe('maskIdentityNumbers', () => {
  it('masks PAN, Aadhaar, passport and DIN, keeping the last four', () => {
    expect(maskIdentityNumbers('PAN ABCDE1234F')).toBe('PAN XXXXXX234F');
    expect(maskIdentityNumbers('Aadhaar 2345 6789 0123')).toBe('Aadhaar XXXXXXXX0123');
    expect(maskIdentityNumbers('Passport J8369854')).toBe('Passport XXXX9854');
    expect(maskIdentityNumbers('DIN: 01234567')).toBe('DIN: XXXX4567');
  });

  it('catches a PAN or passport typed in lower case', () => {
    expect(maskIdentityNumbers('pan abcde1234f')).toBe('pan XXXXXX234f');
    expect(maskIdentityNumbers('passport j8369854')).toBe('passport XXXX9854');
  });

  it('masks a number joined to a file name by an underscore', () => {
    expect(maskIdentityNumbers('ABCDE1234F_Rahul_PAN.pdf')).toBe('XXXXXX234F_Rahul_PAN.pdf');
    expect(maskIdentityNumbers('aadhaar_234567890123.jpg')).toBe('aadhaar_XXXXXXXX0123.jpg');
  });

  it('leaves public registry numbers and ordinary text alone', () => {
    const text = 'GSTIN 22AAAAA0000A1Z5, CIN U74999TG2020PTC123456, 12 directors on 01-04-2026, 12345678';
    expect(maskIdentityNumbers(text)).toBe(text);
  });
});
