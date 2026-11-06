import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/** A run belongs to its person, and no stored trace holds an identity number. */

let lastWhere: SQL | undefined;
let inserted: unknown;
const chain = () => {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    groupBy: () => c,
    orderBy: () => c,
    limit: () => c,
    set: (v: unknown) => {
      inserted = v;
      return c;
    },
    returning: () => c,
    values: (v: unknown) => {
      inserted = v;
      return c;
    },
    where: (w: SQL) => {
      lastWhere = w;
      return c;
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve([{ id: 'r', last: 1 }]).then(res),
  };
  return c;
};
vi.mock('@/db/client', () => ({ db: { select: chain, update: chain, insert: chain } }));
const access = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({ assertEngagementAccess: (...a: unknown[]) => access(...a) }));

const { appendAskRunStep, createAskRun, findWaitingAskRun, lockAskRun, updateAskRun } = await import('./ask-runs');
const { AskForbiddenError } = await import('@/lib/ask/access');

const me: AuthContext = { userId: 'me', email: 'x@x.test', name: 'X', role: 'intern' };
const params = () => new PgDialect().sqlToQuery(lastWhere!).params;

beforeEach(() => {
  vi.clearAllMocks();
  lastWhere = undefined;
  inserted = undefined;
});

describe('ask runs', () => {
  it('masks the goal and every step', async () => {
    await createAskRun(me, { conversationId: null, workflow: 'data_router', goal: 'Add PAN ABCDE1234F', budgetTokens: 10 });
    expect(JSON.stringify(inserted)).not.toContain('ABCDE1234F');
    await appendAskRunStep(me, 'r', { kind: 'tool', name: 'read', output: { note: 'PAN ABCDE1234F' } });
    expect(JSON.stringify(inserted)).not.toContain('ABCDE1234F');
    await updateAskRun(me, 'r', { status: 'waiting_reply', state: { instruction: 'PAN ABCDE1234F' } });
    expect(JSON.stringify(inserted)).not.toContain('ABCDE1234F');
  });

  it('scopes every read and write to the person', async () => {
    await findWaitingAskRun(me, 'c', new Date());
    expect(params()).toContain('me');
    await updateAskRun(me, 'r', { status: 'done' });
    expect(params()).toContain('me');
  });

  it('refuses to lock a run to an engagement the person cannot reach', async () => {
    access.mockResolvedValue({ ok: false, dbId: 'e', forbidden: true });
    await expect(lockAskRun(me, 'r', 'e')).rejects.toBeInstanceOf(AskForbiddenError);
    expect(lastWhere).toBeUndefined();
  });
});
