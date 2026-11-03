import { describe, expect, it } from 'vitest';

import { formById } from '@/data/labour-registers/forms';
import { monthPeriod } from './catalogue';
import { buildDataset, daysOf, employeesShort, joinKey, undecidedCoverage, type SlotInput } from './dataset';
import { DERIVERS, num, wholeYears, workedDays } from './derive';
import { assumedCode, ProjectionError, projectForm, projectForms } from './project';
import type { ParsedSheet } from './parse';

/**
 * The projection, end to end: four messy sheets in, a printable statutory table out.
 *
 * These are the tests that would have caught the feature being unbuildable. Everything below
 * runs on the real catalogue — `in-wages-iv` and `in-wages-ix` as the forms actually are, not
 * fixtures of them — so a change to a prescribed column breaks a test here rather than being
 * discovered in a filed register.
 */

const period = monthPeriod(2026, 9);

/** A sheet as `parseWorkbook` returns one, without going through exceljs. */
function sheet(headers: string[], rows: Array<Record<string, string>>, grid?: ParsedSheet['grid']): ParsedSheet {
  return {
    sheetName: 'Sheet1',
    headerRow: 1,
    headers,
    rows,
    grid: grid ?? { found: false, days: [], format: 'none', ambiguous: false, gaps: [] },
  };
}

/** A paysheet with the client's own headings, as the mapper would have resolved them. */
function paysheet(rows: Array<Record<string, string>>): SlotInput {
  return {
    sheet: sheet(
      ['Emp No', 'Employee Name', 'Sex', 'Designation', 'Days', 'Basic', 'HRA', 'OT Hrs', 'Gross', 'PF', 'Total Ded', 'Net'],
      rows,
    ),
    mapping: {
      employeeId: 'Emp No',
      name: 'Employee Name',
      sex: 'Sex',
      designation: 'Designation',
      daysWorked: 'Days',
      basic: 'Basic',
      hra: 'HRA',
      overtimeHours: 'OT Hrs',
      grossEarnings: 'Gross',
      pf: 'PF',
      totalDeductions: 'Total Ded',
      netPay: 'Net',
    },
  };
}

const ROW_ONE = {
  'Emp No': 'E0001',
  'Employee Name': 'Asha Rao',
  Sex: 'F',
  Designation: 'Associate',
  Days: '26',
  Basic: '25000',
  HRA: '10000',
  'OT Hrs': '0',
  Gross: '35000',
  PF: '1800',
  'Total Ded': '1800',
  Net: '33200',
};

const ROW_TWO = { ...ROW_ONE, 'Emp No': 'E0002', 'Employee Name': 'Vikram Shah', Sex: 'M', Days: '24' };

function dataset(slots: Parameters<typeof buildDataset>[0]['slots'], over: Partial<Parameters<typeof buildDataset>[0]> = {}) {
  return buildDataset({
    period,
    slots,
    assumptions: { fullAttendanceAssumed: false },
    forms: [formById('in-wages-iv')!],
    master: { dateOfPayment: '2026-10-07' },
    ...over,
  });
}

describe('daysOf', () => {
  it('gives a day per day of the period, not a fixed 31', () => {
    expect(daysOf(monthPeriod(2026, 9))).toHaveLength(30);
    expect(daysOf(monthPeriod(2026, 2))).toHaveLength(28);
    /* 2028 is a leap year; a muster roll for that February prints 29 columns. */
    expect(daysOf(monthPeriod(2028, 2))).toHaveLength(29);
  });

  it('gives nothing for a period that runs backwards', () => {
    expect(daysOf({ from: '2026-09-30', to: '2026-09-01' })).toEqual([]);
  });
});

