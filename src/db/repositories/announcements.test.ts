import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/auth/guards';

/**
 * Announcements are firm-wide news: every signed-in role may read; only
 * super_admin / admin / manager may post, delete, or manage feed sources.
 * Refusals happen before any query. The author on a post is the session user.
 * (`system*` helpers are job-only with no AuthContext — not tested here.)
 */

type Call = { op: string; values?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    where: () => c,
    returning: () => c,
    values: (v: unknown) => {
      call.values = v;
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}
function op(name: string) {
  return () => {
    const call: Call = { op: name };
    calls.push(call);
    return chain(call);
  };
}

vi.mock('@/db/client', () => ({
  db: { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') },
}));

const repo = await import('@/db/repositories/announcements');

const ALL: AuthContext['role'][] = ['super_admin', 'admin', 'manager', 'intern', 'client'];
const WRITERS = ['super_admin', 'admin', 'manager'] as const;
const READERS_ONLY = ['intern', 'client'] as const;

function ctx(role: AuthContext['role']): AuthContext {
  return { userId: `user-${role}`, email: `${role}@vcfo.local`, name: `Name ${role}`, role };
}

function announcementRow(authorId: string, authorRole: string) {
  return {
    id: 'an-1',
    title: 'T',
    body: 'B',
    kind: 'general',
    origin: 'manual',
    sourceId: null,
    sourceUrl: null,
    authorId,
    authorName: 'x',
    authorRole,
    publishedAt: new Date(),
    createdAt: new Date(),
  };
}

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe('read — every role', () => {
  it.each(ALL)('%s can list announcements and the board head', async (role) => {
    results = [[{ announcement: announcementRow('u', 'admin'), sourceName: null }]];
    expect(await repo.listAnnouncements(ctx(role))).toHaveLength(1);
    results = [[], [{ n: 0 }]];
    expect(await repo.getAnnouncementBoardHead(ctx(role))).toEqual({
      latestId: null,
      latestCreatedAt: null,
      latestUpdatedAt: null,
      count: 0,
    });
  });
});

describe('write — staff with post rights only', () => {
  it.each(READERS_ONLY)('%s cannot post, delete, or manage sources', async (role) => {
    const c = ctx(role);
    await expect(repo.createAnnouncement(c, { body: 'hi' })).rejects.toThrow('not permitted');
    await expect(repo.deleteAnnouncement(c, 'an-1')).rejects.toThrow('not permitted');
    await expect(repo.listAnnouncementSources(c)).rejects.toThrow('not permitted');
    await expect(
      repo.createAnnouncementSource(c, { name: 'x', feedUrl: 'https://example.com/rss' }),
    ).rejects.toThrow('not permitted');
    await expect(repo.deleteAnnouncementSource(c, 's-1')).rejects.toThrow('not permitted');
    await expect(repo.getAnnouncementSourceForWrite(c, 's-1')).rejects.toThrow('not permitted');
    expect(calls).toHaveLength(0);
  });

  it.each(WRITERS)('%s posts as itself', async (role) => {
    results = [[announcementRow(`user-${role}`, role)]];
    await repo.createAnnouncement(ctx(role), { body: 'Office closed Friday' });
    const v = calls[0]!.values as { authorId: string; authorRole: string; authorName: string };
    expect(v.authorId).toBe(`user-${role}`);
    expect(v.authorRole).toBe(role);
    expect(v.authorName).toBe(`Name ${role}`);
  });

  it.each(WRITERS)('%s may delete and list sources', async (role) => {
    results = [[{ id: 'an-1' }], []];
    expect(await repo.deleteAnnouncement(ctx(role), 'an-1')).toBe(true);
    expect(await repo.listAnnouncementSources(ctx(role))).toEqual([]);
  });
});
