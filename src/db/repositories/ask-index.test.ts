import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant rules for record cards (the database-backed version, across real rows, is in
 * tests/ask/evals/knowledge-db.test.ts): a person's scope is applied in the WHERE of every search,
 * another client's engagement id never appears, and a client never asks for staff cards.
 */

const ENG_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ENG_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const scoped = vi.fn<(ctx: AuthContext) => Promise<string[]>>();
let lastWhere: SQL | undefined;
const select = vi.fn(() => {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    where: (w: SQL) => {
      lastWhere = w;
      return c;
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve([]).then(res),
  };
  return c;
});
vi.mock('@/db/client', () => ({ db: { select: () => select() } }));
vi.mock('@/db/repositories/engagements', () => ({ listScopedEngagementIds: (ctx: AuthContext) => scoped(ctx) }));

const { searchIndexItems } = await import('@/db/repositories/ask-index');
const { AskForbiddenError } = await import('@/lib/ask/access');

const who = (role: AuthContext['role'], userId = `user-${role}`): AuthContext => ({ userId, email: 'x@x.test', name: 'X', role });
const params = () => new PgDialect().sqlToQuery(lastWhere!).params;

beforeEach(() => {
  vi.clearAllMocks();
  lastWhere = undefined;
});

describe('searchIndexItems', () => {
  it('refuses a developer before any query runs', async () => {
    await expect(searchIndexItems(who('developer'), { query: 'x', persona: 'staff', limit: 4 })).rejects.toBeInstanceOf(AskForbiddenError);
    expect(select).not.toHaveBeenCalled();
    expect(scoped).not.toHaveBeenCalled();
  });

  it('a client is held to their own projects and to client cards, whatever persona is asked for', async () => {
    scoped.mockResolvedValue([ENG_A]);
    await searchIndexItems(who('client'), { query: 'gst', persona: 'staff', limit: 4 });
    expect(params()).toContain(ENG_A);
    expect(params()).not.toContain(ENG_B);
    expect(params()).toEqual(expect.arrayContaining(['client', 'both']));
    expect(params()).not.toContain('staff');
  });

  it('naming a project outside the scope does not reach it', async () => {
    scoped.mockResolvedValue([ENG_A]);
    await searchIndexItems(who('client'), { query: 'gst', persona: 'client', limit: 4, engagementId: ENG_B });
    expect(params()).not.toContain(ENG_B);
    expect(params()).not.toContain(ENG_A);
  });

  it.each(['manager', 'intern'] as const)('a %s with no projects sees only firm-wide cards', async (role) => {
    scoped.mockResolvedValue([]);
    await searchIndexItems(who(role), { query: 'gst', persona: 'staff', limit: 4 });
    expect(new PgDialect().sqlToQuery(lastWhere!).sql).toContain('false');
  });

  it.each(['admin', 'super_admin'] as const)('a %s reads across projects without a scope lookup', async (role) => {
    await searchIndexItems(who(role), { query: 'gst', persona: 'staff', limit: 4 });
    expect(scoped).not.toHaveBeenCalled();
    expect(params()).toContain('staff');
  });

  it('an empty question makes no query', async () => {
    expect(await searchIndexItems(who('admin'), { query: '  ', persona: 'staff', limit: 4 })).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('hands private owner cards only to their owner', async () => {
    scoped.mockResolvedValue([ENG_A]);
    await searchIndexItems(who('manager', 'owner-1'), { query: 'gst', persona: 'staff', limit: 4 });
    expect(params()).toContain('owner-1');
  });
});
