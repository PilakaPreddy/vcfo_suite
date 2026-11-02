import { describe, expect, it } from 'vitest';

import { matchColumns, matchSummary, rememberable, scoreHeader, unusedHeaders } from './match';
import { fieldByKey } from '@/data/labour-registers/fields';
import { normaliseHeader } from './normalise';

/**
 * The headings are real: they come from the paysheet, attendance export and overtime report of
 * a filed September 2026 workbook, so a change that breaks these breaks a client's actual file.
 */
const PAYSHEET = [
  'SlNo',
  'EmpNo',
  'Remarks',
  'Name',
  'Gender',
  'Date_of_Birth',
  'Date_of_Joining',
  'Date_of_Leaving',
  'Designation',
  'Department',
  'Cost_Centre',
  'LOP',
  'Working_days',
  'Days_Worked',
  'Basic_Pay',
  'HRA',
  'Special_Allowance',
  'NISHA',
  'OTALL',
  'Gross',
  'PF',
  'TDS',
  'VPF',
  'PT',
  'Other_Deduction',
  'Food_Coupon_Deduction',
  'Total_Dedn',
  'Net_Pay',
  'Inwords',
];

function field(key: string) {
  const spec = fieldByKey(key);
  if (!spec) throw new Error(`no such field: ${key}`);
  return spec;
}

describe('scoreHeader', () => {
  it('takes an exact heading', () => {
    expect(scoreHeader(field('basic'), 'Basic wages').score).toBe(1);
    expect(scoreHeader(field('basic'), 'Basic wages').reason).toBe('exact heading');
  });

  it('takes a recorded alias, underscores and case notwithstanding', () => {
    const hit = scoreHeader(field('dateOfJoining'), 'Date_of_Joining');
    expect(hit.score).toBe(1);
    expect(hit.reason).toBe('known alias');
  });

  it('reaches a field through an abbreviation the payroll system used', () => {
    expect(scoreHeader(field('nightShiftAllowance'), 'NISHA').score).toBe(1);
    expect(scoreHeader(field('professionTax'), 'PT').score).toBe(1);
    expect(scoreHeader(field('lossOfPayDays'), 'LOP').score).toBe(1);
  });

  it('matches a statutory heading that carries extra words', () => {
    /* Form X asks for "Total attendance/ Units of work done", the paysheet says "Days_Worked". */
    expect(scoreHeader(field('daysWorked'), 'Total attendance/ Units of work done').score).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps total deductions and other deductions apart', () => {
    const totalOnTotal = scoreHeader(field('totalDeductions'), 'Total_Dedn').score;
    const otherOnTotal = scoreHeader(field('otherDeductions'), 'Total_Dedn').score;
    expect(totalOnTotal).toBeGreaterThan(otherOnTotal);
  });

  it('scores an unrelated heading low enough to stay out of the suggestions', () => {
    expect(scoreHeader(field('netPay'), 'Cost_Centre').score).toBeLessThan(0.45);
  });
});

describe('matchColumns', () => {
  const wanted = [
    'employeeId',
    'name',
    'sex',
    'dateOfJoining',
    'daysWorked',
    'basic',
    'hra',
    'nightShiftAllowance',
    'grossEarnings',
    'pf',
    'professionTax',
    'totalDeductions',
    'netPay',
  ];

  it('maps a real paysheet without asking anything of the preparer', () => {
    const matches = matchColumns({ fields: wanted, headers: PAYSHEET });
    const summary = matchSummary(matches);
    expect(summary.none).toBe(0);
    expect(summary.auto).toBeGreaterThanOrEqual(wanted.length - 1);
  });

  it('never exposes a score, only a bucket and a reason', () => {
    const [first] = matchColumns({ fields: ['basic'], headers: PAYSHEET });
    expect(first.bucket).toBe('auto');
    expect(first.reason).toBeTypeOf('string');
    /* The score exists for ordering and for this test, and lives on the candidate only. */
    expect(first.chosen?.score).toBeGreaterThan(0);
    expect(Object.keys(first)).not.toContain('score');
  });

  it('offers at most three candidates, best first', () => {
    const [match] = matchColumns({ fields: ['otherDeductions'], headers: PAYSHEET });
    expect(match.candidates.length).toBeLessThanOrEqual(3);
    const scores = match.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('gives one source column to one field only', () => {
    const matches = matchColumns({ fields: wanted, headers: PAYSHEET });
    const taken = matches.filter((m) => m.bucket === 'auto' && m.chosen).map((m) => m.chosen!.index);
    expect(new Set(taken).size).toBe(taken.length);
  });

  it('prefers a remembered mapping over its own scoring', () => {
    const remembered = { basic: normaliseHeader('Special_Allowance') };
    const [match] = matchColumns({ fields: ['basic'], headers: PAYSHEET, remembered });
    expect(match.bucket).toBe('auto');
    expect(match.chosen?.header).toBe('Special_Allowance');
    expect(match.reason).toBe('remembered from last filing');
  });

  it('ignores a remembered mapping whose column has gone', () => {
    const remembered = { basic: normaliseHeader('Column_That_Left') };
    const [match] = matchColumns({ fields: ['basic'], headers: PAYSHEET, remembered });
    expect(match.chosen?.header).toBe('Basic_Pay');
    expect(match.reason).not.toBe('remembered from last filing');
  });

  it('reports a field with no candidate rather than guessing', () => {
    const [match] = matchColumns({ fields: ['esi'], headers: ['SlNo', 'Cost_Centre', 'Inwords'] });
    expect(match.bucket).toBe('none');
    expect(match.reason).toBe('no candidate');
  });

  it('leaves excluded columns alone, so the day grid is not mapped twice', () => {
    const headers = ['EmpNo', 'Name', '2026-09-01 00:00:00', '2026-09-02 00:00:00'];
    const matches = matchColumns({ fields: ['employeeId', 'name'], headers, exclude: [2, 3] });
    expect(matches.every((m) => (m.chosen?.index ?? 0) < 2)).toBe(true);
  });

  it('returns matches in the order the caller asked for', () => {
    const order = ['netPay', 'basic', 'name'];
    expect(matchColumns({ fields: order, headers: PAYSHEET }).map((m) => m.field)).toEqual(order);
  });
});

describe('unusedHeaders', () => {
  it('lists the client columns no register needs', () => {
    const input = { fields: ['employeeId', 'name'], headers: PAYSHEET };
    const unused = unusedHeaders(input, matchColumns(input)).map((u) => u.header);
    expect(unused).toContain('Cost_Centre');
    expect(unused).toContain('Inwords');
    expect(unused).not.toContain('Name');
  });
});

describe('rememberable', () => {
  it('remembers accepted columns and not unconfirmed suggestions', () => {
    const matches = matchColumns({ fields: ['basic', 'esi'], headers: PAYSHEET });
    const saved = rememberable(matches);
    expect(saved.basic).toBe('basic pay');
    expect(saved.esi).toBeUndefined();
  });
});
