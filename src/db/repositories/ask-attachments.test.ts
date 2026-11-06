import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/** A chat file belongs to the person who gave it: no role widens that, and clients have none yet. */

let lastWhere: SQL | undefined;
const chain = () => {
  const c: Record<string, unknown> = {
    from: () => c,
    where: (w: SQL) => {
      lastWhere = w;
      return c;
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve([]).then(res),
  };
  return c;
};
const select = vi.fn(chain);
vi.mock('@/db/client', () => ({ db: { select: () => select(), update: () => ({ set: () => chain() }) } }));

const { getOwnAskAttachments, updateOwnAskAttachment, createAskAttachment } = await import('./ask-attachments');
const { AskForbiddenError } = await import('@/lib/ask/access');

const who = (role: AuthContext['role'], userId = `user-${role}`): AuthContext => ({ userId, email: 'x@x.test', name: 'X', role });
const params = () => new PgDialect().sqlToQuery(lastWhere!).params;

beforeEach(() => {
  vi.clearAllMocks();
  lastWhere = undefined;
});

describe('ask attachments', () => {
  it('reads only the caller\'s own rows, even for a firm admin', async () => {
    await getOwnAskAttachments(who('super_admin', 'me'), ['a0000000-0000-4000-8000-000000000001']);
    expect(params()).toContain('me');
  });

  it('updates only the caller\'s own rows', async () => {
    await updateOwnAskAttachment(who('intern', 'me'), 'a0000000-0000-4000-8000-000000000001', { status: 'read' });
    expect(params()).toContain('me');
  });

  it('refuses clients and developers before any query', async () => {
    for (const role of ['client', 'developer'] as const) {
      await expect(getOwnAskAttachments(who(role), ['x'])).rejects.toBeInstanceOf(AskForbiddenError);
      await expect(createAskAttachment(who(role), { kind: 'file', fileName: 'a', contentType: null, sizeBytes: 1, s3Key: 'k' })).rejects.toBeInstanceOf(AskForbiddenError);
    }
    expect(select).not.toHaveBeenCalled();
  });

  it('makes no query for an empty list', async () => {
    expect(await getOwnAskAttachments(who('manager'), [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
