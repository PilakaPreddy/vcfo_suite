import { describe, expect, it } from 'vitest';
import { workPart } from './intern-work';

describe('workPart', () => {
  it('names the part a step belongs to from its catalogue id', () => {
    expect(workPart({ source: 'step', catalogId: 'pre-7' })).toBe('Incorporation');
    expect(workPart({ source: 'step', catalogId: 'post-3' })).toBe('Post-incorporation');
    expect(workPart({ source: 'step', catalogId: 'reg-4' })).toBe('Registration');
  });

  it('names filings, requests and tasks', () => {
    expect(workPart({ source: 'filing' })).toBe('Compliance');
    expect(workPart({ source: 'request' })).toBe('Documents');
    expect(workPart({ source: 'task' })).toBe('Task');
  });
});
