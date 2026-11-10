import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Scoping for request lists:
 *   super_admin / admin — every list;
 *   manager / intern    — lists on engagements in scope;
 *   client              — its own sent lists only (never drafts or cancelled), answers only.
 * Sending creates one document request per document item through `createDocumentRequest`.
 */

type Call = { op: string; where?: SQL; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
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
const createDocumentRequest = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
}));
vi.mock('@/db/repositories/document-requests', () => ({ createDocumentRequest: (...a: unknown[]) => createDocumentRequest(...a) }));
vi.mock('@/lib/ask/index-cards/queue', () => ({ queueIndexRefresh: vi.fn() }));

const repo = await import('./request-lists');
const dialect = new PgDialect();

const OWN = '11111111-1111-4111-8111-111111111101';
const OTHER = '22222222-2222-4222-8222-222222222202';
const LIST = '33333333-3333-4333-8333-333333333303';
const ITEM = '44444444-4444-4444-8444-444444444404';

const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role });
const listRow = (over: Record<string, unknown> = {}) => ({
  id: LIST,
  engagementId: OWN,
  templateId: 'gst-monthly',
  title: 'GST monthly data · Oct 2026',
  periodLabel: 'Oct 2026',
  status: 'sent',
  dueOn: '2026-11-15',
  cadenceDays: 3,
  reminderCount: 0,
  lastRemindedAt: null,
  firstSentAt: new Date('2026-11-01T05:00:00Z'),
  callTaskId: null,
  completedAt: null,
  createdBy: 'user-intern',
  createdAt: new Date('2026-11-01T04:00:00Z'),
  updatedAt: new Date('2026-11-01T04:00:00Z'),
  ...over,
});
const itemRow = (over: Record<string, unknown> = {}) => ({
  id: ITEM,
  listId: LIST,
  kind: 'answer',
  label: 'Any advances?',
  help: null,
  status: 'pending',
  answerText: null,
  documentRequestId: null,
  receivedAt: null,
  ordinal: 0,
  ...over,
});
const writes = () => calls.filter((c) => c.op !== 'select');
const sqlOf = (w: SQL) => dialect.sqlToQuery(w);

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
  listScopedEngagementIds.mockResolvedValue([OWN]);
  assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: { companyName: 'Acme' } });
});

