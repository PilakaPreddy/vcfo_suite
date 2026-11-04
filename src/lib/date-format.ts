/**
 * Date wording rules (K-13, rule R-29): write "14 Sep", never "14 Sept". The
 * en-GB and en-IN locale data in modern ICU spell September "Sept", so every
 * display date passes through `sep`.
 */
export function sep(s: string): string {
  return s.replace(/\bSept\b/g, 'Sep');
}

/** 24-hour clock time, for example "09:05" or "15:42" (Asia/Kolkata unless given). */
export function time24(d: Date, timeZone = 'Asia/Kolkata'): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };

/** R-29: a plain date, "14 Oct". Accepts YYYY-MM-DD or an ISO timestamp. */
export function plainDay(value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) return '–';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(date.getTime())) return '–';
  return sep(date.toLocaleDateString('en-GB', DAY_MONTH));
}