describe('joining the four sheets', () => {
  it('joins on the employee code', () => {
    const d = dataset({
      paysheet: paysheet([ROW_ONE]),
      overtime: {
        sheet: sheet(['Code', 'OT Hours'], [{ Code: 'E0001', 'OT Hours': '6' }]),
        mapping: { employeeId: 'Code', overtimeHours: 'OT Hours' },
      },
    });
    expect(d.employees).toHaveLength(1);
    /* The paysheet is the system of record: its own 0 is not overwritten by a secondary sheet. */
    expect(d.employees[0].values.overtimeHours).toBe('0');
  });

  it('fills a field the paysheet left blank from a secondary sheet', () => {
    const d = dataset({
      paysheet: paysheet([{ ...ROW_ONE, 'OT Hrs': '' }]),
      overtime: {
        sheet: sheet(['Code', 'OT Hours'], [{ Code: 'E0001', 'OT Hours': '6' }]),
        mapping: { employeeId: 'Code', overtimeHours: 'OT Hours' },
      },
    });
    expect(d.employees[0].values.overtimeHours).toBe('6');
  });

  it('counts a row that matches nobody rather than dropping it silently', () => {
    /* Attendance for somebody who has left, or a typo in a code. Either is worth seeing. */
    const d = dataset({
      paysheet: paysheet([ROW_ONE]),
      overtime: {
        sheet: sheet(['Code', 'OT Hours'], [{ Code: 'E9999', 'OT Hours': '6' }]),
        mapping: { employeeId: 'Code', overtimeHours: 'OT Hours' },
      },
    });
    expect(d.orphans).toEqual([{ slot: 'overtime', key: 'E9999' }]);
  });

  it('keeps both of two rows carrying the same employee code', () => {
    /* The filed paysheet really does. Merging them would add two people's wages together. */
    const d = dataset({ paysheet: paysheet([ROW_ONE, { ...ROW_ONE, Basic: '30000' }]) });
    expect(d.employees).toHaveLength(2);
    expect(d.employees[1].key).toBe('E0001#2');
  });

  it('falls back to the name when there is no code', () => {
    expect(joinKey({ employeeId: '', name: 'Asha  Rao' })).toBe(joinKey({ name: 'asha rao' }));
    expect(joinKey({ employeeId: 'e0001' })).toBe('E0001');
  });

  it('reads the attendance grid by position, into day numbers', () => {
    const d = dataset({
      paysheet: paysheet([ROW_ONE]),
      attendance: {
        sheet: sheet(
          ['Code', '1', '2', '3'],
          [{ Code: 'E0001', '1': 'P', '2': 'WO', '3': 'pr' }],
          { found: true, format: 'day-only', ambiguous: false, gaps: [],
            days: [{ index: 1, header: '1', day: 1 }, { index: 2, header: '2', day: 2 }, { index: 3, header: '3', day: 3 }] },
        ),
        mapping: { employeeId: 'Code' },
        valueMaps: { attendanceGrid: { pr: 'P' } },
      },
    });
    expect(d.employees[0].grid).toEqual({ 1: 'P', 2: 'WO', 3: 'P' });
  });

  it('reports nobody when there is no paysheet, because it is the spine', () => {
    const d = dataset({ attendance: { sheet: sheet(['Code'], [{ Code: 'E0001' }]), mapping: { employeeId: 'Code' } } });
    expect(d.employees).toEqual([]);
  });

  it('counts who is short of a field a register prints', () => {
    const d = dataset({ paysheet: paysheet([ROW_ONE, ROW_TWO]) });
    /* Form IV prints a dearness allowance and a profession tax, which this paysheet lacks. */
    expect(employeesShort(d)).toBe(2);
    expect(d.employees[0].missing).toContain('dearnessAllowance');
  });

  it('reads minimum wage coverage off the employees sheet', () => {
    const d = dataset({
      paysheet: paysheet([ROW_ONE]),
      employees: {
        sheet: sheet(['Code', 'MW'], [{ Code: 'E0001', MW: 'covered' }]),
        mapping: { employeeId: 'Code', minimumWageCoverage: 'MW' },
      },
    });
    expect(d.employees[0].coverage).toBe('covered');
    expect(undecidedCoverage(d)).toBe(0);
  });

  it('leaves coverage unknown when nobody has said', () => {
    expect(undecidedCoverage(dataset({ paysheet: paysheet([ROW_ONE]) }))).toBe(1);
  });
});

