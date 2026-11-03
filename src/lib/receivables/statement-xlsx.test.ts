import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildStatement } from './statement';
import { statementWorkbook } from './statement-xlsx';

describe('statementWorkbook', () => {
  it('writes the summary, the lines and the receipts', async () => {
    const st = buildStatement(
      [
        { id: 'a', clientName: 'Duravant', invoiceNo: 'SC/1', invoiceMonth: '2026-08-01', dueDate: '2026-08-20', amountInr: 500, status: 'open', paidOn: null, paidAmount: null, partPaid: 0 },
        { id: 'b', clientName: 'Duravant', invoiceNo: 'SC/2', invoiceMonth: '2026-09-01', dueDate: '2026-09-20', amountInr: 300, status: 'received', paidOn: '2026-09-15', paidAmount: 290, partPaid: 0 },
      ],
      { client: 'Duravant', from: '2026-09-01', to: '2026-09-30' },
    );
    const bytes = await statementWorkbook(st, 'Demo Summit');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Statement')!;
    expect(String(ws.getCell('A1').value)).toBe('Statement of account · Duravant');
    const values = ws.getSheetValues().flat().map(String);
    expect(values).toContain('Closing balance on 30-Sep-26');
    expect(values).toContain('Duravant (brought forward)');
    const rc = wb.getWorksheet('Receipts')!;
    expect(rc.rowCount).toBe(2);
    expect(rc.getRow(2).getCell(5).value).toBe(290);
  });
});
