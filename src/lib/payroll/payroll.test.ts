import { describe, expect, it } from 'vitest';
import {
  checkDates,
  cutoffLocalLabel,
  cycleFor,
  cycleOptions,
  daysToCutoff,
  defaultDates,
  formatDay,
  parseCycleKey,
} from './cycle';
import { computeSalary, emptyRow, mergeRows, salariesFromCsv, salariesToCsv, summaryToCsv, totalsFor, type SalaryRow } from './salaries';

describe('payroll cycles', () => {
  it('labels a month the way the cycle picker shows it', () => {
    expect(cycleFor(2026, 11).label).toBe('01–30 Nov 2026');
    expect(cycleFor(2027, 2).to).toBe('2027-02-28');
  });

  it('defaults the cut-off to the 16th and payment to the 27th', () => {
    expect(defaultDates(cycleFor(2026, 11))).toEqual({ cutoff: '2026-11-16', payment: '2026-11-27' });
  });

  it('falls back to the current month for a bad key', () => {
    expect(parseCycleKey('nope', new Date('2026-11-03T07:18:00Z')).key).toBe('2026-11');
    expect(parseCycleKey('2026-13', new Date('2026-11-03T07:18:00Z')).key).toBe('2026-11');
  });

  it('offers months around today, newest first', () => {
    const opts = cycleOptions(new Date('2026-11-03T00:00:00Z'), 1, 1);
    expect(opts.map((c) => c.key)).toEqual(['2026-12', '2026-11', '2026-10']);
  });

  it('matches the cut-off countdown and local time in the reference screen', () => {
    expect(daysToCutoff('2026-11-16', new Date('2026-11-03T07:18:00Z'))).toBe(13);
    expect(cutoffLocalLabel('2026-11-16')).toBe('17 Nov 02:30');
    expect(formatDay('2026-11-16')).toBe('16 Nov 2026');
  });

  it('rejects dates outside the month or a payment before the cut-off', () => {
    const c = cycleFor(2026, 11);
    expect(checkDates(c, '2026-11-16', '2026-11-27').ok).toBe(true);
    expect(checkDates(c, '2026-12-01', '2026-11-27').ok).toBe(false);
    expect(checkDates(c, '2026-11-20', '2026-11-10').ok).toBe(false);
  });
});

describe('salary maths', () => {
  const row: SalaryRow = { ...emptyRow(1, 30), name: 'Asha', basic: 20_000, hra: 8_000, allowances: 2_000 };

  it('caps PF at 12% of ₹15,000 and skips ESI above ₹21,000 gross', () => {
    const c = computeSalary(row, 30);
    expect(c.gross).toBe(30_000);
    expect(c.pf).toBe(1_800);
    expect(c.esi).toBe(0);
    expect(c.net).toBe(28_200);
  });

  it('applies ESI at or below ₹21,000 gross and pro-rates on paid days', () => {
    const small = { ...row, basic: 10_000, hra: 4_000, allowances: 0, paidDays: 15 };
    const c = computeSalary(small, 30);
    expect(c.gross).toBe(7_000);
    expect(c.pf).toBe(600);
    expect(c.esi).toBe(53);
  });

  it('adds up totals', () => {
    expect(totalsFor([row, row], 30).net).toBe(56_400);
  });
});

describe('salary CSV', () => {
  it('round-trips an export through an import', () => {
    const rows: SalaryRow[] = [{ ...emptyRow(1, 30), name: 'Rao, K "Kris"', basic: 1000, pfApplicable: false }];
    const back = salariesFromCsv(salariesToCsv(rows), 30);
    expect(back.errors).toEqual([]);
    expect(back.rows).toEqual(rows);
  });

  it('reports bad amounts and missing IDs, and keeps good rows', () => {
    const res = salariesFromCsv('Employee ID,Basic\nE1,abc\n,100\nE3,"1,200"\n', 30);
    expect(res.rows.map((r) => [r.employeeId, r.basic])).toEqual([['E3', 1200]]);
    expect(res.errors).toHaveLength(2);
  });

  it('merges by Employee ID', () => {
    const a = { ...emptyRow(1, 30), basic: 1 };
    const b = { ...emptyRow(2, 30), basic: 2 };
    const merged = mergeRows([a, b], [{ ...b, basic: 5 }, { ...emptyRow(3, 30) }]);
    expect(merged.updated).toBe(1);
    expect(merged.added).toBe(1);
    expect(merged.rows.map((r) => r.basic)).toEqual([1, 5, 0]);
  });

  it('writes a totals row in the summary', () => {
    const csv = summaryToCsv([{ ...emptyRow(1, 30), basic: 30_000 }], 30);
    expect(csv.trim().split('\r\n').pop()).toMatch(/^Total,1 workers/);
  });
});
