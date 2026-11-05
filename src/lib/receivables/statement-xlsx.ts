import ExcelJS from 'exceljs';
import { sheetDate } from './dates';
import type { Statement } from './statement';

/**
 * RECEIVABLES STATEMENT EXCEL (Phase 10): the statement of account as an .xlsx, in the style of
 * the sheet export (src/lib/receivables/xlsx.ts): a black title bar, boxed cells, Indian digit
 * grouping and dd-mmm-yy dates. Sheet "Statement" holds the summary and every line; sheet
 * "Receipts" lists the payments received in the period.
 */

const BLACK = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } } as const;
const GREY = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } } as const;
const GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } } as const;
const THIN = { style: 'thin', color: { argb: 'FF333333' } } as const;
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const INR_FMT = '#,##,##0';
const DATE_FMT = 'dd-mmm-yy';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function statementWorkbook(st: Statement, orgName: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCFO Suite';
  const ws = wb.addWorksheet('Statement');
  ws.columns = [{ width: 13 }, { width: 24 }, { width: 16 }, { width: 13 }, { width: 18 }, { width: 13 }, { width: 18 }, { width: 18 }, { width: 12 }];
  const width = 9;
  const boxRow = (r: ExcelJS.Row) => r.eachCell({ includeEmpty: true }, (c) => (c.border = BOX));

  const title = ws.addRow([`Statement of account · ${st.client ?? 'All clients'}`]);
  ws.mergeCells(title.number, 1, title.number, width);
  title.getCell(1).fill = BLACK;
  title.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  title.getCell(1).alignment = { horizontal: 'center' };
  ws.addRow([`${orgName} · ${sheetDate(st.from)} to ${sheetDate(st.to)}`]).font = { italic: true };
  ws.addRow([]);

  const summary: Array<[string, number, number]> = [
    [`Opening balance on ${sheetDate(st.from)}`, st.opening.count, st.opening.inr],
    ['Invoiced in the period', st.invoiced.count, st.invoiced.inr],
    ['Received in the period', st.received.count, -st.received.inr],
    [`Closing balance on ${sheetDate(st.to)}`, st.closing.count, st.closing.inr],
  ];
  const sumHead = ws.addRow(['', 'Summary', 'Invoices', 'Amount INR']);
  sumHead.font = { bold: true };
  for (const [label, count, amount] of summary) {
    const r = ws.addRow(['', label, count, amount]);
    r.getCell(4).numFmt = INR_FMT;
    if (label.startsWith('Closing')) r.font = { bold: true };
    [2, 3, 4].forEach((c) => (r.getCell(c).border = BOX));
  }
  ws.addRow([]);

  const head = ws.addRow(['Invoice date', 'Client', 'Invoice no.', 'Due date', 'Amount INR', 'Received on', 'Received INR', 'Closing INR', 'Days overdue']);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = GREY));
  boxRow(head);
  for (const l of st.lines) {
    const r = ws.addRow([
      toDate(l.invoiceDate),
      l.kind === 'opening' ? `${l.clientName} (brought forward)` : l.clientName,
      l.invoiceNo ?? '',
      toDate(l.dueDate),
      l.amountInr,
      l.receivedOn ? toDate(l.receivedOn) : '',
      l.receivedInr || '',
      l.closingInr || '',
      l.daysOverdue ?? '',
    ]);
    r.getCell(1).numFmt = DATE_FMT;
    r.getCell(4).numFmt = DATE_FMT;
    r.getCell(6).numFmt = DATE_FMT;
    [5, 7, 8].forEach((c) => (r.getCell(c).numFmt = INR_FMT));
    if (l.receivedOn) r.eachCell({ includeEmpty: true }, (c) => (c.fill = GREEN));
    boxRow(r);
  }
  const total = ws.addRow(['Total', '', '', '', st.opening.inr + st.invoiced.inr, '', st.received.inr, st.closing.inr, '']);
  total.font = { bold: true };
  [5, 7, 8].forEach((c) => (total.getCell(c).numFmt = INR_FMT));
  boxRow(total);
  ws.addRow([]);
  ws.addRow(['Part payments are already netted off each balance. Received INR is the balance a receipt cleared; the Receipts sheet shows the INR credited.']).font = {
    italic: true,
    color: { argb: 'FF64748B' },
  };

  const rc = wb.addWorksheet('Receipts');
  rc.columns = [
    { header: 'Received on', width: 13 },
    { header: 'Client', width: 24 },
    { header: 'Invoice no.', width: 16 },
    { header: 'Balance cleared INR', width: 20 },
    { header: 'INR credited', width: 16 },
  ];
  rc.getRow(1).font = { bold: true };
  for (const l of st.receipts) {
    const r = rc.addRow([toDate(l.receivedOn!), l.clientName, l.invoiceNo ?? '', l.receivedInr, l.creditedInr ?? '']);
    r.getCell(1).numFmt = DATE_FMT;
    r.getCell(4).numFmt = INR_FMT;
    r.getCell(5).numFmt = INR_FMT;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
