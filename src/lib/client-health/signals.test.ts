import { describe, expect, it } from 'vitest';
import { healthInputsFrom } from './signals';

const now = new Date('2026-11-10T06:00:00Z');

describe('healthInputsFrom', () => {
  it('turns raw counts into score inputs', () => {
    const i = healthInputsFrom({
      raw: {
        oldestRequestAt: new Date('2026-10-31T06:00:00Z'),
        lastClientMessageAt: '2026-11-01T06:00:00Z',
        lastClientUploadAt: new Date('2026-11-05T06:00:00Z'),
        overdueInstances: 1,
        overdueTasks: 2,
        overdueEvents: 1,
        openNotices: 2,
      },
      engagement: { stage: 'Operational Readiness', createdAt: '2026-01-01T00:00:00Z' },
      checklistState: {},
      noticesAvailable: true,
      now,
    });
    expect(i).toEqual({ oldestRequestDays: 10, daysSinceClientActivity: 5, overdueCompliances: 4, openNotices: 2, lateReceivables: null, stuck: null });
  });

  it('counts silence from the start for a client who never replied, after a week', () => {
    const base = { raw: undefined, checklistState: {}, noticesAvailable: false, now };
    expect(healthInputsFrom({ ...base, engagement: { stage: 'Operational Readiness', createdAt: '2026-11-01T06:00:00Z' } }).daysSinceClientActivity).toBe(9);
    expect(healthInputsFrom({ ...base, engagement: { stage: 'Operational Readiness', createdAt: '2026-11-08T06:00:00Z' } }).daysSinceClientActivity).toBeNull();
    expect(healthInputsFrom({ ...base, engagement: { stage: 'Operational Readiness', createdAt: '2026-11-08T06:00:00Z' } }).openNotices).toBeNull();
  });

  it('reads the stuck reason while incorporating', () => {
    const i = healthInputsFrom({ raw: undefined, engagement: { stage: 'Pre-Incorporation', createdAt: now }, checklistState: {}, noticesAvailable: true, now });
    expect(i.stuck).toBe('waiting_lead');
    expect(i.openNotices).toBe(0);
  });
});
