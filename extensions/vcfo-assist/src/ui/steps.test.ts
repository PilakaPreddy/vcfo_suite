import { describe, expect, it } from 'vitest';
import { estimateCostUsd, stepStatus } from './steps';
import type { Run } from '../shared/types';

const run = (state: Run['state'], moves: string[] = []): Run =>
  ({ state, log: moves.map((text) => ({ t: 0, kind: 'transition', text })) }) as unknown as Run;

describe('run checklist', () => {
  it('marks done, current and todo steps', () => {
    const r = run('WAIT_DSC');
    expect(stepStatus(r, 'FILL')).toBe('done');
    expect(stepStatus(r, 'WAIT_DSC')).toBe('current');
    expect(stepStatus(r, 'ATTACH')).toBe('todo');
  });
  it('marks the step a run failed in', () => {
    const r = run('FAILED', ['READY → PULL_PROFILE', 'PULL_PROFILE → WAIT_LOGIN', 'WAIT_LOGIN → FAILED (x)']);
    expect(stepStatus(r, 'WAIT_LOGIN')).toBe('failed');
    expect(stepStatus(r, 'PULL_PROFILE')).toBe('done');
  });
  it('marks everything done at DONE', () => {
    expect(stepStatus(run('DONE'), 'WRITE_BACK')).toBe('done');
  });
  it('prices tokens', () => {
    expect(estimateCostUsd(0)).toBe(0);
    expect(estimateCostUsd(1_000_000)).toBeCloseTo(1.4);
  });
});
