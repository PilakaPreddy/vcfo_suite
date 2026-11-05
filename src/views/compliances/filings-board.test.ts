import { describe, expect, it } from 'vitest';
import type { FilingRow } from '@/lib/compliance/filings';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import {
  groupByClient,
  groupByFiling,
  matchesStatus,
  noteFor,
  onTimeByMonth,
  parseBoardStatus,
  parseRegulator,
  regulatorCounts,
  tileCounts,
  tileSubs,
} from '@/views/compliances/filings-board';

const now = new Date('2026-10-14T09:00:00Z');

function row(patch: Partial<FilingRow> & { id: string }): FilingRow {
  return {
    engagementId: 'acme',
    companyName: 'Acme Pvt Ltd',
    compliance: 'GST',
    particular: 'GSTR-3B',
    authority: 'GST',
    frequency: 'monthly',
    dueDate: '2026-10-20',
    filedOn: null,
    periodLabel: 'Sep 2026',
    fyLabel: 'FY 2026-27',
    rawStatus: 'upcoming',
    obligationId: 'gst-3b',
    windowFrom: null,
    windowTo: null,
    ...patch,
  };
}

const rows = [
  row({ id: 'a', filedOn: '2026-10-11' }),
  row({ id: 'b', engagementId: 'birch', companyName: 'Birch LLP' }),
  row({ id: 'c', compliance: 'Income Tax', particular: 'TDS payment', obligationId: 'tds', dueDate: '2026-10-07' }),
  row({ id: 'd', compliance: 'MCA', particular: 'AOC-4', obligationId: 'aoc4', dueDate: '2026-11-29', rawStatus: 'in-progress' }),
];

describe('filings board', () => {
  it('counts the four KPI tiles from the rows in hand', () => {
    expect(tileCounts(rows, now)).toEqual({ month: 3, filed: 1, week: 1, late: 1 });
  });

  it('reads the status chip, keeping the old ?status= values', () => {
    expect(parseBoardStatus('due-soon')).toBe('due-soon');
    expect(parseBoardStatus('all')).toBe('');
    expect(rows.filter((r) => matchesStatus(r, 'open', now)).map((r) => r.id)).toEqual(['b', 'c', 'd']);
    expect(rows.filter((r) => matchesStatus(r, 'in-progress', now)).map((r) => r.id)).toEqual(['d']);
  });

  it('maps an old area word to its regulator and lists all six regulators', () => {
    expect(parseRegulator('Income Tax')).toBe('it');
    expect(parseRegulator('gst')).toBe('gst');
    expect(parseRegulator('all')).toBe('');
    const counts = regulatorCounts(rows, now);
    expect(counts.map((c) => c.label)).toEqual(['GST', 'Income tax', 'MCA', 'FEMA', 'Payroll', 'Labour']);
    expect(counts.find((c) => c.key === 'gst')).toMatchObject({ filed: 1, total: 2 });
    expect(counts.find((c) => c.key === 'labour')).toMatchObject({ filed: 0, total: 0 });
  });

  it('groups by filing period and by client, counting before the filters', () => {
    const shown = rows.filter((r) => r.id !== 'a');
    const byFiling = groupByFiling(rows, shown, now);
    const gst = byFiling.find((g) => g.key === 'gst-3b|2026-10-20')!;
    expect(gst).toMatchObject({ filed: 1, total: 2, status: 'due-soon' });
    expect(gst.rows.map((r) => r.id)).toEqual(['b']);
    expect(byFiling[0]!.label).toBe('TDS payment');
    expect(groupByClient(rows, rows, now).map((g) => g.label)).toEqual(['Acme Pvt Ltd', 'Birch LLP']);
  });

  it('writes the note from the recorded facts only', () => {
    const detail = { acknowledgementNo: 'AA2910', dataReceivedOn: null, preparingSince: null, approvedOn: null } as PortalFiling;
    expect(noteFor(rows[0]!, detail, now)).toBe('ARN AA2910');
    expect(noteFor(rows[1]!, undefined, now)).toBe('');
    expect(noteFor(rows[1]!, { ...detail, dataReceivedOn: '2026-10-09' }, now)).toBe('Data in 9 Oct');
    expect(noteFor(rows[1]!, detail, now)).toBe('Waiting on client data');
  });

  it('counts on time and late by due month', () => {
    const months = onTimeByMonth(
      [row({ id: 'x', dueDate: '2026-09-20', filedOn: '2026-09-18' }), row({ id: 'y', dueDate: '2026-09-20', filedOn: '2026-09-25' })],
      now,
      6,
    );
    expect(months).toHaveLength(6);
    expect(months.find((m) => m.key === '2026-09')).toMatchObject({ label: 'Sep', onTime: 1, late: 1 });
  });
});

describe('tiles on the IST day', () => {
  it('counts the month and the 7-day window from the IST date after 18:30 UTC', () => {
    // 31 Oct 2026 19:00 UTC is 1 Nov 00:30 IST: November is this month, the window ends Sun 8 Nov.
    const late = new Date('2026-10-31T19:00:00Z');
    const counts = tileCounts([row({ id: 'n', dueDate: '2026-11-08' }), row({ id: 'o', dueDate: '2026-10-31' })], late);
    expect(counts.month).toBe(1);
    expect(counts.week).toBe(1);
    expect(tileSubs([], late).week).toMatch(/^by Sun /);
  });
});
