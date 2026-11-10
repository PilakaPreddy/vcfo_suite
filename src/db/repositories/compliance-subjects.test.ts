import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant scoping for the migration 0029 compliance record parts: VCFO Assist runs, the
 * "From the client" and "Filled by SBC" inputs, and the registration applicability read.
 * Staff go through `assertEngagementAccess`; a client reads its own engagement; a developer
 * gets nothing; a foreign engagement or a subject key of another engagement reads as not
 * found and writes nothing; writes use the approved engagement id.
 */

type Call = { op: string; where?: SQL; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'orderBy', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c;
  c.where = (w: SQL) => {
    call.where = w;
    return c;
  };
  c.values = (v: unknown) => {
    call.values = v;
    return c;
  };
  c.set = (v: unknown) => {
    call.set = v;
    return c;
  };
  c.onConflictDoUpdate = () => c;
  c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej);
  return c;
}
const op = (name: string) => () => {
  const call: Call = { op: name };
  calls.push(call);
  return chain(call);
};
const db = { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete'), transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
vi.mock('@/db/client', () => ({ db }));
vi.mock('server-only', () => ({}));
vi.mock('@/storage/s3', () => ({ bucketKey: (b: string, p: string) => `${b}/${p}`, putObject: vi.fn(), getObjectBuffer: vi.fn() }));

const assertEngagementAccess = vi.fn();
const getMyEngagement = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
  getMyEngagement: (...a: unknown[]) => getMyEngagement(...a),
}));

const runs = await import('@/db/repositories/assist-runs');
const inputs = await import('@/db/repositories/compliance-inputs');
const applicability = await import('@/db/repositories/registration-applicability');
const dialect = new PgDialect();
const OWN = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';
const INSTANCE = '33333333-3333-3333-3333-333333333303';
const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role });
const paramsOf = (c: Call) => (c.where ? dialect.sqlToQuery(c.where).params : []);
const row = (over: Record<string, unknown> = {}) => ({ id: OWN, entityLegalForm: 'company', complianceQuestionnaire: {}, incorporationDate: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
});

describe('assist runs', () => {
  it('takes exactly the two SPICe+ run keys as registration subjects', async () => {
    const { subjectInEngagement } = await import('@/db/repositories/compliance-subject-scope');
    expect(await subjectInEngagement(OWN, 'registration', 'spice-part-a')).toBe(true);
    expect(await subjectInEngagement(OWN, 'registration', 'spice-part-b')).toBe(true);
    expect(await subjectInEngagement(OWN, 'registration', 'reg-4')).toBe(true);
    for (const key of ['spice-part-c', 'SPICE-PART-A', 'spice-part-a ', 'spice', 'reg-', 'reg-1234']) {
      expect(await subjectInEngagement(OWN, 'registration', key)).toBe(false);
    }
    // A SPICe+ key is no filing key: it does not get past the instance check.
    expect(await subjectInEngagement(OWN, 'filing', 'spice-part-a')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('gives a developer nothing before any query', async () => {
    expect(await runs.listAssistRuns(ctx('developer'), { engagementId: OWN })).toBeNull();
    expect(calls).toHaveLength(0);
    expect(assertEngagementAccess).not.toHaveBeenCalled();
  });

  it('refuses client writes before any query', async () => {
    await expect(runs.requestAssistRun(ctx('client'), { engagementId: OWN, subjectKind: 'registration', subjectKey: 'reg-4' })).rejects.toThrow(runs.AssistForbiddenError);
    await expect(runs.ingestAssistRun(ctx('client'), OWN, { subjectKind: 'registration', subjectKey: 'reg-4' })).rejects.toThrow(runs.AssistForbiddenError);
    expect(calls).toHaveLength(0);
  });

  it.each(['manager', 'intern'] as const)('reads and writes nothing on a foreign engagement (%s)', async (role) => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await runs.listAssistRuns(ctx(role), { engagementId: OTHER })).toBeNull();
    expect(await runs.requestAssistRun(ctx(role), { engagementId: OTHER, subjectKind: 'registration', subjectKey: 'reg-4' })).toBeNull();
    expect(await runs.ingestAssistRun(ctx(role), OTHER, { subjectKind: 'registration', subjectKey: 'reg-4', state: 'running' })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('lets a client read only its own engagement', async () => {
    getMyEngagement.mockResolvedValue({ id: OWN });
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row() });
    results = [[]];
    expect(await runs.listAssistRuns(ctx('client'), {})).toEqual([]);
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), OWN);
    expect(paramsOf(calls[0]!)).toContain(OWN);
  });

  it('refuses a filing key that is not an instance of the engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row() });
    results = [[]];
    expect(await runs.requestAssistRun(ctx('manager'), { engagementId: OWN, subjectKind: 'filing', subjectKey: INSTANCE })).toBeNull();
    expect(calls.map((c) => c.op)).toEqual(['select']);
    expect(paramsOf(calls[0]!)).toEqual(expect.arrayContaining([INSTANCE, OWN]));
  });

  it('refuses a run id of another engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row() });
    results = [[]];
    expect(await runs.ingestAssistRun(ctx('intern'), OWN, { runId: INSTANCE, state: 'done' })).toBeNull();
    expect(calls.every((c) => c.op === 'select')).toBe(true);
    expect(paramsOf(calls[0]!)).toEqual(expect.arrayContaining([INSTANCE, OWN]));
  });

  it('stores a requested run against the approved engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row() });
    const now = new Date('2026-10-30T05:00:00Z');
    results = [[], [{ id: INSTANCE, engagementId: OWN, subjectKind: 'registration', subjectKey: 'reg-4', form: 'GST REG-01', state: 'requested', steps: [], mismatches: [], startedAt: now, updatedAt: now }]];
    const run = await runs.requestAssistRun(ctx('admin'), { engagementId: 'acme', subjectKind: 'registration', subjectKey: 'reg-4', form: 'GST REG-01' });
    expect(run?.state).toBe('requested');
    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.values).toMatchObject({ engagementId: OWN, subjectKey: 'reg-4', state: 'requested' });
  });
});

