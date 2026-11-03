import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant scoping for the board meetings repositories (docs/specs/board-meetings/PLAN.md):
 * a meeting of another firm's engagement reads as not found and writes nothing; a client never
 * reads a draft notice or an unlocked document; a lead cannot approve; a developer gets nothing
 * before any query; locked documents never change.
 */

type Call = { op: string; where?: SQL; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'orderBy', 'limit', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate']) c[m] = () => c;
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
  c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej);
  return c;
}
const op = (name: string) => () => {
  const call: Call = { op: name };
  calls.push(call);
  return chain(call);
};
const db = { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') };
vi.mock('@/db/client', () => ({ db }));
vi.mock('server-only', () => ({}));
const putObject = vi.fn();
vi.mock('@/storage/s3', () => ({ bucketKey: (b: string, p: string) => `${b}/${p}`, putObject: (...a: unknown[]) => putObject(...a), signedDownloadUrl: vi.fn(async () => 'https://signed') }));

const assertEngagementAccess = vi.fn();
const listScopedEngagementIds = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: vi.fn(async () => []) }));
vi.mock('@/db/repositories/audit-events', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));

const repo = await import('@/db/repositories/board-meetings');
const dialect = new PgDialect();

const OWN = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';
const MEETING = '33333333-3333-3333-3333-333333333303';
const DOC = '44444444-4444-4444-4444-444444444404';
const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role });
const paramsOf = (c: Call) => (c.where ? dialect.sqlToQuery(c.where).params : []);
const writes = () => calls.filter((c) => c.op !== 'select');
const meetingRow = (over: Record<string, unknown> = {}) => ({
  id: MEETING,
  engagementId: OTHER,
  kind: 'board',
  meetingType: 'quarterly',
  seq: 2,
  meetingNo: 'NIPL/BM/02/2026-27',
  meetingDate: '2026-09-10',
  meetingTime: '19:30',
  status: 'draft',
  version: 1,
  agenda: [],
  bodyOverride: null,
  recipients: [],
  sentAt: null,
  lockedAt: null,
  icsSequence: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
});

