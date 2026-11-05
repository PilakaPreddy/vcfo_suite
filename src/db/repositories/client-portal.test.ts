import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/auth/guards';

/**
 * Client portal shell: a client always gets the own engagement, whatever id it names; staff get
 * the shell of an engagement they name only when it passes `assertEngagementAccess`, and then
 * without the client's inbox, preferences or team photos.
 */

let results: unknown[][] = [];
function chain(): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    where: () => c,
    limit: () => c,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}

vi.mock('server-only', () => ({}));
vi.mock('@/db/client', () => ({ db: { select: () => chain() } }));

const getMyEngagement = vi.fn();
const assertEngagementAccess = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  getMyEngagement: (...a: unknown[]) => getMyEngagement(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
  checklistStateFromRow: () => ({}),
  checklistStateForViewer: (_ctx: unknown, s: unknown) => s,
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({
  resolveEngagementRecipients: async () => ({ managers: [{ userId: 'pm-1', name: 'Anita', email: 'anita@sbc.in' }], leads: [] }),
}));
const getNotificationInboxHead = vi.fn(async () => ({ unreadCount: 7 }));
vi.mock('@/db/repositories/notifications', () => ({ getNotificationInboxHead: (...a: unknown[]) => getNotificationInboxHead(...(a as [])) }));

const { getClientPortalShell } = await import('@/db/repositories/client-portal');

const OWN = '11111111-1111-1111-1111-111111111101';
function ctx(role: AuthContext['role']): AuthContext {
  return { userId: 'me', email: `${role}@vcfo.local`, name: role, role };
}

beforeEach(() => {
  vi.clearAllMocks();
  results = [];
  getMyEngagement.mockResolvedValue({ id: 'own-slug' });
  assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: { id: OWN, companyName: 'Northwind Analytics Private Limited', incorporationDate: null } });
});

describe('getClientPortalShell', () => {
  it('a client gets the own engagement and ignores a named one', async () => {
    // Requests count, prefs row, staff phones, me.
    results = [[{ n: 0 }], [], [{ id: 'pm-1', avatarKey: 'k/photo.png' }], [{ name: 'Asha' }]];
    const shell = await getClientPortalShell(ctx('client'), 'other-slug');
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'own-slug');
    expect(shell?.viewer).toBe('client');
    expect(shell?.badges.notifications).toBe(7);
    expect(shell?.team[0]?.avatarUrl).toContain('/api/client/portal/team-photo/pm-1');
  });

  it.each(['admin', 'manager', 'intern'] as const)('%s without a named engagement gets null and no check', async (role) => {
    expect(await getClientPortalShell(ctx(role))).toBeNull();
    expect(assertEngagementAccess).not.toHaveBeenCalled();
  });

  it.each(['admin', 'manager', 'intern'] as const)('%s without access to the named engagement gets null', async (role) => {
    assertEngagementAccess.mockResolvedValue({ ok: false });
    expect(await getClientPortalShell(ctx(role), 'other-slug')).toBeNull();
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'other-slug');
    expect(getMyEngagement).not.toHaveBeenCalled();
  });

  it('staff with access get the staff shell without the client inbox, prefs or photos', async () => {
    results = [[{ n: 2 }], [{ id: 'pm-1', avatarKey: 'k/photo.png' }], [{ name: 'Anita' }]];
    const shell = await getClientPortalShell(ctx('manager'), 'own-slug');
    expect(getMyEngagement).not.toHaveBeenCalled();
    expect(getNotificationInboxHead).not.toHaveBeenCalled();
    expect(shell?.viewer).toBe('staff');
    expect(shell?.companyName).toBe('Northwind Analytics Private Limited');
    expect(shell?.badges.notifications).toBe(0);
    expect(shell?.team[0]?.avatarUrl).toBeUndefined();
  });
});
