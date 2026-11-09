import { describe, expect, it } from 'vitest';

import { formById } from '@/data/labour-registers/forms';
import { AGGREGATORS, headCountNote } from './aggregate';
import { monthPeriod } from './catalogue';
import { buildDataset, type SlotInput } from './dataset';
import { ProjectionError, projectForm } from './project';

/**
 * A return is one row about an establishment; a register is many rows about people.
 *
 * The three returns in the catalogue were bound to `serial` — the row-number deriver — so a
 * half-yearly return would have printed 1, 2, 3 under three headings asking for head counts.
 * It compiled, it produced a file, and the file was wrong in a way only somebody who knew what
 * the form was for would notice. These tests are mostly about that: that the figures are
 * figures, and that a count which cannot be made honestly says so instead of balancing itself.
 */

const period = monthPeriod(2026, 9);
const master = {
  name: 'WebPT India Private Limited',
  address: 'Hyderabad',
  shiftName: 'General',
  shiftStart: '09:30',
  shiftEnd: '18:30',
  restInterval: '13:00–13:45',
  dateOfPayment: '2026-10-07',
};

function paysheet(sexes: string[]): SlotInput {
  return {
    sheet: {
      sheetName: 'S',
      headerRow: 1,
      headers: ['Emp No', 'Name', 'Sex', 'Gross', 'Net'],
      rows: sexes.map((sex, i) => ({
        'Emp No': `E${i + 1}`,
        Name: `Employee ${i + 1}`,
        Sex: sex,
        Gross: '35000',
        Net: '33200',
      })),
      grid: { found: false, days: [], format: 'none' as const, ambiguous: false, gaps: [] },
    },
    mapping: { employeeId: 'Emp No', name: 'Name', sex: 'Sex', grossEarnings: 'Gross', netPay: 'Net' },
  };
}

function rollOf(sexes: string[], formId: string) {
  const form = formById(formId)!;
  const dataset = buildDataset({
    period,
    slots: { paysheet: paysheet(sexes) },
    assumptions: { fullAttendanceAssumed: false },
    forms: [form],
    master,
  });
  return { form, dataset };
}

describe('figures about an establishment', () => {
  it('counts heads by sex, however the sheet spells it', () => {
    const { dataset } = rollOf(['F', 'female', 'Woman', 'M', 'male', 'Men'], 'ka-se-xxi');
    const ctx = { period: dataset.period, days: dataset.days };
    expect(AGGREGATORS.countWomen(dataset.employees, ctx)).toBe(3);
    expect(AGGREGATORS.countMen(dataset.employees, ctx)).toBe(3);
    expect(AGGREGATORS.countEmployees(dataset.employees, ctx)).toBe(6);
  });

  it('never guesses a sex it was not given', () => {
    /* The unknown is counted in the total and in neither column, and the return says so. A
       head count silently balanced is not a question anybody can answer. */
    const { dataset } = rollOf(['F', 'M', ''], 'ka-se-xxi');
    const ctx = { period: dataset.period, days: dataset.days };
    expect(AGGREGATORS.countWomen(dataset.employees, ctx)).toBe(1);
    expect(AGGREGATORS.countMen(dataset.employees, ctx)).toBe(1);
    expect(AGGREGATORS.countEmployees(dataset.employees, ctx)).toBe(3);
    expect(headCountNote(dataset.employees)).toContain('no sex recorded');
  });

  it('says nothing when the count adds up', () => {
    const { dataset } = rollOf(['F', 'M'], 'ka-se-xxi');
    expect(headCountNote(dataset.employees)).toBe('');
  });

  it('totals money across the roll', () => {
    const { dataset } = rollOf(['F', 'M'], 'ka-se-xxi');
    const ctx = { period: dataset.period, days: dataset.days };
    expect(AGGREGATORS.totalGrossWages(dataset.employees, ctx)).toBe(70000);
    expect(AGGREGATORS.totalNetWages(dataset.employees, ctx)).toBe(66400);
  });
});

describe('projecting a periodic return', () => {
  it('produces one row of figures, not one row per employee', () => {
    const { form, dataset } = rollOf(['F', 'F', 'M'], 'ka-se-xxi');
    const table = projectForm(form, dataset);

    expect(dataset.employees).toHaveLength(3);
    expect(table.rows).toHaveLength(1);
    expect(table.columns.map((c) => c.heading)).toEqual(['Adults — men', 'Adults — women', 'Total']);
    expect(table.rows[0]).toEqual([1, 2, 3]);
  });

  it('carries the head-count note onto the return it belongs to', () => {
    const { form, dataset } = rollOf(['F', ''], 'ka-se-xxi');
    expect(projectForm(form, dataset).notes.join(' ')).toContain('no sex recorded');
  });
});

describe('a layout nobody has seen is not produced', () => {
  it('refuses Telangana Form XXVII rather than printing [1] to [7]', () => {
    /* Its columns are recorded as placeholders. A sheet with seven columns headed [1] to [7]
       looks filed and says nothing, which is worse than an absent form somebody can chase. */
    const { form, dataset } = rollOf(['F', 'M'], 'tg-se-xxvii');
    expect(form.layoutPlaceholder).toBe(true);
    expect(() => projectForm(form, dataset)).toThrow(ProjectionError);
    try {
      projectForm(form, dataset);
    } catch (e) {
      expect((e as ProjectionError).message).toContain('column layout is not known');
    }
  });
});
