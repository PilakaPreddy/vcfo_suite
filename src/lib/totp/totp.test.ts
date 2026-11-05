import { describe, expect, it, vi } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpAt,
  verifyTotp,
} from './totp';
import { groupSecret } from './format';
import { acceptTotpCounter, clearTotpFailures, isTotpLocked, recordTotpFailure, resetTotpGuard } from './guard';

// The failure count lives in the Postgres rate-limit store; a map stands in for it here.
const counts = new Map<string, number>();
vi.mock('@/db/repositories/rate-limits', () => ({
  systemTakeRateLimit: async (key: string, limit: number) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts.get(key)! <= limit;
  },
  systemPeekRateLimit: async (key: string) => counts.get(key) ?? 0,
  systemClearRateLimit: async (key: string) => void counts.delete(key),
}));

/** The shared secret from RFC 4226 Appendix D and RFC 6238 Appendix B (SHA-1). */
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_KEY_B32 = base32Encode(RFC_KEY);

describe('base32', () => {
  it('round-trips and matches the RFC 4648 vector', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb-oi======').toString()).toBe('foobar');
    expect(RFC_KEY_B32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow('invalid_base32');
  });

  it('makes a 160-bit secret', () => {
    const s = generateTotpSecret();
    expect(base32Decode(s)).toHaveLength(20);
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});

describe('HOTP (RFC 4226 Appendix D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  it.each(expected.map((code, counter) => [counter, code]))('counter %i gives %s', (counter, code) => {
    expect(hotp(RFC_KEY, counter as number)).toBe(code);
  });
});

describe('TOTP (RFC 6238 Appendix B, SHA-1, 8 digits)', () => {
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  it.each(vectors)('time %i gives %s', (seconds, code) => {
    expect(totpAt(RFC_KEY, seconds * 1000, { digits: 8 })).toBe(code);
  });

  it('gives the last six digits of the same value at 6 digits', () => {
    expect(totpAt(RFC_KEY, 59_000)).toBe('287082');
  });
});

describe('verifyTotp', () => {
  const now = 1111111111 * 1000;
  const code = totpAt(RFC_KEY, now);

  it('accepts the current code and returns its step', () => {
    expect(verifyTotp(RFC_KEY_B32, code, { now })).toBe(Math.floor(1111111111 / 30));
  });

  it('accepts one step either side and nothing further', () => {
    expect(verifyTotp(RFC_KEY_B32, totpAt(RFC_KEY, now - 30_000), { now })).not.toBeNull();
    expect(verifyTotp(RFC_KEY_B32, totpAt(RFC_KEY, now + 30_000), { now })).not.toBeNull();
    expect(verifyTotp(RFC_KEY_B32, totpAt(RFC_KEY, now - 60_000), { now })).toBeNull();
    expect(verifyTotp(RFC_KEY_B32, totpAt(RFC_KEY, now + 60_000), { now })).toBeNull();
  });

  it('ignores spaces and refuses malformed input', () => {
    expect(verifyTotp(RFC_KEY_B32, `${code.slice(0, 3)} ${code.slice(3)}`, { now })).not.toBeNull();
    expect(verifyTotp(RFC_KEY_B32, '12345', { now })).toBeNull();
    expect(verifyTotp(RFC_KEY_B32, 'abcdef', { now })).toBeNull();
    expect(verifyTotp('not base32!', code, { now })).toBeNull();
    expect(verifyTotp('', code, { now })).toBeNull();
  });
});

describe('otpauthUri', () => {
  it('builds the Key Uri Format link', () => {
    const uri = otpauthUri({ issuer: 'VCFO Suite', account: 'asha@sbc.in', secret: 'ABCD' });
    expect(uri.startsWith('otpauth://totp/VCFO%20Suite:asha%40sbc.in?')).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get('secret')).toBe('ABCD');
    expect(params.get('issuer')).toBe('VCFO Suite');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
    expect(params.get('algorithm')).toBe('SHA1');
  });
});

describe('code guard', () => {
  it('refuses a replayed step and locks after ten failures', async () => {
    resetTotpGuard();
    expect(acceptTotpCounter('u1', 100)).toBe(true);
    expect(acceptTotpCounter('u1', 100)).toBe(false);
    expect(acceptTotpCounter('u1', 99)).toBe(false);
    expect(acceptTotpCounter('u1', 101)).toBe(true);
    expect(acceptTotpCounter('u2', 100)).toBe(true);

    for (let i = 0; i < 9; i++) await recordTotpFailure('u3');
    expect(await isTotpLocked('u3')).toBe(false);
    await recordTotpFailure('u3');
    expect(await isTotpLocked('u3')).toBe(true);
    expect(counts.has('totp-fail:u3')).toBe(true);
    await clearTotpFailures('u3');
    expect(await isTotpLocked('u3')).toBe(false);
  });
});
