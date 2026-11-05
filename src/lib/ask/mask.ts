/**
 * Masks identity numbers wherever text can reach chat, logs, stored prompts or a run trace. It runs
 * on text, so it also catches a number somebody pasted. GSTIN and CIN are public registry numbers
 * and stay readable; a PAN inside a GSTIN does not match, because it has no word boundary.
 */
const lastFour = (value: string): string => {
  const compact = value.replace(/[\s-]/g, '');
  return `${'X'.repeat(compact.length - 4)}${compact.slice(-4)}`;
};

const PATTERNS: readonly RegExp[] = [
  /\b[A-Z]{5}\d{4}[A-Z]\b/g, // PAN
  /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Aadhaar
  /\b[A-Z][1-9]\d{6}\b/g, // Passport
];

const DIN_IN_CONTEXT = /\b(DIN[\s:#-]*)(\d{8})\b/gi;

export function maskIdentityNumbers(text: string): string {
  const masked = PATTERNS.reduce((out, pattern) => out.replace(pattern, lastFour), text);
  return masked.replace(DIN_IN_CONTEXT, (_all, label: string, digits: string) => `${label}${lastFour(digits)}`);
}
