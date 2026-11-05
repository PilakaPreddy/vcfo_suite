import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';

/**
 * Client documents: a client uploads to, and undoes uploads on, requests of the
 * own engagement only. A request of another tenant reads as "not found" and
 * nothing is written; staff roles are refused. The upload stamps
 * `document_requests.closed_at` and the undo clears it (migration 0027).
 */

type Call = { op: string; where?: SQL; set?: Record<string, unknown> };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    orderBy: () => c,
    limit: () => c,
    leftJoin: () => c,
    innerJoin: () => c,
    returning: () => c,
    values: () => c,
    set: (s: Record<string, unknown>) => {
      call.set = s;
      return c;
    },
    where: (w: SQL) => {
      call.where = w;
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}

function makeDb() {
  const d = {
    select: () => {
      const call: Call = { op: 'select' };
      calls.push(call);
      return chain(call);
    },
    update: () => {
      const call: Call = { op: 'update' };
      calls.push(call);
      return chain(call);
    },
    insert: () => {
      const call: Call = { op: 'insert' };
      calls.push(call);
      return chain(call);
    },
    delete: () => {
      const call: Call = { op: 'delete' };
      calls.push(call);
      return chain(call);
    },
    transaction: async (fn: (tx: unknown) => unknown) => fn(d),
  };
  return d;
}

vi.mock('server-only', () => ({}));
vi.mock('@/db/client', () => ({ db: makeDb() }));
const putObject = vi.fn();
const deleteObject = vi.fn();
vi.mock('@/storage/s3', () => ({
  bucketKey: (_b: string, k: string) => k,
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  getObjectBuffer: vi.fn(),
  listObjects: vi.fn(),
  putObject: (...a: unknown[]) => putObject(...a),
}));

const getMyEngagement = vi.fn();
const assertEngagementAccess = vi.fn();
vi.mock('@/db/repositories/engagements', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getMyEngagement: (...a: unknown[]) => getMyEngagement(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
}));

vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: async () => null }));
vi.mock('@/db/repositories/documents', () => ({ getDocumentById: async () => null, listDocuments: async () => [] }));
vi.mock('@/db/repositories/board-resolution', () => ({ getBoardResolutionByEngagementId: async () => null }));

const { getClientDocuments, listClientDocumentsZip, uploadRequestFiles, undoRequestUpload } = await import('@/db/repositories/client-documents');
const s3 = await import('@/storage/s3');

const dialect = new PgDialect();
const OWN = '11111111-1111-1111-1111-111111111101';
const OTHER_REQUEST = '22222222-2222-2222-2222-222222222202';
const FILE = '33333333-3333-3333-3333-333333333303';

function ctx(role: AuthContext['role']): AuthContext {
  return { userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role, clientId: role === 'client' ? 'c1' : undefined };
}
const pdf = { name: 'bill.pdf', type: 'application/pdf', size: 4, bytes: Buffer.from('%PDF') };

beforeEach(() => {
  vi.clearAllMocks();
  deleteObject.mockResolvedValue(undefined);
  calls.length = 0;
  results = [];
  getMyEngagement.mockResolvedValue({ id: 'own-slug' });
  assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: { companyName: 'Northwind India Private Limited' } });
});

describe('uploadRequestFiles — tenant scope', () => {
  it.each(['admin', 'manager', 'intern'] as const)('%s is refused', async (role) => {
    await expect(uploadRequestFiles(ctx(role), OTHER_REQUEST, [pdf])).rejects.toBeTruthy();
    expect(putObject).not.toHaveBeenCalled();
  });

  it('a request of another engagement reads as not found and nothing is stored', async () => {
    results = [[]];
    const out = await uploadRequestFiles(ctx('client'), OTHER_REQUEST, [pdf]);
    expect(out).toBeNull();
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.sql).toContain('"document_requests"."engagement_id" =');
    expect(q.params).toContain(OWN);
    expect(putObject).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('a client whose engagement check fails gets null and no query', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false });
    expect(await uploadRequestFiles(ctx('client'), OTHER_REQUEST, [pdf])).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('an upload on the own request closes it with closed_at', async () => {
    results = [[{ id: OTHER_REQUEST, engagementId: OWN, status: 'pending', title: 'Electricity bill' }], [], [{ id: FILE, fileName: 'bill.pdf' }], []];
    const out = await uploadRequestFiles(ctx('client'), OTHER_REQUEST, [pdf]);
    expect(out?.fileIds).toEqual([FILE]);
    const close = calls.find((c) => c.op === 'update' && c.set?.status === 'fulfilled');
    expect(close?.set?.closedAt).toBeInstanceOf(Date);
  });
});

