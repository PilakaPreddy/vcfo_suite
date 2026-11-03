import { describe, expect, it } from 'vitest';

import { describeGrid, detectAttendanceGrid, gridIndices } from './attendance-grid';
import { draftKey, hashRows, mayReplaceInPlace, stalenessReason, type DocumentIdentity } from './cache-key';
import { appliesDuring, formsFor, monthPeriod, needsAttendanceGrid, nilColumns, optionalFields, requiredFields, retentionYears } from './catalogue';
import { computeOvertime, normalHoursFor, overtimeBasisNote, unresolvedCoverage } from './overtime';
import { describeShapeDiff, diffShape } from './shape-diff';
import { matchValues, unresolvedValues, valueLookup } from './value-map';
import { formById } from '@/data/labour-registers/forms';

/* The attendance export's real shape: twenty fixed columns, then a column per day, then TOTAL. */
const ATTENDANCE_FIXED = [
  'Employee_ID',
  'Employee_ID',
  'Employee_Name',
  'Affiliate_Name',
  'Branch_Name',
  'Department_Name',
  'Designation_Name',
  'Category_Name',
  'Present',
  'Absent',
  'LOP',
  'Week_Off',
  'Holiday',
  'Leaves_Count',
  'Total_Days',
  'MS_Count',
  'Week_Off_Present',
  'Holiday_Present',
  'Category',
  'Salary Grade',
];
const DAY_COLUMNS = Array.from({ length: 31 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')} 00:00:00`);
const ATTENDANCE_HEADERS = [...ATTENDANCE_FIXED, ...DAY_COLUMNS, 'TOTAL'];

describe('detectAttendanceGrid', () => {
  it('finds the per-day block in a real attendance export', () => {
    const hit = detectAttendanceGrid(ATTENDANCE_HEADERS);
    expect(hit.found).toBe(true);
    expect(hit.days).toHaveLength(31);
    expect(hit.format).toBe('iso');
    expect(hit.ambiguous).toBe(false);
    expect(hit.days[0].date).toBe('2026-09-01');
    expect(hit.days[0].index).toBe(ATTENDANCE_FIXED.length);
  });

  it('does not mistake a sheet with one date column for a muster roll', () => {
    expect(detectAttendanceGrid(['EmpNo', 'Name', 'Date_of_Joining', 'Net_Pay']).found).toBe(false);
  });

  it('reads bare day numbers when there is a month of them', () => {
    const headers = ['Emp', 'Name', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
    const hit = detectAttendanceGrid(headers);
    expect(hit.found).toBe(true);
    expect(hit.format).toBe('day-only');
    expect(hit.days).toHaveLength(30);
  });

  it('asks rather than guess when the date order is genuinely ambiguous', () => {
    const headers = ['Emp', ...Array.from({ length: 12 }, (_, i) => `${i + 1}/0${1}/2026`), ...Array.from({ length: 12 }, (_, i) => `${i + 1}/01/2026`)];
    const hit = detectAttendanceGrid(headers, 20);
    expect(hit.found).toBe(true);
    expect(hit.ambiguous).toBe(true);
    expect(describeGrid(hit)).toContain('day-first or month-first');
  });

  it('tolerates a stray subtotal inside the run and reports it', () => {
    const headers = [...ATTENDANCE_FIXED, ...DAY_COLUMNS.slice(0, 15), 'Fortnight total', ...DAY_COLUMNS.slice(15)];
    const hit = detectAttendanceGrid(headers);
    expect(hit.found).toBe(true);
    expect(hit.gaps).toHaveLength(1);
    expect(describeGrid(hit)).toContain('not days');
  });

  it('hands the matcher a contiguous range to leave alone', () => {
    const indices = gridIndices(detectAttendanceGrid(ATTENDANCE_HEADERS));
    expect(indices[0]).toBe(20);
    expect(indices).toHaveLength(31);
    expect(indices).not.toContain(ATTENDANCE_HEADERS.length - 1);
  });
});

describe('catalogue', () => {
  const september = monthPeriod(2026, 9);

  it('produces both the state and the central stack while state rules are only draft', () => {
    const forms = formsFor('TG', september);
    expect(forms.some((f) => f.regime === 'state')).toBe(true);
    expect(forms.some((f) => f.regime === 'central-code')).toBe(true);
  });

  it('puts the state forms first, because that is what a state inspector asks for', () => {
    const forms = formsFor('KA', september);
    expect(forms[0].regime).toBe('state');
  });

  it('drops a form that another live form is deemed to satisfy', () => {
    const forms = formsFor('TG', september).map((f) => f.id);
    expect(forms).toContain('in-wages-i');
    expect(forms).not.toContain('in-osh-xiii');
  });

  it('leaves out the Equal Remuneration register after the Act was repealed', () => {
    expect(formsFor('TG', monthPeriod(2026, 9)).map((f) => f.id)).not.toContain('in-era-d');
    expect(formsFor('TG', monthPeriod(2025, 9)).map((f) => f.id)).toContain('in-era-d');
  });

  it('keeps a form out of a period that ended before it commenced', () => {
    const codeForm = formById('in-wages-iv')!;
    expect(appliesDuring(codeForm, monthPeriod(2026, 9))).toBe(true);
    expect(appliesDuring(codeForm, monthPeriod(2025, 9))).toBe(false);
  });

  it('demands only what every payroll has, and asks for the rest without demanding it', () => {
    const forms = formsFor('TG', september);
    /* A night shift allowance is not run by every employer, so holding a close over its
       column would block clients who will never fill it. */
    expect(requiredFields(forms)).toContain('basic');
    expect(requiredFields(forms)).not.toContain('nightShiftAllowance');
    expect(optionalFields(forms)).toContain('nightShiftAllowance');
    expect(optionalFields(forms)).toContain('overtimeHours');
  });

  it('keeps a prescribed column on the form and prints it nil when nothing is mapped to it', () => {
    const form = formById('in-wages-iv')!;
    /* The column is never removed: an electronic register may change its layout but not its
       column contents, so an unfilled statutory column goes out blank, not missing. */
    expect(nilColumns(form, ['basic']).map((c) => c.heading)).toContain('Overtime hours worked');
    expect(nilColumns(form, ['overtimeHours']).map((c) => c.heading)).not.toContain('Overtime hours worked');
  });

  it('knows the month needs a daily attendance block', () => {
    expect(needsAttendanceGrid(formsFor('TG', september))).toBe(true);
  });

  it('retains for five years once the code registers are in play, not three', () => {
    expect(retentionYears(formsFor('TG', september))).toBe(5);
    expect(retentionYears(formsFor('TG', monthPeriod(2025, 9)))).toBe(3);
  });

  it('builds a month period that ends on the real last day', () => {
    expect(monthPeriod(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthPeriod(2024, 2).to).toBe('2024-02-29');
  });
});

describe('cache key', () => {
  const identity = (over: Partial<DocumentIdentity> = {}): DocumentIdentity => ({
    engagementId: 'eng-1',
    jurisdiction: 'TG',
    formId: 'tg-se-xxiii',
    period: '2026-09',
    inputsHash: 'abc',
    templateVersion: 'v1',
    assumptions: { fullAttendanceAssumed: false },
    locale: 'en-IN',
    timeZone: 'Asia/Kolkata',
    ...over,
  });

  it('is stable for the same inputs', () => {
    expect(draftKey(identity())).toBe(draftKey(identity()));
  });

  it('changes when the data changes', () => {
    expect(draftKey(identity())).not.toBe(draftKey(identity({ inputsHash: 'def' })));
  });

  it('changes when the assumptions change, so an assumed month is a different document', () => {
    expect(draftKey(identity())).not.toBe(
      draftKey(identity({ assumptions: { fullAttendanceAssumed: true, weekOff: 'sat-sun' } })),
    );
  });

  it('changes when the template changes', () => {
    expect(draftKey(identity())).not.toBe(draftKey(identity({ templateVersion: 'v2' })));
  });

  it('changes when the locale or time zone changes', () => {
    expect(draftKey(identity())).not.toBe(draftKey(identity({ timeZone: 'UTC' })));
  });

  it('hashes rows in render order, so reordering is a new document', () => {
    const a = [{ name: 'A', net: 1 }, { name: 'B', net: 2 }];
    const b = [{ name: 'B', net: 2 }, { name: 'A', net: 1 }];
    expect(hashRows(a, ['name', 'net'])).not.toBe(hashRows(b, ['name', 'net']));
    expect(hashRows(a, ['name', 'net'])).toBe(hashRows(a, ['net', 'name']));
  });

  it('says nothing is stale when the key still matches', () => {
    const id = identity();
    expect(stalenessReason(draftKey(id), id, id)).toBeNull();
  });

  it('names the reason a stored document is stale', () => {
    const stored = identity();
    expect(stalenessReason(draftKey(stored), stored, identity({ inputsHash: 'z' }))).toBe('the uploaded data changed');
    expect(stalenessReason(draftKey(stored), stored, identity({ templateVersion: 'v9' }))).toBe('the form template changed');
  });

  it('refuses to replace an attested document in place', () => {
    expect(mayReplaceInPlace({})).toBe(true);
    expect(
      mayReplaceInPlace({
        attestation: { byName: 'A Partner', byRole: 'admin', at: '2026-10-02T12:00:00Z', method: 'printed-wet-signature' },
      }),
    ).toBe(false);
  });
});

describe('value mapping', () => {
  it('resolves the real attendance codes without asking', () => {
    const matches = matchValues('attendanceGrid', ['P', 'P', 'WO', 'H', 'PVL', 'SCL']);
    const lookup = valueLookup(matches);
    expect(lookup.P).toBe('P');
    expect(lookup.WO).toBe('WO');
    expect(lookup.PVL).toBe('PL');
    expect(lookup.SCL).toBe('SCL');
  });

  it('reads M as maternity leave in a grid and as male in a sex column', () => {
    expect(valueLookup(matchValues('attendanceGrid', ['M'])).M).toBe('M');
    expect(valueLookup(matchValues('sex', ['M'])).M).toBe('Male');
  });

  it('orders by how many rows carry the value', () => {
    const matches = matchValues('attendanceGrid', ['SCL', 'P', 'P', 'P']);
    expect(matches[0].source).toBe('P');
  });

  it('leaves an unknown code unresolved rather than printing the client\'s own', () => {
    const matches = matchValues('attendanceGrid', ['ZZQ']);
    expect(unresolvedValues(matches)).toHaveLength(1);
    expect(valueLookup(matches).ZZQ).toBeUndefined();
  });
});

describe('shape diff', () => {
  it('says nothing changed when the columns are the same', () => {
    const diff = diffShape(['Emp No', 'Name'], ['EMP_NO', 'name']);
    expect(diff.unchanged).toBe(true);
    expect(describeShapeDiff(diff)).toBe('Same columns as last month.');
  });

  it('names a column that has gone and the mapping it broke', () => {
    const diff = diffShape(['EmpNo', 'NISHA', 'Net_Pay'], ['EmpNo', 'Net_Pay'], {
      nightShiftAllowance: 'nisha',
      netPay: 'net pay',
    });
    expect(diff.removed).toEqual(['NISHA']);
    expect(diff.brokenMappings).toEqual([{ field: 'nightShiftAllowance', wasHeader: 'nisha' }]);
    expect(describeShapeDiff(diff)).toContain('no longer in the file');
  });

  it('counts new columns', () => {
    const diff = diffShape(['EmpNo'], ['EmpNo', 'Bonus', 'Gratuity']);
    expect(diff.added).toEqual(['Bonus', 'Gratuity']);
    expect(describeShapeDiff(diff)).toContain('2 new');
  });
});

describe('overtime', () => {
  it('applies twice the ordinary rate only where a minimum wage is fixed', () => {
    const covered = computeOvertime({ hours: 10, normalWages: 24000, normalHours: normalHoursFor(30), coverage: 'covered' });
    expect(covered.multiplier).toBe(2);
    expect(covered.basis).toBe('section-14-double-rate');
    expect(covered.wages).toBeCloseTo((24000 / 240) * 2 * 10);
  });

  it('uses the terms of employment for an employee outside the Code\'s minimum wage', () => {
    const uncovered = computeOvertime({ hours: 10, normalWages: 240000, normalHours: 240, coverage: 'not-covered' });
    expect(uncovered.multiplier).toBe(1);
    expect(uncovered.basis).toBe('contractual-rate');
    expect(overtimeBasisNote(uncovered)).toContain('Section 14 of the Code on Wages is not engaged');
  });

  it('blocks the register when coverage has not been decided', () => {
    const unknown = computeOvertime({ hours: 10, normalWages: 50000, normalHours: 240, coverage: 'unknown' });
    expect(unknown.wages).toBe(0);
    expect(unknown.blocked).toContain('has not been confirmed');
  });

  it('counts how many employees still need the decision', () => {
    expect(unresolvedCoverage([{ coverage: 'covered' }, { coverage: 'unknown' }, { coverage: 'unknown' }])).toBe(2);
  });
});
