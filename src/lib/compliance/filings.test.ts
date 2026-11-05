import { describe, expect, it } from 'vitest';

import {
  buildMatrix,
  filingStatus,
  financialYearForDate,
  financialYearLabel,
  financialYearMonths,
  financialYearQuarters,
  formatFilingDate,
  monthKeyOf,
  parseFyParam,
  parseMonthParam,
  quarterForMonthKey,
  rowsForCadence,
  rowsInFinancialYear,
  rowsInMonth,
  summarise,
  todayIST,
  DUE_SOON_DAYS,
  type FilingRow,
} from '@/lib/compliance/filings';
import { statusOf, todayIso } from '@/lib/client-portal/compliances';

const NOW = new Date('2026-09-01T00:00:00Z');

function row(overrides: Partial<FilingRow> & { id: string; dueDate: string }): FilingRow {
  return {
    engagementId: 'e1',
    companyName: 'Acme India Private Limited',
    compliance: 'GST',
    particular: 'GSTR-3B',
    authority: 'GST',
    frequency: 'monthly',
    obligationId: 'gst-gstr3b',
    windowFrom: null,
    windowTo: null,
    filedOn: null,
    periodLabel: null,
    fyLabel: null,
    rawStatus: 'upcoming',
    ...overrides,
  };
}

