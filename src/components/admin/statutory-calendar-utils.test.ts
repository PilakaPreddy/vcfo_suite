import { describe, expect, it } from 'vitest';
import { ACT_SWATCH } from '@/data/statutory-calendar-fy2627';
import {
  buildStatutoryFyWeeks,
  buildStatutoryMonthGrid,
  calendarCellIndexAfterKey,
  dateHasAgendaItems,
  isoFromDate,
  isoInStatutoryFy,
  isSelectAllActive,
  muteAllActs,
  nextInMonthCellIndex,
  parseCalendarViewPrefs,
  selectAllActs,
  statutoryActTextClass,
  statutoryAgendaId,
  statutoryCellActs,
  statutoryCellWash,
  statutoryCountByDate,
  statutoryDaysUntil,
  statutoryFilingName,
  statutoryFyMonthLabels,
  statutoryHeatLevel,
  statutoryPillLabel,
  statutoryReturnPeriod,
  statutoryStatus,
  statutoryStatusLabel,
  toggleMutedAct,
  uniqueActsInCatalogOrder,
} from './statutory-calendar-utils';

const ACTS = ['GST', 'IT', 'MCA'] as const;

describe('statutoryAgendaId', () => {
  it('uses a stable prefix the agenda groups can match', () => {
    expect(statutoryAgendaId('2026-08-05')).toBe('statutory-agenda-2026-08-05');
  });
});

describe('select-all chips', () => {
  it('starts selected when nothing is muted', () => {
    expect(isSelectAllActive(new Set())).toBe(true);
  });

  it('unselects when any category is muted', () => {
    expect(isSelectAllActive(toggleMutedAct(new Set<string>(), 'GST'))).toBe(false);
  });

  it('reselects after every muted category is turned back on', () => {
    let muted = toggleMutedAct(new Set<string>(), 'GST');
    muted = toggleMutedAct(muted, 'GST');
    expect(isSelectAllActive(muted)).toBe(true);
  });

  it('select-all click clears mutes even after a partial toggle', () => {
    let muted: Set<(typeof ACTS)[number]> = toggleMutedAct(new Set<(typeof ACTS)[number]>(), 'IT');
    expect(isSelectAllActive(muted)).toBe(false);
    muted = selectAllActs();
    expect(isSelectAllActive(muted)).toBe(true);
    expect(muted.size).toBe(0);
  });

  it('all-on click mutes every act', () => {
    expect(isSelectAllActive(selectAllActs())).toBe(true);
    const muted = muteAllActs(ACTS);
    expect(isSelectAllActive(muted)).toBe(false);
    expect(muted.size).toBe(ACTS.length);
    for (const act of ACTS) expect(muted.has(act)).toBe(true);
  });

  it('all-muted click restores select-all', () => {
    let muted: Set<(typeof ACTS)[number]> = muteAllActs(ACTS);
    expect(isSelectAllActive(muted)).toBe(false);
    muted = selectAllActs();
    expect(isSelectAllActive(muted)).toBe(true);
    expect(muted.size).toBe(0);
  });
});

describe('act swatches', () => {
  it('gives every statutory act a unique solid class', () => {
    const solids = Object.values(ACT_SWATCH).map((s) => s.solid);
    expect(new Set(solids).size).toBe(solids.length);
    expect(solids).toHaveLength(8);
  });
});

describe('statutoryCellWash', () => {
  it('uses that act’s soft wash for a single-act day', () => {
    expect(statutoryCellWash(['GST'])).toBe(ACT_SWATCH.GST.soft);
  });

  it('skips wash on multi-act days so stacked stripes stay distinct', () => {
    expect(statutoryCellWash(['FEMA', 'IT', 'STPI/SEZ'])).toBeNull();
    expect(statutoryCellWash(['GST', 'LABOUR', 'STPI/SEZ'])).toBeNull();
  });

  it('returns null when the day has no acts', () => {
    expect(statutoryCellWash([])).toBeNull();
  });
});

describe('dateHasAgendaItems', () => {
  it('is true only when the day has a non-empty list', () => {
    const byDate = new Map<string, readonly string[]>([
      ['2026-08-05', ['a']],
      ['2026-08-06', []],
    ]);
    expect(dateHasAgendaItems('2026-08-05', byDate)).toBe(true);
    expect(dateHasAgendaItems('2026-08-06', byDate)).toBe(false);
    expect(dateHasAgendaItems('2026-08-07', byDate)).toBe(false);
  });
});

describe('uniqueActsInCatalogOrder', () => {
  it('dedupes and follows ACT_SWATCH key order', () => {
    expect(uniqueActsInCatalogOrder(['LABOUR', 'GST', 'GST', 'MCA'])).toEqual([
      'GST',
      'MCA',
      'LABOUR',
    ]);
  });
});

