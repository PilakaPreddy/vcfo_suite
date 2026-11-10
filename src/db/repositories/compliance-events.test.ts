import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Scoping for compliance events: admins see every event, a manager or lead the events on
 * engagements in scope, a client none. Record-change proposals keep one row per watched value and
 * kind, and are withdrawn when the value goes back to its baseline.
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
    set: (s: unknown) => ((call.set = s), c),
    where: (w: SQL) => ((call.where = w), c),
    values: (v: unknown) => ((call.values = v), c),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}
const op = (name: string) => () => {
  const call: Call = { op: name };
  calls.push(call);
  return chain(call);
};

vi.mock('@/db/client', () => ({ db: { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') } }));
const listScopedEngagementIds = vi.fn();
const assertEngagementAccess = vi.fn();
const createNotificationsForUsers = vi.fn();
const engagementLeadProfileId = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
}));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (...a: unknown[]) => createNotificationsForUsers(...a) }));
vi.mock('@/db/repositories/compliance-tasks/shared', () => ({ engagementLeadProfileId: (...a: unknown[]) => engagementLeadProfileId(...a) }));

const repo = await import('./compliance-events');
const dialect = new PgDialect();

const OWN = '11111111-1111-4111-8111-111111111101';
const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role });
const ENG_ROW = { id: OWN, slug: 'acme', companyName: 'Acme', internId: 'i-1', managerId: 'user-manager', adminId: null };
const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'ev-1',
  engagementId: OWN,
  kind: 'registered_office_changed',
  occurredOn: '2026-11-10',
  details: { address: 'New', baseline: 'Old' },
  source: 'record_change',
  sourceKey: 'pre-14:address:registered_office_changed',
  status: 'proposed',
  taskId: null,
  taskKind: null,
  requestListId: null,
  dueOn: null,
  createdBy: null,
  confirmedBy: null,
  confirmedAt: null,
  createdAt: new Date('2026-11-10T05:00:00Z'),
  updatedAt: new Date('2026-11-10T05:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
  assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: ENG_ROW });
  engagementLeadProfileId.mockResolvedValue('user-lead');
});

describe('listComplianceEvents', () => {
  it('gives a client nothing and reads nothing', async () => {
    expect(await repo.listComplianceEvents(ctx('client'))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('limits a lead to engagements in scope, and stops when there are none', async () => {
    listScopedEngagementIds.mockResolvedValue([]);
    expect(await repo.listComplianceEvents(ctx('intern'))).toEqual([]);
    expect(calls).toHaveLength(0);
    listScopedEngagementIds.mockResolvedValue([OWN]);
    results = [[{ event: eventRow(), companyName: 'Acme', slug: 'acme', createdByName: null }]];
    const out = await repo.listComplianceEvents(ctx('intern'));
    expect(out[0]).toMatchObject({ form: 'INC-22', dueOn: '2026-12-10', details: { address: 'New' } });
    expect(out[0]!.details).not.toHaveProperty('baseline');
    expect(dialect.sqlToQuery(calls[0]!.where!).params).toContain(OWN);
  });

  it('does not scope an admin', async () => {
    results = [[]];
    await repo.listComplianceEvents(ctx('admin'));
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
  });
});

describe('staff writes', () => {
  it('refuses a client', async () => {
    await expect(repo.setComplianceEventStatus(ctx('client'), 'ev-1', 'dismissed')).rejects.toThrow(/Clients/);
  });

  it('will not mark a proposal filed', async () => {
    results = [[eventRow()]];
    await expect(repo.setComplianceEventStatus(ctx('manager'), 'ev-1', 'done')).rejects.toThrow(/cannot move/);
  });

  it('confirms only a proposal that is still open', async () => {
    results = [[]];
    await expect(
      repo.recordComplianceEvent(ctx('intern'), {
        engagementId: OWN,
        kind: 'director_resigned',
        occurredOn: '2026-11-09',
        details: {},
        source: 'record_change',
        dueOn: '2026-12-09',
        taskId: null,
        taskKind: null,
        requestListId: null,
        eventId: 'ev-1',
      }),
    ).rejects.toThrow(/already confirmed/);
  });
});

describe('syncRecordChangeProposals', () => {
  it('inserts a new proposal and tells the lead', async () => {
    results = [[], [eventRow()], [{ role: 'intern' }]];
    const out = await repo.syncRecordChangeProposals(ctx('client'), { engagementId: OWN, watchKey: 'pre-14:address', before: 'Old', after: 'New', occurredOn: '2026-11-10' });
    expect(out).toHaveLength(1);
    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.values).toMatchObject({ status: 'proposed', source: 'record_change', createdBy: null, details: { baseline: 'Old', address: 'New' } });
    expect(createNotificationsForUsers).toHaveBeenCalledWith([expect.objectContaining({ userId: 'user-lead', href: '/app/intern/compliances/events' })]);
  });

  it('updates the open proposal on the next autosave instead of adding one', async () => {
    results = [[eventRow()]];
    const out = await repo.syncRecordChangeProposals(ctx('intern'), { engagementId: OWN, watchKey: 'pre-14:address', before: 'New', after: 'Newer', occurredOn: '2026-11-10' });
    expect(out).toEqual([]);
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    expect(calls.find((c) => c.op === 'update')!.set).toMatchObject({ details: { address: 'Newer', baseline: 'Old' } });
  });

  it('withdraws the proposal when the value goes back to the baseline', async () => {
    results = [[eventRow()]];
    await repo.syncRecordChangeProposals(ctx('intern'), { engagementId: OWN, watchKey: 'pre-14:address', before: 'New', after: 'old', occurredOn: '2026-11-10' });
    expect(calls.find((c) => c.op === 'update')!.set).toMatchObject({ status: 'dismissed' });
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });

  it('proposes nothing on an engagement the person cannot reach', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OWN, forbidden: true });
    expect(await repo.syncRecordChangeProposals(ctx('client'), { engagementId: OWN, watchKey: 'pre-14:address', before: 'Old', after: 'New', occurredOn: '2026-11-10' })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
