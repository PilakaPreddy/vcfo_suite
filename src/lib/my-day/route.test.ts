// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRole, AuthContext } from '@/auth/guards';

/**
 * GET /api/my-day: staff only, and the plan is gathered with the caller's own context, so the
 * scoped repositories decide what each person sees.
 */

let caller: AuthContext | null = null;
const allowed: AppRole[][] = [];
vi.mock('@/auth/guards', () => ({
  requireAnyRole: async (...roles: AppRole[]) => {
    allowed.push(roles);
    if (!caller) return { ok: false, status: 401, error: 'Unauthorized' };
    if (!roles.includes(caller.role)) return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true, ctx: caller };
  },
}));
const gatherMyDay = vi.fn();
vi.mock('@/lib/my-day/gather', () => ({ gatherMyDay: (...a: unknown[]) => gatherMyDay(...a) }));

const { GET } = await import('../../../app/api/my-day/route');

const item = (id: string, kind: string) => ({ id, kind, title: id, engagementId: 'e', companyName: 'C', href: '/x', weight: 0, score: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  allowed.length = 0;
  gatherMyDay.mockResolvedValue([item('a', 'overdue'), item('b', 'task'), item('c', 'task')]);
});

describe('GET /api/my-day', () => {
  it('refuses a client and a signed-out caller before reading anything', async () => {
    caller = { userId: 'c1', email: 'c@x.test', name: 'Client', role: 'client', clientId: 'cl-1' };
    expect((await GET(new Request('http://x/api/my-day'))).status).toBe(403);
    caller = null;
    expect((await GET(new Request('http://x/api/my-day'))).status).toBe(401);
    expect(gatherMyDay).not.toHaveBeenCalled();
    expect(allowed[0]).toEqual(['super_admin', 'admin', 'manager', 'intern']);
  });

  it('gathers with the caller’s own context and caps the list, keeping the totals', async () => {
    caller = { userId: 'l1', email: 'l@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };
    const res = await GET(new Request('http://x/api/my-day?limit=2'));
    expect(res.status).toBe(200);
    expect(gatherMyDay.mock.calls[0]![0]).toBe(caller);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.counts).toMatchObject({ overdue: 1, task: 2 });
  });
});