describe('board meetings · reads', () => {
  it('gives a developer nothing before any query', async () => {
    expect(await repo.listMeetings(ctx('developer' as AuthContext['role']))).toEqual([]);
    await expect(repo.getMeeting(ctx('developer' as AuthContext['role']), MEETING)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('a foreign engagement reads as not found for every role', async () => {
    for (const role of ['manager', 'intern', 'client'] as const) {
      calls.length = 0;
      results = [[meetingRow({ status: 'sent', sentAt: new Date() })]];
      assertEngagementAccess.mockResolvedValueOnce({ ok: false, dbId: OTHER, forbidden: true });
      await expect(repo.getMeeting(ctx(role), MEETING)).rejects.toMatchObject({ status: 404 });
      expect(writes()).toHaveLength(0);
    }
  });

  it('a client never reads a draft or a meeting cancelled before sending', async () => {
    for (const row of [meetingRow({ engagementId: OWN }), meetingRow({ engagementId: OWN, status: 'cancelled', sentAt: null }), meetingRow({ engagementId: OWN, status: 'pending_approval' })]) {
      results = [[row]];
      assertEngagementAccess.mockResolvedValueOnce({ ok: true, dbId: OWN, row: { id: OWN } });
      await expect(repo.getMeeting(ctx('client'), MEETING)).rejects.toMatchObject({ status: 404 });
    }
  });

  it('a manager lists only scoped engagements; none in scope means no query', async () => {
    listScopedEngagementIds.mockResolvedValueOnce([]);
    expect(await repo.listMeetings(ctx('manager'))).toEqual([]);
    expect(calls).toHaveLength(0);

    listScopedEngagementIds.mockResolvedValueOnce([OWN]);
    results = [[]];
    await repo.listMeetings(ctx('manager'));
    expect(paramsOf(calls[0]!)).toContain(OWN);
    expect(paramsOf(calls[0]!)).not.toContain(OTHER);
  });

  it('directors of a foreign engagement read as not found', async () => {
    assertEngagementAccess.mockResolvedValueOnce({ ok: false, dbId: OTHER, forbidden: true });
    await expect(repo.listDirectors(ctx('intern'), OTHER)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});

describe('board meetings · writes', () => {
  it('creating a meeting on a foreign engagement writes nothing', async () => {
    assertEngagementAccess.mockResolvedValueOnce({ ok: false, dbId: OTHER, forbidden: true });
    await expect(repo.createMeeting(ctx('intern'), { engagementId: OTHER, meetingDate: '2026-09-10', meetingTime: '19:30' })).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('a client cannot create a meeting or add a director', async () => {
    await expect(repo.createMeeting(ctx('client'), { engagementId: OWN, meetingDate: '2026-09-10', meetingTime: '19:30' })).rejects.toMatchObject({ status: 403 });
    await expect(repo.addDirector(ctx('client'), OWN, { name: 'X' })).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('a lead cannot approve or send back', async () => {
    await expect(repo.approveMeeting(ctx('intern'), MEETING)).rejects.toMatchObject({ status: 403 });
    await expect(repo.sendBackMeeting(ctx('intern'), MEETING, 'fix')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it('a lead cannot edit a notice that waits for approval; nobody edits a sent notice', async () => {
    results = [[meetingRow({ engagementId: OWN, status: 'pending_approval' })]];
    assertEngagementAccess.mockResolvedValueOnce({ ok: true, dbId: OWN, row: { id: OWN } });
    await expect(repo.updateMeeting(ctx('intern'), MEETING, { venue: 'x' })).rejects.toMatchObject({ status: 403 });
    results = [[meetingRow({ engagementId: OWN, status: 'sent' })]];
    assertEngagementAccess.mockResolvedValueOnce({ ok: true, dbId: OWN, row: { id: OWN } });
    await expect(repo.updateMeeting(ctx('manager'), MEETING, { venue: 'x' })).rejects.toMatchObject({ status: 409, code: 'notice_locked' });
    expect(writes()).toHaveLength(0);
  });

  it('approving a foreign meeting writes nothing, also for a super admin denied by scope', async () => {
    results = [[meetingRow({ status: 'pending_approval' })]];
    assertEngagementAccess.mockResolvedValueOnce({ ok: false, dbId: OTHER, forbidden: true });
    await expect(repo.approveMeeting(ctx('manager'), MEETING)).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('a locked document never changes and a client never uploads', async () => {
    await expect(repo.uploadSigned(ctx('client'), DOC, { name: 'a.pdf', type: 'application/pdf', bytes: new Uint8Array([1]) })).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);

    results = [[{ id: DOC, meetingId: MEETING, kind: 'mom', status: 'locked', signerIds: [] }], [meetingRow({ engagementId: OWN, status: 'held' })]];
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: { id: OWN } });
    await expect(repo.uploadSigned(ctx('intern'), DOC, { name: 'a.pdf', type: 'application/pdf', bytes: new Uint8Array([1]) })).rejects.toMatchObject({ status: 409, code: 'locked' });
    expect(writes()).toHaveLength(0);
    expect(putObject).not.toHaveBeenCalled();
    assertEngagementAccess.mockReset();
  });

  it('a client cannot open an unlocked document', async () => {
    results = [[{ id: DOC, meetingId: MEETING, kind: 'mom', status: 'sent', signerIds: [], fileKey: 'k' }], [meetingRow({ engagementId: OWN, status: 'held', sentAt: new Date() })]];
    assertEngagementAccess.mockResolvedValueOnce({ ok: true, dbId: OWN, row: { id: OWN } });
    await expect(repo.documentFileUrl(ctx('client'), DOC, 'signed')).rejects.toMatchObject({ status: 404 });
  });

  it('only a firm-wide admin edits the agenda library', async () => {
    for (const role of ['manager', 'intern', 'client'] as const) {
      await expect(repo.updateLibraryItem(ctx(role), 'BM-001', { wording: 'x' })).rejects.toMatchObject({ status: 403 });
    }
    await expect(repo.listLibrary(ctx('client'))).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});
