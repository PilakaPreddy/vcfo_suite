import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/auth/guards';

/**
 * Labour registers follow the engagement scope. Staff read and write through it, a client reads
 * only, and an attested document can never be changed. The cross-tenant cases assert that
 * another firm's batch reads as nothing and writes nothing at all.
 */

type Call = { op: string; values?: unknown; set?: unknown };
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
    onConflictDoUpdate: () => c,
    values: (v: unknown) => {
      call.values = v;
      return c;
    },
    set: (v: unknown) => {
      call.set = v;
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

/** The engagement scope is the thing under test's dependency, so it is stubbed, not reimplemented. */
const access = vi.fn();
const scopedIds = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  assertEngagementAccess: (...args: unknown[]) => access(...args),
  listScopedEngagementIds: (...args: unknown[]) => scopedIds(...args),
}));

const repo = await import('@/db/repositories/labour-registers');

function ctx(role: AuthContext['role']): AuthContext {
  return {
    role,
    userId: role === 'client' ? 'client-user' : 'staff-user',
    internId: role === 'intern' ? 'intern-1' : undefined,
    clientId: role === 'client' ? 'client-1' : undefined,
  } as AuthContext;
}

const OURS = 'eng-ours';
const THEIRS = 'eng-theirs';

function allow(dbId = OURS) {
  access.mockResolvedValue({ ok: true, dbId, row: { id: dbId } });
}
function deny() {
  access.mockResolvedValue({ ok: false, dbId: THEIRS, forbidden: true });
}

beforeEach(() => {
  calls.length = 0;
  results = [];
  access.mockReset();
  scopedIds.mockReset();
});

