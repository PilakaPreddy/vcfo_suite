import { describe, expect, it } from 'vitest';
import { periodKey, periodRowsToMove, proposalsFor, withCalendarChanges, withMovedDeadlines, type PeriodRow } from '../calendar-proposal';

const row = (engagementId: string, dueDate: string, fields: Partial<PeriodRow> = {}): PeriodRow => ({
  engagementId,
  obligationId: 'mca-mgt-7',
  periodLabel: 'Form MGT-7 FY 2025-26',
  dueDate,
  filed: false,
  ...fields,
});

const update = (fields: object) => ({
  title: 'Time extended for filing Form MGT-7 for FY 2025-26',
  area: 'mca',
  act: 'Companies Act, 2013',
  changeType: 'due_date',
  summary: null,
  affects: null,
  quote: null,
  oldDueDate: '2026-11-29',
  newDueDate: '2026-12-31',
  ...fields,
});

describe('working out a proposal', () => {
  it('names the period on the old date and the open clients in it, leaving the filed one out', () => {
    const rows = [row('open', '2026-11-29'), row('filed', '2026-11-29', { filed: true }), row('other-filing', '2026-11-29', { obligationId: 'mca-aoc-4' })];
    expect(proposalsFor(update({}), rows)).toEqual([
      { obligationId: 'mca-mgt-7', period: 'Form MGT-7 FY 2025-26', oldDueDate: '2026-11-29', newDueDate: '2026-12-31', affectedEngagementIds: ['open'] },
    ]);
  });

  it('proposes nothing unless it is a due-date change that names a filing on the calendar', () => {
    expect(proposalsFor(update({ changeType: 'other' }), [row('a', '2026-11-29')])).toEqual([]);
    expect(proposalsFor(update({ newDueDate: null }), [row('a', '2026-11-29')])).toEqual([]);
    expect(proposalsFor(update({ title: 'Time extended for a form nobody files' }), [row('a', '2026-11-29')])).toEqual([]);
    expect(proposalsFor(update({}), [row('a', '2026-11-29', { filed: true })])).toEqual([]);
  });

  it('a notice with no old date finds the period it names, then the nearest earlier date', () => {
    const rows = [row('old-year', '2025-11-29', { periodLabel: 'Form MGT-7 FY 2024-25' }), row('this-year', '2026-11-29')];
    expect(proposalsFor(update({ oldDueDate: null, title: 'MGT-7 for 2025-2026 extended' }), rows)[0]).toMatchObject({ period: 'Form MGT-7 FY 2025-26', oldDueDate: '2026-11-29' });
    expect(proposalsFor(update({ oldDueDate: null, title: 'MGT-7 extended' }), rows)[0]).toMatchObject({ period: 'Form MGT-7 FY 2025-26' });
    expect(proposalsFor(update({ oldDueDate: null, title: 'MGT-7 for FY 2019-20 extended' }), rows)).toEqual([]);
  });

  it('a monthly period is named as a period, and a date is not a period', () => {
    const rows = [row('sep', '2026-10-20', { obligationId: 'gst-gstr-3b', periodLabel: 'Sep 2026' }), row('oct', '2026-11-20', { obligationId: 'gst-gstr-3b', periodLabel: 'Oct 2026' })];
    const named = update({ title: 'GSTR-3B for September 2026 extended', oldDueDate: null, newDueDate: '2026-11-25' });
    expect(proposalsFor(named, rows).map((draft) => draft.period)).toEqual(['Sep 2026']);
    const dated = update({ title: 'GSTR-3B may be filed by 25 November 2026', oldDueDate: null, newDueDate: '2026-11-25' });
    expect(proposalsFor(dated, rows).map((draft) => draft.period)).toEqual(['Oct 2026']);
  });

  it('never moves a filed row or one already on the new date, and never moves a row later than the new date', () => {
    const rows = [row('a', '2026-11-29'), row('b', '2026-12-31'), row('c', '2026-11-29', { filed: true }), row('d', '2027-01-15')];
    expect(periodRowsToMove(rows, '2026-11-29', '2026-12-31').map((item) => item.engagementId)).toEqual(['a']);
  });
});

describe('an approved change holding through later generation', () => {
  const change = { obligationId: 'mca-mgt-7', period: 'Form MGT-7 FY 2025-26', oldDueDate: '2026-11-29', newDueDate: '2026-12-31' };
  const generated = (engagementId: string, status = 'overdue') => ({ engagementId, obligationId: change.obligationId, periodLabel: change.period, dueDate: '2026-11-29', status });

  it('drops the generated copy when the period already has a row, moved or filed, so the old date does not come back', () => {
    const existing = new Set([periodKey('a', change.obligationId, change.period)]);
    expect(withCalendarChanges([generated('a')], [change], existing)).toEqual([]);
  });

  it('starts a period not yet on the calendar on the approved date', () => {
    expect(withCalendarChanges([generated('new')], [change], new Set(), '2026-12-01')).toEqual([{ ...generated('new'), dueDate: '2026-12-31', status: 'upcoming' }]);
  });

  it('leaves other filings and periods alone', () => {
    const other = { ...generated('a'), periodLabel: 'Form MGT-7 FY 2026-27' };
    expect(withCalendarChanges([other], [change])).toEqual([other]);
    expect(withCalendarChanges([other], [])).toEqual([other]);
  });

  it('a later approval on the same period wins', () => {
    const later = { ...change, oldDueDate: '2026-12-31', newDueDate: '2027-01-31' };
    expect(withCalendarChanges([generated('new')], [change, later], new Set(), '2026-12-01')[0]!.dueDate).toBe('2027-01-31');
  });
});

describe('the printed statutory calendar', () => {
  const change = { obligationId: 'mca-mgt-7', period: 'Form MGT-7 FY 2025-26', oldDueDate: '2026-11-29', newDueDate: '2026-12-31' };
  const line = { id: 'x', date: '2026-11-29', title: 'MGT-7' };

  it('shows a single line on the new date, naming the old one', () => {
    const [moved, ...rest] = withMovedDeadlines([line], [change]);
    expect(rest).toEqual([]);
    expect(moved!.date).toBe('2026-12-31');
    expect(moved!.title).toContain('29 Nov 2026');
  });

  it('keeps a shared line where it is and adds the moved filing', () => {
    const shared = { ...line, title: 'MGT-7, AOC-4' };
    expect(withMovedDeadlines([shared], [change]).map((row) => row.date)).toEqual(['2026-11-29', '2026-12-31']);
  });

  it('changes nothing when no date moved', () => {
    expect(withMovedDeadlines([line], [])).toEqual([line]);
    expect(withMovedDeadlines([{ ...line, date: '2026-10-29' }], [change])[0]!.date).toBe('2026-10-29');
  });
});