describe('financial year', () => {
  it('runs April to March', () => {
    expect(financialYearForDate(new Date('2026-04-01T00:00:00Z')).startYear).toBe(2026);
    expect(financialYearForDate(new Date('2027-03-31T00:00:00Z')).startYear).toBe(2026);
    // January belongs to the FY that started the previous April.
    expect(financialYearForDate(new Date('2027-01-15T00:00:00Z')).startYear).toBe(2026);
    expect(financialYearForDate(new Date('2026-03-31T00:00:00Z')).startYear).toBe(2025);
  });

  it('labels the year the way the deck does', () => {
    expect(financialYearLabel(2026)).toBe('FY 2026-27');
    expect(financialYearLabel(2029)).toBe('FY 2029-30');
  });

  it('lists twelve months in deck order, Apr first', () => {
    const months = financialYearMonths(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ key: '2026-04', label: 'Apr 2026', shortLabel: 'Apr' });
    expect(months[11]).toEqual({ key: '2027-03', label: 'Mar 2027', shortLabel: 'Mar' });
  });

  it('quarters start at Apr–Jun', () => {
    const quarters = financialYearQuarters(2026);
    expect(quarters.map((q) => q.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(quarters[0]!.monthKeys).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(quarters[3]!.monthKeys).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(quarters[0]!.rangeLabel).toBe('Apr–Jun 2026');
  });

  it('maps a month back to its quarter', () => {
    expect(quarterForMonthKey('2027-02', 2026)?.label).toBe('Q4');
    expect(quarterForMonthKey('2026-09', 2026)?.label).toBe('Q2');
    expect(quarterForMonthKey('2025-09', 2026)).toBeNull();
  });
});

describe('filingStatus', () => {
  it('a filed date wins outright, even past the due date', () => {
    expect(
      filingStatus({ dueDate: '2026-01-01', filedOn: '2026-02-10' }, NOW),
    ).toBe('filed');
  });

  it('marks an unfiled past due date overdue', () => {
    expect(filingStatus({ dueDate: '2026-08-20', filedOn: null }, NOW)).toBe('overdue');
  });

  it('marks the next 15 days due soon and beyond that upcoming', () => {
    expect(filingStatus({ dueDate: '2026-09-11', filedOn: null }, NOW)).toBe('due-soon');
    expect(filingStatus({ dueDate: '2026-09-16', filedOn: null }, NOW)).toBe('due-soon');
    expect(filingStatus({ dueDate: '2026-09-17', filedOn: null }, NOW)).toBe('upcoming');
  });

  it('counts today in IST, so a filing due yesterday is overdue just after midnight IST', () => {
    // 18:29 UTC on 31 Aug is 23:59 IST; 18:30 UTC is 00:00 IST on 1 Sep.
    expect(todayIST(new Date('2026-08-31T18:29:59Z'))).toBe('2026-08-31');
    expect(todayIST(new Date('2026-08-31T18:30:00Z'))).toBe('2026-09-01');
    const row = { dueDate: '2026-08-31', filedOn: null };
    expect(filingStatus(row, new Date('2026-08-31T18:29:59Z'))).toBe('due-soon');
    expect(filingStatus(row, new Date('2026-08-31T18:30:00Z'))).toBe('overdue');
  });

  it('agrees with the client portal status for the same row at every boundary', () => {
    const word = { filed: 'ok', overdue: 'over', 'due-soon': 'due', upcoming: 'up' } as const;
    const instants = ['2026-08-31T18:29:59Z', '2026-08-31T18:30:00Z', '2026-09-01T12:00:00Z'];
    const dues = ['2026-08-31', '2026-09-01', `2026-09-${String(1 + DUE_SOON_DAYS).padStart(2, '0')}`, '2026-09-30'];
    for (const at of instants) {
      const now = new Date(at);
      for (const dueDate of dues) {
        const r = { dueDate, filedOn: null };
        expect(statusOf(r, todayIso(now)), `${dueDate} at ${at}`).toBe(word[filingStatus(r, now)]);
      }
    }
  });

  it('treats the due date itself as due soon, not overdue', () => {
    expect(filingStatus({ dueDate: '2026-09-01', filedOn: null }, NOW)).toBe('due-soon');
  });

  it('never invents a status for a missing due date', () => {
    expect(filingStatus({ dueDate: '', filedOn: null }, NOW)).toBe('upcoming');
  });
});

describe('cadence grouping', () => {
  const rows = [
    row({ id: '1', dueDate: '2026-09-11', frequency: 'monthly' }),
    row({ id: '2', dueDate: '2026-10-31', frequency: 'quarterly' }),
    row({ id: '3', dueDate: '2026-11-30', frequency: 'half-yearly' }),
    row({ id: '4', dueDate: '2027-01-31', frequency: 'annual' }),
    row({ id: '5', dueDate: '2026-12-01', frequency: 'one-time' }),
  ];

  it('routes each frequency to exactly one tab', () => {
    expect(rowsForCadence(rows, 'monthly').map((r) => r.id)).toEqual(['1']);
    expect(rowsForCadence(rows, 'quarterly').map((r) => r.id)).toEqual(['2', '3']);
    expect(rowsForCadence(rows, 'annual').map((r) => r.id)).toEqual(['4', '5']);
  });

  it('filters to a month and to a financial year', () => {
    expect(rowsInMonth(rows, '2026-09').map((r) => r.id)).toEqual(['1']);
    // FY 2026-27 covers Apr 2026 → Mar 2027, so all five rows fall inside.
    expect(rowsInFinancialYear(rows, 2026)).toHaveLength(5);
    expect(rowsInFinancialYear(rows, 2025)).toHaveLength(0);
  });
});

describe('summarise', () => {
  it('counts due-this-month, overdue and filed from real rows only', () => {
    const summary = summarise(
      [
        row({ id: '1', dueDate: '2026-09-11' }),
        row({ id: '2', dueDate: '2026-09-20', filedOn: '2026-09-18' }),
        row({ id: '3', dueDate: '2026-08-20' }),
        row({ id: '4', dueDate: '2026-12-01' }),
      ],
      '2026-09',
      NOW,
    );
    expect(summary).toEqual({ dueThisMonth: 2, overdue: 1, filed: 1 });
  });

  it('is all zeroes with no rows — never a fabricated series', () => {
    expect(summarise([], '2026-09', NOW)).toEqual({ dueThisMonth: 0, overdue: 0, filed: 0 });
  });
});

describe('buildMatrix', () => {
  it('lays obligations down the rows and periods across the columns', () => {
    const months = financialYearMonths(2026).map((m) => m.key);
    const matrix = buildMatrix(
      [
        row({ id: '1', dueDate: '2026-04-20', particular: 'GSTR-3B', filedOn: '2026-04-18' }),
        row({ id: '2', dueDate: '2026-05-20', particular: 'GSTR-3B' }),
        row({ id: '3', dueDate: '2026-04-11', particular: 'GSTR-1' }),
      ],
      months,
      (r) => monthKeyOf(r.dueDate),
      NOW,
    );

    expect(matrix.map((m) => m.particular)).toEqual(['GSTR-1', 'GSTR-3B']);
    const gstr3b = matrix.find((m) => m.particular === 'GSTR-3B')!;
    expect(gstr3b.cells[0]).toEqual({
      dueDate: '2026-04-20',
      filedOn: '2026-04-18',
      status: 'filed',
    });
    expect(gstr3b.cells[1]?.status).toBe('overdue');
    // Nothing due in June: an honest blank, not a zero.
    expect(gstr3b.cells[2]).toEqual({ dueDate: null, filedOn: null, status: null });
  });

  it('keeps one row per company per obligation in the firm scope', () => {
    const months = financialYearMonths(2026).map((m) => m.key);
    const rows = [
      row({ id: '1', dueDate: '2026-04-20', engagementId: 'e1', companyName: 'Acme' }),
      row({ id: '2', dueDate: '2026-04-20', engagementId: 'e2', companyName: 'Zeta', filedOn: '2026-04-19' }),
    ];
    // Default: the client register — one company, one row.
    expect(buildMatrix(rows, months, (r) => monthKeyOf(r.dueDate), NOW)).toHaveLength(1);

    const perCompany = buildMatrix(rows, months, (r) => monthKeyOf(r.dueDate), NOW, {
      perCompany: true,
    });
    expect(perCompany.map((m) => m.companyName)).toEqual(['Acme', 'Zeta']);
    expect(perCompany[0]?.cells[0]?.status).toBe('overdue');
    expect(perCompany[1]?.cells[0]?.status).toBe('filed');
  });
});

describe('url params', () => {
  it('accepts only well-formed periods', () => {
    expect(parseMonthParam('2026-04')).toBe('2026-04');
    expect(parseMonthParam('2026-13')).toBeNull();
    expect(parseMonthParam('nonsense')).toBeNull();
    expect(parseMonthParam(null)).toBeNull();
    expect(parseFyParam('2026')).toBe(2026);
    expect(parseFyParam('12')).toBeNull();
    expect(parseFyParam(undefined)).toBeNull();
  });
});

describe('formatting', () => {
  it('renders dates in the register face and an em dash when absent', () => {
    expect(formatFilingDate('2026-09-11')).toBe('11 Sep 2026');
    expect(formatFilingDate(null)).toBe('—');
    expect(formatFilingDate('')).toBe('—');
  });

  it('reads the month key in UTC so a timezone cannot shift it', () => {
    expect(monthKeyOf('2026-04-01')).toBe('2026-04');
    expect(monthKeyOf('2026-12-31')).toBe('2026-12');
  });
});