describe('reads are scoped to the engagement', () => {
  it('returns nothing for another firm\'s engagement and runs no query', async () => {
    deny();
    expect(await repo.listBatches(ctx('manager'), { engagementId: THEIRS })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns nothing, and queries nothing, when a role has no engagements at all', async () => {
    scopedIds.mockResolvedValue([]);
    expect(await repo.listBatches(ctx('intern'))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('lets a firm-wide admin list every batch', async () => {
    results = [[{ id: 'b1' }]];
    expect(await repo.listBatches(ctx('super_admin'))).toEqual([{ id: 'b1' }]);
    expect(calls.map((c) => c.op)).toEqual(['select']);
  });

  it('hides a batch whose engagement the caller cannot reach', async () => {
    results = [[{ id: 'b1', engagementId: THEIRS }]];
    deny();
    expect(await repo.getBatch(ctx('manager'), 'b1')).toBeNull();
  });

  it('hides another firm\'s documents', async () => {
    results = [[{ id: 'b1', engagementId: THEIRS }]];
    deny();
    expect(await repo.listDocuments(ctx('client'), 'b1')).toEqual([]);
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(1);
  });

  it('misses the cache rather than leaking across tenants', async () => {
    results = [[{ id: 'b1', engagementId: THEIRS }]];
    deny();
    expect(await repo.findByCacheKey(ctx('manager'), 'b1', 'tg-se-xxiii', 'abc')).toBeNull();
  });
});

describe('writes are staff-only', () => {
  it('refuses a client before touching the database', async () => {
    allow();
    await expect(
      repo.openBatch(ctx('client'), { engagementId: OURS, stateCode: 'TG', periodFrom: '2026-09-01', periodTo: '2026-09-30' }),
    ).rejects.toThrow('not permitted');
    expect(calls).toHaveLength(0);
  });

  it('refuses a client a column map', async () => {
    allow();
    await expect(
      repo.saveColumnMap(ctx('client'), { engagementId: OURS, slot: 'paysheet', mapping: {}, lastHeaders: [] }),
    ).rejects.toThrow('not permitted');
    expect(calls).toHaveLength(0);
  });

  it('writes nothing for another firm\'s engagement', async () => {
    deny();
    expect(
      await repo.openBatch(ctx('manager'), { engagementId: THEIRS, stateCode: 'TG', periodFrom: '2026-09-01', periodTo: '2026-09-30' }),
    ).toBeNull();
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('writes against the id the scope resolved, not the one the caller sent', async () => {
    allow(OURS);
    results = [[], [{ id: 'b-new' }]];
    await repo.openBatch(ctx('manager'), { engagementId: 'e1-legacy-alias', stateCode: 'TG', periodFrom: '2026-09-01', periodTo: '2026-09-30' });
    const insert = calls.find((c) => c.op === 'insert');
    expect((insert?.values as { engagementId: string }).engagementId).toBe(OURS);
  });

  it('joins an existing batch instead of forking the month', async () => {
    allow();
    results = [[{ id: 'b-existing' }]];
    const row = await repo.openBatch(ctx('intern'), { engagementId: OURS, stateCode: 'TG', periodFrom: '2026-09-01', periodTo: '2026-09-30' });
    expect(row).toEqual({ id: 'b-existing' });
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('rejects a checklist head the catalogue does not know', async () => {
    allow();
    await expect(
      repo.setChecklistHead(ctx('manager'), { engagementId: OURS, headId: 'made-up-head' }),
    ).rejects.toThrow('unknown checklist head');
    expect(calls).toHaveLength(0);
  });

  it('refuses a tick for another firm\'s batch', async () => {
    results = [[{ id: 'b1', engagementId: THEIRS }]];
    deny();
    expect(await repo.setTick(ctx('manager'), { batchId: 'b1', headId: 'overtime', state: 'received' })).toBeNull();
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });
});

describe('the standing checklist', () => {
  it('falls back to the catalogue defaults for a client with no rows yet', async () => {
    allow();
    results = [[]];
    const heads = await repo.activeHeads(ctx('manager'), OURS);
    expect(heads).toContain('attendance-lop');
    expect(heads).toContain('overtime');
  });

  it('returns only the heads a client actually runs once they are set', async () => {
    allow();
    results = [[{ headId: 'overtime', active: true }, { headId: 'esi', active: false }]];
    expect(await repo.activeHeads(ctx('manager'), OURS)).toEqual(['overtime']);
  });

  it('gives a client no heads at all', async () => {
    deny();
    expect(await repo.activeHeads(ctx('client'), THEIRS)).toEqual([]);
  });
});

describe('attestation freezes a document', () => {
  it('is refused to a manager and an intern', async () => {
    allow();
    await expect(repo.attestDocument(ctx('manager'), { documentId: 'd1', method: 'dsc' })).rejects.toThrow('not permitted');
    await expect(repo.attestDocument(ctx('intern'), { documentId: 'd1', method: 'dsc' })).rejects.toThrow('not permitted');
    expect(calls).toHaveLength(0);
  });

  it('refuses to attest a document twice, so a correction has to supersede instead', async () => {
    results = [[{ id: 'd1', batchId: 'b1', attestedAt: new Date('2026-10-02') }], [{ id: 'b1', engagementId: OURS }]];
    allow();
    await expect(repo.attestDocument(ctx('admin'), { documentId: 'd1', method: 'dsc' })).rejects.toThrow('already attested');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('attests an unattested document for a firm-wide admin', async () => {
    results = [[{ id: 'd1', batchId: 'b1', attestedAt: null }], [{ id: 'b1', engagementId: OURS }], [{ id: 'd1', status: 'attested' }]];
    allow();
    const row = await repo.attestDocument(ctx('admin'), { documentId: 'd1', method: 'printed-wet-signature' });
    expect(row).toEqual({ id: 'd1', status: 'attested' });
    const update = calls.find((c) => c.op === 'update');
    expect((update?.set as { status: string }).status).toBe('attested');
  });

  it('does not attest another firm\'s document', async () => {
    results = [[{ id: 'd1', batchId: 'b1', attestedAt: null }], [{ id: 'b1', engagementId: THEIRS }]];
    deny();
    expect(await repo.attestDocument(ctx('admin'), { documentId: 'd1', method: 'dsc' })).toBeNull();
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});

describe('there is no delete path', () => {
  it('exports nothing that deletes a register', () => {
    const names = Object.keys(repo).filter((k) => /delete|remove|purge|destroy/i.test(k));
    expect(names).toEqual([]);
  });
});

describe('the monthly close', () => {
  it('refuses to lock without the accuracy confirmation', async () => {
    allow();
    await expect(
      repo.markReady(ctx('manager'), { batchId: 'b1', accuracyConfirmed: false, readiness: {} }),
    ).rejects.toThrow('accuracy confirmation');
    expect(calls).toHaveLength(0);
  });

  it('refuses a client the close entirely', async () => {
    allow();
    await expect(
      repo.markReady(ctx('client'), { batchId: 'b1', accuracyConfirmed: true, readiness: {} }),
    ).rejects.toThrow('not permitted');
    expect(calls).toHaveLength(0);
  });

  it('stores the readiness summary the preparer was shown', async () => {
    results = [[{ id: 'b1', engagementId: OURS, markedReadyAt: null, reopenCount: 0 }], [{ id: 'b1', status: 'ready' }]];
    allow();
    await repo.markReady(ctx('manager'), {
      batchId: 'b1',
      accuracyConfirmed: true,
      readiness: { employees: 422, employeesShort: 2 },
    });
    const set = calls.find((c) => c.op === 'update')?.set as Record<string, unknown>;
    expect(set.status).toBe('ready');
    expect(set.accuracyConfirmed).toBe(true);
    expect(set.readinessSnapshot).toEqual({ employees: 422, employeesShort: 2 });
    expect(set.markedReadyBy).toBe('staff-user');
  });

  it('refuses to lock a period that is already locked', async () => {
    results = [[{ id: 'b1', engagementId: OURS, markedReadyAt: new Date('2026-11-03'), reopenCount: 0 }]];
    allow();
    await expect(
      repo.markReady(ctx('manager'), { batchId: 'b1', accuracyConfirmed: true, readiness: {} }),
    ).rejects.toThrow('already marked ready');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('does not lock another firm\'s period', async () => {
    results = [[{ id: 'b1', engagementId: THEIRS, markedReadyAt: null, reopenCount: 0 }]];
    deny();
    expect(await repo.markReady(ctx('manager'), { batchId: 'b1', accuracyConfirmed: true, readiness: {} })).toBeNull();
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});

describe('reopening a locked period', () => {
  it('requires a reason', async () => {
    allow();
    await expect(repo.reopenInputs(ctx('manager'), { batchId: 'b1', reason: '   ' })).rejects.toThrow('reason is required');
    expect(calls).toHaveLength(0);
  });

  it('records who reopened it, why, and counts it', async () => {
    results = [[{ id: 'b1', engagementId: OURS, markedReadyAt: new Date('2026-11-03'), reopenCount: 1 }], [{ id: 'b1' }]];
    allow();
    await repo.reopenInputs(ctx('manager'), { batchId: 'b1', reason: 'HR sent a corrected attendance sheet' });
    const set = calls.find((c) => c.op === 'update')?.set as Record<string, unknown>;
    expect(set.status).toBe('open');
    expect(set.markedReadyAt).toBeNull();
    expect(set.reopenReason).toBe('HR sent a corrected attendance sheet');
    expect(set.reopenCount).toBe(2);
  });

  it('leaves an unlocked period alone', async () => {
    const batch = { id: 'b1', engagementId: OURS, markedReadyAt: null, reopenCount: 0 };
    results = [[batch]];
    allow();
    expect(await repo.reopenInputs(ctx('manager'), { batchId: 'b1', reason: 'x' })).toEqual(batch);
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});

describe('generation follows the close', () => {
  it('refuses to record a document before the period is locked', async () => {
    results = [[{ id: 'b1', engagementId: OURS, markedReadyAt: null }]];
    allow();
    await expect(
      repo.recordDocument(ctx('manager'), {
        batchId: 'b1', formId: 'tg-se-xxiii', cacheKey: 'k', objectKey: 'o', artifactSha256: 's',
        byteLength: 10, templateVersion: 'v1', generatorRevision: 'r', manifest: {}, retainUntil: '2031',
      }),
    ).rejects.toThrow('mark the inputs ready');
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });
});

describe('provenance', () => {
  it('reports who locked it, when it was built and how much came from storage', async () => {
    results = [
      [{ id: 'b1', engagementId: OURS, periodFrom: '2026-09-01', periodTo: '2026-09-30', status: 'generated',
         markedReadyAt: new Date('2026-11-03T09:00:00Z'), markedReadyBy: 'u1', reopenCount: 0, reopenReason: '' }],
      [{ id: 'd1', generatedAt: new Date('2026-11-03T14:05:00Z'), downloadCount: 3 },
       { id: 'd2', generatedAt: new Date('2026-11-03T14:04:00Z'), downloadCount: 0 }],
      [{ name: 'Krishna' }],
    ];
    allow();
    const p = await repo.batchProvenance(ctx('manager'), 'b1');
    expect(p?.markedReadyByName).toBe('Krishna');
    expect(p?.registers).toBe(2);
    expect(p?.fromStorage).toBe(1);
    expect(p?.generatedAt).toBe('2026-11-03T14:05:00.000Z');
  });

  it('gives a client nothing for another firm\'s batch', async () => {
    results = [[{ id: 'b1', engagementId: THEIRS }]];
    deny();
    expect(await repo.batchProvenance(ctx('client'), 'b1')).toBeNull();
  });
});
