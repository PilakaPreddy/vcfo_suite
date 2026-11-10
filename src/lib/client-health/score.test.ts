import { describe, expect, it } from 'vitest';
import { bandDrop, bandForScore, computeHealth, healthTooltipLines, needsPartnerCheckIn, type HealthInputs } from './score';

const calm: HealthInputs = {
  oldestRequestDays: null,
  daysSinceClientActivity: 2,
  overdueCompliances: 0,
  openNotices: 0,
  lateReceivables: null,
  stuck: 'on_track',
};

describe('computeHealth', () => {
  it('gives a calm client 100 and Good', () => {
    const h = computeHealth(calm);
    expect(h.score).toBe(100);
    expect(h.band).toBe('good');
    expect(h.signals.penalties).toHaveLength(6);
  });

  it('takes points off past each allowance and stops at each cap', () => {
    const h = computeHealth({ ...calm, oldestRequestDays: 10, daysSinceClientActivity: 100, overdueCompliances: 10, openNotices: 1, stuck: 'blocked' });
    const pts = Object.fromEntries(h.signals.penalties.map((p) => [p.key, p.points]));
    expect(pts).toEqual({ request: 3, silence: 15, overdue: 32, notices: 6, receivables: 0, stuck: 15 });
    expect(h.score).toBe(100 - 71);
    expect(h.band).toBe('critical');
  });

  it('leaves out a signal it could not read', () => {
    const h = computeHealth({ ...calm, openNotices: null, daysSinceClientActivity: null });
    expect(h.score).toBe(100);
    expect(h.signals.penalties.find((p) => p.key === 'notices')?.counted).toBe(false);
    expect(h.signals.penalties.find((p) => p.key === 'silence')?.counted).toBe(false);
  });

  it('never goes below zero', () => {
    const h = computeHealth({ oldestRequestDays: 400, daysSinceClientActivity: 400, overdueCompliances: 99, openNotices: 99, lateReceivables: 99, stuck: 'blocked' });
    // The caps add up to 115, so the floor matters.
    expect(h.score).toBe(0);
    expect(h.band).toBe('critical');
  });
});

describe('bands', () => {
  it('maps scores to bands at 80, 60 and 40', () => {
    expect(bandForScore(80)).toBe('good');
    expect(bandForScore(79)).toBe('watch');
    expect(bandForScore(60)).toBe('watch');
    expect(bandForScore(59)).toBe('at_risk');
    expect(bandForScore(40)).toBe('at_risk');
    expect(bandForScore(39)).toBe('critical');
  });

  it('opens a partner check-in only on a fall of two bands or more', () => {
    expect(needsPartnerCheckIn(null, 'critical')).toBe(false);
    expect(needsPartnerCheckIn('good', 'watch')).toBe(false);
    expect(needsPartnerCheckIn('good', 'at_risk')).toBe(true);
    expect(needsPartnerCheckIn('watch', 'critical')).toBe(true);
    expect(needsPartnerCheckIn('critical', 'good')).toBe(false);
    expect(bandDrop('critical', 'good')).toBe(-3);
  });

  it('writes the tooltip with the points', () => {
    const h = computeHealth({ ...calm, overdueCompliances: 2 });
    const lines = healthTooltipLines(h.score, h.signals);
    expect(lines[0]).toBe('Score 84 of 100');
    expect(lines).toContain('2 overdue compliances (-16, at most 32)');
  });
});
