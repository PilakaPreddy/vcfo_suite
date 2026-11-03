/**
 * Typed dates for the sheet's date picker (Phase 10). The sheet shows dates as `02-Nov-26`; a
 * manager may type that, or `2 Nov 2026`, `02/11/2026`, `2/11/26`, `02.11.2026` or `2026-11-02`.
 * Day first always (India), never the browser's month-first `mm/dd/yyyy`.
 */

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function year(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/** A real calendar day as `YYYY-MM-DD`, or null (31 Feb is null). */
export function isoOf(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** The ISO day a person typed, or null when it is not a date. */
export function parseDateText(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[\s/.-]([a-z]{3,9})\.?[\s/.-]('?\d{2}|\d{4})$/.exec(t);
  if (m) {
    const mi = MON.findIndex((x) => m![2]!.startsWith(x));
    return mi < 0 ? null : isoOf(year(m[3]!.replace("'", '')), mi + 1, Number(m[1]));
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) return isoOf(year(m[3]!), Number(m[2]), Number(m[1]));
  return null;
}

/** A local-midnight Date for the calendar widget, from an ISO day. */
export function localDateOf(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** The ISO day of a calendar widget's local Date. */
export function isoOfLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
