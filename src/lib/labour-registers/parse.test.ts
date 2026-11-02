import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { columnValues, guessSlot, gridValues, parseWorkbook, type WorkbookInput } from './parse';

/** Build a workbook in memory, so the test needs no fixture file on disk. */
async function book(sheets: Array<{ name: string; rows: unknown[][]; merge?: string }>): Promise<WorkbookInput> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const row of s.rows) ws.addRow(row);
    if (s.merge) ws.mergeCells(s.merge);
  }
  return wb.xlsx.writeBuffer();
}

describe('parseWorkbook', () => {
  it('finds the heading row under a title and an instruction row', async () => {
    const buf = await book([
      {
        name: 'PAYSHEET',
        rows: [
          ['Paysheet — paste your data here. Row 4 must be the header row.'],
          ['The macro reads these columns automatically:'],
          [1, 2, 3, 4],
          ['SlNo', 'EmpNo', 'Name', 'Net_Pay'],
          [1, '000002380', 'Kodam Raviraju', 58286],
          [2, '000002385', 'Devakantha Nagaraju', 58945],
        ],
      },
    ]);
    const parsed = await parseWorkbook(buf);
    expect(parsed.headerRow).toBe(4);
    expect(parsed.headers).toEqual(['SlNo', 'EmpNo', 'Name', 'Net_Pay']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].Name).toBe('Kodam Raviraju');
  });

  it('is not fooled by a merged banner repeated across every column', async () => {
    /* exceljs reports a merged cell's value in every column it spans, which made an
       instruction row look like a full set of headings and beat the real one. */
    const buf = await book([
      {
        name: 'Sheet1',
        rows: [
          ['The macro reads these columns automatically:', null, null, null],
          ['EmpNo', 'Name', 'Basic', 'Net_Pay'],
          ['2380', 'Kodam Raviraju', 31043, 58286],
        ],
        merge: 'A1:D1',
      },
    ]);
    const parsed = await parseWorkbook(buf);
    expect(parsed.headerRow).toBe(2);
    expect(parsed.headers).toEqual(['EmpNo', 'Name', 'Basic', 'Net_Pay']);
  });

  it('keeps both of two identically named columns', async () => {
    /* The filed paysheet really does carry EmpNo twice, padded and unpadded. */
    const buf = await book([
      { name: 'Sheet1', rows: [['EmpNo', 'EmpNo', 'Name'], ['000002380', '2380', 'Kodam Raviraju']] },
    ]);
    const parsed = await parseWorkbook(buf);
    expect(parsed.headers).toEqual(['EmpNo', 'EmpNo', 'Name']);
    expect(parsed.rows[0].EmpNo).toBe('000002380');
    expect(parsed.rows[0].EmpNo__1).toBe('2380');
  });

  it('reads the per-day block out of an attendance export', async () => {
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, i + 1)));
    const buf = await book([
      {
        name: 'Attendance Data',
        rows: [
          ['Attendance — paste here'],
          ['Row 3 = headers'],
          ['Employee_ID', 'Employee_Name', 'Present', ...days, 'TOTAL'],
          ['2380', 'Kodam Raviraju', 18, ...days.map((_, i) => (i % 7 >= 5 ? 'WO' : 'P')), 0],
        ],
      },
    ]);
    const parsed = await parseWorkbook(buf);
    expect(parsed.headerRow).toBe(3);
    expect(parsed.grid.found).toBe(true);
    expect(parsed.grid.days).toHaveLength(30);
    expect(parsed.grid.days[0].index).toBe(3);
    expect(gridValues(parsed)).toContain('WO');
  });

  it('picks the named sheet out of a workbook with many', async () => {
    const buf = await book([
      { name: 'DASHBOARD', rows: [['Labour Register Automation'], ['Month', 'September']] },
      { name: 'OT Data', rows: [['Employee ID', 'Total OT Hours'], ['2970', 8], ['2855', 8]] },
    ]);
    const parsed = await parseWorkbook(buf, { preferSheet: 'OT Data' });
    expect(parsed.sheetName).toBe('OT Data');
    expect(parsed.headers).toEqual(['Employee ID', 'Total OT Hours']);
  });

  it('skips blank rows rather than emitting empty records', async () => {
    const buf = await book([
      { name: 'Sheet1', rows: [['EmpNo', 'Name'], ['2380', 'A'], [null, null], ['2385', 'B']] },
    ]);
    expect((await parseWorkbook(buf)).rows).toHaveLength(2);
  });

  it('refuses a workbook with nothing in it', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Empty');
    await expect(parseWorkbook(await wb.xlsx.writeBuffer())).rejects.toThrow('no sheet');
  });
});

describe('guessSlot', () => {
  it('recognises each of the four inputs from its own headings', () => {
    expect(guessSlot(['EmpNo', 'Basic_Pay', 'Gross', 'Net_Pay'])).toBe('paysheet');
    expect(guessSlot(['Employee ID', 'Emp ID', 'Manager', 'Total OT Hours', 'Dates'])).toBe('overtime');
    expect(guessSlot(['Employee ID', 'Father / Husband Name', 'Residential Address', 'Education Qualification'])).toBe('employees');
    expect(
      guessSlot(['Employee_ID', 'Present', ...Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)]),
    ).toBe('attendance');
  });

  it('declines to guess when nothing is clear', () => {
    expect(guessSlot(['Column1', 'Column2'])).toBeNull();
  });
});

describe('columnValues', () => {
  it('returns the non-empty values of one column', () => {
    const rows = [{ Gender: 'Male' }, { Gender: '' }, { Gender: 'Female' }];
    expect(columnValues(rows, 'Gender')).toEqual(['Male', 'Female']);
  });
});
