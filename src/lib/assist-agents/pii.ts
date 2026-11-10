import { maskIdentityNumbers } from '@/lib/ask/mask';

/**
 * The labels-only rule (PLAN §4: values never leave the browser). Anything the extension sends
 * Suite about a page (resolver candidates, patch evidence, refusal targets) is checked here; text
 * that looks like an identity number, an email or a phone number is refused, not masked, because
 * the extension only ever sends labels and such a payload means a bug upstream.
 */
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/;
/** A DIN is eight digits; a label has no reason to hold eight digits in a row. */
const BARE_DIN = /\b\d{8}\b/;

/** True when the text looks like it holds an identity number (PAN, Aadhaar, passport, DIN), an email or a phone number. */
export function looksLikePersonalData(text: string | null | undefined): boolean {
  if (!text) return false;
  if (maskIdentityNumbers(text) !== text) return true;
  return EMAIL.test(text) || PHONE.test(text) || BARE_DIN.test(text);
}

/** Every string anywhere inside a JSON-like value. */
export function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => (out.push(k), stringsIn(v, out)));
  return out;
}

export function containsPersonalData(value: unknown): boolean {
  return stringsIn(value).some(looksLikePersonalData);
}
