// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { isLabourSheet } from './labour-sheet';

async function book(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Hours worked per day: numeric rows, so the heading row is the only row of text.
const hours = (count: number) => [1, 2, ...Array.from({ length: count }, () => 8)];
const days = (format: (day: number) => unknown, count = 30) => Array.from({ length: count }, (_, i) => format(i + 1));

describe('isLabourSheet', () => {
  it('recognises a paysheet by its headings, with no period', async () => {
    const bytes = await book([['EmpNo', 'Name', 'Basic', 'Gross', 'Net Pay'], ['1', 'Asha Rao', 20000, 25000, 23000]]);
    expect(await isLabourSheet(bytes, 'payroll.xlsx')).toEqual({ slot: 'paysheet', headers: ['EmpNo', 'Name', 'Basic', 'Gross', 'Net Pay'] });
  });

  it('takes the whole month from an attendance grid with dated columns', async () => {
    const bytes = await book([['EmpNo', 'Name', ...days((d) => new Date(Date.UTC(2026, 8, d)))], ['1', 'Asha Rao', ...days(() => 'P')]]);
    const result = await isLabourSheet(bytes, 'muster.xlsm');
    expect(result?.slot).toBe('attendance');
    expect(result?.periodHint).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('gives the first and last date when the grid runs across two months', async () => {
    const headers = [...days((d) => `${String(d + 25).padStart(2, '0')}/08/2026`, 6), ...days((d) => `${String(d).padStart(2, '0')}/09/2026`, 25)];
    const bytes = await book([['EmpNo', 'Name', ...headers], hours(headers.length)]);
    expect((await isLabourSheet(bytes, 'cycle.xlsx'))?.periodHint).toEqual({ from: '2026-08-26', to: '2026-09-25' });
  });

  it('gives no period for day numbers alone, or for dates that read either way', async () => {
    const bare = await book([['EmpNo', 'Name', ...days((d) => String(d))], hours(30)]);
    const plain = await isLabourSheet(bare, 'attendance.xlsx');
    expect(plain?.slot).toBe('attendance');
    expect(plain?.periodHint).toBeUndefined();
    // Twenty-four headings whose day and month are both twelve or below: day-first or month-first.
    const either = [...Array.from({ length: 12 }, (_, i) => `${i + 1}/1/2026`), ...Array.from({ length: 12 }, (_, i) => `${i + 1}/2/2026`)];
    const ambiguous = await book([['EmpNo', 'Name', ...either], hours(either.length)]);
    const read = await isLabourSheet(ambiguous, 'grid.xlsx');
    expect(read?.slot).toBe('attendance');
    expect(read?.periodHint).toBeUndefined();
  });

  it('reads a CSV the same way', async () => {
    const csv = Buffer.from('EmpNo,Name,Total OT Hours\n1,Asha,4\n');
    expect((await isLabourSheet(csv, 'ot.csv'))?.slot).toBe('overtime');
  });

  it('leaves other sheets, other files and unreadable bytes alone', async () => {
    expect(await isLabourSheet(await book([['Name', 'PAN', 'DIN'], ['Asha Rao', 'ABCDE1234F', '01234567']]), 'directors.xlsx')).toBeNull();
    expect(await isLabourSheet(Buffer.from('Name: Asha'), 'notes.txt')).toBeNull();
    expect(await isLabourSheet(Buffer.from('not a workbook'), 'broken.xlsx')).toBeNull();
  });
});
