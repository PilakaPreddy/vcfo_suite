import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant scoping for VCFO Assist agent runs and recipe patches:
 *   super_admin / admin — every run; manager / intern — runs on engagements in their scope;
 *   client / developer — nothing, before any query.
 * One run is reached through its engagement (`assertEngagementAccess`); a foreign run reads as
 * null and takes no write. Patches: admins and managers list and review the whole queue; a lead
 * lists only their own proposals and cannot review.
 */

type Call = { op: string; where?: SQL; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    returning: () => c,
    set: (s: unknown) => {
      call.set = s;
      return c;
    },
    where: (w: SQL) => {
      call.where = w;
      return c;
    },
    values: (v: unknown) => {
      call.values = v;
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

vi.mock('@/db/client', () => ({
  db: { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') },
}));

const listScopedEngagementIds = vi.fn();
const assertEngagementAccess = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
}));

const runs = await import('@/db/repositories/assist-agent-runs');
const patches = await import('@/db/repositories/assist-patches');

const dialect = new PgDialect();
const OWN = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';
const RUN = '33333333-3333-3333-3333-333333333303';

function ctx(role: AuthContext['role'], userId = `user-${role}`): AuthContext {
  return { userId, email: `${role}@vcfo.local`, name: role, role };
}

function runRow(engagementId: string, over: Record<string, unknown> = {}) {
  return {
    id: RUN,
    engagementId,
    userId: 'user-intern',
    agent: 'incorporation',
    subAgent: 'spice-a',
    recipeId: 'spice-a',
    recipeVersion: '1.0.0',
    status: 'running',
    state: 'FILL',
    fieldsTotal: 9,
    fieldsFilled: 3,
    heals: [],
    refusals: [],
    aiCalls: 0,
    aiTokens: 0,
    srn: null,
    error: null,
    startedAt: new Date(),
    finishedAt: null,
    updatedAt: new Date(),
    ...over,
  };
}

const allow = (dbId: string) => ({ ok: true, dbId, row: { id: dbId, companyName: 'Acme Pvt Ltd' } });
const deny = (dbId: string) => ({ ok: false, dbId, forbidden: true });
const writes = () => calls.filter((c) => c.op !== 'select');
const NEW_RUN = { agent: 'incorporation', subAgent: 'spice-a', recipeId: 'spice-a', recipeVersion: '1.0.0' };

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
  listScopedEngagementIds.mockResolvedValue([OWN]);
  assertEngagementAccess.mockImplementation(async (_ctx: AuthContext, id: string) => (id === OTHER ? deny(OTHER) : allow(OWN)));
});

describe('staff only', () => {
  it.each(['client', 'developer', 'partner'] as const)('%s is refused before any query', async (role) => {
    await expect(runs.listRecentAgentRuns(ctx(role))).rejects.toMatchObject({ status: 403 });
    await expect(runs.createAgentRun(ctx(role), OWN, NEW_RUN)).rejects.toMatchObject({ status: 403 });
    await expect(runs.getAgentRun(ctx(role), RUN)).rejects.toMatchObject({ status: 403 });
    await expect(patches.listPatches(ctx(role))).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
    expect(assertEngagementAccess).not.toHaveBeenCalled();
  });
});