describe('derived columns', () => {
  const ctx = {
    index: 0,
    period,
    days: daysOf(period),
    master: { dateOfPayment: '2026-10-07' },
    wageRateBasis: 'monthly' as const,
  };
  const employee = (values: Record<string, string>, grid: Record<number, string> = {}) => ({
    values, grid, coverage: 'unknown' as const,
  });

  it('reads a number through Indian digit grouping and a rupee sign', () => {
    expect(num('1,23,456.50')).toBe(123456.5);
    expect(num('₹ 25,000')).toBe(25000);
    expect(num('')).toBeNull();
    expect(num('n/a')).toBeNull();
  });

  it('counts an age at the end of the period, never today', () => {
    /* A value that moved with the wall clock would make a stored register go stale on somebody's
       birthday and be rebuilt for nothing. */
    expect(DERIVERS.age(employee({ dateOfBirth: '1990-09-30' }), ctx)).toBe(36);
    expect(DERIVERS.age(employee({ dateOfBirth: '1990-10-01' }), ctx)).toBe(35);
    expect(wholeYears('2000-02-29', '2026-02-28')).toBe(25);
  });

  it('counts days worked off the grid when the paysheet does not say', () => {
    const grid = { 1: 'P', 2: 'P', 3: 'WO', 4: 'WOP', 5: 'A', 6: 'PL', 7: 'HP' };
    /* P, WOP and HP are worked; a week off, a holiday, an absence and paid leave are not. */
    expect(workedDays(employee({}, grid), ctx)).toBe(4);
    expect(workedDays(employee({ daysWorked: '26' }, grid), ctx)).toBe(26);
  });

  it('prefers the payroll\'s own gross to summing the heads', () => {
    expect(DERIVERS.normalWagesEarned(employee({ grossEarnings: '35000', overtimeWages: '1000' }), ctx)).toBe(34000);
    expect(DERIVERS.normalWagesEarned(employee({ basic: '25000', hra: '10000' }), ctx)).toBe(35000);
    expect(DERIVERS.normalWagesEarned(employee({}), ctx)).toBeNull();
  });

  it('does not sum a deduction into earnings', () => {
    /* `kind: 'money'` covers deductions too, which is why the earnings are listed not inferred. */
    expect(DERIVERS.normalWagesEarned(employee({ basic: '25000', pf: '1800' }), ctx)).toBe(25000);
  });

  it('expresses a wage rate the way the client\'s payroll does', () => {
    const e = employee({ grossEarnings: '26000', daysWorked: '26' });
    expect(DERIVERS.wageRate(e, ctx)).toBe(26000);
    expect(DERIVERS.wageRate(e, { ...ctx, wageRateBasis: 'daily' })).toBe(1000);
  });

  it('never overwrites a figure the payroll supplied', () => {
    expect(DERIVERS.wageRate(employee({ wageRate: '999', grossEarnings: '26000' }), ctx)).toBe(999);
    expect(DERIVERS.overtimeWages(employee({ overtimeWages: '1234', overtimeHours: '6' }), ctx)).toBe(1234);
  });

  it('blocks an overtime figure for an employee whose coverage nobody decided', () => {
    /* The workbook this replaces applied twice the rate to everybody. Section 14 applies it
       only where a minimum rate of wages is fixed under the Code. */
    expect(() =>
      DERIVERS.overtimeWages({ ...employee({ overtimeHours: '6', grossEarnings: '26000', daysWorked: '26' }) }, ctx),
    ).toThrow(/coverage has not been confirmed/);
  });

  it('computes overtime at twice the rate for a covered employee', () => {
    const e = { ...employee({ overtimeHours: '10', grossEarnings: '20800', daysWorked: '26' }), coverage: 'covered' as const };
    /* 20800 over 26 days of 8 hours is 100 an hour; twice that for ten hours is 2000. */
    expect(DERIVERS.overtimeWages(e, ctx)).toBe(2000);
  });

  it('does not guess a payment date', () => {
    expect(DERIVERS.dateOfPayment(employee({}), { ...ctx, master: { dateOfPayment: '' } })).toBeNull();
    expect(DERIVERS.dateOfPayment(employee({}), ctx)).toBe('2026-10-07');
  });
});

