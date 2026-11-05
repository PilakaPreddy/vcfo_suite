import { describe, expect, it } from 'vitest';
import { areaLabel, daysUntil, filingWord, plainDate, toCsv, worstStatus } from '@/lib/compliance/spectrum-status';

const NOW = new Date('2026-10-16T09:00:00Z');

describe('spectrum status words', () => {
  it('speaks the six words for register rows', () => {
    expect(filingWord({ filedOn: '2026-10-01', dueDate: '2026-10-20', rawStatus: 'filed' }, NOW)).toBe('Done');
    expect(filingWord({ filedOn: null, dueDate: '2026-10-10', rawStatus: 'upcoming' }, NOW)).toBe('Overdue');
    expect(filingWord({ filedOn: null, dueDate: '2026-10-20', rawStatus: 'upcoming' }, NOW)).toBe('Due soon');
    expect(filingWord({ filedOn: null, dueDate: '2026-12-20', rawStatus: 'upcoming' }, NOW)).toBe('Not started');
    expect(filingWord({ filedOn: null, dueDate: '2026-12-20', rawStatus: 'in-progress' }, NOW)).toBe('In progress');
    // Late beats the team's in-progress mark.
    expect(filingWord({ filedOn: null, dueDate: '2026-10-01', rawStatus: 'in-progress' }, NOW)).toBe('Overdue');
  });

  it('takes the worst status of a set', () => {
    expect(worstStatus(['filed', 'upcoming', 'due-soon'])).toBe('due-soon');
    expect(worstStatus(['filed', 'overdue'])).toBe('overdue');
    expect(worstStatus([])).toBe('upcoming');
  });

  it('writes plain dates and sentence-case areas', () => {
    expect(plainDate('2026-10-14', NOW)).toBe('14 Oct');
    expect(plainDate('2027-01-07', NOW)).toBe('7 Jan 2027');
    expect(plainDate(null, NOW)).toBe('—');
    expect(areaLabel('Income Tax')).toBe('Income tax');
    expect(areaLabel('GST')).toBe('GST');
    expect(areaLabel('ROC MCA')).toBe('ROC MCA');
    expect(daysUntil('2026-10-20', NOW)).toBe(4);
    expect(daysUntil('2026-10-13', NOW)).toBe(-3);
  });

  it('quotes CSV cells', () => {
    expect(toCsv(['A', 'B'], [['x "y"', null]])).toBe('"A","B"\n"x ""y""",""');
  });
});
