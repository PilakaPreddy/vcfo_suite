import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { FilingRefusal } from '@/lib/mca-filing/filing-state';

/**
 * Cross-tenant scoping for the MCA filing record (migration 0041). Staff go through
 * `assertEngagementAccess`; a client, developer or partner is refused before any query; a foreign
 * engagement reads as not found and writes nothing; a document of another engagement is not
 * served; every write uses the approved engagement id.
 */

type Call = { op: string; where?: SQL; values?: Record<string, unknown>; set?: Record<string, unknown> };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'orderBy', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c;
  c.where = (w: SQL) => {
    call.where = w;
    return c;
  };
  c.values = (v: Record<string, unknown>) => {
    call.values = v;
    return c;
  };
  c.set = (v: Record<string, unknown>) => {
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
const getObjectBuffer = vi.fn();
const signedDownloadUrl = vi.fn();
vi.mock('@/storage/s3', () => ({
  bucketKey: (b: string, p: string) => `${b}/${p}`,
  putObject: (...a: unknown[]) => putObject(...a),
  getObjectBuffer: (...a: unknown[]) => getObjectBuffer(...a),
  signedDownloadUrl: (...a: unknown[]) => signedDownloadUrl(...a),
}));

const assertEngagementAccess = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  assertEngagementAccess: (...a: unknown[]) => assertEngagementAccess(...a),
  getMyEngagement: vi.fn(),
}));
vi.mock('@/db/repositories/board-meetings/shared', () => ({ leadProfileId: vi.fn(async () => 'lead-1') }));

const filings = await import('@/db/repositories/assist-filings');
const { AssistForbiddenError } = await import('@/db/repositories/assist-runs');

