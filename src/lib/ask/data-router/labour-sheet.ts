import type { LabourSheetInfo } from './types';

/**
 * Recognises a labour register input (a paysheet, an attendance grid, an overtime, employee or
 * leave sheet) by its headings, with the labour registers' own reader. Such a sheet goes to the
 * register as a file, so its thousands of rows are never read as values and cost no model tokens.
 */

const SHEET_EXTENSIONS: ReadonlySet<string> = new Set(['xlsx', 'xlsm', 'csv']);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The period the day columns cover. Dates inside one month give that whole month, because a
 * register batch is a month; dates across months give the first and last date. A grid whose
 * dates could be read day-first or month-first gives no hint, and neither does one without years.
 */
function periodFromGrid(grid: { found: boolean; ambiguous: boolean; days: Array<{ date?: string }> }): LabourSheetInfo['periodHint'] {
  if (!grid.found || grid.ambiguous) return undefined;
  const dates = grid.days.map((d) => d.date).filter((d): d is string => Boolean(d)).sort();
  if (dates.length === 0 || dates.length < grid.days.length / 2) return undefined;
  const first = dates[0]!;
  const last = dates.at(-1)!;
  if (first.slice(0, 7) !== last.slice(0, 7)) return { from: first, to: last };
  const [year, month] = first.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

export async function isLabourSheet(bytes: Uint8Array, fileName: string): Promise<LabourSheetInfo | null> {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (!SHEET_EXTENSIONS.has(ext) || bytes.byteLength === 0) return null;
  const { formatForFileName, guessSlot, parseWorkbook } = await import('@/lib/labour-registers/parse');
  let parsed: Awaited<ReturnType<typeof parseWorkbook>>;
  try {
    parsed = await parseWorkbook(bytes, { format: formatForFileName(fileName) });
  } catch {
    return null;
  }
  const slot = guessSlot(parsed.headers);
  if (!slot) return null;
  const periodHint = periodFromGrid(parsed.grid);
  return { slot, headers: parsed.headers, ...(periodHint ? { periodHint } : {}) };
}
