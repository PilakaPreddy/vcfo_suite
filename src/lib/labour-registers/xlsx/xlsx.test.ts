import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { FORMS, formById } from '@/data/labour-registers/forms';
import { monthPeriod } from '../catalogue';
import { buildDataset, type SlotInput } from '../dataset';
import { parseWorkbook } from '../parse';
import { projectForm } from '../project';
import { ArchetypeNotBuilt, isBuilt, layoutFor, numberFormat } from './layouts';
import { renderForForm } from './renderers';
import { sheetName, verificationNotice, type WorkbookMeta } from './scaffold';
import { templateVersionFor } from './version';

/**
 * The writer, proved by reading its own output back.
 *
 * The round trip is the point: a register is written with exceljs and then parsed with this
 * feature's own `parseWorkbook`, the same code that reads a client's uploaded paysheet. If the
 * heading row cannot be found, or the headings do not come back in the prescribed order, the
 * file is not a register whatever it looks like. No fixture files, no golden bytes, and it
 * exercises two halves of the feature against each other.
 */

const period = monthPeriod(2026, 9);

const meta: WorkbookMeta = {
  establishment: {
    name: 'WebPT India Private Limited',
    address: 'Hyderabad, Telangana',
    shiftName: 'General',
    shiftStart: '09:30',
    shiftEnd: '18:30',
    restInterval: '13:00–13:45',
    dateOfPayment: '2026-10-07',
  },
  periodLabel: 'September 2026',
  generatedAt: '2026-11-03T14:05:00.000Z',
  generatorRevision: '2026-11-02.1',
  cacheKey: 'abcdef0123456789abcdef',
};

function sheet(headers: string[], rows: Array<Record<string, string>>) {
  return {
    sheetName: 'Sheet1',
    headerRow: 1,
    headers,
    rows,
    grid: { found: false, days: [], format: 'none' as const, ambiguous: false, gaps: [] },
  };
}

const PAY_HEADERS = ['Emp No', 'Name', 'Sex', 'Desig', 'Days', 'Basic', 'Gross', 'Total Ded', 'Net', 'Joined', 'Father'];

function paysheet(count = 3): SlotInput {
  const rows = Array.from({ length: count }, (_, i) => ({
    'Emp No': `E${String(i + 1).padStart(4, '0')}`,
    Name: `Employee ${i + 1}`,
    Sex: i % 2 === 0 ? 'F' : 'M',
    Desig: 'Associate',
    Days: '26',
    Basic: '25000',
    Gross: '35000',
    'Total Ded': '1800',
    Net: '33200',
    Joined: '2024-04-01',
    Father: `Father ${i + 1}`,
  }));
  return {
    sheet: sheet(PAY_HEADERS, rows),
    mapping: {
      employeeId: 'Emp No',
      name: 'Name',
      sex: 'Sex',
      designation: 'Desig',
      daysWorked: 'Days',
      basic: 'Basic',
      grossEarnings: 'Gross',
      totalDeductions: 'Total Ded',
      netPay: 'Net',
      dateOfJoining: 'Joined',
      guardianName: 'Father',
    },
  };
}

function roll(formId: string, count = 3) {
  const form = formById(formId)!;
  const dataset = buildDataset({
    period,
    slots: { paysheet: paysheet(count) },
    assumptions: { fullAttendanceAssumed: false },
    forms: [form],
    master: meta.establishment,
  });
  return { form, table: projectForm(form, dataset) };
}

/** Read a written register back with the feature's own reader. */
async function readBack(buffer: Buffer) {
  return parseWorkbook(buffer, { maxHeaderRow: 12 });
}

/**
 * Open a written register as a workbook again, to assert on the things a reader cannot see —
 * print setup, frozen panes, number formats, a banded heading.
 *
 * The cast absorbs exceljs's own declaration saying `Buffer` where Node now hands back
 * `Buffer<ArrayBufferLike>`; they are the same bytes. One place rather than six.
 */
async function reopen(table: Parameters<typeof renderForForm>[0]): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await renderForForm(table, meta)) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb.worksheets[0];
}

