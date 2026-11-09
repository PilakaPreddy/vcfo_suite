import { describe, expect, it } from 'vitest';
import { parsePeriodHint } from './period-hint';

const aug = { from: '2026-08-01', to: '2026-08-31' };
const oct = { from: '2026-10-01', to: '2026-10-31' };

describe('parsePeriodHint', () => {
  it.each([
    ['Aug-2026', aug],
    ['August 2026', aug],
    ['08-2026', aug],
    ['2026-08', aug],
    ['2026_Aug', aug],
    ["Oct'26", oct],
    ['Payroll_Oct26', oct],
    ['salary oct 26.xlsx', oct],
    ['Attendance-15-10-2026.csv', oct],
    ['2026-10-31 paysheet', oct],
    ['Sept 2026', { from: '2026-09-01', to: '2026-09-30' }],
    ['Feb-2028', { from: '2028-02-01', to: '2028-02-29' }],
  ])('reads %s', (name, expected) => {
    expect(parsePeriodHint(name)).toEqual(expected);
  });

  it('reads a path, the file name first', () => {
    expect(parsePeriodHint('Acme/Payroll/Aug-2026/pay.xlsx')).toEqual(aug);
    expect(parsePeriodHint('pay Oct 2026.xlsx', 'Acme/Payroll/Aug-2026')).toEqual(oct);
  });

  it('joins a month in one name with the year in another', () => {
    expect(parsePeriodHint('Acme/2026/August/pay.xlsx')).toEqual(aug);
  });

  it('gives nothing without a year, or for words that only contain a month', () => {
    expect(parsePeriodHint('August paysheet.xlsx')).toBeNull();
    expect(parsePeriodHint('Octopus summary 2026')).toBeNull();
    expect(parsePeriodHint('FY 2026-27 payroll')).toBeNull();
    expect(parsePeriodHint('pay.xlsx', null, undefined)).toBeNull();
  });
});