describe('projecting a wage register', () => {
  const form = formById('in-wages-iv')!;

  it('prints the prescribed columns, in the prescribed order', () => {
    const table = projectForm(form, dataset({ paysheet: paysheet([ROW_ONE, ROW_TWO]) }));
    expect(table.columns.map((c) => c.heading).slice(0, 6)).toEqual([
      'Sl. No.',
      'Employee code',
      'Name of the employee',
      'Sex',
      'Designation',
      'Rate of wages payable',
    ]);
    /* 26 columns, ending with the signature column the form prescribes. */
    expect(table.columns).toHaveLength(form.columns.length);
    expect(table.columns.at(-1)!.source).toBe('signature');
    expect(table.rows).toHaveLength(2);
  });

  it('leaves a signature column blank, but present', () => {
    const table = projectForm(form, dataset({ paysheet: paysheet([ROW_ONE]) }));
    const at = table.columns.findIndex((c) => c.source === 'signature');
    expect(table.rows[0][at]).toBeNull();
  });

  it('prints an unmapped optional column nil rather than dropping it', () => {
    const table = projectForm(form, dataset({ paysheet: paysheet([ROW_ONE]) }));
    const at = table.columns.findIndex((c) => c.field === 'nightShiftAllowance');
    /* The column is prescribed; the client pays no night shift allowance. Both are true. */
    expect(at).toBeGreaterThan(-1);
    expect(table.columns[at].nil).toBe(true);
    expect(table.rows[0][at]).toBeNull();
    expect(table.nil.map((c) => c.heading)).toContain('Night shift allowance');
    expect(table.notes.join(' ')).toContain('Night shift allowance');
  });

  it('writes money as a number, so the sheet can total it', () => {
    const table = projectForm(form, dataset({ paysheet: paysheet([ROW_ONE]) }));
    const at = table.columns.findIndex((c) => c.field === 'basic');
    expect(table.rows[0][at]).toBe(25000);
  });

  it('numbers the rows and fills the derived columns', () => {
    const table = projectForm(form, dataset({ paysheet: paysheet([ROW_ONE, ROW_TWO]) }));
    const serial = table.columns.findIndex((c) => c.field === 'serial');
    const paid = table.columns.findIndex((c) => c.field === 'dateOfPayment');
    expect(table.rows[0][serial]).toBe(1);
    expect(table.rows[1][serial]).toBe(2);
    expect(table.rows[0][paid]).toBe('2026-10-07');
  });

  it('refuses the form when a required column is unmapped', () => {
    const bare: SlotInput = { sheet: sheet(['Emp No'], [{ 'Emp No': 'E0001' }]), mapping: { employeeId: 'Emp No' } };
    expect(() => projectForm(form, dataset({ paysheet: bare }))).toThrow(ProjectionError);
    try {
      projectForm(form, dataset({ paysheet: bare }));
    } catch (e) {
      expect((e as ProjectionError).missingRequired).toContain('name');
      expect((e as ProjectionError).formId).toBe('in-wages-iv');
    }
  });

  it('refuses the form when overtime cannot be rated honestly', () => {
    const withOt = paysheet([{ ...ROW_ONE, 'OT Hrs': '6' }]);
    try {
      projectForm(form, dataset({ paysheet: withOt }));
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectionError);
      expect((e as ProjectionError).blocked.join(' ')).toContain('coverage has not been confirmed');
    }
  });
});

