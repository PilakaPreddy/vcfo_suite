import ExcelJS from 'exceljs';
import { monthStart } from './dates';

/**
 * RECEIVABLES WORKBOOK IMPORT — reads the finance team's weekly sheet ("Receivables Summary Week 1
 * November.xlsx") once, to start the register. Used by scripts/import-receivables.ts.
 *
 * The sheet has one block per invoice month: a title row ("August -26 -Receivables"), a header
 * row (Client, Due Date, Invoice Amount INR, No of Days Over Due, Remarks), the invoice rows and a
 * total row ("Aug'26- Receivables"), then a "Total Receivables" row. Some amount cells add several
 * invoices together (`=1976259+1643932`); each part becomes its own invoice. "Received" in Remarks
 * imports the row as received on `receivedOn`. Days overdue are not imported; the app works them
 * out. Only the first worksheet with month blocks is read (Sheet2 is the previous cycle).
 */

export type ImportedInvoice = {
  invoiceMonth: string;
  clientName: string;
  dueDate: string;
  amountInr: number;
  status: 'open' | 'received';
  paidOn: string | null;
  /** 1-based row in the worksheet, for the review list. */
  sourceRow: number;
  /** "2 of 3" when the cell added several invoices together. */
  part: string | null;
};

export type ImportResult = { sheetName: string; invoices: ImportedInvoice[]; warnings: string[] };

export type WorkbookInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TITLE = /^\s*([a-z]+)\s*[-' ]\s*(\d{2})\s*-?\s*receivables\s*$/i;

function text(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return text(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
  }
  return String(v);
}

function excelSerialToIso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
}

function dateOf(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return excelSerialToIso(v);
  if (v && typeof v === 'object' && 'result' in v) return dateOf(v.result as ExcelJS.CellValue);
  const s = text(v).trim();
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mon >= 0) return `${y}-${String(mon + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** The invoice amounts in a cell: the parts of `=a+b+c`, else its value or cached result. */
export function amountsOf(v: ExcelJS.CellValue): number[] {
  if (typeof v === 'number') return [v];
  if (v && typeof v === 'object' && 'formula' in v && typeof v.formula === 'string') {
    const f = v.formula.replace(/^=/, '').trim();
    if (/^\d+(\.\d+)?(\s*\+\s*\d+(\.\d+)?)+$/.test(f)) return f.split('+').map((x) => Number(x.trim()));
    const r = (v as { result?: unknown }).result;
    return typeof r === 'number' ? [r] : [];
  }
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return [v.result];
  const n = Number(text(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? [n] : [];
}

function monthFromTitle(s: string): string | null {
  const m = s.match(TITLE);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mon < 0) return null;
  return monthStart(`20${m[2]}-${String(mon + 1).padStart(2, '0')}-01`);
}

export async function parseReceivablesWorkbook(input: WorkbookInput, opts: { receivedOn: string }): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(input);
  const warnings: string[] = [];

  for (const ws of wb.worksheets) {
    const invoices: ImportedInvoice[] = [];
    let month: string | null = null;
    let cols: { client: number; due: number; amount: number; remarks: number } | null = null;
    let sawBlock = false;

    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      // row.values is sparse (index 0 and blank cells are holes); Array.from fills them.
      const cells = Array.from((row.values as ExcelJS.CellValue[]) ?? [], (c) => c ?? null);
      const texts = cells.map((c) => text(c).trim());
      const titled = texts.map(monthFromTitle).find(Boolean);
      if (titled) {
        month = titled;
        cols = null;
        sawBlock = true;
        return;
      }
      if (!month) return;
      const clientCol = texts.findIndex((t) => t.toLowerCase() === 'client');
      if (clientCol > 0) {
        const find = (re: RegExp) => texts.findIndex((t) => re.test(t));
        cols = { client: clientCol, due: find(/^due date$/i), amount: find(/invoice amount/i), remarks: find(/^remarks$/i) };
        return;
      }
      if (!cols) return;
      const client = texts[cols.client] ?? '';
      if (!client || /receivables/i.test(client)) return;
      const due = cols.due > 0 ? dateOf(cells[cols.due]) : null;
      const amounts = cols.amount > 0 ? amountsOf(cells[cols.amount]) : [];
      if (!due || !amounts.length) {
        warnings.push(`Row ${rowNo} (${client}): ${!due ? 'no due date' : 'no amount'}, skipped.`);
        return;
      }
      const received = cols.remarks > 0 && /received/i.test(texts[cols.remarks] ?? '');
      amounts.forEach((amountInr, n) =>
        invoices.push({
          invoiceMonth: month!,
          clientName: client,
          dueDate: due,
          amountInr,
          status: received ? 'received' : 'open',
          paidOn: received ? opts.receivedOn : null,
          sourceRow: rowNo,
          part: amounts.length > 1 ? `${n + 1} of ${amounts.length}` : null,
        }),
      );
    });

    if (sawBlock) return { sheetName: ws.name, invoices, warnings };
  }
  return { sheetName: '', invoices: [], warnings: ['No worksheet has a "<Month>-<YY> Receivables" block.'] };
}
