import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

const gatherMyDay = vi.fn();
vi.mock('@/lib/my-day/gather', () => ({ gatherMyDay: (...a: unknown[]) => gatherMyDay(...a) }));
vi.mock('./staff-areas', () => ({}));

const { GET_MY_DAY_TOOL } = await import('./my-day');

const ctx: AuthContext = { userId: 'l1', email: 'l@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };
const data = { engagements: [], filings: [], now: new Date('2026-11-10T04:00:00Z') };
const row = (id: string, kind: string) => ({ id, kind, title: id, engagementId: 'acme', companyName: 'Acme', href: '/x', weight: 0, score: 0 });

describe('getMyDay', () => {
  it('reads with the caller’s context and the turn’s staff data, and returns the ranked top rows', async () => {
    gatherMyDay.mockResolvedValue([row('a', 'overdue'), row('b', 'task'), row('c', 'task')]);
    const out = (await GET_MY_DAY_TOOL.run({ ctx, data }, { limit: 2 })) as { count: number; top: Array<{ rank: number; kind: string }> };
    expect(gatherMyDay).toHaveBeenCalledWith(ctx, { data, now: data.now });
    expect(out.count).toBe(3);
    expect(out.top.map((t) => [t.rank, t.kind])).toEqual([
      [1, 'Overdue'],
      [2, 'Task'],
    ]);
  });

  it('answers not_available when the read fails', async () => {
    gatherMyDay.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await GET_MY_DAY_TOOL.run({ ctx, data }, {})).toEqual({ error: 'not_available' });
    warn.mockRestore();
  });
});
