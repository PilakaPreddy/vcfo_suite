import { describe, expect, it } from 'vitest';
import { findSrn } from './srn';

describe('findSrn', () => {
  it('reads the SRN next to the word SRN', () => {
    expect(findSrn('Payment received (mock). SRN AB1234567 has been generated.')).toBe('AB1234567');
    expect(findSrn('Service Request Number: F12345678')).toBe('F12345678');
  });
  it('returns null when the page does not mention an SRN', () => {
    expect(findSrn('Reference AB1234567')).toBeNull();
  });
  it('ignores a PAN and a DIN and prefers the code nearest the anchor', () => {
    expect(findSrn('PAN ABCDE1234F, DIN 01234567. SRN: AA7654321')).toBe('AA7654321');
    expect(findSrn('Old ref ZZ1111111 '.padEnd(400, '.') + ' SRN AB2222222')).toBe('AB2222222');
  });
});