describe('statutoryActTextClass', () => {
  it('pulls the unique text-stat class from each chip', () => {
    const classes = Object.keys(ACT_SWATCH).map((act) =>
      statutoryActTextClass(act as keyof typeof ACT_SWATCH),
    );
    expect(new Set(classes).size).toBe(8);
    expect(statutoryActTextClass('GST')).toBe('text-stat-gst');
    expect(statutoryActTextClass('STPI/SEZ')).toBe('text-stat-stpi');
  });
});

describe('buildStatutoryMonthGrid', () => {
  it('always returns six Sunday-start weeks', () => {
    const cells = buildStatutoryMonthGrid(new Date(2026, 7, 1)); // Aug 2026
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ iso: '2026-07-26', day: 26, inMonth: false });
    expect(cells[6]).toEqual({ iso: '2026-08-01', day: 1, inMonth: true });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
    expect(isoFromDate(new Date(2026, 7, 25))).toBe('2026-08-25');
  });
});

describe('statutoryHeatLevel', () => {
  it('maps counts onto four luminance steps', () => {
    expect(statutoryHeatLevel(0)).toBe(0);
    expect(statutoryHeatLevel(-2)).toBe(0);
    expect(statutoryHeatLevel(1)).toBe(1);
    expect(statutoryHeatLevel(2)).toBe(2);
    expect(statutoryHeatLevel(3)).toBe(2);
    expect(statutoryHeatLevel(4)).toBe(3);
    expect(statutoryHeatLevel(12)).toBe(3);
  });
});

describe('statutoryCountByDate', () => {
  it('tallies items per ISO day', () => {
    const map = statutoryCountByDate([
      { date: '2026-08-05' },
      { date: '2026-08-05' },
      { date: '2026-08-11' },
    ]);
    expect(map.get('2026-08-05')).toBe(2);
    expect(map.get('2026-08-11')).toBe(1);
    expect(map.get('2026-08-12')).toBeUndefined();
  });
});

describe('buildStatutoryFyWeeks', () => {
  it('covers FY 2026-27 as Sunday-start weeks', () => {
    const weeks = buildStatutoryFyWeeks('2026-04-01', '2027-03-31');
    expect(weeks.length).toBeGreaterThanOrEqual(52);
    expect(weeks.length).toBeLessThanOrEqual(54);
    expect(weeks[0]?.[0]).toEqual({ iso: '2026-03-29', inFy: false });
    expect(weeks[0]?.[3]).toEqual({ iso: '2026-04-01', inFy: true });
    const flat = weeks.flat();
    expect(flat.some((c) => c.iso === '2027-03-31' && c.inFy)).toBe(true);
    expect(isoInStatutoryFy('2026-04-01', '2026-04-01', '2027-03-31')).toBe(true);
    expect(isoInStatutoryFy('2026-03-31', '2026-04-01', '2027-03-31')).toBe(false);
  });
});

describe('statutoryFyMonthLabels', () => {
  it('labels the week that starts each FY month', () => {
    const weeks = buildStatutoryFyWeeks('2026-04-01', '2027-03-31');
    const labels = statutoryFyMonthLabels(weeks);
    expect(labels[0]?.label).toMatch(/apr/i);
    expect(labels[0]?.prefix).toBe('2026-04');
    expect(labels[1]?.prefix).toBe('2026-05');
    expect(labels).toHaveLength(12);
    expect(labels.map((l) => l.weekIndex).every((i, n, arr) => n === 0 || i > arr[n - 1]!)).toBe(
      true,
    );
  });
});

describe('calendar keyboard', () => {
  it('moves spatially and stays at the grid edge', () => {
    expect(calendarCellIndexAfterKey(3, 'ArrowLeft', 42)).toBe(2);
    expect(calendarCellIndexAfterKey(0, 'ArrowUp', 42)).toBe(0);
    expect(calendarCellIndexAfterKey(41, 'ArrowDown', 42)).toBe(41);
    expect(calendarCellIndexAfterKey(8, 'Home', 42)).toBe(7);
    expect(calendarCellIndexAfterKey(8, 'End', 42)).toBe(13);
    expect(calendarCellIndexAfterKey(0, 'Enter', 42)).toBeNull();
  });

  it('skips out-of-month cells when arrowing', () => {
    const cells = buildStatutoryMonthGrid(new Date(2026, 7, 1));
    const firstIn = cells.findIndex((c) => c.inMonth);
    expect(nextInMonthCellIndex(cells, firstIn, 'ArrowLeft')).toBe(firstIn);
    const lastIn = cells.reduce((acc, c, i) => (c.inMonth ? i : acc), 0);
    expect(nextInMonthCellIndex(cells, lastIn, 'ArrowRight')).toBe(lastIn);
  });
});