/** Everything written on a sheet, as one string, for asserting that a line is present. */
async function textOf(table: Parameters<typeof renderForForm>[0]): Promise<string> {
  return JSON.stringify((await reopen(table)).getSheetValues());
}

describe('a written wage register', () => {
  it('can be read back, with the prescribed headings in order', async () => {
    const { form, table } = roll('in-wages-iv');
    const parsed = await readBack(await renderForForm(table, meta));

    const expected = [...form.columns]
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map((c) => c.heading);
    expect(parsed.headers).toEqual(expected);

    /* The first three rows are the roll. The reader also sees the footnotes as rows, which is
       correct of it — they are rows — and is why the assertion counts the roll rather than the
       sheet. */
    expect(parsed.rows.slice(0, 3).map((r) => r['Sl. No.'])).toEqual(['1', '2', '3']);
    expect(parsed.rows[0]['Name of the employee']).toBe('Employee 1');
  });

  it('writes money as a number the sheet can total, not as text', async () => {
    const { table } = roll('in-wages-iv');
    const ws = await reopen(table);

    const headingRow = ws.getRow(9);
    const basicAt = (headingRow.values as unknown[]).findIndex((v) => v === 'Basic wages');
    const cell = ws.getRow(10).getCell(basicAt);
    expect(typeof cell.value).toBe('number');
    expect(cell.value).toBe(25000);
    expect(cell.numFmt).toBe('#,##0.00');
  });

  it('prints an unmapped optional column, with nothing under it', async () => {
    const { table } = roll('in-wages-iv');
    const parsed = await readBack(await renderForForm(table, meta));
    /* The client pays no house rent allowance. The column is prescribed, so it prints. */
    expect(parsed.headers).toContain('House rent allowance');
    expect(parsed.rows[0]['House rent allowance']).toBe('');
  });

  it('names what went out nil, under the table', async () => {
    const { table } = roll('in-wages-iv');
    const text = await textOf(table);
    expect(text).toContain('Printed nil for this period');
    expect(text).toContain('House rent allowance');
  });
});

describe('a written muster roll', () => {
  it('prints one column per day of the period, under one band', async () => {
    const { table } = roll('in-wages-ix');
    const ws = await reopen(table);

    /* A banded heading is two rows, which no single-header reader can merge back — so this
       asserts on the sheet rather than on a round trip. The band row carries the prescribed
       heading; the row under it carries the day numbers. */
    const band = (ws.getRow(9).values as unknown[]).filter(Boolean);
    const days = (ws.getRow(10).values as unknown[]).filter((v) => /^\d+$/.test(String(v)));

    expect(band).toContain('Days of the month');
    /* September has thirty days, so thirty columns and not a fixed thirty-one. */
    expect(days).toHaveLength(30);
    /* Written as labels, not numbers: a day heading is a column name, and a numeric one would
       be right-aligned against the letters underneath it. */
    expect(days[0]).toBe('1');
    expect(days.at(-1)).toBe('30');
  });

  it('writes a muster roll that has no day grid at all', async () => {
    /* `in-mw-muster` is declared a muster roll but summarises with "Period of work" instead of
       a day block. The writer asks the table whether it has grid columns, never the archetype;
       if it ever asks the archetype, this test fails. */
    const { form, table } = roll('in-mw-muster');
    expect(form.archetype).toBe('musterRoll');
    expect(table.columns.some((c) => c.source === 'grid')).toBe(false);

    const parsed = await readBack(await renderForForm(table, meta));
    expect(parsed.headers).toContain('Total no. of actual working days');
    expect(parsed.headers.filter((h) => /^\d+$/.test(h))).toHaveLength(0);
  });
});

