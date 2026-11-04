import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';

/**
 * Client team (Team page): a client sees the people of the own engagement only,
 * with their designation (C-888) read for exactly those people; staff read an
 * engagement they name only when it passes the access check; another tenant's
 * engagement reads as not found.
 */

type Call = { op: string; where?: SQL; set?: Record<string, unknown> };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    innerJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    returning: () => c,
    values: () => c,
    set: (s: Record<string, unknown>) => {
      call.set = s;
      return c;
    },
    where: (w: SQL) => {
      call.where = w;
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}

vi.mock('server-only', () => ({}));
vi.mock('@/db/client', () => {
  const op = (name: string) => () => {
    const call: Call = { op: name };
    calls.push(call);
    return chain(call);
  };
  return { db: { select: op('select'), update: op('update'), insert: op('insert') } };
});

const getMyEngagement = vi.fn();
const assertEngagementAccess = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  getMyEngagement: (...a: unknown[]) => getMyEngagement(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
}));
const listEngagementClients = vi.fn();
const isPrimaryClient = vi.fn();
vi.mock('@/db/repositories/engagement-clients', () => ({
  listEngagementClients: (...a: unknown[]) => listEngagementClients(...a),
  isPrimaryClient: (...a: unknown[]) => isPrimaryClient(...a),
  inviteEngagementClient: vi.fn(),
}));
vi.mock('@/db/repositories/audit-events', () => ({ recordAuditEvent: vi.fn() }));

const { getClientTeam, createClientInvite, cancelClientInvite, systemSetInvitePassword, systemPeekInviteToken, hashSetPasswordToken } = await import('@/db/repositories/client-team');

const dialect = new PgDialect();
const OWN = '11111111-1111-1111-1111-111111111101';
const ME = '33333333-3333-3333-3333-333333333303';
const MATE = '44444444-4444-4444-4444-444444444404';
const STRANGER = '55555555-5555-5555-5555-555555555505';

function ctx(role: AuthContext['role']): AuthContext {
  return { userId: ME, email: `${role}@vcfo.local`, name: role, role, clientId: role === 'client' ? 'c1' : undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
  getMyEngagement.mockResolvedValue({ id: 'own-slug' });
  assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: { clientUserId: ME, companyName: 'Northwind' } });
  isPrimaryClient.mockResolvedValue(true);
  listEngagementClients.mockResolvedValue([
    { userId: ME, name: 'Asha Rao', email: 'asha@nw.in', memberRole: 'owner', createdAt: '2026-09-02T00:00:00Z' },
    { userId: MATE, name: 'Ravi K', email: 'ravi@nw.in', memberRole: 'member', createdAt: '2026-09-10T00:00:00Z' },
  ]);
});

describe('getClientTeam — designation scope', () => {
  it.each(['admin', 'manager', 'intern'] as const)('%s without an engagement gets 404 and no query', async (role) => {
    await expect(getClientTeam(ctx(role))).rejects.toMatchObject({ status: 404 });
    expect(assertEngagementAccess).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it.each(['admin', 'manager', 'intern'] as const)('%s without access to the named engagement gets 404 and no query', async (role) => {
    assertEngagementAccess.mockResolvedValue({ ok: false });
    await expect(getClientTeam(ctx(role), 'other-slug')).rejects.toMatchObject({ status: 404 });
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'other-slug');
    expect(listEngagementClients).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('staff with access read the named engagement and are never Primary', async () => {
    results = [[], []];
    const view = await getClientTeam(ctx('manager'), 'own-slug');
    expect(getMyEngagement).not.toHaveBeenCalled();
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'own-slug');
    expect(listEngagementClients).toHaveBeenCalledWith(expect.anything(), OWN);
    expect(isPrimaryClient).not.toHaveBeenCalled();
    expect(view.isPrimary).toBe(false);
  });

  it.each(['admin', 'manager', 'intern'] as const)('%s cannot invite or cancel, even with access', async (role) => {
    await expect(createClientInvite(ctx(role), { name: 'X', email: 'x@nw.in', tempPassword: 'a-good-password' })).rejects.toMatchObject({ status: 403 });
    await expect(cancelClientInvite(ctx(role), '66666666-6666-6666-6666-666666666606')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it('a client cannot name another engagement', async () => {
    results = [[], []];
    await getClientTeam(ctx('client'), 'other-slug');
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'own-slug');
  });

  it('another tenant’s engagement reads as 404', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false });
    await expect(getClientTeam(ctx('client'))).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('reads designations for the own engagement’s people only', async () => {
    results = [[], [{ id: ME, designation: 'Director' }, { id: MATE, designation: null }]];
    const view = await getClientTeam(ctx('client'));
    expect(view.people.map((p) => [p.name, p.designation])).toEqual([
      ['Asha Rao', 'Director'],
      ['Ravi K', null],
    ]);
    const q = dialect.sqlToQuery(calls[1]!.where!);
    expect(q.sql).toContain('"profiles"."id" in');
    expect(q.params).toEqual([ME, MATE]);
    expect(q.params).not.toContain(STRANGER);
    expect(listEngagementClients).toHaveBeenCalledWith(expect.anything(), OWN);
  });
});

describe('set-password link (C-899)', () => {
  const TOKEN = 'a'.repeat(43);
  const pending = { inv: { id: 'inv-1', profileId: MATE, tempPasswordHash: 'temp' }, hash: 'temp', email: 'mate@client.test', company: 'Northwind' };

  it('looks the invite up by the token hash only, pending and unexpired', async () => {
    results = [[pending]];
    expect(await systemPeekInviteToken(TOKEN)).toEqual({ email: 'mate@client.test', companyName: 'Northwind' });
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.params).toContain(hashSetPasswordToken(TOKEN));
    expect(q.params).not.toContain(TOKEN);
    expect(q.sql).toContain('"client_invites"."revoked_at" is null');
    expect(q.sql).toContain('"client_invites"."set_password_expires_at" >');
  });

  it('sets the password once and clears the link', async () => {
    results = [[pending], [], []];
    expect((await systemSetInvitePassword(TOKEN, 'a-good-password')).status).toBe('ok');
    const upd = calls.filter((c) => c.op === 'update');
    expect(upd[0]!.set).toHaveProperty('passwordHash');
    expect(upd[1]!.set).toMatchObject({ setPasswordTokenHash: null, setPasswordExpiresAt: null });
  });

  it('refuses a bad token, a short password, and an invite whose password was already chosen', async () => {
    expect((await systemSetInvitePassword('short', 'a-good-password')).status).toBe('invalid');
    expect((await systemSetInvitePassword(TOKEN, 'short')).status).toBe('too_short');
    results = [[{ ...pending, hash: 'chosen-already' }]];
    expect((await systemSetInvitePassword(TOKEN, 'a-good-password')).status).toBe('invalid');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});
