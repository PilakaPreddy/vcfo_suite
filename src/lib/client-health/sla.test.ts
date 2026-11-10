import { describe, expect, it } from 'vitest';
import { slaDaysFromTimeline } from '@/data/sla';
import { complianceClock, dueLevels, slaMultiple, stageLabelOf, stepClocks, stepStage } from './sla';

describe('slaDaysFromTimeline', () => {
  it('reads the upper figure and turns working days into calendar days', () => {
    expect(slaDaysFromTimeline('2–3 working days')).toBe(5);
    expect(slaDaysFromTimeline('5 working days')).toBe(7);
    expect(slaDaysFromTimeline('1 week')).toBe(7);
    expect(slaDaysFromTimeline('4 days')).toBe(4);
    expect(slaDaysFromTimeline('as soon as possible')).toBeNull();
    expect(slaDaysFromTimeline(undefined)).toBeNull();
  });
});

describe('the ladder', () => {
  const clock = { startedOn: '2026-11-01', slaDays: 5 };

  it('reaches the lead at 1x, the manager at 2x and the partner at 3x', () => {
    expect(dueLevels(clock, '2026-11-05')).toEqual([]);
    expect(dueLevels(clock, '2026-11-06')).toEqual(['lead']);
    expect(dueLevels(clock, '2026-11-11')).toEqual(['lead', 'manager']);
    expect(dueLevels(clock, '2026-11-16')).toEqual(['lead', 'manager', 'partner']);
    expect(slaMultiple(clock, '2026-11-16')).toBe(3);
  });

  it('sends each level once: levels already recorded are left out', () => {
    expect(dueLevels(clock, '2026-11-11', new Set(['lead']))).toEqual(['manager']);
    expect(dueLevels(clock, '2026-11-11', new Set(['lead', 'manager']))).toEqual([]);
    expect(dueLevels(clock, '2026-11-20', new Set(['lead', 'manager', 'partner']))).toEqual([]);
  });

  it('keys a new clock for a new stage start, so a step that comes back starts again', () => {
    expect(stageLabelOf({ stage: 'awaiting-client', startedOn: '2026-11-01' })).toBe('awaiting-client@2026-11-01');
    expect(stageLabelOf({ stage: 'awaiting-client', startedOn: '2026-11-09' })).not.toBe(stageLabelOf({ stage: 'awaiting-client', startedOn: '2026-11-01' }));
  });
});

describe('step clocks', () => {
  it('puts only started, open steps on the clock', () => {
    expect(stepStage(undefined)).toBeNull();
    expect(stepStage({ status: 'not-started' })).toBeNull();
    expect(stepStage({ status: 'completed' })).toBeNull();
    expect(stepStage({ status: 'awaiting-client' })).toBe('awaiting-client');
    expect(stepStage({ status: 'in-progress', reviewStatus: 'reviewing' })).toBe('review');
    expect(stepStage({ status: 'overdue' })).toBe('in-progress');
  });

  it('uses the manager window, else the day the step entered its stage, and skips an unknown start', () => {
    const clocks = stepClocks({
      state: {
        'pre-1': { status: 'in-progress' },
        'pre-2': { status: 'awaiting-client' },
        'pre-3': { status: 'in-progress' },
      },
      schedule: { steps: { 'pre-1': { from: '2026-11-01', to: '2026-11-04', setBy: 'm', setAt: '' } } },
      enteredOn: { 'pre-2': '2026-11-03' },
    });
    expect(clocks.map((c) => [c.itemKey, c.stage, c.startedOn, c.slaDays])).toEqual([
      ['step:pre-1', 'in-progress', '2026-11-01', 4],
      ['step:pre-2', 'awaiting-client', '2026-11-03', 5],
    ]);
  });
});

describe('compliance clocks', () => {
  it('runs from the working window to the due date, so 1x is the due date', () => {
    const c = complianceClock({ itemKey: 'instance:x', title: 'GSTR-3B', dueOn: '2026-11-20', windowFrom: '2026-11-10' })!;
    expect(c.slaDays).toBe(10);
    expect(dueLevels(c, '2026-11-19')).toEqual([]);
    expect(dueLevels(c, '2026-11-20')).toEqual(['lead']);
    expect(dueLevels(c, '2026-11-30')).toEqual(['lead', 'manager']);
  });

  it('falls back to seven days before the due date', () => {
    const c = complianceClock({ itemKey: 'task:y', title: 'Payroll', dueOn: '2026-11-20', windowFrom: '2026-11-25' })!;
    expect(c.startedOn).toBe('2026-11-13');
    expect(c.slaDays).toBe(7);
  });
});