const dialect = new PgDialect();
const OWN = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';
const DOC = '33333333-3333-3333-3333-333333333303';
const FILE = { fileName: 'a.pdf', bytes: Buffer.from('%PDF-'), sha256: 'sha', textHash: 'h1', check: {} };
const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@vcfo.local`, name: role, role });
const paramsOf = (c: Call) => (c.where ? dialect.sqlToQuery(c.where).params : []);
const writes = () => calls.filter((c) => c.op !== 'select');
const now = new Date('2026-11-05T06:00:00Z');
const filingRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  engagementId: OWN,
  form: 'spice-part-b',
  state: 'pdf_review',
  remarks: [],
  signatureRequests: [],
  alertedOn: {},
  createdAt: now,
  updatedAt: now,
  ...over,
});
const docRow = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  engagementId: OWN,
  form: 'spice-part-b',
  kind: 'portal_pdf',
  fileName: 'a.pdf',
  storageKey: `engagement-documents/${OWN}/assist-filing/spice-part-b/portal_pdf-1.pdf`,
  sizeBytes: 10,
  sha256: 'old',
  textHash: 'h0',
  signers: [],
  check: {},
  stale: false,
  createdAt: now,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  results = [];
});

describe('roles with no access', () => {
  it.each(['client', 'developer', 'partner'] as const)('refuses %s before any query', async (role) => {
    await expect(filings.getFilingRecords(ctx(role), OWN)).rejects.toThrow(AssistForbiddenError);
    await expect(filings.updateFiling(ctx(role), OWN, 'spice-part-b', { remark: 'x' })).rejects.toThrow(AssistForbiddenError);
    await expect(filings.savePortalPdf(ctx(role), OWN, 'spice-part-b', FILE)).rejects.toThrow(AssistForbiddenError);
    await expect(filings.saveSignedPdf(ctx(role), OWN, 'spice-part-b', { ...FILE, signers: [], allSigned: true })).rejects.toThrow(AssistForbiddenError);
    await expect(filings.readFilingDocument(ctx(role), OWN, DOC)).rejects.toThrow(AssistForbiddenError);
    await expect(filings.recordFilingReview(ctx(role), OWN, 'spice-part-b', null)).rejects.toThrow(AssistForbiddenError);
    await expect(filings.recordSignatureRequests(ctx(role), OWN, 'spice-part-b', [])).rejects.toThrow(AssistForbiddenError);
    expect(calls).toHaveLength(0);
    expect(assertEngagementAccess).not.toHaveBeenCalled();
  });
});

describe('another firm’s engagement', () => {
  it.each(['intern', 'manager', 'admin', 'super_admin'] as const)('reads as not found and writes nothing (%s)', async (role) => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: OTHER, forbidden: true });
    expect(await filings.getFilingRecords(ctx(role), OTHER)).toBeNull();
    expect(await filings.updateFiling(ctx(role), OTHER, 'spice-part-b', { remark: 'x' })).toBeNull();
    expect(await filings.getFilingUploadContext(ctx(role), OTHER, 'spice-part-b')).toBeNull();
    expect(await filings.savePortalPdf(ctx(role), OTHER, 'spice-part-b', FILE)).toBeNull();
    expect(await filings.saveSignedPdf(ctx(role), OTHER, 'spice-part-b', { ...FILE, signers: [], allSigned: true })).toBeNull();
    expect(await filings.readFilingDocument(ctx(role), OTHER, DOC)).toBeNull();
    expect(await filings.recordFilingReview(ctx(role), OTHER, 'spice-part-b', 'note')).toBeNull();
    expect(await filings.portalPdfForSigners(ctx(role), OTHER, 'spice-part-b', 60)).toBeNull();
    expect(await filings.recordSignatureRequests(ctx(role), OTHER, 'spice-part-b', [])).toBeNull();
    expect(calls).toHaveLength(0);
    expect(putObject).not.toHaveBeenCalled();
    expect(getObjectBuffer).not.toHaveBeenCalled();
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('within scope', () => {
  beforeEach(() => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: OWN, row: { id: OWN, companyName: 'Acme' } });
  });

  it('scopes every read by the approved engagement id, not what the caller sent', async () => {
    results = [[filingRow()], [docRow()], []];
    const out = await filings.getFilingRecords(ctx('super_admin'), 'acme');
    expect(out?.filings.map((f) => f.form)).toEqual(['spice-part-a', 'spice-part-b']);
    expect(out?.filings[0]?.state).toBe('data_ready');
    expect(out?.filings[1]?.state).toBe('pdf_review');
    for (const call of calls.slice(0, 2)) {
      expect(paramsOf(call)).toContain(OWN);
      expect(paramsOf(call)).not.toContain('acme');
    }
    // No storage key reaches a caller.
    expect(JSON.stringify(out)).not.toContain('assist-filing/');
  });

  it('writes with the approved engagement id', async () => {
    results = [[], [filingRow({ state: 'data_ready' })], [], [filingRow({ srn: 'AB1234567' })], []];
    const out = await filings.updateFiling(ctx('manager'), 'acme', 'spice-part-b', { srn: 'ab1234567' });
    expect(out?.changed).toContain('srn');
    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.values).toMatchObject({ engagementId: OWN, form: 'spice-part-b' });
    const update = calls.find((c) => c.op === 'update')!;
    expect(paramsOf(update)).toContain(OWN);
    expect(update.set).toMatchObject({ srn: 'AB1234567' });
  });

  it('does not serve a document of another engagement', async () => {
    results = [[]];
    expect(await filings.readFilingDocument(ctx('intern'), OWN, DOC)).toBeNull();
    expect(paramsOf(calls[0]!)).toEqual(expect.arrayContaining([DOC, OWN]));
    expect(getObjectBuffer).not.toHaveBeenCalled();
  });

  it('refuses a stored key outside the engagement, and a malformed id before any query', async () => {
    results = [[docRow({ storageKey: `engagement-documents/${OTHER}/x.pdf` })]];
    expect(await filings.readFilingDocument(ctx('admin'), OWN, DOC)).toBeNull();
    expect(getObjectBuffer).not.toHaveBeenCalled();
    calls.length = 0;
    expect(await filings.readFilingDocument(ctx('admin'), OWN, 'not-a-uuid')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('makes earlier signed copies stale and clears the approval when the text changes', async () => {
    results = [[], [filingRow({ reviewedBy: 'someone', reviewedAt: now })], [docRow()], [docRow()], [docRow({ id: 'new', sha256: 'sha', textHash: 'h1' })], [], [filingRow({ reviewedBy: null, reviewedAt: null })], []];
    const out = await filings.savePortalPdf(ctx('intern'), OWN, 'spice-part-b', FILE);
    expect(out).toMatchObject({ created: true, textChanged: true });
    expect(putObject).toHaveBeenCalledOnce();
    expect(String(putObject.mock.calls[0]![0])).toContain(`engagement-documents/${OWN}/assist-filing/spice-part-b/`);
    const [stale, row] = calls.filter((c) => c.op === 'update');
    expect(stale!.set).toEqual({ stale: true });
    expect(paramsOf(stale!)).toEqual(expect.arrayContaining([OWN, 'spice-part-b', 'signed_pdf']));
    expect(row!.set).toMatchObject({ reviewedBy: null, reviewedAt: null, state: 'pdf_review' });
  });

  it('adds nothing when the extension posts the same bytes again', async () => {
    results = [[], [filingRow()], [docRow({ sha256: 'sha' })], []];
    const out = await filings.savePortalPdf(ctx('intern'), OWN, 'spice-part-b', FILE);
    expect(out?.created).toBe(false);
    expect(putObject).not.toHaveBeenCalled();
    expect(writes().map((c) => c.op)).toEqual(['insert']); // only the row made on first use
  });

  it('keeps the approval and signed copies when a new file reads the same', async () => {
    results = [[], [filingRow({ reviewedAt: now })], [docRow({ textHash: 'h1' })], [docRow({ textHash: 'h1' })], [docRow({ id: 'new', sha256: 'sha', textHash: 'h1' })], [filingRow({ reviewedAt: now })], []];
    const out = await filings.savePortalPdf(ctx('intern'), OWN, 'spice-part-b', FILE);
    expect(out).toMatchObject({ created: true, textChanged: false });
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set).not.toHaveProperty('reviewedAt');
  });

  describe('professional approval', () => {
    const portalCheck = (check: Record<string, unknown>) => docRow({ check });
    const refusal = async (note: string | null) => {
      try {
        await filings.recordFilingReview(ctx('manager'), OWN, 'spice-part-b', note);
      } catch (e) {
        if (e instanceof FilingRefusal) return e.code;
        throw e;
      }
      return 'approved';
    };

    it('refuses with no portal PDF', async () => {
      results = [[], [filingRow()], []];
      expect(await refusal('note')).toBe('no_portal_pdf');
    });

    it('refuses while values are missing, unless a note is given', async () => {
      const missing = portalCheck({ checked: 5, found: 4, missing: [{ field: 'a', expected: 'b' }], unreadable: false });
      results = [[], [filingRow()], [missing]];
      expect(await refusal(null)).toBe('missing_values_need_note');
      expect(writes().some((c) => c.op === 'update')).toBe(false);
      results = [[], [filingRow()], [missing], [filingRow({ reviewedBy: 'user-manager', reviewedAt: now, reviewNote: 'Read by hand' })], [{ id: 'user-manager', name: 'Mira', email: 'm@x' }]];
      expect(await refusal('Read by hand')).toBe('approved');
      const update = calls.filter((c) => c.op === 'update').pop()!;
      expect(update.set).toMatchObject({ reviewedBy: 'user-manager', reviewNote: 'Read by hand' });
      expect(paramsOf(update)).toContain(OWN);
    });

    it('refuses an unreadable PDF without a note, and a PDF nothing was compared against', async () => {
      results = [[], [filingRow()], [portalCheck({ checked: 0, found: 0, missing: [], unreadable: true })]];
      expect(await refusal(null)).toBe('missing_values_need_note');
      results = [[], [filingRow()], [portalCheck({ checked: 0, found: 0, missing: [], unreadable: false })]];
      expect(await refusal(null)).toBe('missing_values_need_note');
    });

    it('approves a clean PDF without a note', async () => {
      results = [[], [filingRow()], [portalCheck({ checked: 5, found: 5, missing: [], unreadable: false })], [filingRow({ reviewedAt: now })], []];
      expect(await refusal(null)).toBe('approved');
    });
  });

  describe('signature link', () => {
    it('refuses before the approval', async () => {
      results = [[], [filingRow()], [docRow()]];
      await expect(filings.portalPdfForSigners(ctx('intern'), OWN, 'spice-part-b', 60)).rejects.toMatchObject({ code: 'not_reviewed' });
      expect(signedDownloadUrl).not.toHaveBeenCalled();
    });

    it('signs one object inside this engagement', async () => {
      signedDownloadUrl.mockResolvedValue('https://signed');
      getObjectBuffer.mockResolvedValue(Buffer.from('%PDF-'));
      results = [[], [filingRow({ reviewedAt: now })], [docRow()]];
      const out = await filings.portalPdfForSigners(ctx('intern'), OWN, 'spice-part-b', 60);
      expect(out).toMatchObject({ url: 'https://signed', documentId: DOC, companyName: 'Acme' });
      expect(signedDownloadUrl).toHaveBeenCalledWith(docRow().storageKey, 60);
    });

    it('refuses a stored key outside the engagement', async () => {
      results = [[], [filingRow({ reviewedAt: now })], [docRow({ storageKey: `engagement-documents/${OTHER}/x.pdf` })]];
      await expect(filings.portalPdfForSigners(ctx('intern'), OWN, 'spice-part-b', 60)).rejects.toMatchObject({ code: 'no_portal_pdf' });
      expect(signedDownloadUrl).not.toHaveBeenCalled();
    });
  });
});

describe('the deadline job', () => {
  it('picks up a filing with an upload date inside the window, and marks only that row', async () => {
    results = [
      [
        {
          filing: filingRow({ srnAt: new Date('2026-11-01T06:00:00Z'), state: 'signed_ready' }),
          engagement: { id: OWN, slug: 'acme', companyName: 'Acme', internId: 'i1', managerId: null, adminId: null },
        },
      ],
    ];
    const due = await filings.systemFilingAlertsDue('2026-11-14');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ recipientId: 'lead-1', href: '/app/intern/engagements/acme', companyName: 'Acme' });
    expect(due[0]!.due[0]).toMatchObject({ key: 'upload', daysLeft: 2 });
    await filings.systemMarkFilingAlerted('f1', {}, ['upload'], '2026-11-14');
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.set).toEqual({ alertedOn: { upload: '2026-11-14' } });
    expect(paramsOf(update)).toEqual(['f1']);
  });
});
