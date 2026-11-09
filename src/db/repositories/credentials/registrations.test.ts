import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';
import { checklistViewerForRole, redactChecklistStateForViewer } from '@/lib/checklist/checklist-visibility';

/**
 * Cross-tenant scoping for the registration facts (G-05, G-06):
 *   client — only its own engagement; a foreign id is a 403 before any query; never writes;
 *   intern / manager — the list reads only `listScopedEngagementIds`; one engagement must
 *     pass `assertEngagementAccess`;
 *   admin / super_admin — firm-wide through the same scoped id list;
 *   developer — nothing, before any query.
 * Writes go to the approved engagement id and record an audit event; the certificate URL
 * is signed only for a file on an engagement the caller can open.
 */

type Call = { op: string; where?: SQL; values?: unknown; conflict?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    orderBy: () => c,
    limit: () => c,
    where: (w: SQL) => {
      call.where = w;
      return c;
    },
    values: (v: unknown) => {
      call.values = v;
      return c;
    },
    onConflictDoUpdate: (v: unknown) => {
      call.conflict = v;
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
const getMyEngagement = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...a: unknown[]) => listScopedEngagementIds(...a),
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
  getMyEngagement: (...a: unknown[]) => getMyEngagement(...a),
  checklistStateForViewer: (c: AuthContext, s: never) => redactChecklistStateForViewer(checklistViewerForRole(c.role), s),
}));
const recordAuditEvent = vi.fn();
vi.mock('@/db/repositories/audit-events', () => ({ recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a) }));
const signedDownloadUrl = vi.fn(async (key: string) => `https://signed/${key}`);
vi.mock('@/storage/s3', () => ({
  bucketKey: (b: string, p: string) => `${b}/${p}`,
  signedDownloadUrl: (key: string) => signedDownloadUrl(key),
}));

const repo = await import('@/db/repositories/credentials/registrations');

const dialect = new PgDialect();
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';

function ctx(role: string): AuthContext {
  return { userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role: role as AuthContext['role'] };
}

const gstSlice = {
  status: 'completed',
  responses: { gstinNumber: '29ABCDE1234F1Z5', gstCertificateUrl: `${OWN}/gstCertificateUrl/1712-gst.pdf` },
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
  listScopedEngagementIds.mockResolvedValue([OWN]);
  getMyEngagement.mockResolvedValue({ id: OWN });
  assertEngagementAccess.mockImplementation(async (_c: AuthContext, id: string) =>
    id === OWN ? { ok: true, dbId: OWN, row: { id: OWN } } : { ok: false, dbId: id, forbidden: true },
  );
});

