import { describe, expect, it } from 'vitest';
import { historyGroup } from './history-group';

describe('historyGroup', () => {
  const now = new Date(2026, 10, 2, 15, 0);
  it('groups by local calendar day', () => {
    expect(historyGroup(new Date(2026, 10, 2, 0, 5).toISOString(), now)).toBe('Today');
    expect(historyGroup(new Date(2026, 10, 1, 23, 50).toISOString(), now)).toBe('Yesterday');
    expect(historyGroup(new Date(2026, 9, 27).toISOString(), now)).toBe('Previous 7 days');
    expect(historyGroup(new Date(2026, 9, 10).toISOString(), now)).toBe('Previous 30 days');
    expect(historyGroup(new Date(2026, 5, 1).toISOString(), now)).toBe('Older');
  });
  it('treats a bad date as Older and a future one as Today', () => {
    expect(historyGroup('not a date', now)).toBe('Older');
    expect(historyGroup(new Date(2026, 10, 3).toISOString(), now)).toBe('Today');
  });
});
