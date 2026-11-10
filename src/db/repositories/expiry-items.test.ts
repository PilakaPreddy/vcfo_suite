import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Expiry items: staff read and write inside their engagement scope, clients only read their own,
 * and any other role gets nothing. Refusals happen before any write.
 */

type Call = { op: string; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    where: () => c,
    returning: () => c,
    onConflictDoNothing: () => c,
    onConflictDoUpdate: () => c,
    values: (v: unknown) => {
      call.values = v;
      return c;
    },
    set: (v: unknown) => {
      call.set = v;
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
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

vi.mock('@/db/client', () => ({ db: { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') } }));
const listScopedEngagementIds = vi.fn();
const assertEngagementAccess = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
}));
vi.mock('@/db/repositories/audit-events', () => ({ recordAuditEvent: vi.fn() }));

const repo = await import('./expiry-items');

const ENG_A = '11111111-1111-4111-8111-111111111111';
const ENG_B = '22222222-2222-4222-8222-222222222222';
const TODAY = '2026-11-09';

function ctx(role: AuthContext['role']): AuthContext {
  return { userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role, internId: role === 'intern' ? 'i-1' : undefined };
}

function itemRow(over: Record<string, unknown> = {}) {
  return {
    id: 'x-1',
    engagementId: ENG_A,
    subjectKind: 'person',
    subjectName: 'Ravi Kumar',
    kind: 'dsc',
    referenceLabel: null,
    expiresOn: '2026-11-14',
    source: 'checklist',
    sourceKey: 'dsc:ravi-kumar',
    renewedAt: null,
    renewedBy: null,
    notes: null,
    lastAlertStage: null,
    requestListId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  calls.length = 0;
  results = [];
  listScopedEngagementIds.mockReset().mockResolvedValue([ENG_A]);
  assertEngagementAccess.mockReset().mockImplementation(async (_c: AuthContext, id: string) =>
    id === ENG_A ? { ok: true, dbId: ENG_A, row: { id: ENG_A, companyName: 'Acme' } } : { ok: false, dbId: id, forbidden: true },
  );
});

describe('listExpiryItems', () => {
  it('returns the scoped items with their band', async () => {
    results = [[{ item: itemRow(), companyName: 'Acme' }]];
    const items = await repo.listExpiryItems(ctx('intern'), {}, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ subjectName: 'Ravi Kumar', daysLeft: 5, band: 'red', kindLabel: 'DSC', companyName: 'Acme' });
  });

  it("returns nothing for an engagement outside the caller's scope", async () => {
    expect(await repo.listExpiryItems(ctx('manager'), { engagementId: ENG_B }, TODAY)).toEqual([]);
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(0);
  });

  it('returns nothing for a role outside staff and clients, before any query', async () => {
    expect(await repo.listExpiryItems({ ...ctx('admin'), role: 'developer' as AuthContext['role'] }, {}, TODAY)).toEqual([]);
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
  });

  it('lets a client read its own engagement', async () => {
    results = [[{ item: itemRow(), companyName: 'Acme' }]];
    expect(await repo.listExpiryItems(ctx('client'), {}, TODAY)).toHaveLength(1);
  });
});

describe('writes', () => {
  it('refuses a client before any query', async () => {
    await expect(repo.upsertExpiryItem(ctx('client'), { engagementId: ENG_A, kind: 'dsc', subjectName: 'Ravi', expiresOn: '2027-03-12' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(repo.markRenewed(ctx('client'), 'x-1')).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls).toHaveLength(0);
  });

  it('refuses an engagement on another team and writes nothing', async () => {
    await expect(repo.upsertExpiryItem(ctx('intern'), { engagementId: ENG_B, kind: 'dsc', subjectName: 'Ravi', expiresOn: '2027-03-12' })).rejects.toMatchObject({ code: 'not_found' });
    results = [[itemRow({ engagementId: ENG_B })]];
    await expect(repo.markRenewed(ctx('intern'), 'x-1', {}, TODAY)).rejects.toMatchObject({ code: 'not_found' });
    expect(calls.some((c) => c.op === 'insert' || c.op === 'update')).toBe(false);
  });

  it('adds a manual item with a fresh source key and updates the matching one with a new date', async () => {
    results = [[], [itemRow({ source: 'manual' })]];
    const added = await repo.upsertExpiryItem(ctx('intern'), { engagementId: ENG_A, kind: 'dsc', subjectName: 'Asha Rao', expiresOn: '2027-03-12' }, TODAY);
    expect(added.previous).toBeNull();
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert?.values).toMatchObject({ engagementId: ENG_A, kind: 'dsc', subjectKind: 'person', source: 'manual' });

    calls.length = 0;
    results = [[itemRow()], [itemRow({ expiresOn: '2027-03-12', source: 'ask' })]];
    const updated = await repo.upsertExpiryItem(ctx('manager'), { engagementId: ENG_A, kind: 'dsc', subjectName: 'ravi  kumar', expiresOn: '2027-03-12', source: 'ask' }, TODAY);
    expect(updated.previous?.expiresOn).toBe('2026-11-14');
    expect(calls.find((c) => c.op === 'update')?.set).toMatchObject({ expiresOn: '2027-03-12', source: 'ask', lastAlertStage: null, renewedAt: null });
  });

  it('rolls DIR-3 KYC to next 30 September and closes a DSC without a new date', async () => {
    results = [[itemRow({ kind: 'dir3_kyc', expiresOn: '2026-09-30' })], [itemRow({ kind: 'dir3_kyc', expiresOn: '2027-09-30' })]];
    await repo.markRenewed(ctx('intern'), 'x-1', {}, TODAY);
    expect(calls.find((c) => c.op === 'update')?.set).toMatchObject({ expiresOn: '2027-09-30', lastAlertStage: null });

    calls.length = 0;
    results = [[itemRow()], [itemRow({ renewedAt: new Date() })]];
    const dsc = await repo.markRenewed(ctx('intern'), 'x-1', {}, TODAY);
    expect((calls.find((c) => c.op === 'update')?.set as Record<string, unknown>).renewedAt).toBeInstanceOf(Date);
    expect(dsc.band).toBe('green');
  });
});