describe('what every register says about itself', () => {
  it('prints the authority line and the form it is', async () => {
    const { form, table } = roll('in-wages-iv');
    const text = await textOf(table);

    expect(text).toContain(form.authorityLine);
    expect(text).toContain(form.rule);
    expect(text).toContain('WebPT India Private Limited');
    expect(text).toContain('September 2026');
  });

  it('prints a notice saying how far the layout was checked', async () => {
    /* Not one form in the catalogue is gazette-verified. A register must not imply an authority
       nobody checked, so every sheet carries this above the table. */
    const { table } = roll('in-wages-iv');
    expect(await textOf(table)).toContain('not verified against the gazette');
  });

  it('shouts on a disputed form, and still produces it', async () => {
    /* Telangana Form V: our catalogue calls it a muster roll, the rules text appears to call it
       a register of eating houses. A missing statutory register is a failure nobody notices;
       a flagged one is a draft somebody reviews. So it is produced, loudly. */
    const { form, table } = roll('tg-se-v');
    expect(form.verification.status).toBe('disputed');

    const text = await textOf(table);
    expect(text).toContain('DISPUTED');
    expect(text).toContain('DO NOT FILE WITHOUT CHECKING');
    expect(text).toContain('Register of Establishments');
    expect(text).toContain('before it is filed or handed to an inspector');
  });

  it('words the notice from the form\'s own verification state', () => {
    const unverified = { form: { verification: { status: 'unverified', open: ['seal'] } } } as never;
    expect(verificationNotice(unverified)).toContain('not verified against the gazette');
    expect(verificationNotice(unverified)).toContain('Still open: seal');

    const sampled = {
      form: { verification: { status: 'checked-against-sample', against: 'a filed workbook', on: '2026-10-28' } },
    } as never;
    expect(verificationNotice(sampled)).toContain('checked against a filed workbook');
    expect(verificationNotice(sampled)).toContain('not against the gazette');

    const disputed = {
      form: { verification: { status: 'disputed', disputedBecause: 'the rules text says otherwise' } },
    } as never;
    expect(verificationNotice(disputed)).toContain('DISPUTED');
    expect(verificationNotice(disputed)).toContain('the rules text says otherwise');
  });

  it('prints the firm\'s own verdict over the catalogue\'s, both ways', async () => {
    /* The firm has checked Form IV against the gazette. The sheet must say so — the whole
       point of the verification screen is that this line changes without a deploy. */
    const { table } = roll('in-wages-iv');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      (await renderForForm(table, {
        ...meta,
        verification: { status: 'gazette-verified', on: '2026-11-04', against: 'the Central Rules of 8 May 2026' },
      })) as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const verified = JSON.stringify(wb.worksheets[0].getSheetValues());
    expect(verified).toContain('verified against the gazette on 2026-11-04');
    expect(verified).not.toContain('not verified against the gazette');

    /* And the other direction: a form the catalogue is happy with, that the firm has since
       found wrong, shouts. A verdict that could only make a sheet calmer would be no use. */
    const sampled = roll('in-wages-ix');
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(
      (await renderForForm(sampled.table, {
        ...meta,
        verification: { status: 'disputed', disputedBecause: 'The column order does not match the prescribed form.' },
      })) as unknown as Parameters<typeof wb2.xlsx.load>[0],
    );
    const text = JSON.stringify(wb2.worksheets[0].getSheetValues());
    expect(text).toContain('DISPUTED');
    expect(text).toContain('The column order does not match the prescribed form.');
  });

  it('carries the generator revision and the content address, so a printout is traceable', async () => {
    const { table } = roll('in-wages-iv');
    const text = await textOf(table);
    expect(text).toContain('2026-11-02.1');
    expect(text).toContain('abcdef012345');
  });
});

describe('printing', () => {
  it('fits one page wide, as many pages tall as it needs, and repeats the headings', async () => {
    /* An electronic register is permitted only if a printout is produced on demand. A thirty
       column sheet printing across four unlabelled pages does not satisfy that. */
    const { table } = roll('in-wages-iv');
    const ws = await reopen(table);

    expect(ws.pageSetup.orientation).toBe('landscape');
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);
    expect(ws.pageSetup.printTitlesRow).toBeTruthy();
  });

  it('keeps the identity columns in view while the rest scrolls', async () => {
    const { table } = roll('in-wages-ix');
    const view = (await reopen(table)).views[0] as { state: string; xSplit: number; ySplit: number };
    expect(view.state).toBe('frozen');
    /* Serial, code, name: three columns held while thirty days scroll past. */
    expect(view.xSplit).toBe(3);
    expect(view.ySplit).toBeGreaterThan(0);
  });
});