describe('undoRequestUpload — tenant scope', () => {
  it('a file of another engagement or uploader is not found and nothing is deleted', async () => {
    results = [[]];
    expect(await undoRequestUpload(ctx('client'), OTHER_REQUEST, FILE)).toBe(false);
    const q = dialect.sqlToQuery(calls[0]!.where!);
    expect(q.sql).toContain('"document_request_files"."engagement_id" =');
    expect(q.sql).toContain('"document_request_files"."uploaded_by" =');
    expect(q.params).toContain(OWN);
    expect(q.params).toContain('user-client');
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('an undo reopens the request and clears closed_at', async () => {
    const at = new Date();
    results = [[{ id: FILE, uploadedAt: at, objectKey: 'k1' }], [{ id: OTHER_REQUEST, status: 'fulfilled' }], [{ id: FILE, objectKey: 'k1' }], [], []];
    expect(await undoRequestUpload(ctx('client'), OTHER_REQUEST, FILE)).toBe(true);
    const reopen = calls.find((c) => c.op === 'update' && c.set?.status === 'pending');
    expect(reopen?.set).toMatchObject({ closedAt: null });
  });
});

describe('getClientDocuments — who may read which engagement', () => {
  it('a client always reads its own engagement, whatever id it passes', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false });
    await expect(getClientDocuments(ctx('client'), 'someone-else')).resolves.toBeNull();
    expect(getMyEngagement).toHaveBeenCalled();
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'own-slug');
  });

  it('staff without an engagement id get null and no access check', async () => {
    await expect(getClientDocuments(ctx('manager'))).resolves.toBeNull();
    expect(assertEngagementAccess).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('staff are checked against the engagement they name, and a refusal reads nothing', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, forbidden: true });
    await expect(getClientDocuments(ctx('intern'), 'eng-9')).resolves.toBeNull();
    expect(getMyEngagement).not.toHaveBeenCalled();
    expect(assertEngagementAccess).toHaveBeenCalledWith(expect.anything(), 'eng-9');
    expect(calls).toHaveLength(0);
  });
});

describe('listClientDocumentsZip — one access check, no bytes read', () => {
  it('lists an answered request file once, checking the engagement a single time', async () => {
    vi.mocked(s3.listObjects).mockResolvedValue([]);
    const uploadedAt = new Date('2026-10-01T00:00:00Z');
    results = [
      [{ req: { id: OTHER_REQUEST, title: 'Electricity bill', status: 'approved', detail: null }, det: null, askedBy: null }],
      [{ id: FILE, requestId: OTHER_REQUEST, fileName: 'bill.pdf', contentType: 'application/pdf', sizeBytes: 4, uploadedAt, replacedAt: null }],
      [{ id: FILE, objectKey: 'engagement-documents/own/requests/bill.pdf', fileName: 'bill.pdf', contentType: 'application/pdf' }],
    ];
    const zip = await listClientDocumentsZip(ctx('client'), 'all');
    expect(assertEngagementAccess).toHaveBeenCalledTimes(1);
    expect(s3.getObjectBuffer).not.toHaveBeenCalled();
    expect(zip?.missing).toBe(0);
    expect(zip?.entries).toHaveLength(1);
    expect(zip?.entries[0]).toMatchObject({ key: 'engagement-documents/own/requests/bill.pdf', sizeBytes: 4 });
    expect(zip?.entries[0]?.name).toMatch(/\/Electricity bill\.pdf$/);
  });

  it('staff without an engagement id get null', async () => {
    await expect(listClientDocumentsZip(ctx('manager'), 'all')).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});
