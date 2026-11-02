/**
 * LABOUR REGISTERS — reading an uploaded workbook.
 *
 * All the spreadsheet work is `exceljs`, which handles xlsx and xlsm, merged cells, shared
 * strings, date cells and formula results. Nothing here parses a file format by hand; this
 * module only answers the two questions exceljs cannot: which sheet holds the data, and which
 * row holds the headings.
 *
 * Both questions are real. The filed workbooks put the paysheet headings on row 4, the
 * attendance headings on row 3 and the employee details on row 2, under a title row and a
 * row of instructions. A fixed header row would misread three of the four inputs.
 */
import ExcelJS from 'exceljs';
import { detectAttendanceGrid, type GridDetection } from './attendance-grid';
import { normaliseHeader } from './normalise';

/**
 * Whatever `exceljs` itself accepts, so no cast is needed at the boundary and a change in the
 * library's own typing surfaces here rather than in every caller.
 */
export type WorkbookInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

/** The four inputs a batch takes. */
export type UploadSlot = 'paysheet' | 'attendance' | 'overtime' | 'employees';

export interface ParsedSheet {
  sheetName: string;
  /** The row the headings were found on, one-based as a spreadsheet counts. */
  headerRow: number;
  /** The headings, in column order, blanks included so positions stay meaningful. */
  headers: string[];
  /** The data rows, each keyed by its heading. */
  rows: Array<Record<string, string>>;
  /** The per-day attendance block, when the sheet has one. */
  grid: GridDetection;
}

/**
 * How plausible a row is as the heading row: the share of its cells that are short, non-numeric
 * text, weighted by how wide the row is and how DISTINCT its values are.
 *
 * Distinctness is the part that earns its place. A merged banner across the top of a sheet is
 * reported by exceljs as the same string in every column it spans, so the instruction row of a
 * real client workbook — "The macro reads these columns automatically:" — looked exactly like
 * sixty-nine headings and beat the true heading row four rows below it. Headings are nearly all
 * different from each other; a banner is one value repeated. Nothing else separated the two.
 */
function headerScore(values: string[]): number {
  const filled = values.filter((v) => v.trim() !== '');
  if (filled.length < 2) return 0;
  const texty = filled.filter((v) => {
    const t = v.trim();
    if (t.length > 60) return false;
    if (/^-?[\d,.]+$/.test(t)) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return true; /* a date heading in a day grid counts */
    return /[a-z]/i.test(t);
  });
  const distinct = new Set(filled.map((v) => v.trim().toLowerCase())).size / filled.length;
  /* Reward width as well as texture: the heading row is usually the widest of the first few. */
  return (texty.length / filled.length) * Math.min(1, filled.length / 8) * distinct;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return String((v as { result?: unknown }).result ?? '');
    if ('richText' in v) return (v as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join('');
    return '';
  }
  return String(v);
}

function rowValues(row: ExcelJS.Row, width: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= width; i += 1) out.push(cellText(row.getCell(i)));
  return out;
}

/**
 * Read a workbook and return the sheet that looks like data.
 *
 * `preferSheet` lets a caller name the sheet when the client's workbook has several — the macro
 * workbook this feature replaces has thirteen, four of which are inputs. Without it, the sheet
 * with the most rows wins, which is right for a single-sheet export.
 */
export async function parseWorkbook(
  input: WorkbookInput,
  options: { preferSheet?: string; maxHeaderRow?: number } = {},
): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);

  const sheets = workbook.worksheets.filter((ws) => ws.rowCount > 0);
  if (sheets.length === 0) throw new Error('The workbook has no sheet with any rows in it.');

  const wanted = options.preferSheet
    ? sheets.find((ws) => normaliseHeader(ws.name) === normaliseHeader(options.preferSheet!))
    : undefined;
  const sheet = wanted ?? sheets.reduce((a, b) => (b.rowCount > a.rowCount ? b : a));

  const width = Math.max(sheet.columnCount, 1);
  const limit = Math.min(options.maxHeaderRow ?? 8, sheet.rowCount);

  let headerRow = 1;
  let best = -1;
  for (let r = 1; r <= limit; r += 1) {
    const score = headerScore(rowValues(sheet.getRow(r), width));
    if (score > best) {
      best = score;
      headerRow = r;
    }
  }

  const headers = rowValues(sheet.getRow(headerRow), width).map((h) => h.trim());
  /* Trailing blank columns carry no data and only widen every row object. */
  let last = headers.length;
  while (last > 0 && headers[last - 1] === '') last -= 1;
  const trimmed = headers.slice(0, last);

  const rows: Array<Record<string, string>> = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const values = rowValues(sheet.getRow(r), last);
    if (values.every((v) => v.trim() === '')) continue;
    const row: Record<string, string> = {};
    for (const [i, header] of trimmed.entries()) {
      /* A duplicate heading would otherwise overwrite its twin; the position disambiguates.
         The filed paysheet really does carry `EmpNo` twice, padded and unpadded. */
      const key = header === '' || row[header] !== undefined ? `${header || 'column'}__${i}` : header;
      row[key] = values[i] ?? '';
    }
    rows.push(row);
  }

  return {
    sheetName: sheet.name,
    headerRow,
    headers: trimmed,
    rows,
    grid: detectAttendanceGrid(trimmed),
  };
}

/** The sheet names in a workbook, so a preparer can pick when detection is not obvious. */
export async function listSheets(input: WorkbookInput): Promise<Array<{ name: string; rowCount: number }>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  return workbook.worksheets.map((ws) => ({ name: ws.name, rowCount: ws.rowCount }));
}

/**
 * Which slot a sheet belongs in, guessed from its own headings so a preparer can drop four
 * files at once without labelling them. Returns null when nothing is clear enough to act on —
 * a wrong guess here would map a whole file to the wrong place.
 */
export function guessSlot(headers: string[]): UploadSlot | null {
  const set = new Set(headers.map(normaliseHeader));
  const has = (...names: string[]) => names.some((n) => set.has(n));

  if (detectAttendanceGrid(headers).found) return 'attendance';
  if (has('total ot hours', 'ot hours', 'overtime hours') && !has('gross', 'net pay')) return 'overtime';
  if (has('gross', 'net pay', 'basic pay', 'basic')) return 'paysheet';
  if (has('residential address', 'father husband name', 'education qualification')) return 'employees';
  return null;
}

/** The distinct values of one column, for the value-mapping step. */
export function columnValues(rows: Array<Record<string, string>>, header: string): string[] {
  return rows.map((r) => r[header] ?? '').filter((v) => v.trim() !== '');
}

/** Every value in the per-day block, which is what the attendance codes are mapped from. */
export function gridValues(parsed: ParsedSheet): string[] {
  if (!parsed.grid.found) return [];
  const headers = parsed.grid.days.map((d) => parsed.headers[d.index]);
  const out: string[] = [];
  for (const row of parsed.rows) {
    for (const [i, header] of headers.entries()) {
      const key = row[header] !== undefined ? header : `${header || 'column'}__${parsed.grid.days[i].index}`;
      const v = row[key];
      if (v && v.trim() !== '') out.push(v.trim());
    }
  }
  return out;
}
