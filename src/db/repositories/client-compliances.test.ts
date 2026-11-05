import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/auth/guards';

/**
 * G-03: a client may add a proof file to a filing, but only to a filing of an
 * engagement inside their own scope. The proof is never primary, the filing's
 * status is never changed, and the lead hears about it.
 */

const listScopedEngagementIds = vi.fn();
const assertEngagementAccess = vi.fn();
let whereArgs: unknown[] = [];
const recordAuditEvent = vi.fn();
const createNotificationsForUsers = vi.fn();
const putObject = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
let selectQueue: unknown[][] = [];
let insertedValues: Record<string, unknown> | null = null;

// Filing events are written fire-and-forget after the action; they are tested in filing-events.test.ts.
vi.mock('@/db/repositories/filing-events', () => ({ recordFilingEvent: async () => undefined, windowEventLabel: () => '' }));
vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => dbInsert(...args),
    select: (...args: unknown[]) => dbSelect(...args),
    update: (...args: unknown[]) => dbUpdate(...args),
  },
}));

vi.mock('@/db/repositories/engagements', () => ({
  listScopedEngagementIds: (...args: unknown[]) => listScopedEngagementIds(...args),
  assertEngagementAccess: (...args: unknown[]) => assertEngagementAccess(...args),
}));
vi.mock('@/db/repositories/audit-events', () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args),
}));
vi.mock('@/db/repositories/notifications', () => ({
  createNotificationsForUsers: (...args: unknown[]) => createNotificationsForUsers(...args),
}));
vi.mock('@/storage/s3', () => ({
  bucketKey: (bucket: string, path: string) => `${bucket}/${path}`,
  putObject: (...args: unknown[]) => putObject(...args),
  signedDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
}));

const { addClientFilingProof, complianceErrorStatus, getPortalFilings } = await import('@/db/repositories/client-compliances');

const OWN_ENGAGEMENT = '11111111-1111-1111-1111-111111111101';
const INSTANCE = '33333333-3333-3333-3333-333333333303';
const FILE = { name: 'challan.pdf', type: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) };

const clientCtx: AuthContext = { userId: 'user-client', email: 'client@vcfo.local', name: 'Asha', role: 'client', clientId: 'c-a' };
const leadCtx: AuthContext = { userId: 'user-lead', email: 'lead@vcfo.local', name: 'Lead', role: 'intern' };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  insertedValues = null;
  whereArgs = [];
  dbSelect.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const k of ['from', 'innerJoin', 'leftJoin']) chain[k] = () => chain;
    chain.where = (arg: unknown) => {
      whereArgs.push(arg);
      return chain;
    };
    chain.orderBy = () => Promise.resolve(selectQueue.shift() ?? []);
    chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
    return chain;
  });
  dbInsert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      insertedValues = values;
      return {
        returning: () => Promise.resolve([{ id: 'proof-1', ...values, uploadedAt: new Date('2026-10-01T00:00:00.000Z') }]),
      };
    },
  }));
});

