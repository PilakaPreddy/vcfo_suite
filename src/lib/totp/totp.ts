import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords for two-step sign-in (G-25).
 *
 * RFC 4226 (HOTP) and RFC 6238 (TOTP), written on node `crypto` so no new
 * dependency is needed. The app uses the settings every authenticator app
 * expects by default: HMAC-SHA-1, 6 digits, a 30-second step, and one step of
 * clock drift either side when a code is checked. The digit count and the
 * hash are parameters only so the RFC test vectors can be checked.
 *
 * PURE: no database, no env reads. The secret is encrypted at rest by
 * `secret-box.ts`; this file only ever sees the base32 text.
 */

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
/** How many steps either side of now a code may come from. */
const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, upper case, without padding (the form authenticator apps take). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32, ignoring spaces, dashes, padding and case. Throws on any other character. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid_base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret: 20 bytes (160 bits, the RFC 4226 recommendation) as base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export type HotpOptions = {
  digits?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
};

/** RFC 4226 HOTP for a raw key and a counter. */
export function hotp(key: Buffer, counter: number, opts: HotpOptions = {}): string {
  const digits = opts.digits ?? TOTP_DIGITS;
  const msg = Buffer.alloc(8);
  // The counter is a 64-bit big-endian integer; JS numbers are safe up to 2^53.
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac(opts.algorithm ?? 'sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The TOTP step counter for a moment in time. */
function totpCounter(atMs: number, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(atMs / 1000 / stepSeconds);
}

/** RFC 6238 TOTP for a raw key at a moment in time. */
export function totpAt(key: Buffer, atMs: number, opts: HotpOptions & { stepSeconds?: number } = {}): string {
  return hotp(key, totpCounter(atMs, opts.stepSeconds), opts);
}

/** Keeps the digits of what a person typed ("123 456" and "123-456" both work). */
function normalizeTotpCode(input: string): string {
  return String(input ?? '').replace(/[\s-]/g, '');
}

/**
 * Checks a 6-digit code against a base32 secret, allowing one step of drift
 * either side. Returns the matching step counter, so the caller can refuse a
 * code that was already used, or null when nothing matches. Every candidate is
 * compared in constant time and the loop never exits early.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { now?: number; window?: number } = {},
): number | null {
  const clean = normalizeTotpCode(code);
  if (!/^\d{6}$/.test(clean)) return null;
  let key: Buffer;
  try {
    key = base32Decode(secretBase32);
  } catch {
    return null;
  }
  if (key.length === 0) return null;
  const now = opts.now ?? Date.now();
  const window = opts.window ?? TOTP_WINDOW;
  const current = totpCounter(now);
  const given = Buffer.from(clean, 'utf8');
  let matched: number | null = null;
  for (let delta = -window; delta <= window; delta++) {
    const expected = Buffer.from(hotp(key, current + delta), 'utf8');
    if (timingSafeEqual(expected, given) && matched === null) matched = current + delta;
  }
  return matched;
}

/**
 * The `otpauth://` link an authenticator app reads (Key Uri Format). The page
 * shows it as a link and the base32 key as text; there is no QR library.
 */
export function otpauthUri(input: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
