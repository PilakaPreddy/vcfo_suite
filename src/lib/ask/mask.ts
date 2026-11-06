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
  /\b[A-Z]{5}\d{4}[A-Z]\b/gi, // PAN
  /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Aadhaar
  /\b[A-Z][1-9]\d{6}\b/gi, // Passport
];

const DIN_IN_CONTEXT = /\b(DIN[\s:#-]*)(\d{8})\b/gi;

export function maskIdentityNumbers(text: string): string {
  const masked = PATTERNS.reduce((out, pattern) => out.replace(pattern, lastFour), text);
  return masked.replace(DIN_IN_CONTEXT, (_all, label: string, digits: string) => `${label}${lastFour(digits)}`);
}

/** The whole of one identity value, for a field already known to hold one. */
export function maskIdentityValue(value: string): string {
  const compact = value.replace(/[\s-]/g, '');
  return compact.length > 4 ? lastFour(compact) : 'X'.repeat(compact.length);
}

/**
 * Swaps identity numbers for placeholders, so a model reading the text never sees one. `restore`
 * puts them back into what the model returned; a placeholder the model made up stays as it is and
 * then fails the format check.
 */
export function tokeniseIdentityNumbers(text: string): { text: string; restore: (value: string) => string } {
  const found: string[] = [];
  const hold = (value: string): string => `IDTOKEN${found.push(value)}X`;
  const swapped = PATTERNS.reduce((out, pattern) => out.replace(pattern, hold), text).replace(
    DIN_IN_CONTEXT,
    (_all, label: string, digits: string) => `${label}${hold(digits)}`,
  );
  return { text: swapped, restore: (value) => value.replace(/IDTOKEN(\d+)X/g, (all, n: string) => found[Number(n) - 1] ?? all) };
}