describe('addClientFilingProof', () => {
  it('refuses staff (they use the staff upload) before touching anything', async () => {
    const err = await addClientFilingProof(leadCtx, INSTANCE, FILE).catch((e: unknown) => e);
    expect(complianceErrorStatus(err)).toBe(403);
    expect(putObject).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('reads a filing outside the client’s scope as not found and writes nothing', async () => {
    listScopedEngagementIds.mockResolvedValue([OWN_ENGAGEMENT]);
    selectQueue = [[]]; // the instance is not in the scoped engagement list
    const err = await addClientFilingProof(clientCtx, INSTANCE, FILE).catch((e: unknown) => e);
    expect(complianceErrorStatus(err)).toBe(404);
    expect(putObject).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });

  it('gives a client with no engagement nothing', async () => {
    listScopedEngagementIds.mockResolvedValue([]);
    const err = await addClientFilingProof(clientCtx, INSTANCE, FILE).catch((e: unknown) => e);
    expect(complianceErrorStatus(err)).toBe(404);
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('stores a non-primary client proof, leaves the filing alone and tells the lead', async () => {
    listScopedEngagementIds.mockResolvedValue([OWN_ENGAGEMENT]);
    selectQueue = [
      [{ id: INSTANCE, engagementId: OWN_ENGAGEMENT, dueDate: '2026-10-20', filedOn: null, evidenceUrl: null }],
      [{ companyName: 'Northwind', internId: 'lead-key', particular: 'GSTR-3B', periodLabel: 'Sep 2026' }],
      [{ id: 'user-lead' }],
    ];
    const proof = await addClientFilingProof(clientCtx, INSTANCE, FILE, 'challan');
    expect(proof.byClient).toBe(true);
    expect(proof.isPrimary).toBe(false);
    expect(insertedValues).toMatchObject({
      instanceId: INSTANCE,
      engagementId: OWN_ENGAGEMENT,
      isPrimary: false,
      kind: 'challan',
      uploadedBy: 'user-client',
    });
    expect(String(insertedValues?.storagePath)).toMatch(new RegExp(`^${OWN_ENGAGEMENT}/compliance-proofs/${INSTANCE}/client-`));
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(clientCtx, expect.objectContaining({ action: 'client.compliance_proof_uploaded', engagementId: OWN_ENGAGEMENT }));
    expect(createNotificationsForUsers).toHaveBeenCalledWith([expect.objectContaining({ userId: 'user-lead', kind: 'request.uploaded' })]);
  });

  it('turns an unknown kind into "other" and refuses an empty file', async () => {
    listScopedEngagementIds.mockResolvedValue([OWN_ENGAGEMENT]);
    selectQueue = [[{ id: INSTANCE, engagementId: OWN_ENGAGEMENT, dueDate: '2026-10-20', filedOn: null, evidenceUrl: null }], [], []];
    await addClientFilingProof(clientCtx, INSTANCE, FILE, 'certificate');
    expect(insertedValues?.kind).toBe('other');
    expect(createNotificationsForUsers).not.toHaveBeenCalled();

    selectQueue = [[{ id: INSTANCE, engagementId: OWN_ENGAGEMENT, dueDate: '2026-10-20', filedOn: null, evidenceUrl: null }]];
    const err = await addClientFilingProof(clientCtx, INSTANCE, { ...FILE, bytes: new Uint8Array() }).catch((e: unknown) => e);
    expect(complianceErrorStatus(err)).toBe(400);
  });
});

/** Every bound value inside a drizzle condition, so a test can see which engagement ids it scopes to. */
function boundValues(node: unknown, seen = new Set<unknown>()): unknown[] {
  if (!node || typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);
  const out: unknown[] = [];
  if (node.constructor?.name === 'Param') out.push((node as { value: unknown }).value);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'table' || key === 'encoder') continue;
    out.push(...boundValues(value, seen));
  }
  return out.flat();
}

describe('getPortalFilings for staff viewing one client (engagementId)', () => {
  const OTHER = '11111111-1111-1111-1111-111111111102';

  it('reads only the named engagement when staff may access it', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN_ENGAGEMENT, row: {} });
    const rows = await getPortalFilings(leadCtx, { engagementId: 'kestrel-slug' });
    expect(rows).toEqual([]);
    expect(assertEngagementAccess).toHaveBeenCalledWith(leadCtx, 'kestrel-slug');
    expect(listScopedEngagementIds).not.toHaveBeenCalled();
    const values = boundValues(whereArgs[0]);
    expect(values).toContain(OWN_ENGAGEMENT);
    expect(values).not.toContain(OTHER);
  });

  it('reads nothing, and never queries filings, when staff may not access it', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false });
    listScopedEngagementIds.mockResolvedValue([OWN_ENGAGEMENT, OTHER]);
    expect(await getPortalFilings(leadCtx, { engagementId: OTHER })).toEqual([]);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it('ignores the engagement a client names and keeps to its own scope', async () => {
    listScopedEngagementIds.mockResolvedValue([OWN_ENGAGEMENT]);
    await getPortalFilings(clientCtx, { engagementId: OTHER });
    expect(assertEngagementAccess).not.toHaveBeenCalled();
    const values = boundValues(whereArgs[0]);
    expect(values).toContain(OWN_ENGAGEMENT);
    expect(values).not.toContain(OTHER);
  });
});
