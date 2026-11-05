import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * The secret part of the public link. 12 URL-safe characters, about 72 bits: not guessable,
 * short enough for WhatsApp. Server only, so links.ts stays importable from the browser.
 */
export function newPublicKey(): string {
  return randomBytes(9).toString('base64url');
}