describe('layouts', () => {
  it('has a layout for every archetype in the catalogue', () => {
    for (const a of ['wages', 'musterRoll', 'combinedWages', 'leave', 'employment'] as const) {
      expect(isBuilt(a)).toBe(true);
      expect(layoutFor(a).orientation).toMatch(/portrait|landscape/);
    }
    /* Both were deferred when this file was written: a wage slip is one document per
       employee and a return is one row about an establishment, and neither fits the
       one-row-per-employee shape. Both are built now, so what this asserts is that the
       layout table has an entry for every archetype rather than that two are missing. */
    for (const a of ['wageSlip', 'periodicReturn'] as const) {
      expect(isBuilt(a)).toBe(true);
      expect(layoutFor(a).orientation).toBe('portrait');
    }

    /* ArchetypeNotBuilt is still the guard, for an archetype added to the type without an
       entry here. It is reachable only through a cast, which is the point: the next person to
       add one gets a named failure instead of an undefined. */
    expect(() => layoutFor('somethingNew' as never)).toThrow(ArchetypeNotBuilt);
  });

  it('formats a rupee figure to the paisa and leaves text alone', () => {
    expect(numberFormat('money')).toBe('#,##0.00');
    expect(numberFormat('days')).toBe('#,##0.0');
    expect(numberFormat('text')).toBeUndefined();
  });

  it('keeps a sheet name inside what Excel accepts', () => {
    expect(sheetName('XXIII')).toBe('Form XXIII');
    expect(sheetName('A/B')).toBe('Form A-B');
    expect(sheetName('X'.repeat(50)).length).toBeLessThanOrEqual(31);
  });

  it('versions each archetype separately from the shared frame', () => {
    /* A layout change re-keys one archetype's forms; a scaffold change bumps
       GENERATOR_REVISION and re-keys every one. */
    expect(templateVersionFor(formById('in-wages-iv')!)).toBe('v1');
    expect(templateVersionFor(formById('in-wages-ix')!)).toBe('v1');
  });
});

describe('the two shapes that are not a table of people', () => {
  it('writes a wage slip as one block per employee, not one row each', async () => {
    /* A slip is handed to the person it is about. Transposed, with the frame repeated above
       every block, so a slip torn off a stack still says who issued it and for what period. */
    const { table } = roll('tg-se-xi', 3);
    const ws = await reopen(table);

    /* The establishment line starts a row once per slip, not once per sheet. Counted on the
       first cell of each row rather than in the sheet's text, because the title is merged
       across both columns and so appears in each of them. */
    let starts = 0;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? '') === 'WebPT India Private Limited') starts += 1;
    });
    expect(starts).toBe(3);

    /* Labels down the left, figures beside them — the opposite of every other form. */
    const text = JSON.stringify(ws.getSheetValues());
    expect(text).toContain('Net Wages Payable');
    expect(text).toContain('Received by the employee');
    /* Two columns, however many columns the form prescribes. */
    expect(ws.getColumn(1).width).toBe(42);
    expect(ws.getColumn(3).width).toBeUndefined();
  });

  it('writes a periodic return as one row of figures', async () => {
    const { table } = roll('ka-se-xxi', 5);
    expect(table.rows).toHaveLength(1);

    const parsed = await readBack(await renderForForm(table, meta));
    expect(parsed.headers).toEqual(['Adults — men', 'Adults — women', 'Total']);
    /* The reader finds the heading row and everything under it, which on this sheet is the
       one row of figures and then the footnotes. The figures are what matters. */
    expect(parsed.rows[0]['Total']).toBe('5');
    expect(parsed.rows[0]['Adults — men']).toBe('2');
  });

  it('gives every archetype a layout, so nothing is silently skipped', () => {
    for (const form of FORMS) {
      expect(isBuilt(form.archetype), `${form.archetype} has no layout`).toBe(true);
    }
  });
});