describe('statutoryDaysUntil', () => {
  it('counts whole days forward and back across a month edge', () => {
    expect(statutoryDaysUntil('2026-08-25', '2026-08-25')).toBe(0);
    expect(statutoryDaysUntil('2026-09-02', '2026-08-31')).toBe(2);
    expect(statutoryDaysUntil('2026-08-20', '2026-08-25')).toBe(-5);
  });
});

describe('statutoryStatus', () => {
  it('reads a past date as overdue', () => {
    expect(statutoryStatus('2026-08-24', '2026-08-25')).toBe('overdue');
  });

  it('reads today and the next 15 days as due soon', () => {
    expect(statutoryStatus('2026-08-25', '2026-08-25')).toBe('due-soon');
    expect(statutoryStatus('2026-09-09', '2026-08-25')).toBe('due-soon');
  });

  it('reads anything past the due-soon window as upcoming', () => {
    expect(statutoryStatus('2026-09-10', '2026-08-25')).toBe('upcoming');
  });
});

describe('statutoryStatusLabel', () => {
  it('names the near dates and falls back to the state word', () => {
    expect(statutoryStatusLabel('2026-08-24', '2026-08-25')).toBe('Overdue');
    expect(statutoryStatusLabel('2026-08-25', '2026-08-25')).toBe('Today');
    expect(statutoryStatusLabel('2026-08-26', '2026-08-25')).toBe('Tomorrow');
    expect(statutoryStatusLabel('2026-08-29', '2026-08-25')).toBe('4 days');
    expect(statutoryStatusLabel('2026-09-30', '2026-08-25')).toBe('Upcoming');
  });
});

describe('return period', () => {
  it('lifts a trailing parenthetical off the title', () => {
    expect(statutoryReturnPeriod('Form 141 challan-cum-statement (Jul ’26)')).toBe('Jul ’26');
    expect(statutoryFilingName('Form 141 challan-cum-statement (Jul ’26)')).toBe(
      'Form 141 challan-cum-statement',
    );
  });

  it('leaves a title alone when the parenthetical is not trailing', () => {
    const title = 'GSTR-7 & GSTR-8; Form A & B (EOU); MOOWR return';
    expect(statutoryReturnPeriod(title)).toBeNull();
    expect(statutoryFilingName(title)).toBe(title);
  });

  it('has no period when the title carries none', () => {
    expect(statutoryReturnPeriod('GSTR-1')).toBeNull();
    expect(statutoryFilingName('GSTR-1')).toBe('GSTR-1');
  });
});

describe('statutoryCellActs', () => {
  it('dedupes to catalog order and caps the dots', () => {
    const items = [
      { act: 'LABOUR' as const },
      { act: 'GST' as const },
      { act: 'GST' as const },
      { act: 'IT' as const },
      { act: 'MCA' as const },
    ];
    expect(statutoryCellActs(items)).toEqual({ acts: ['GST', 'IT', 'MCA'], overflow: 1 });
  });

  it('reports no overflow when the day fits', () => {
    expect(statutoryCellActs([{ act: 'GST' as const }])).toEqual({ acts: ['GST'], overflow: 0 });
  });
});

describe('calendar view prefs', () => {
  it('defaults to the minimized list', () => {
    expect(parseCalendarViewPrefs(null)).toEqual({ mode: 'minimized' });
    expect(parseCalendarViewPrefs('junk')).toEqual({ mode: 'minimized' });
    expect(parseCalendarViewPrefs([])).toEqual({ mode: 'minimized' });
  });

  it('keeps a stored maximized choice', () => {
    expect(parseCalendarViewPrefs({ mode: 'maximized' })).toEqual({ mode: 'maximized' });
  });

  it('coerces unknown values back to the default', () => {
    expect(parseCalendarViewPrefs({ mode: 'huge' })).toEqual({ mode: 'minimized' });
  });
});

describe('statutoryPillLabel', () => {
  it('keeps a short title whole', () => {
    expect(statutoryPillLabel('GSTR-1')).toBe('GSTR-1');
  });

  it('trims a multi-clause title to its first clause', () => {
    expect(statutoryPillLabel('GSTR-7 & GSTR-8; Form A & B (EOU); MOOWR return')).toBe(
      'GSTR-7 & GSTR-8',
    );
  });

  it('never returns an empty label', () => {
    expect(statutoryPillLabel('; TDS return')).toBe('TDS return');
  });
});
