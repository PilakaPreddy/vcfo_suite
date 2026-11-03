import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { amountsOf, parseReceivablesWorkbook, type WorkbookInput } from './import-workbook';
import { isPublicKeyShape, partnerSlug, publicPageUrl } from './links';
import { newPublicKey } from './public-key';
import type { SnapshotRow } from './model';
import { receivablesWorkbook } from './xlsx';

/** A workbook shaped like "Receivables Summary Week 1 November.xlsx" (columns E to I). */
async function financeSheet(): Promise<WorkbookInput> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  const put = (r: number, values: ExcelJS.CellValue[]) => values.forEach((v, n) => (ws.getCell(r, 5 + n).value = v));
  const due = (iso: string) => new Date(`${iso}T00:00:00Z`);
  put(5, ['August -26 -Receivables']);
  put(6, ['Client', 'Due Date', 'Invoice Amount INR', 'No of Days Over Due ', 'Remarks']);
  put(7, ['Bupa ', due('2026-11-02'), 2010500, { formula: 'IF(TODAY()-F7<0,"-",TODAY()-F7)', result: 0 }]);
  put(8, ["Aug'26- Receivables", null, { formula: 'SUM(G7)', result: 2010500 }]);
  put(10, ['September -26 -Receivables']);
  put(11, ['Client', 'Due Date', 'Invoice Amount INR', 'No of Days Over Due ', 'Remarks']);
  put(12, ['Emburse', due('2026-10-30'), 22757764, 3, 'Received']);
  put(13, ['Bupa', 46340, { formula: '1976259+1643932', result: 3620191 }, '-']);
  put(14, ['Duravant', due('2026-10-16'), 6456984, 17]);
  put(15, ['Broken', null, 100]);
  put(16, ["Sep'26- Receivables", null, { formula: 'SUM(G12:G15)-G12', result: 1 }]);
  put(17, ['Total Receivables', null, { formula: 'G8+G16', result: 1 }]);
  const prev = wb.addWorksheet('Sheet2');
  prev.getCell('D8').value = 'Emburse';
  return wb.xlsx.writeBuffer();
}

describe('parseReceivablesWorkbook', () => {
  it('reads month blocks, splits summed cells and marks received rows', async () => {
    const r = await parseReceivablesWorkbook(await financeSheet(), { receivedOn: '2026-11-01' });
    expect(r.sheetName).toBe('Sheet1');
    expect(r.invoices.map((i) => [i.invoiceMonth, i.clientName, i.dueDate, i.amountInr, i.status, i.part])).toEqual([
      ['2026-08-01', 'Bupa', '2026-11-02', 2010500, 'open', null],
      ['2026-09-01', 'Emburse', '2026-10-30', 22757764, 'received', null],
      ['2026-09-01', 'Bupa', '2026-11-14', 1976259, 'open', '1 of 2'],
      ['2026-09-01', 'Bupa', '2026-11-14', 1643932, 'open', '2 of 2'],
      ['2026-09-01', 'Duravant', '2026-10-16', 6456984, 'open', null],
    ]);
    expect(r.invoices[1].paidOn).toBe('2026-11-01');
    expect(r.warnings).toEqual(['Row 15 (Broken): no due date, skipped.']);
  });

  it('falls back to the cached result for other formulas', () => {
    expect(amountsOf({ formula: 'G7*2', result: 40 } as ExcelJS.CellValue)).toEqual([40]);
    expect(amountsOf('20,10,500')).toEqual([2010500]);
  });
});

describe('receivablesWorkbook', () => {
  it('writes the summary and a flat invoice sheet that read back', async () => {
    const rows: SnapshotRow[] = [
      { id: 'a', invoiceMonth: '2026-09-01', clientName: 'Duravant', invoiceNo: 'SC/09/03', partnerId: null, partnerSlug: 'yash', partnerName: 'Yash Babbar', dueDate: '2026-10-16', amountInr: 6456984, status: 'open', paidOn: null, paidAmount: null, paidVia: null, partPaid: 0, remindersPausedUntil: null, pauseReason: null },
    ];
    const bytes = await receivablesWorkbook(rows, '2026-11-03');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as WorkbookInput);
    const summary = wb.getWorksheet('Summary')!;
    expect(summary.getCell('A1').value).toBe('September-26 Receivables');
    expect(summary.getCell('A3').value).toBe('Duravant');
    expect(summary.getCell('D3').value).toBe(18);
    const flat = wb.getWorksheet('Invoices')!;
    expect(flat.getCell('C2').value).toBe('SC/09/03');
    expect(flat.getCell('D2').value).toBe('Yash Babbar');
  });
});

describe('links', () => {
  it('makes 12-character keys and the key link', () => {
    const k = newPublicKey();
    expect(isPublicKeyShape(k)).toBe(true);
    expect(publicPageUrl('https://app.sbctrack.in/', { publicKey: 'abcdefghijkl', requireKey: true }, 'yash')).toBe('https://app.sbctrack.in/receivables/k/abcdefghijkl?partner=yash');
    expect(publicPageUrl('https://app.sbctrack.in', { publicKey: 'abcdefghijkl', requireKey: false })).toBe('https://app.sbctrack.in/receivables');
  });

  it('makes free partner slugs', () => {
    expect(partnerSlug('Sandeep Sharma', [])).toBe('sandeep');
    expect(partnerSlug('Sandeep Rao', ['sandeep'])).toBe('sandeep-2');
  });
});