describe('listRecentAgentRuns', () => {
  it.each(['admin', 'super_admin'] as const)('%s lists firm-wide without a scope lookup', async (role) => {
    results = [[]];
    await runs.listRecentAgentRuns(ctx(role));
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.sql).not.toContain('in (');
  });

  it.each(['manager', 'intern'] as const)('%s only sees runs on scoped engagements', async (role) => {
    results = [[]];
    await runs.listRecentAgentRuns(ctx(role));
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.sql).toContain('"assist_agent_runs"."engagement_id" in');
    expect(q.sql).toContain('"engagements"."deleted_at" is null');
    expect(q.params).toEqual([OWN]);
    expect(q.params).not.toContain(OTHER);
  });

  it.each(['manager', 'intern'] as const)('%s with no engagements gets [] and no query', async (role) => {
    listScopedEngagementIds.mockResolvedValue([]);
    expect(await runs.listRecentAgentRuns(ctx(role))).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('one engagement', () => {
  it.each(['manager', 'intern'] as const)('%s cannot create or list on another firm’s engagement', async (role) => {
    expect(await runs.createAgentRun(ctx(role), OTHER, NEW_RUN)).toBeNull();
    expect(await runs.listAgentRuns(ctx(role), OTHER)).toBeNull();
    expect(writes()).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('creates against the approved engagement id and the session user', async () => {
    results = [[runRow(OWN)]];
    const run = await runs.createAgentRun(ctx('intern'), 'acme-slug', NEW_RUN);
    expect(run?.companyName).toBe('Acme Pvt Ltd');
    const insert = writes()[0]!;
    expect(insert.op).toBe('insert');
    expect(insert.values).toMatchObject({ engagementId: OWN, userId: 'user-intern', status: 'running' });
  });

  it('lists one engagement filtered by its id only', async () => {
    results = [[]];
    await runs.listAgentRuns(ctx('manager'), OWN);
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.params).toEqual([OWN]);
  });
});

describe('getAgentRun / updateAgentRun', () => {
  it.each(['manager', 'intern'] as const)('%s reads a foreign run as null', async (role) => {
    results = [[runRow(OTHER)]];
    expect(await runs.getAgentRun(ctx(role), RUN)).toBeNull();
    expect(assertEngagementAccess).toHaveBeenCalledWith(ctx(role), OTHER);
  });

  it.each(['manager', 'intern'] as const)('%s cannot update a foreign run', async (role) => {
    results = [[runRow(OTHER)]];
    await expect(runs.updateAgentRun(ctx(role), OTHER, RUN, { fieldsFilled: 9 })).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('refuses a run moved under another engagement URL', async () => {
    results = [[runRow(OWN)]];
    assertEngagementAccess.mockImplementation(async (_c: AuthContext, id: string) => (id === OWN ? allow(OWN) : allow('44444444-4444-4444-4444-444444444404')));
    await expect(runs.updateAgentRun(ctx('admin'), 'elsewhere', RUN, { fieldsFilled: 9 })).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('a lead cannot change another lead’s run; a manager in scope can', async () => {
    results = [[runRow(OWN, { userId: 'someone-else' })]];
    await expect(runs.updateAgentRun(ctx('intern'), OWN, RUN, { fieldsFilled: 9 })).rejects.toMatchObject({ status: 403 });
    expect(writes()).toHaveLength(0);
    results = [[runRow(OWN, { userId: 'someone-else' })], [runRow(OWN, { fieldsFilled: 9 })]];
    const { run } = await runs.updateAgentRun(ctx('manager'), OWN, RUN, { fieldsFilled: 9 });
    expect(run.fieldsFilled).toBe(9);
  });

  it('a closed run takes no more changes', async () => {
    results = [[runRow(OWN, { userId: 'user-intern', status: 'done' })]];
    await expect(runs.updateAgentRun(ctx('intern'), OWN, RUN, { state: 'FILL' })).rejects.toMatchObject({ status: 409 });
    expect(writes()).toHaveLength(0);
  });

  it('a finish stamps finishedAt and reports finished', async () => {
    results = [[runRow(OWN)], [runRow(OWN, { status: 'done', srn: 'AA1234567', finishedAt: new Date() })]];
    const { finished } = await runs.updateAgentRun(ctx('intern'), OWN, RUN, { status: 'done', srn: 'AA1234567' });
    expect(finished).toBe(true);
    expect(writes()[0]!.set).toMatchObject({ status: 'done', srn: 'AA1234567', finishedAt: expect.any(Date) });
  });

  it('returns the engagement uuid when the URL names the engagement by its slug', async () => {
    results = [[runRow(OWN)], [runRow(OWN, { status: 'done', srn: 'AA1234567', finishedAt: new Date() })]];
    const { engagementDbId } = await runs.updateAgentRun(ctx('intern'), 'acme-labs', RUN, { status: 'done', srn: 'AA1234567' });
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'acme-labs');
    expect(engagementDbId).toBe(OWN);
  });

  it('meters AI use only on a reachable run', async () => {
    results = [[runRow(OTHER)]];
    await runs.addAgentRunAiUsage(ctx('intern'), RUN, { calls: 1, tokens: 900 });
    expect(writes()).toHaveLength(0);
    results = [[runRow(OWN, { aiCalls: runs.ASSIST_AGENT_RUN_MAX_AI_CALLS })]];
    expect(await runs.canSpendOnAgentRun(ctx('intern'), RUN)).toBe(false);
  });
});

describe('recipe patches', () => {
  const proposal = {
    recipeId: 'spice-a',
    recipeVersion: '1.0.0',
    fieldKey: 'company.type',
    proposed: { som: 'x[0]' },
    evidence: { fieldLabel: 'Type of company' },
    sourceTier: 'T3' as const,
  };
  const patchRow = (over: Record<string, unknown> = {}) => ({ id: 'p1', ...proposal, runId: null, proposedBy: 'user-intern', status: 'proposed', reviewedBy: null, reviewedAt: null, createdAt: new Date(), ...over });

  it('a lead lists only their own proposals', async () => {
    results = [[]];
    await patches.listPatches(ctx('intern'));
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.sql).toContain('"assist_recipe_patches"."proposed_by" =');
    expect(q.params).toContain('user-intern');
  });

  it.each(['admin', 'super_admin', 'manager'] as const)('%s lists the whole queue', async (role) => {
    results = [[]];
    await patches.listPatches(ctx(role));
    expect(calls[0]!.where).toBeUndefined();
  });

  it('refuses a proposal on a run out of reach and writes nothing', async () => {
    results = [[{ id: RUN, engagementId: OTHER }]];
    await expect(patches.proposePatch(ctx('intern'), { ...proposal, runId: RUN })).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('records the proposer from the session', async () => {
    results = [[patchRow()]];
    await patches.proposePatch(ctx('intern'), proposal);
    expect(writes()[0]!.values).toMatchObject({ proposedBy: 'user-intern', status: 'proposed' });
  });

  it('a lead cannot review', async () => {
    await expect(patches.reviewPatch(ctx('intern'), 'p1', 'approved')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it.each(['admin', 'super_admin', 'manager'] as const)('%s reviews only a proposed patch', async (role) => {
    results = [[patchRow({ status: 'approved', reviewedBy: `user-${role}` })]];
    const saved = await patches.reviewPatch(ctx(role), 'p1', 'approved');
    expect(saved.status).toBe('approved');
    const q = dialect.sqlToQuery(writes()[0]!.where!);
    expect(q.sql).toContain('"assist_recipe_patches"."status" =');
    expect(q.params).toContain('proposed');
  });

  it('a second decision gets already_decided', async () => {
    results = [[], [{ id: 'p1' }]];
    await expect(patches.reviewPatch(ctx('manager'), 'p1', 'rejected')).rejects.toMatchObject({ status: 409, message: 'already_decided' });
  });
});
