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
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { detectAttendanceGrid, type GridDetection } from './attendance-grid';
import { normaliseHeader } from './normalise';

/**
 * Whatever `exceljs` itself accepts, so no cast is needed at the boundary and a change in the
 * library's own typing surfaces here rather than in every caller.
 *
 * `Uint8Array` is added because the library's own declaration says `Buffer`, and the `Buffer`
 * a route gets from `Buffer.from(await file.arrayBuffer())` is typed `Buffer<ArrayBufferLike>`,
 * which is not assignable to it. Both are the same bytes at runtime; this is the one place to
 * absorb that rather than casting at every call site.
 */
export type WorkbookInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0] | Uint8Array;

/**
 * The inputs a batch takes.
 *
 * Written once and exported, because the list was spelled out in seven places — the upload
 * route, the mapping route, four role shells and the dataset loader — and adding a fifth meant
 * finding all seven. A slot missing from one of them is a file that uploads and is then never
 * read, which is the quietest way for a register to come out short.
 *
 * `leave` is the fifth. Five forms in the catalogue print a leave balance, days availed and a
 * category of leave, and none of those is on a paysheet: leave is kept in an HR system, not a
 * payroll run. Without the slot those forms could only ever be produced blank.
 */
export const UPLOAD_SLOTS = ['paysheet', 'attendance', 'overtime', 'employees', 'leave'] as const;

export type UploadSlot = (typeof UPLOAD_SLOTS)[number];

/**
 * Which reader to use. A payroll system exports a CSV about as often as a workbook, and the
 * header-detection below works the same either way — a CSV simply has one sheet and no merged
 * cells. Legacy `.xls` is not here because exceljs cannot read the BIFF format at all.
 */
export type SheetFormat = 'xlsx' | 'csv';

/** Guess the reader from the file name. Anything not obviously a CSV is read as a workbook. */
export function formatForFileName(fileName: string): SheetFormat {
  return /\.csv$/i.test(fileName.trim()) ? 'csv' : 'xlsx';
}

/**
 * Load a workbook, whichever of the two formats it is.
 *
 * exceljs reads a CSV from a stream rather than a buffer, which is the only reason this is a
 * function and not a line.
 */
async function loadWorkbook(input: WorkbookInput, format: SheetFormat): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  if (format === 'csv') {
    const bytes = ArrayBuffer.isView(input) ? Buffer.from(input.buffer, input.byteOffset, input.byteLength) : Buffer.from(input as ArrayBuffer);
    await workbook.csv.read(Readable.from(bytes));
    return workbook;
  }
  await workbook.xlsx.load(input as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);
  return workbook;
}

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
  options: { preferSheet?: string; maxHeaderRow?: number; format?: SheetFormat } = {},
): Promise<ParsedSheet> {
  const workbook = await loadWorkbook(input, options.format ?? 'xlsx');

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
  /* Checked after the paysheet, not before: a paysheet often carries a leave-encashment
     column, and a leave register never carries a gross or a net pay. */
  if (has('leave balance', 'balance of leave to credit', 'leaves availed', 'leave availed', 'category of leave')) {
    return 'leave';
  }
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
