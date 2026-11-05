import ExcelJS from 'exceljs';
import { foreignAmountHeader } from './currencies';
import { daysLeft, monthBlockTitle, monthShort } from './dates';
import type { SnapshotRow } from './model';
import { foreignAmountOf, isForeignRow, isOpen, monthsOf, receivedThisWeek, sumInr } from './summary';

/**
 * RECEIVABLES EXCEL EXPORT — the published version as an .xlsx in the finance team's own layout
 * (sheet "Summary": month blocks with Client, Due Date, Invoice Amount INR, No of Days Over Due,
 * Remarks and totals), plus a flat "Invoices" sheet with one row per invoice for filtering.
 * Used for the email attachment and the Download Excel buttons.
 *
 * Phase 9: when any row is in a foreign currency, the Summary blocks gain Currency and the foreign
 * amount ("USD Amount", or "Foreign Amount" when currencies are mixed) before the INR, and the
 * Invoices sheet gains Currency, the foreign amount and Booked rate after
 * Amount INR. With every row in INR both sheets keep exactly the layout above.
 */

const BLACK = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } } as const;
const GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } } as const;
const THIN = { style: 'thin', color: { argb: 'FF333333' } } as const;
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export async function receivablesWorkbook(rows: SnapshotRow[], today: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCFO Suite';
  const ws = wb.addWorksheet('Summary');
  const foreign = rows.some(isForeignRow);
  // Phase 10: the amount column names the currency when there is one, else reads "Foreign".
  const fcCodes = rows.filter(isForeignRow).map((r) => r.currency);
  const width = foreign ? 7 : 5;
  /** The 1-based column of the INR amount on the Summary sheet. */
  const inrCol = foreign ? 5 : 3;
  ws.columns = foreign
    ? [{ width: 24 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 14 }]
    : [{ width: 24 }, { width: 14 }, { width: 20 }, { width: 20 }, { width: 14 }];

  const boxRow = (r: ExcelJS.Row) => r.eachCell({ includeEmpty: true }, (c) => (c.border = BOX));
  /** The Currency and foreign amount cells of a row, only when the workbook has a foreign row. */
  const fxCells = (r: SnapshotRow): ExcelJS.CellValue[] => (foreign ? [isForeignRow(r) ? (r.currency ?? '').toUpperCase() : 'INR', foreignAmountOf(r) ?? ''] : []);
  const pad = foreign ? ['', ''] : [];

  for (const m of monthsOf(rows)) {
    const list = rows.filter((r) => r.invoiceMonth === m && (isOpen(r) || receivedThisWeek(r, today))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!list.length) continue;
    const title = ws.addRow([monthBlockTitle(m)]);
    ws.mergeCells(title.number, 1, title.number, width);
    title.getCell(1).fill = BLACK;
    title.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    title.getCell(1).alignment = { horizontal: 'center' };
    const head = ws.addRow(['Client', 'Due Date', ...(foreign ? ['Currency', foreignAmountHeader(fcCodes)] : []), 'Invoice Amount INR', 'No of Days Over Due', 'Remarks']);
    head.font = { bold: true };
    boxRow(head);
    for (const r of list) {
      const dl = daysLeft(r.dueDate, today);
      const row = ws.addRow([r.clientName, isoToDate(r.dueDate), ...fxCells(r), isOpen(r) ? r.amountInr : r.paidAmount ?? r.amountInr, isOpen(r) ? (dl < 0 ? -dl : '-') : '', isOpen(r) ? '' : 'Received']);
      row.getCell(2).numFmt = 'dd-mmm-yy';
      if (foreign) row.getCell(4).numFmt = '#,##0.00';
      row.getCell(inrCol).numFmt = '#,##,##0';
      if (!isOpen(r)) row.eachCell({ includeEmpty: true }, (c) => (c.fill = GREEN));
      boxRow(row);
    }
    const total = ws.addRow([`${monthShort(m)}- Receivables`, '', ...pad, sumInr(list.filter(isOpen)), '', '']);
    total.font = { bold: true };
    total.getCell(inrCol).numFmt = '#,##,##0';
    boxRow(total);
    ws.addRow([]);
  }
  const grand = ws.addRow(['Total Receivables', '', ...pad, sumInr(rows.filter(isOpen)), '', '']);
  grand.font = { bold: true };
  grand.getCell(inrCol).numFmt = '#,##,##0';
  boxRow(grand);

  const flat = wb.addWorksheet('Invoices');
  flat.columns = [
    { header: 'Invoice month', width: 14 },
    { header: 'Client', width: 24 },
    { header: 'Invoice no.', width: 14 },
    { header: 'Client partner', width: 22 },
    { header: 'Due date', width: 12 },
    { header: 'Amount INR', width: 16 },
    ...(foreign ? [{ header: 'Currency', width: 10 }, { header: foreignAmountHeader(fcCodes, 'amount'), width: 14 }, { header: 'Booked rate', width: 12 }] : []),
    { header: 'Days overdue', width: 13 },
    { header: 'Status', width: 11 },
    { header: 'Paid on', width: 12 },
  ];
  flat.getRow(1).font = { bold: true };
  const paidCol = foreign ? 12 : 9;
  for (const r of [...rows].sort((a, b) => a.invoiceMonth.localeCompare(b.invoiceMonth) || a.dueDate.localeCompare(b.dueDate))) {
    const dl = daysLeft(r.dueDate, today);
    const fx: ExcelJS.CellValue[] = foreign ? [isForeignRow(r) ? (r.currency ?? '').toUpperCase() : 'INR', foreignAmountOf(r) ?? '', isForeignRow(r) && r.fxRate ? r.fxRate : ''] : [];
    const row = flat.addRow([
      isoToDate(r.invoiceMonth),
      r.clientName,
      r.invoiceNo ?? '',
      r.partnerName ?? '',
      isoToDate(r.dueDate),
      isOpen(r) ? r.amountInr : r.paidAmount ?? r.amountInr,
      ...fx,
      isOpen(r) && dl < 0 ? -dl : '',
      isOpen(r) ? 'Open' : 'Received',
      r.paidOn ? isoToDate(r.paidOn) : '',
    ]);
    row.getCell(1).numFmt = 'mmm-yy';
    row.getCell(5).numFmt = 'dd-mmm-yy';
    row.getCell(6).numFmt = '#,##,##0';
    if (foreign) {
      row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).numFmt = '0.0000';
    }
    if (r.paidOn) row.getCell(paidCol).numFmt = 'dd-mmm-yy';
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function receivablesWorkbookName(clientOrgName: string, today: string): string {
  return `Receivables ${clientOrgName} ${today}.xlsx`;
}