describe('listRegistrationFacts', () => {
  it.each(['super_admin', 'admin', 'manager', 'intern'])('%s lists only the scoped engagement ids', async (role) => {
    results = [[{ id: OWN, reg: { 'reg-4': gstSlice } }], [{ engagementId: OWN, rowKey: 'gst', fields: { expiresOn: '2027-01-01' } }], []];
    const out = await repo.listRegistrationFacts(ctx(role));
    expect(listScopedEngagementIds).toHaveBeenCalledWith(ctx(role));
    expect(out[OWN]!['reg-4']).toMatchObject({ number: '29ABCDE1234F1Z5', expiresOn: '2027-01-01' });
    for (const c of calls) {
      const q = dialect.sqlToQuery(c.where!);
      expect(q.params).toContain(OWN);
      expect(q.params).not.toContain(OTHER);
    }
  });

  it('never selects the secret ciphertext or whole checklist states', async () => {
    results = [[], [], []];
    await repo.listRegistrationFacts(ctx('manager'));
    expect(calls).toHaveLength(3);
  });

  it.each(['manager', 'intern'])('%s with no engagements gets {} and no query', async (role) => {
    listScopedEngagementIds.mockResolvedValue([]);
    expect(await repo.listRegistrationFacts(ctx(role))).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it.each(['manager', 'intern', 'client'])('%s naming another firm’s engagement is a 403 before any query', async (role) => {
    await expect(repo.listRegistrationFacts(ctx(role), { engagementId: OTHER })).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it('a client always reads its own engagement, never the scoped list', async () => {
    results = [[{ id: OWN, reg: {} }], [], []];
    const out = await repo.listRegistrationFacts(ctx('client'));
    expect(Object.keys(out)).toEqual([OWN]);
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
    const docs = dialect.sqlToQuery(calls[2]!.where!);
    expect(docs.sql).toContain('"documents"."shared_with_client"');
  });

  it('a client does not see answers on a step the manager has not released', async () => {
    // ESI is a lead-delivered step; GST (reg-4) is filled with the client, so it is always released.
    results = [[{ id: OWN, reg: { 'reg-3': { status: 'in-progress', responses: { esiRegistrationNumber: 'DRAFT' } } } }], [], []];
    const out = await repo.listRegistrationFacts(ctx('client'));
    expect(out[OWN]!['reg-3']!.number).toBeNull();
  });

  it('a developer gets nothing before any query', async () => {
    expect(await repo.listRegistrationFacts(ctx('developer'))).toEqual({});
    expect(calls).toHaveLength(0);
  });
});

describe('setRegistrationDates', () => {
  const input = { engagementId: OWN, stepId: 'reg-4', issuedOn: '2026-08-01', expiresOn: null, renewEveryMonths: 12 };

  it.each(['client', 'developer'])('%s is refused before any query', async (role) => {
    await expect(repo.setRegistrationDates(ctx(role), input)).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each(['manager', 'intern'])('%s cannot write another firm’s engagement', async (role) => {
    await expect(repo.setRegistrationDates(ctx(role), { ...input, engagementId: OTHER })).rejects.toMatchObject({ status: 403 });
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('refuses a step that is not a registration', async () => {
    await expect(repo.setRegistrationDates(ctx('admin'), { ...input, stepId: 'pre-1' })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('writes the approved engagement row and records an audit event', async () => {
    results = [[], [{ id: OWN, reg: {} }], [{ engagementId: OWN, rowKey: 'gst', fields: { issuedOn: '2026-08-01', renewEveryMonths: '12' } }], []];
    const out = await repo.setRegistrationDates(ctx('manager'), input);
    const ins = calls.find((c) => c.op === 'insert')!;
    expect(ins.values).toMatchObject({ engagementId: OWN, sheet: 'reg', rowKey: 'gst', fields: { issuedOn: '2026-08-01', renewEveryMonths: '12' } });
    expect(recordAuditEvent).toHaveBeenCalledWith(ctx('manager'), expect.objectContaining({ engagementId: OWN, action: 'registrations.dates_updated' }));
    expect(out['reg-4']!.expiresOn).toBe('2027-08-01');
  });
});

describe('getRegistrationCertificateUrl', () => {
  it.each(['manager', 'intern', 'client'])('%s cannot open a certificate on another firm’s engagement', async (role) => {
    await expect(repo.getRegistrationCertificateUrl(ctx(role), { engagementId: OTHER, stepId: 'reg-4' })).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });

  it('signs the step upload of the caller’s own engagement', async () => {
    results = [[{ id: OWN, reg: { 'reg-4': gstSlice } }], [], []];
    const out = await repo.getRegistrationCertificateUrl(ctx('client'), { stepId: 'reg-4' });
    expect(out).toEqual({ url: `https://signed/milestone-documents/${OWN}/gstCertificateUrl/1712-gst.pdf`, fileName: 'gst.pdf' });
    expect(recordAuditEvent).toHaveBeenCalled();
  });

  it('ignores a step answer that points into another engagement’s folder', async () => {
    const forged = { status: 'completed', responses: { gstCertificateUrl: `${OTHER}/gstCertificateUrl/1712-gst.pdf` } };
    results = [[{ id: OWN, reg: { 'reg-4': forged } }], [], []];
    await expect(repo.getRegistrationCertificateUrl(ctx('admin'), { engagementId: OWN, stepId: 'reg-4' })).rejects.toMatchObject({ status: 404 });
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });

  it('falls back to a document filed on the step', async () => {
    results = [[{ id: OWN, reg: { 'reg-1': { status: 'completed' } } }], [], [{ engagementId: OWN, stepId: 'reg-1', fileName: 'PF.pdf', objectKey: `engagement-documents/${OWN}/pf.pdf`, createdAt: new Date() }]];
    const out = await repo.getRegistrationCertificateUrl(ctx('admin'), { engagementId: OWN, stepId: 'reg-1' });
    expect(out.fileName).toBe('PF.pdf');
    expect(signedDownloadUrl).toHaveBeenCalledWith(`engagement-documents/${OWN}/pf.pdf`);
  });

  it('a developer is refused before any query', async () => {
    await expect(repo.getRegistrationCertificateUrl(ctx('developer'), { engagementId: OWN, stepId: 'reg-4' })).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });
});
