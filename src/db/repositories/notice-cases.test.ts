import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Notice cases: staff read and write inside their engagement scope; clients and other roles get
 * nothing, before any query. Submitting or closing a case needs an admin or manager.
 */

type Call = { op: string; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    where: () => c,
    returning: () => c,
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

const repo = await import('./notice-cases');

const ENG_A = '11111111-1111-4111-8111-111111111111';
const ENG_B = '22222222-2222-4222-8222-222222222222';

function ctx(role: AuthContext['role']): AuthContext {
  return { userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role, internId: role === 'intern' ? 'i-1' : undefined };
}

function caseRow(over: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    engagementId: ENG_A,
    authority: 'gst',
    section: '73',
    periodLabel: 'FY 2023-24',
    din: 'DIN1',
    demandAmount: '1000.00',
    receivedOn: '2026-11-01',
    responseDueOn: '2026-11-20',
    hearingOn: null,
    stage: 'received',
    ownerId: null,
    summary: null,
    replyDraft: null,
    documentsNeeded: [],
    requestListId: null,
    attachments: [],
    notes: null,
    lastEscalation: null,
    lastEscalationDueOn: null,
    closedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}
const joined = (over: Record<string, unknown> = {}) => ({ item: caseRow(over), companyName: 'Acme', ownerName: null });

beforeEach(() => {
  calls.length = 0;
  results = [];
  listScopedEngagementIds.mockReset();
  assertEngagementAccess.mockReset();
});

describe('notice cases: reads', () => {
  it('gives clients and other roles nothing, before any query', async () => {
    for (const role of ['client', 'developer', 'partner'] as const) {
      expect(await repo.listNoticeCases(ctx(role))).toEqual([]);
      expect(await repo.getNoticeCase(ctx(role), 'n-1')).toBeNull();
    }
    expect(calls).toHaveLength(0);
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
  });

  it('returns nothing to a lead with no clients, without querying cases', async () => {
    listScopedEngagementIds.mockResolvedValue([]);
    expect(await repo.listNoticeCases(ctx('intern'))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('lists a manager\'s cases with days left and the label', async () => {
    listScopedEngagementIds.mockResolvedValue([ENG_A]);
    results = [[joined()]];
    const [item] = await repo.listNoticeCases(ctx('manager'), { open: true }, '2026-11-10');
    expect(item).toMatchObject({ id: 'n-1', daysLeft: 10, open: true, label: 'GST notice u/s 73 (FY 2023-24)', companyName: 'Acme' });
  });

  it('hides a case on a client outside the caller\'s scope', async () => {
    results = [[joined({ engagementId: ENG_B })]];
    listScopedEngagementIds.mockResolvedValue([ENG_A]);
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: ENG_B, forbidden: true });
    expect(await repo.getNoticeCase(ctx('intern'), 'n-1')).toBeNull();
  });

  it('narrows to one named client only when it is in scope', async () => {
    listScopedEngagementIds.mockResolvedValue([ENG_A]);
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_B, row: { id: ENG_B } });
    expect(await repo.listNoticeCases(ctx('manager'), { engagementId: ENG_B })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('notice cases: writes', () => {
  it('refuses a client before any write', async () => {
    await expect(repo.createNoticeCase(ctx('client'), { engagementId: ENG_A, authority: 'gst' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(repo.updateNoticeCase(ctx('client'), 'n-1', { replyDraft: 'x' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a client outside the scope', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: ENG_B, forbidden: true });
    await expect(repo.createNoticeCase(ctx('intern'), { engagementId: ENG_B, authority: 'gst' })).rejects.toMatchObject({ code: 'not_found' });
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('opens a case owned by the person, at the received stage', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_A, row: { id: ENG_A, companyName: 'Acme' } });
    results = [[caseRow({ ownerId: 'user-intern' })]];
    const item = await repo.createNoticeCase(ctx('intern'), { engagementId: ENG_A, authority: 'gst', section: ' 73 ', responseDueOn: '2026-11-20' });
    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.values).toMatchObject({ engagementId: ENG_A, authority: 'gst', section: '73', stage: 'received', ownerId: 'user-intern' });
    expect(item.ownerName).toBe('intern');
  });

  it('rejects a bad date or amount before writing', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_A, row: { id: ENG_A, companyName: 'Acme' } });
    await expect(repo.createNoticeCase(ctx('admin'), { engagementId: ENG_A, authority: 'gst', responseDueOn: '20/11/2026' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.createNoticeCase(ctx('admin'), { engagementId: ENG_A, authority: 'gst', demandAmount: '1,000' })).rejects.toMatchObject({ code: 'invalid' });
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('lets only an admin or manager submit or close a case', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_A, row: { id: ENG_A } });
    results = [[joined()]];
    await expect(repo.updateNoticeCase(ctx('intern'), 'n-1', { stage: 'submitted' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);

    results = [[joined()], [caseRow({ stage: 'closed', closedAt: new Date() })]];
    const { item, previous } = await repo.updateNoticeCase(ctx('manager'), 'n-1', { stage: 'closed' });
    expect(previous.stage).toBe('received');
    expect(item.stage).toBe('closed');
    expect(calls.find((c) => c.op === 'update')!.set).toMatchObject({ stage: 'closed' });
  });

  it('lets a lead save the reply draft and earlier stages', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_A, row: { id: ENG_A } });
    results = [[joined()], [caseRow({ stage: 'reply_drafted', replyDraft: 'Dear Sir' })]];
    const { item } = await repo.updateNoticeCase(ctx('intern'), 'n-1', { stage: 'reply_drafted', replyDraft: 'Dear Sir' });
    expect(item.replyDraft).toBe('Dear Sir');
  });
});
