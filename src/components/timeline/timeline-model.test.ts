import { describe, expect, it } from 'vitest';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { axisFraction, buildRecordTimeline, shortDate } from './timeline-model';

type State = Record<string, ChecklistItemStateSlice | undefined>;

const done = (on: string): ChecklistItemStateSlice => ({ status: 'completed', completedOn: on }) as ChecklistItemStateSlice;

const window = (from: string, to: string) => ({ from, to, setBy: 'm', setAt: '2026-09-01T00:00:00Z' });

describe('buildRecordTimeline', () => {
  it('has no axis and no bars when nothing is dated', () => {
    const t = buildRecordTimeline({ state: {}, today: '2026-10-20' });
    expect(t.start).toBeNull();
    expect(t.incorporating).toBe(true);
    expect(t.rows.every((r) => r.bars.length === 0)).toBe(true);
    expect(t.rows.find((r) => r.id === 'coi')).toBeUndefined();
  });

  it('draws the incorporating rows from the incorporation window and the expected COI', () => {
    const t = buildRecordTimeline({
      state: {},
      schedule: { incorporation: window('2026-10-01', '2026-11-09') },
      expectedCoiOn: '2026-11-12',
      today: '2026-10-20',
    });
    expect(t.rows.map((r) => r.id)).toEqual(['pre-inc-phase-1', 'pre-inc-phase-2', 'mca-review', 'coi', 'post-inc-phase-3']);
    expect(t.rows[0]!.name).toBe('Phase 1 · Name application');
    expect(t.coi).toEqual({ on: '2026-11-12', source: 'expected' });
    expect(t.rows.find((r) => r.id === 'coi')!.milestone).toBe('2026-11-12');
    // Post-incorporation starts at the COI.
    const p3 = t.rows.find((r) => r.id === 'post-inc-phase-3')!;
    expect(p3.bars[0]!.from).toBe('2026-11-12');
    expect(p3.bars[0]!.kind).toBe('plan');
    expect(t.start! <= '2026-10-01').toBe(true);
    expect(t.end! >= '2026-12-12').toBe(true);
  });

  it('splits the current phase into a solid done part and a hatched rest (R-21)', () => {
    const state: State = { 'pre-1': done('2026-10-03'), 'pre-2': done('2026-10-05') };
    const t = buildRecordTimeline({
      state,
      schedule: { incorporation: window('2026-10-01', '2026-10-21') },
      today: '2026-10-10',
    });
    const p1 = t.rows[0]!;
    expect(p1.status).toBe('current');
    expect(p1.bars.map((b) => b.kind)).toEqual(['cur', 'rest']);
    expect(p1.bars[0]!.from).toBe('2026-10-01');
    expect(p1.bars[1]!.to).toBe('2026-10-21');
  });

  it('adds a red tail when today is past the plan of the current phase', () => {
    const t = buildRecordTimeline({
      state: {},
      schedule: { incorporation: window('2026-09-01', '2026-09-20') },
      today: '2026-10-01',
    });
    const p1 = t.rows[0]!;
    expect(p1.bars.at(-1)).toEqual({ from: '2026-09-20', to: '2026-10-01', kind: 'late' });
    expect(p1.note).toEqual({ text: 'Stuck', bad: true });
  });

  it('switches to the after-COI rows with counts and the COI diamond on Incorporation', () => {
    const t = buildRecordTimeline({ state: {}, incorporationDate: '2026-06-28', today: '2026-10-20' });
    expect(t.incorporating).toBe(false);
    expect(t.coi).toEqual({ on: '2026-06-28', source: 'actual' });
    expect(t.rows.map((r) => r.name)).toEqual(['Name application', 'Incorporation', 'Post-incorporation', 'Registrations']);
    expect(t.rows[1]!.milestone).toBe('2026-06-28');
    expect(t.rows[2]!.count).toMatch(/^\d+\/\d+$/);
  });
});

describe('date helpers', () => {
  it('writes short dates and positions dates on the axis', () => {
    expect(shortDate('2026-09-14')).toBe('14 Sep');
    expect(axisFraction('2026-10-11', '2026-10-01', '2026-10-21')).toBeCloseTo(0.5);
    expect(axisFraction('2026-12-01', '2026-10-01', '2026-10-21')).toBe(1);
  });
});