describe('listRequestLists', () => {
  it.each(['admin', 'super_admin'] as const)('%s lists every list without a scope lookup', async (role) => {
    results = [[{ list: listRow(), companyName: 'Acme' }], [itemRow()]];
    const lists = await repo.listRequestLists(ctx(role));
    expect(lists).toHaveLength(1);
    expect(lists[0]!.progress).toEqual({ total: 1, done: 0, percent: 0 });
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
    expect(sqlOf(calls[0]!.where!).params).not.toContain(OWN);
  });

  it.each(['manager', 'intern'] as const)('%s only sees lists on scoped engagements', async (role) => {
    await repo.listRequestLists(ctx(role));
    const q = sqlOf(calls[0]!.where!);
    expect(q.sql).toContain('"request_lists"."engagement_id" in');
    expect(q.params).toContain(OWN);
    expect(q.params).not.toContain(OTHER);
    expect(q.sql).not.toContain('not in');
  });

  it('a client never sees drafts or cancelled lists', async () => {
    await repo.listRequestLists(ctx('client'));
    const q = sqlOf(calls[0]!.where!);
    expect(q.sql).toContain('"request_lists"."status" not in');
    expect(q.params).toEqual(expect.arrayContaining([OWN, 'draft', 'cancelled']));
  });

  it('returns [] with no query for a person with no engagements', async () => {
    listScopedEngagementIds.mockResolvedValue([]);
    expect(await repo.listRequestLists(ctx('intern'))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns [] for an engagement filter outside scope', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await repo.listRequestLists(ctx('manager'), { engagementId: OTHER })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('getRequestList', () => {
  it('is null for a list on another firm’s engagement', async () => {
    results = [[listRow({ engagementId: OTHER })]];
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await repo.getRequestList(ctx('intern'), LIST)).toBeNull();
    expect(assertEngagementAccess).toHaveBeenCalledWith(ctx('intern'), OTHER);
  });

  it('is null for a client reading a draft', async () => {
    results = [[listRow({ status: 'draft' })]];
    expect(await repo.getRequestList(ctx('client'), LIST)).toBeNull();
  });

  it('reconciles an uploaded document request and completes the list', async () => {
    const DOC = '55555555-5555-4555-8555-555555555505';
    results = [[listRow()], [itemRow({ kind: 'document', documentRequestId: DOC })], [{ id: DOC, status: 'fulfilled' }], [], []];
    const list = await repo.getRequestList(ctx('client'), LIST);
    expect(list!.items[0]!.status).toBe('received');
    expect(list!.status).toBe('complete');
    const sets = writes().map((c) => c.set as Record<string, unknown>);
    expect(sets[0]).toMatchObject({ status: 'received' });
    expect(sets[1]).toMatchObject({ status: 'complete' });
  });
});

describe('staff writes', () => {
  it('a client may not create a list', async () => {
    await expect(repo.createRequestList(ctx('client'), { engagementId: OWN, title: 'X', items: [] })).rejects.toThrow(/clients may not/i);
    expect(calls).toHaveLength(0);
  });

  it('staff cannot create on another firm’s engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    await expect(repo.createRequestList(ctx('manager'), { engagementId: OTHER, title: 'X', items: [] })).rejects.toThrow(/not available/);
    expect(writes()).toHaveLength(0);
  });

  it('creates a template draft against the approved engagement id', async () => {
    results = [[listRow({ status: 'draft' })], [itemRow()]];
    await repo.createRequestListFromTemplate(ctx('intern'), { engagementId: 'acme-slug', templateId: 'gst-monthly', periodLabel: 'Oct 2026' }, new Date('2026-11-09T00:00:00Z'));
    const values = calls[0]!.values as Record<string, unknown>;
    expect(values).toMatchObject({ engagementId: OWN, status: 'draft', title: 'GST monthly data · Oct 2026', cadenceDays: 2, dueOn: '2026-11-16', createdBy: 'user-intern' });
    expect((calls[1]!.values as unknown[]).length).toBe(7);
  });

  it('sending creates one document request per document item, then marks the list sent', async () => {
    const draft = listRow({ status: 'draft', firstSentAt: null });
    results = [
      [draft], // loadScoped
      [itemRow({ id: 'i1', kind: 'document', label: 'Sales register' }), itemRow({ id: 'i2' })], // items
      [], // link doc request
      [], // mark sent
      [listRow()], // getRequestList → loadScoped
      [itemRow({ id: 'i1', kind: 'document', documentRequestId: 'dr-1' }), itemRow({ id: 'i2' })],
      [{ id: 'dr-1', status: 'pending' }],
    ];
    createDocumentRequest.mockResolvedValue({ id: 'dr-1' });
    const sent = await repo.markRequestListSent(ctx('intern'), LIST, new Date('2026-11-09T05:00:00Z'));
    expect(createDocumentRequest).toHaveBeenCalledTimes(1);
    expect(createDocumentRequest).toHaveBeenCalledWith(ctx('intern'), expect.objectContaining({ engagementId: OWN, label: 'Sales register', dueAt: '2026-11-15' }));
    expect(writes().map((c) => c.set)).toEqual([{ documentRequestId: 'dr-1' }, expect.objectContaining({ status: 'sent' })]);
    expect(sent.status).toBe('sent');
  });

  it('refuses to send a list twice', async () => {
    results = [[listRow()]];
    await expect(repo.markRequestListSent(ctx('intern'), LIST)).rejects.toThrow(/already been sent/);
    expect(createDocumentRequest).not.toHaveBeenCalled();
  });
});

describe('answerRequestListItem', () => {
  it('a client answers an answer item on its own sent list', async () => {
    results = [[listRow()], [itemRow()], [], [listRow()], [itemRow({ status: 'received', answerText: '₹50,000 from Beta' })], []];
    await repo.answerRequestListItem(ctx('client'), LIST, ITEM, { answerText: '₹50,000 from Beta' });
    expect(writes()[0]!.set).toMatchObject({ status: 'received', answerText: '₹50,000 from Beta' });
  });

  it('refuses a document item, which is uploaded instead', async () => {
    results = [[listRow()], [itemRow({ kind: 'document' })]];
    await expect(repo.answerRequestListItem(ctx('client'), LIST, ITEM, { answerText: 'x' })).rejects.toThrow(/Upload/);
    expect(writes()).toHaveLength(0);
  });

  it('refuses another client’s list', async () => {
    results = [[listRow({ engagementId: OTHER })]];
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    await expect(repo.answerRequestListItem(ctx('client'), LIST, ITEM, { answerText: 'x' })).rejects.toThrow(/not available/);
    expect(writes()).toHaveLength(0);
  });
});

describe('system writers', () => {
  it('counts a reminder only from the expected count, so retries do not double count', async () => {
    results = [[{ id: LIST }]];
    expect(await repo.systemRecordRequestListReminder(LIST, 2)).toBe(true);
    const q = sqlOf(calls[0]!.where!);
    expect(q.sql).toContain('"request_lists"."reminder_count" =');
    expect(q.params).toContain(1);
    results = [[]];
    expect(await repo.systemRecordRequestListReminder(LIST, 2)).toBe(false);
  });

  it('opens the call task once', async () => {
    results = [[{ callTaskId: 'task-1' }]];
    expect(await repo.systemCreateRequestListCallTask({ listId: LIST, engagementId: OWN, companyName: 'Acme', title: 'GST', openCount: 2, leadProfileId: 'lead' })).toBeNull();
    expect(writes()).toHaveLength(0);
    results = [[{ callTaskId: null }], [{ id: 'task-2' }], []];
    expect(await repo.systemCreateRequestListCallTask({ listId: LIST, engagementId: OWN, companyName: 'Acme', title: 'GST', openCount: 2, leadProfileId: 'lead' })).toBe('task-2');
    expect(calls.find((c) => c.op === 'insert')!.values).toMatchObject({ engagementId: OWN, assignedTo: 'lead', status: 'open' });
  });
});