describe('projecting a muster roll', () => {
  const form = formById('in-wages-ix')!;

  it('expands the day grid to one column per day of the period', () => {
    const table = projectForm(form, dataset({ paysheet: paysheet([ROW_ONE]) }, { forms: [form] }));
    const grid = table.columns.filter((c) => c.source === 'grid');
    expect(grid).toHaveLength(30);
    expect(grid.map((c) => c.heading).slice(0, 3)).toEqual(['1', '2', '3']);
    /* The band is the prescribed heading the day columns sit under. */
    expect(grid[0].band).toBe('Days of the month');
  });

  it('prints the attendance codes under their own days', () => {
    const d = dataset(
      {
        paysheet: paysheet([ROW_ONE]),
        attendance: {
          sheet: sheet(
            ['Code', '1', '2'],
            [{ Code: 'E0001', '1': 'P', '2': 'A' }],
            { found: true, format: 'day-only', ambiguous: false, gaps: [],
              days: [{ index: 1, header: '1', day: 1 }, { index: 2, header: '2', day: 2 }] },
          ),
          mapping: { employeeId: 'Code' },
        },
      },
      { forms: [form] },
    );
    const table = projectForm(form, d);
    const first = table.columns.findIndex((c) => c.source === 'grid');
    expect(table.rows[0][first]).toBe('P');
    expect(table.rows[0][first + 1]).toBe('A');
    /* No attendance for day 3, and the month was not assumed: blank, not a guess. */
    expect(table.rows[0][first + 2]).toBeNull();
  });

  it('shows the weekly off as a weekly off in an assumed month', () => {
    /* A month stated fully present is not thirty days worked. Printing P across the Sundays
       would overstate the days-worked total on the same sheet — a muster roll contradicting
       itself. September 2026 begins on a Tuesday, so the 6th, 13th, 20th and 27th are Sundays. */
    const d = dataset(
      { paysheet: paysheet([ROW_ONE]) },
      { forms: [form], assumptions: { fullAttendanceAssumed: true, weekOff: 'sun' } },
    );
    const table = projectForm(form, d);
    const first = table.columns.findIndex((c) => c.source === 'grid');
    expect(table.rows[0][first]).toBe('P');
    expect(table.rows[0][first + 5]).toBe('WO');
    expect(table.rows[0][first + 12]).toBe('WO');
    expect(table.notes.join(' ')).toContain('Sundays are shown as the weekly off');
  });

  it('applies each week-off rule the dialog offers', () => {
    const sep = { from: '2026-09-01' };
    /* 5 Sep is a Saturday, 6 Sep a Sunday, 12 Sep the second Saturday. */
    expect(assumedCode(sep, 6, 'sun')).toBe('WO');
    expect(assumedCode(sep, 5, 'sun')).toBe('P');
    expect(assumedCode(sep, 5, 'sat-sun')).toBe('WO');
    expect(assumedCode(sep, 12, 'alt-sat-sun')).toBe('WO');
    expect(assumedCode(sep, 5, 'alt-sat-sun')).toBe('P');
    expect(assumedCode(sep, 6, 'none')).toBe('P');
    expect(assumedCode(sep, 6, undefined)).toBe('P');
  });

  it('prints a fully assumed month present throughout, and says so', () => {
    const d = dataset(
      { paysheet: paysheet([ROW_ONE]) },
      { forms: [form], assumptions: { fullAttendanceAssumed: true } },
    );
    const table = projectForm(form, d);
    const first = table.columns.findIndex((c) => c.source === 'grid');
    expect(table.rows[0][first]).toBe('P');
    expect(table.notes.join(' ')).toContain('fully present');
  });
});

describe('projecting every form of a period', () => {
  it('keeps what can be built and reports what cannot', () => {
    const wages = formById('in-wages-iv')!;
    const muster = formById('in-wages-ix')!;
    /* A paysheet with overtime hours and no coverage decision: the wage register is blocked
       because it prints an overtime figure, the muster roll is not because it does not. */
    const d = dataset({ paysheet: paysheet([{ ...ROW_ONE, 'OT Hrs': '6' }]) }, { forms: [wages, muster] });
    const { tables, blocked } = projectForms([wages, muster], d);
    expect(tables.map((t) => t.form.id)).toEqual(['in-wages-ix']);
    expect(blocked.map((b) => b.formId)).toEqual(['in-wages-iv']);
  });
});
