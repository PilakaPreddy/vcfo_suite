import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/** Cross-tenant rules for review cards: who reads one, and that a summary never holds a raw value. */

const owner: AuthContext = { userId: 'lead-a', email: 'a@x.test', name: 'A', role: 'intern' };
const otherLead: AuthContext = { userId: 'lead-b', email: 'b@x.test', name: 'B', role: 'intern' };
const manager: AuthContext = { userId: 'mgr', email: 'm@x.test', name: 'M', role: 'manager' };
const client: AuthContext = { userId: 'cli', email: 'c@x.test', name: 'C', role: 'client' };
const developer: AuthContext = { userId: 'dev', email: 'd@x.test', name: 'D', role: 'developer' };

let changesets: unknown[] = [];
let rows: unknown[] = [];
const select = vi.fn(() => {
  let table = 'cs';
  const chain: Record<string, unknown> = {
    from: (t: { __name?: string }) => {
      table = t.__name ?? 'cs';
      return chain;
    },
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (res: (v: unknown) => unknown) => Promise.resolve(table === 'rows' ? rows : changesets).then(res),
  };
  return chain;
});
vi.mock('@/db/client', () => ({ db: { select: () => select() } }));
vi.mock('@/db/schema-ask', () => ({
  askChangesets: { __name: 'cs', id: {}, status: {}, contentHash: {}, expiresAt: {} },
  askChangesetRows: { __name: 'rows', changesetId: {}, ordinal: {}, id: {} },
}));
vi.mock('drizzle-orm', async (load) => ({ ...(await load<object>()), eq: () => ({}), and: () => ({}), asc: () => ({}), gt: () => ({}), inArray: () => ({}) }));
const access = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({ assertEngagementAccess: (...a: unknown[]) => access(...a) }));

const { getAskChangesetForDecision, getAskChangesetSummary, updateAskChangesetRows } = await import('./ask-changesets');
const { AskForbiddenError } = await import('@/lib/ask/access');

const reachable = { ok: true, dbId: 'eng-a', row: { companyName: 'Acme' } };
const unreachable = { ok: false, dbId: 'eng-a', forbidden: true };

beforeEach(() => {
  vi.clearAllMocks();
  changesets = [{ id: 'cs', profileId: 'lead-a', engagementId: 'eng-a', status: 'proposed' }];
  rows = [{ id: 'r', target: { stepId: 'pre-15' }, oldValue: 'OLDPAN', newValue: 'NEWPAN', undoData: { previous: 'OLDPAN' }, displayOld: 'XXXX', displayNew: 'XXXX' }];
  access.mockResolvedValue(reachable);
});

describe('getAskChangesetForDecision', () => {
  it('gives the person it was prepared for their card', async () => {
    expect(await getAskChangesetForDecision(owner, 'cs')).toMatchObject({ owner: true, manager: false, viewerId: 'lead-a' });
  });

  it('hides a card from its owner once they lose the engagement', async () => {
    access.mockResolvedValue(unreachable);
    expect(await getAskChangesetForDecision(owner, 'cs')).toBeNull();
  });

  it('hides it from another lead on the same engagement', async () => {
    expect(await getAskChangesetForDecision(otherLead, 'cs')).toBeNull();
  });

  it('hides it from another client company\'s staff, whatever the id', async () => {
    access.mockResolvedValue(unreachable);
    expect(await getAskChangesetForDecision(otherLead, 'cs')).toBeNull();
    expect(await getAskChangesetForDecision(manager, 'cs')).toBeNull();
  });

  it('shows a manager only a card holding a row that needs a manager', async () => {
    expect(await getAskChangesetForDecision(manager, 'cs')).toBeNull();
    rows = [{ id: 'r', target: { stepId: 'pre-2', needsManager: true } }];
    expect(await getAskChangesetForDecision(manager, 'cs')).toMatchObject({ owner: false, manager: true });
  });

  it('never shows a client a staff card, and refuses a developer before any query', async () => {
    expect(await getAskChangesetForDecision(client, 'cs')).toBeNull();
    await expect(getAskChangesetForDecision(developer, 'cs')).rejects.toBeInstanceOf(AskForbiddenError);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

describe('getAskChangesetSummary', () => {
  it('carries no raw value', async () => {
    const summary = await getAskChangesetSummary(owner, 'cs');
    const text = JSON.stringify(summary);
    expect(text).not.toContain('OLDPAN');
    expect(text).not.toContain('NEWPAN');
    expect(summary!.rows[0]).toMatchObject({ displayOld: 'XXXX', displayNew: 'XXXX' });
  });
});

describe('writes', () => {
  it('refuse access read for someone else', async () => {
    const found = (await getAskChangesetForDecision(owner, 'cs'))!;
    await expect(updateAskChangesetRows(otherLead, found, [])).rejects.toBeInstanceOf(AskForbiddenError);
  });
});
