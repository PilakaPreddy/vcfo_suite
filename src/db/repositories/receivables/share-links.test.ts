import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Access rules for the shared views (Phase 10, docs/specs/receivables/PLAN.md). Managing links
 * goes through the sheet's scope (its manager and the firm-wide admins); opening one follows the
 * link's visibility rule, and an unknown, revoked or expired token gives the same answer.
 */

type Call = { op: string; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'returning', 'groupBy']) c[m] = () => c;
  c.values = (v: unknown) => {
    call.values = v;
    return c;
  };
  c.set = (v: unknown) => {
    call.set = v;
    return c;
  };
  // A subquery: its columns are only read into SQL fragments, never awaited.
  c.as = () => new Proxy({}, { get: (_t, k) => sql.raw(String(k)) });
  c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(res, rej);
  return c;
}
const op = (name: string) => () => {
  const call: Call = { op: name };
  calls.push(call);
  return chain(call);
};
const db: Record<string, unknown> = { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') };
db.transaction = async (fn: (tx: unknown) => unknown) => fn(db);
vi.mock('@/db/client', () => ({ db }));
vi.mock('server-only', () => ({}));

const repo = await import('@/db/repositories/receivables');

const SHEET = '11111111-1111-1111-1111-111111111101';
const LINK = '44444444-4444-4444-4444-444444444404';
const MANAGER = '33333333-3333-3333-3333-333333333303';
const PARTNER = '55555555-5555-5555-5555-555555555505';
const VERSION = '66666666-6666-6666-6666-666666666606';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';
const NOW = new Date('2026-11-03T06:00:00Z');
const TODAY = '2026-11-03';

const ctx = (role: AuthContext['role'], userId = `user-${role}`, email = `${role}@vcfo.local`): AuthContext => ({ userId, email, name: role, role });
const manager = ctx('manager', MANAGER);
const writes = () => calls.filter((c) => c.op !== 'select');
const sheetRow = (over: Record<string, unknown> = {}) => ({
  id: SHEET,
  name: 'Summit Consulting',
  clientOrgName: 'Summit Consulting',
  managerUserId: MANAGER,
  publishedVersionId: VERSION,
  ...over,
});
const linkRow = (over: Record<string, unknown> = {}) => ({
  id: LINK,
  sheetId: SHEET,
  token: TOKEN,
  name: 'Overdue for Priya',
  filters: { status: 'all' },
  visibility: 'public',
  allowedEmails: [],
  allowDownload: true,
  expiresAt: null,
  revokedAt: null,
  viewCount: 0,
  lastViewedAt: null,
  createdBy: MANAGER,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const snapRow = (over: Record<string, unknown> = {}) => ({
  id: '22222222-2222-2222-2222-222222222202',
  invoiceMonth: '2026-09-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/09/03',
  partnerId: 'p-1',
  partnerSlug: 'priya',
  partnerName: 'Priya Raman',
  dueDate: '2026-10-16',
  amountInr: 100000,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: '2026-11-20',
  pauseReason: 'Client asked for time',
  currency: 'INR',
  fcAmount: null,
  fxRate: null,
  invoiceDate: null,
  receivedFc: null,
  tdsInr: 1000,
  disputed: true,
  ...over,
});
const version = () => [{ snapshot: [snapRow(), snapRow({ id: 'r2', partnerSlug: 'rahul', partnerName: 'Rahul', partnerId: 'p-2' })], publishedAt: NOW }];
const open = (viewer: AuthContext | null, log = true) => repo.systemOpenShareLink(TOKEN, viewer, { now: NOW, today: TODAY, log });

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe('managing links', () => {
  for (const role of ['intern', 'client', 'developer', 'partner'] as const) {
    it(`refuses ${role} before any query`, async () => {
      await expect(repo.listShareLinks(ctx(role), SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.createShareLink(ctx(role), SHEET, { name: 'x', filters: {}, visibility: 'public' })).rejects.toMatchObject({ status: 404 });
      await expect(repo.updateShareLink(ctx(role), LINK, { name: 'y' })).rejects.toMatchObject({ status: 404 });
      await expect(repo.revokeShareLink(ctx(role), LINK)).rejects.toMatchObject({ status: 404 });
      expect(calls).toHaveLength(0);
    });
  }

  it('refuses a manager of another sheet and writes nothing', async () => {
    const other = ctx('manager', '99999999-9999-9999-9999-999999999909');
    results = [[sheetRow()]];
    await expect(repo.listShareLinks(other, SHEET)).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.createShareLink(other, SHEET, { name: 'x', filters: {}, visibility: 'public' })).rejects.toMatchObject({ status: 404 });
    results = [[linkRow()], [sheetRow()]];
    await expect(repo.updateShareLink(other, LINK, { name: 'y' })).rejects.toMatchObject({ status: 404 });
    results = [[linkRow()], [sheetRow()]];
    await expect(repo.revokeShareLink(other, LINK)).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('creates a link with a 32-character URL-safe token and a clean filter', async () => {
    results = [[sheetRow()], [linkRow()]];
    await repo.createShareLink(manager, SHEET, { name: '  Overdue  ', filters: { status: 'overdue', search: '', bogus: 1 } as never, visibility: 'public' }, NOW);
    const insert = writes()[0];
    expect(insert.op).toBe('insert');
    const v = insert.values as { token: string; name: string; filters: unknown; allowedEmails: string[] };
    expect(v.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(v.name).toBe('Overdue');
    expect(v.filters).toEqual({ status: 'overdue' });
    expect(v.allowedEmails).toEqual([]);
  });

  it('lets a firm-wide admin create a link on any sheet', async () => {
    results = [[sheetRow({ managerUserId: null })], [linkRow()]];
    await repo.createShareLink(ctx('admin'), SHEET, { name: 'All', filters: {}, visibility: 'login' }, NOW);
    expect(writes()).toHaveLength(1);
  });

  it('needs at least one valid email for a restricted link and lower-cases them', async () => {
    results = [[sheetRow()]];
    await expect(repo.createShareLink(manager, SHEET, { name: 'x', filters: {}, visibility: 'restricted', allowedEmails: [] }, NOW)).rejects.toMatchObject({ code: 'allowed_emails' });
    results = [[sheetRow()]];
    await expect(repo.createShareLink(manager, SHEET, { name: 'x', filters: {}, visibility: 'restricted', allowedEmails: ['not-an-email'] }, NOW)).rejects.toMatchObject({ code: 'allowed_emails' });
    results = [[sheetRow()], [linkRow()]];
    await repo.createShareLink(manager, SHEET, { name: 'x', filters: {}, visibility: 'restricted', allowedEmails: ['Priya.Partner@VCFO.local', 'priya.partner@vcfo.local'] }, NOW);
    expect((writes()[0].values as { allowedEmails: string[] }).allowedEmails).toEqual(['priya.partner@vcfo.local']);
  });

  it('refuses an expiry in the past and an unknown visibility', async () => {
    results = [[sheetRow()]];
    await expect(repo.createShareLink(manager, SHEET, { name: 'x', filters: {}, visibility: 'public', expiresAt: new Date('2026-11-01T00:00:00Z') }, NOW)).rejects.toMatchObject({ code: 'expires_at' });
    results = [[sheetRow()]];
    await expect(repo.createShareLink(manager, SHEET, { name: 'x', filters: {}, visibility: 'everyone' as never }, NOW)).rejects.toMatchObject({ code: 'visibility' });
  });

  it('does not edit a revoked link, and revoking twice writes once', async () => {
    results = [[linkRow({ revokedAt: NOW })], [sheetRow()]];
    await expect(repo.updateShareLink(manager, LINK, { name: 'y' })).rejects.toMatchObject({ status: 409 });
    results = [[linkRow({ revokedAt: NOW })], [sheetRow()]];
    await repo.revokeShareLink(manager, LINK);
    expect(writes()).toHaveLength(0);
    results = [[linkRow()], [sheetRow()], [linkRow({ revokedAt: NOW })]];
    await repo.revokeShareLink(manager, LINK, NOW);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].set).toMatchObject({ revokedAt: NOW });
  });

  it('clears the email list when a restricted link becomes public', async () => {
    results = [[linkRow({ visibility: 'restricted', allowedEmails: ['a@b.co'] })], [sheetRow()], [linkRow()]];
    await repo.updateShareLink(manager, LINK, { visibility: 'public' }, NOW);
    expect(writes()[0].set).toMatchObject({ visibility: 'public', allowedEmails: [] });
  });

  it('lists the links with their recent viewers', async () => {
    results = [[sheetRow()], [{ link: linkRow(), createdByName: 'Manager' }], [{ linkId: LINK, viewerEmail: 'priya@x.co', viewerName: 'Priya', viewedAt: NOW, n: 1 }]];
    const out = await repo.listShareLinks(manager, SHEET);
    expect(out).toHaveLength(1);
    expect(out[0].viewers).toEqual([{ viewerEmail: 'priya@x.co', viewerName: 'Priya', viewedAt: NOW }]);
  });
});

describe('opening a link', () => {
  it('gives not_found for a malformed token without a query', async () => {
    expect(await repo.systemOpenShareLink('short', null)).toEqual({ status: 'not_found' });
    expect(calls).toHaveLength(0);
  });

  it('gives the same not_found for an unknown, revoked or expired link', async () => {
    results = [[]];
    expect(await open(null)).toEqual({ status: 'not_found' });
    results = [[linkRow({ revokedAt: NOW })]];
    expect(await open(manager)).toEqual({ status: 'not_found' });
    results = [[linkRow({ expiresAt: new Date('2026-11-02T00:00:00Z') })]];
    expect(await open(manager)).toEqual({ status: 'not_found' });
    expect(writes()).toHaveLength(0);
  });

  it('opens a public link for anyone, strips internal fields and logs the view', async () => {
    results = [[linkRow()], [sheetRow()], version()];
    const out = await open(null);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.view.rows).toHaveLength(2);
    expect(out.view.rows[0]).toMatchObject({ tdsInr: 0, disputed: false, pauseReason: null, remindersPausedUntil: null, partnerId: null });
    expect(out.view.staffViewer).toBe(false);
    expect(writes().map((w) => w.op)).toEqual(['insert', 'update']);
    expect(writes()[0].values).toMatchObject({ linkId: LINK, viewerId: null, viewerEmail: null });
  });

  it('applies the saved filter to the published rows', async () => {
    results = [[linkRow({ filters: { partnerSlugs: ['priya'], status: 'all' } })], [sheetRow()], version()];
    const out = await open(null, false);
    expect(out.status === 'ok' && out.view.rows.map((r) => r.partnerSlug)).toEqual(['priya']);
    expect(out.status === 'ok' && out.view.link.filterText).toBe('Priya Raman · All invoices');
    expect(writes()).toHaveLength(0);
  });

  it('asks a signed-out visitor of a login or restricted link to sign in', async () => {
    results = [[linkRow({ visibility: 'login' })], [sheetRow()]];
    expect(await open(null)).toEqual({ status: 'needs_login' });
    results = [[linkRow({ visibility: 'restricted', allowedEmails: ['a@b.co'] })], [sheetRow()]];
    expect(await open(null)).toEqual({ status: 'needs_login' });
    expect(writes()).toHaveLength(0);
  });

  it('opens a login link for a partner of the sheet with every shared row, not only theirs', async () => {
    results = [[linkRow({ visibility: 'login' })], [sheetRow()], [{ id: 'p-1' }], version()];
    const out = await open(ctx('partner', PARTNER));
    expect(out.status).toBe('ok');
    expect(out.status === 'ok' && out.view.rows).toHaveLength(2);
    expect(out.status === 'ok' && out.view.rows[0].tdsInr).toBe(0);
  });

  it('refuses a login link to a partner of another sheet and to other roles', async () => {
    results = [[linkRow({ visibility: 'login' })], [sheetRow()], []];
    expect(await open(ctx('partner', PARTNER))).toEqual({ status: 'forbidden' });
    for (const role of ['intern', 'client'] as const) {
      results = [[linkRow({ visibility: 'login' })], [sheetRow()]];
      expect(await open(ctx(role))).toEqual({ status: 'forbidden' });
    }
    results = [[linkRow({ visibility: 'login' })], [sheetRow()]];
    expect(await open(ctx('manager', '99999999-9999-9999-9999-999999999909'))).toEqual({ status: 'forbidden' });
    expect(writes()).toHaveLength(0);
  });

  it('opens a restricted link only for the listed emails, matched without case', async () => {
    const restricted = () => [[linkRow({ visibility: 'restricted', allowedEmails: ['priya.partner@vcfo.local'] })], [sheetRow()]];
    results = [...restricted(), version()];
    expect((await open(ctx('partner', PARTNER, 'Priya.Partner@vcfo.local'))).status).toBe('ok');
    results = restricted();
    expect(await open(ctx('partner', 'rahul', 'rahul.partner@vcfo.local'))).toEqual({ status: 'forbidden' });
    results = restricted();
    expect(await open(ctx('intern'))).toEqual({ status: 'forbidden' });
  });

  it('always opens for the sheet’s manager and a firm-wide admin, with the internal fields', async () => {
    for (const viewer of [manager, ctx('admin'), ctx('super_admin')]) {
      results = [[linkRow({ visibility: 'restricted', allowedEmails: ['someone@x.co'] })], [sheetRow()], version()];
      const out = await open(viewer, false);
      expect(out.status).toBe('ok');
      expect(out.status === 'ok' && out.view.staffViewer).toBe(true);
      expect(out.status === 'ok' && out.view.rows[0].tdsInr).toBe(1000);
    }
  });

  it('shows an empty view when nothing is published yet', async () => {
    results = [[linkRow()], [sheetRow({ publishedVersionId: null })]];
    const out = await open(null, false);
    expect(out.status === 'ok' && out.view.rows).toEqual([]);
    expect(out.status === 'ok' && out.view.publishedAt).toBeNull();
  });
});
