import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sessions contract in `currentContext` (G-25): a revoked `sid` gets no
 * context, a token without `sid` keeps working, and last seen is written for
 * the person and the device.
 */

let sessionUser: Record<string, unknown> | undefined;
vi.mock('./config', () => ({ auth: async () => (sessionUser ? { user: sessionUser } : null) }));

let profileRow: Record<string, unknown> | undefined;
const chain = {
  select: () => chain,
  from: () => chain,
  where: () => chain,
  limit: () => Promise.resolve(profileRow ? [profileRow] : []),
};
vi.mock('@/db/client', () => ({ db: { select: () => chain.select() } }));

const systemIsSessionActive = vi.fn();
const systemTouchLastSeen = vi.fn();
vi.mock('@/db/repositories/user-sessions', () => ({
  systemIsSessionActive: (...a: unknown[]) => systemIsSessionActive(...a),
  systemTouchLastSeen: (...a: unknown[]) => systemTouchLastSeen(...a),
}));

const { requireAuth, requireOwnAccount, requireAdmin, clearGuardLookups } = await import('./guards');

const ME = '11111111-1111-4111-8111-111111111111';
const SID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  clearGuardLookups();
  systemIsSessionActive.mockReset();
  systemTouchLastSeen.mockReset();
  sessionUser = { id: ME, email: 'me@sbc.in', role: 'admin', sid: SID };
  profileRow = { id: ME, email: 'me@sbc.in', name: 'Me', role: 'admin', internId: null, clientId: null, status: 'active' };
});

describe('currentContext sessions', () => {
  it('accepts an active device and carries its id', async () => {
    systemIsSessionActive.mockResolvedValue(true);
    const g = await requireAuth();
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.ctx.sessionId).toBe(SID);
    expect(systemIsSessionActive).toHaveBeenCalledWith(SID, ME);
    expect(systemTouchLastSeen).toHaveBeenCalledWith(ME, SID);
  });

  it('refuses a revoked device', async () => {
    systemIsSessionActive.mockResolvedValue(false);
    expect(await requireAuth()).toEqual({ ok: false, status: 401, error: 'Not authenticated' });
    expect(await requireAdmin()).toMatchObject({ ok: false, status: 401 });
    expect(systemTouchLastSeen).not.toHaveBeenCalled();
  });

  it('keeps a token from before devices were tracked working', async () => {
    sessionUser = { id: ME, email: 'me@sbc.in', role: 'admin' };
    const g = await requireAuth();
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.ctx.sessionId).toBeUndefined();
    expect(systemIsSessionActive).not.toHaveBeenCalled();
    expect(systemTouchLastSeen).toHaveBeenCalledWith(ME, undefined);
  });

  it('lets a developer reach their own account routes only', async () => {
    systemIsSessionActive.mockResolvedValue(true);
    profileRow = { ...profileRow, role: 'developer' };
    expect(await requireAuth()).toMatchObject({ ok: false, status: 401 });
    expect(await requireOwnAccount()).toMatchObject({ ok: true });
  });
});

describe('currentContext shared lookup', () => {
  it('ten calls at once read the profile and the session once', async () => {
    systemIsSessionActive.mockResolvedValue(true);
    const selects = vi.spyOn(chain, 'select');
    const all = await Promise.all(Array.from({ length: 10 }, () => requireAuth()));
    expect(all.every((g) => g.ok)).toBe(true);
    expect(selects).toHaveBeenCalledTimes(1);
    expect(systemIsSessionActive).toHaveBeenCalledTimes(1);
    selects.mockRestore();
  });

  it('a failed lookup is not kept', async () => {
    systemIsSessionActive.mockRejectedValueOnce(new Error('db down')).mockResolvedValue(true);
    await expect(requireAuth()).rejects.toThrow('db down');
    expect((await requireAuth()).ok).toBe(true);
  });
});
