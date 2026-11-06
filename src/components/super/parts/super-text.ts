/**
 * Text helpers for the super admin screens: today's day key and short company names.
 * The plain date (R-29) lives in src/lib/date-format.ts.
 * Kept apart from the components so the component file only exports components.
 */

/* ---------- Dates ---------- */

/** Today as YYYY-MM-DD (UTC, the same day key the server uses). */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Initials of a company, without the legal suffix. */
export function companyInitials(name: string): string {
  const words = name
    .replace(/\b(private limited|pvt\.? ltd\.?|limited|ltd\.?|llp)\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)).toUpperCase();
}

/** Short company name without the legal suffix, for dense rows. */
export function shortCompany(name: string): string {
  return name.replace(/\s+(private limited|pvt\.? ltd\.?|limited|llp)$/i, '').replace(/\s+India$/i, '').trim() || name;
}