describe('compliance inputs', () => {
  it('refuses a client writing SBC fields before any query', async () => {
    await expect(inputs.saveSubjectFields(ctx('client'), { kind: 'registration', key: 'reg-4', side: 'sbc', values: { number: 'X' } })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it.each(['manager', 'intern'] as const)('reads and writes nothing on a foreign engagement (%s)', async (role) => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await inputs.getSubjectInputs(ctx(role), { engagementId: OTHER, kind: 'registration', key: 'reg-4' })).toBeNull();
    expect(await inputs.saveSubjectFields(ctx(role), { engagementId: OTHER, kind: 'registration', key: 'reg-4', side: 'sbc', values: { number: 'X' } })).toBe(false);
    expect(await inputs.askSubjectDocument(ctx(role), { engagementId: OTHER, kind: 'registration', key: 'reg-4', label: 'Rent agreement' })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('does not review a request on a foreign engagement', async () => {
    results = [[{ id: INSTANCE, engagementId: OTHER, status: 'fulfilled' }]];
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await inputs.reviewSubjectDocument(ctx('manager'), { requestId: INSTANCE, action: 'accept' })).toBe(false);
    expect(calls.map((c) => c.op)).toEqual(['select']);
  });

  it('saves only known client fields, against the approved engagement', async () => {
    getMyEngagement.mockResolvedValue({ id: OWN });
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row() });
    expect(await inputs.saveSubjectFields(ctx('client'), { kind: 'registration', key: 'reg-4', side: 'client', values: { business: 'Software', bogus: 'x' } })).toBe(true);
    const inserts = calls.filter((c) => c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({ engagementId: OWN, fieldKey: 'business', side: 'client', value: 'Software' });
  });

  it('reads the documents of the subject inside the approved engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row() });
    results = [[{ id: INSTANCE, title: 'Rent agreement', status: 'fulfilled', createdAt: new Date(), askedBy: 'Asha', dueOn: null, note: null }], [], []];
    const out = await inputs.getSubjectInputs(ctx('intern'), { engagementId: OWN, kind: 'registration', key: 'reg-4' });
    expect(out?.docs[0]?.status).toBe('To review');
    expect(paramsOf(calls[0]!)).toContain(OWN);
    expect(paramsOf(calls[0]!)).not.toContain(OTHER);
  });
});

describe('registration applicability', () => {
  it('reads nothing on a foreign engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await applicability.getComplianceStarts(ctx('manager'), OTHER)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('uses the stored answers and trigger dates', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: row({ complianceQuestionnaire: { 'GST-01': true, 'EMP-03': false } }) });
    results = [[{ engagementId: OWN, gstRegistrationDate: '2026-08-12' }]];
    const out = await applicability.getComplianceStarts(ctx('admin'), OWN);
    expect(out?.byStep['reg-4']).toMatchObject({ applies: true, startsOn: '2026-08-12' });
    expect(out?.byStep['reg-4']?.starts.map((o) => o.id)).toEqual(['gst-gstr-1', 'gst-gstr-3b', 'gst-gstr-9']);
    expect(out?.byStep['reg-1']?.applies).toBe(false);
    expect(out?.upcoming.some((o) => o.id === 'labour-pf-payment')).toBe(false);
    expect(out?.upcoming.find((o) => o.id === 'gst-gstr-3b')?.startedBy?.stepId).toBe('reg-4');
    expect(paramsOf(calls[0]!)).toContain(OWN);
  });
});
