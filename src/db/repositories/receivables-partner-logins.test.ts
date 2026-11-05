import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Phase 8, the manager side (docs/specs/receivables/PLAN.md): partner login invites and invoice
 * notes are for the sheet's own manager and the firm-wide admins only; another manager reads the
 * partner or invoice as not found and writes nothing; interns, clients and partners are refused
 * before any query. The set-password link works once and only until it expires.
 */

type Call = { op: string; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c;
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
const db: Record<string, unknown> = { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') };
db.transaction = async (fn: (tx: unknown) => unknown) => fn(db);
vi.mock('@/db/client', () => ({ db }));
vi.mock('server-only', () => ({}));
// `after` runs its callback once the current tick is done, as it would after the response.
vi.mock('next/server', async (orig) => ({ ...(await orig<Record<string, unknown>>()), after: (fn: () => unknown) => void Promise.resolve().then(fn) }));
const sendEmail = vi.fn();
vi.mock('@/lib/email/send-email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const repo = await import('@/db/repositories/receivables');
const { hashSetPasswordToken } = await import('@/db/repositories/client-team');

const SHEET = '11111111-1111-1111-1111-111111111101';
const INVOICE = '22222222-2222-2222-2222-222222222202';
const MANAGER = '33333333-3333-3333-3333-333333333303';
const PARTNER = '55555555-5555-5555-5555-555555555505';
const PROFILE = '66666666-6666-6666-6666-666666666606';
const TOKEN = 'A'.repeat(43);
const NOW = new Date('2026-11-03T06:00:00Z');

const ctx = (role: AuthContext['role'], userId = `user-${role}`): AuthContext => ({ userId, email: `${role}@vcfo.local`, name: role, role });
const me = ctx('manager', MANAGER);
const other = ctx('manager', '99999999-9999-9999-9999-999999999909');
const writes = () => calls.filter((c) => c.op !== 'select');

const sheetRow = () => ({ id: SHEET, name: 'Summit', clientOrgName: 'Summit Consulting', managerUserId: MANAGER, publicKey: 'abcdefghijkl', requireKey: true, publishedVersionId: null });
const partnerRow = (over: Record<string, unknown> = {}) => ({
  id: PARTNER,
  sheetId: SHEET,
  slug: 'yash',
  name: 'Yash Babbar',
  email: 'Yash.Babbar@summit.in',
  active: true,
  profileId: null,
  notifyOnPublish: true,
  setPasswordTokenHash: null,
  setPasswordExpiresAt: null,
  invitedAt: null,
  inviteSendCount: 0,
  acceptedAt: null,
  createdAt: NOW,
  ...over,
});
const invoiceRow = (over: Record<string, unknown> = {}) => ({ id: INVOICE, sheetId: SHEET, clientName: 'Duravant', invoiceNo: 'SC/09/03', partnerId: PARTNER, deletedAt: null, ...over });

beforeEach(() => {
  calls.length = 0;
  results = [];
  sendEmail.mockReset();
});

describe('partner login actions: who may act', () => {
  for (const role of ['intern', 'client', 'partner', 'developer'] as const) {
    it(`refuses ${role} before any query`, async () => {
      await expect(repo.partnerLoginAction(ctx(role), PARTNER, 'invite')).rejects.toMatchObject({ status: 404 });
      await expect(repo.listNotes(ctx(role), INVOICE)).rejects.toMatchObject({ status: 404 });
      await expect(repo.addSbcNote(ctx(role), INVOICE, 'Hello')).rejects.toMatchObject({ status: 404 });
      expect(calls).toHaveLength(0);
    });
  }

  it('reads another sheet’s partner as not found and writes nothing', async () => {
    for (const action of ['invite', 'resend', 'reset', 'disable', 'enable'] as const) {
      results = [[partnerRow({ profileId: PROFILE })], [sheetRow()]];
      await expect(repo.partnerLoginAction(other, PARTNER, action)).rejects.toMatchObject({ status: 404 });
    }
    expect(writes()).toHaveLength(0);
  });
});

describe('invite', () => {
  it('creates a partner profile with no password, links it and stores only the token hash', async () => {
    results = [[partnerRow()], [sheetRow()], [], [{ id: PROFILE }], [partnerRow({ profileId: PROFILE, invitedAt: NOW, inviteSendCount: 1 })], []];
    const r = await repo.partnerLoginAction(me, PARTNER, 'invite', TOKEN, NOW);
    const [insert, update] = writes();
    expect(insert.values).toMatchObject({ email: 'yash.babbar@summit.in', role: 'partner', passwordHash: null, status: 'active' });
    expect(update.set).toMatchObject({ profileId: PROFILE, setPasswordTokenHash: hashSetPasswordToken(TOKEN), acceptedAt: null, inviteSendCount: 1 });
    expect((update.set as { setPasswordExpiresAt: Date }).setPasswordExpiresAt.getTime()).toBe(NOW.getTime() + 7 * 24 * 3600 * 1000);
    expect(JSON.stringify(update.set)).not.toContain(TOKEN);
    expect(r.email).toMatchObject({ to: 'yash.babbar@summit.in', token: TOKEN, kind: 'set_password', clientOrgName: 'Summit Consulting' });
    expect(r.partner.loginState).toBe('invited');
  });

  it('makes its own token when the browser sends none', async () => {
    results = [[partnerRow()], [sheetRow()], [], [{ id: PROFILE }], [partnerRow({ profileId: PROFILE })], []];
    const r = await repo.partnerLoginAction(me, PARTNER, 'invite', null, NOW);
    expect(r.email?.token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
  });

  it('refuses an email that belongs to staff or a client', async () => {
    for (const role of ['manager', 'client', 'super_admin']) {
      results = [[partnerRow()], [sheetRow()], [{ id: PROFILE, role, status: 'active', passwordHash: 'x' }]];
      await expect(repo.partnerLoginAction(me, PARTNER, 'invite', TOKEN, NOW)).rejects.toMatchObject({ status: 409, code: 'email_in_use' });
    }
    expect(writes()).toHaveLength(0);
  });

  it('links an existing partner login that has a password, with no link in the email', async () => {
    results = [[partnerRow()], [sheetRow()], [{ id: PROFILE, role: 'partner', status: 'active', passwordHash: '$2a$hash' }], [partnerRow({ profileId: PROFILE, acceptedAt: NOW })], []];
    const r = await repo.partnerLoginAction(me, PARTNER, 'invite', TOKEN, NOW);
    expect(writes().filter((w) => w.op === 'insert' && (w.values as { role?: string }).role === 'partner')).toHaveLength(0);
    expect(writes()[0].set).toMatchObject({ profileId: PROFILE, acceptedAt: NOW, setPasswordTokenHash: null });
    expect(r.email).toMatchObject({ token: null, kind: 'access_added' });
    expect(r.partner.loginState).toBe('active');
  });

  it('will not invite twice', async () => {
    results = [[partnerRow({ profileId: PROFILE })], [sheetRow()], [{ id: PROFILE, email: 'y@s.in', role: 'partner', status: 'active', passwordHash: null }]];
    await expect(repo.partnerLoginAction(me, PARTNER, 'invite', TOKEN, NOW)).rejects.toMatchObject({ code: 'already_invited' });
    expect(writes()).toHaveLength(0);
  });
});

describe('resend, reset, disable, enable', () => {
  const profile = (over: Record<string, unknown> = {}) => ({ id: PROFILE, email: 'yash.babbar@summit.in', role: 'partner', status: 'active', passwordHash: null, ...over });

  it('resends only while the invite is pending, reset only after the password is set', async () => {
    results = [[partnerRow({ profileId: PROFILE, acceptedAt: NOW })], [sheetRow()], [profile()]];
    await expect(repo.partnerLoginAction(me, PARTNER, 'resend', TOKEN, NOW)).rejects.toMatchObject({ code: 'already_accepted' });
    results = [[partnerRow({ profileId: PROFILE })], [sheetRow()], [profile()]];
    await expect(repo.partnerLoginAction(me, PARTNER, 'reset', TOKEN, NOW)).rejects.toMatchObject({ code: 'not_accepted' });
    expect(writes()).toHaveLength(0);
  });

  it('reset stores a new token hash and emails the link', async () => {
    results = [[partnerRow({ profileId: PROFILE, acceptedAt: NOW })], [sheetRow()], [profile({ passwordHash: 'h' })], [partnerRow({ profileId: PROFILE, acceptedAt: NOW })], []];
    const r = await repo.partnerLoginAction(me, PARTNER, 'reset', TOKEN, NOW);
    expect(writes()[0].set).toMatchObject({ setPasswordTokenHash: hashSetPasswordToken(TOKEN) });
    expect(r.email).toMatchObject({ to: 'yash.babbar@summit.in', token: TOKEN, kind: 'set_password' });
  });

  it('disable turns the profile login off, keeps the partner row and drops a pending link', async () => {
    results = [[partnerRow({ profileId: PROFILE, acceptedAt: NOW })], [sheetRow()], [profile()], [], [partnerRow({ profileId: PROFILE, acceptedAt: NOW })], []];
    const r = await repo.partnerLoginAction(me, PARTNER, 'disable', null, NOW);
    const [profileUpdate, partnerUpdate] = writes();
    expect(profileUpdate.set).toMatchObject({ status: 'inactive' });
    expect(partnerUpdate.set).toEqual({ setPasswordTokenHash: null, setPasswordExpiresAt: null });
    expect(writes().some((w) => w.op === 'delete')).toBe(false);
    expect(r.partner.loginState).toBe('disabled');
    expect(r.email).toBeNull();
  });

  it('enable turns back on only a login that was disabled here', async () => {
    results = [[partnerRow({ profileId: PROFILE, acceptedAt: NOW })], [sheetRow()], [profile({ status: 'removed' })]];
    await expect(repo.partnerLoginAction(me, PARTNER, 'enable', null, NOW)).rejects.toMatchObject({ code: 'not_disabled' });
    expect(writes()).toHaveLength(0);
    results = [[partnerRow({ profileId: PROFILE, acceptedAt: NOW })], [sheetRow()], [profile({ status: 'inactive' })], [], []];
    const r = await repo.partnerLoginAction(me, PARTNER, 'enable', null, NOW);
    expect(writes()[0].set).toMatchObject({ status: 'active' });
    expect(r.partner.loginState).toBe('active');
  });
});

describe('the set-password link', () => {
  const tokenRow = (over: Record<string, unknown> = {}) => ({
    partner: partnerRow({ profileId: PROFILE, setPasswordTokenHash: hashSetPasswordToken(TOKEN), setPasswordExpiresAt: new Date(NOW.getTime() + 3600_000) }),
    email: 'yash.babbar@summit.in',
    role: 'partner',
    status: 'active',
    clientOrgName: 'Summit Consulting',
    ...over,
  });

  it('refuses a malformed token without a query', async () => {
    await expect(repo.systemPeekPartnerToken("x' or 1=1", NOW)).resolves.toBeNull();
    await expect(repo.systemSetPartnerPassword('short', 'a-good-password', NOW)).resolves.toEqual({ status: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('shows the email and the organisation for a good link', async () => {
    results = [[tokenRow()]];
    await expect(repo.systemPeekPartnerToken(TOKEN, NOW)).resolves.toEqual({ email: 'yash.babbar@summit.in', companyName: 'Summit Consulting' });
  });

  it('refuses an expired link', async () => {
    results = [[tokenRow({ partner: partnerRow({ profileId: PROFILE, setPasswordExpiresAt: new Date(NOW.getTime() - 1) }) })]];
    await expect(repo.systemPeekPartnerToken(TOKEN, NOW)).resolves.toBeNull();
    results = [[tokenRow({ partner: partnerRow({ profileId: PROFILE, setPasswordExpiresAt: new Date(NOW.getTime() - 1) }) })]];
    await expect(repo.systemSetPartnerPassword(TOKEN, 'a-good-password', NOW)).resolves.toEqual({ status: 'invalid' });
    expect(writes()).toHaveLength(0);
  });

  it('refuses a disabled login and a non-partner profile', async () => {
    results = [[tokenRow({ status: 'inactive' })]];
    await expect(repo.systemPeekPartnerToken(TOKEN, NOW)).resolves.toBeNull();
    results = [[tokenRow({ role: 'manager' })]];
    await expect(repo.systemSetPartnerPassword(TOKEN, 'a-good-password', NOW)).resolves.toEqual({ status: 'invalid' });
    expect(writes()).toHaveLength(0);
  });

  it('refuses a short password before any query', async () => {
    await expect(repo.systemSetPartnerPassword(TOKEN, 'short', NOW)).resolves.toEqual({ status: 'too_short' });
    expect(calls).toHaveLength(0);
  });

  it('sets the password once: the token is cleared, and a second use is refused', async () => {
    results = [[tokenRow()], [{ id: PARTNER }], [], []];
    await expect(repo.systemSetPartnerPassword(TOKEN, 'a-good-password', NOW)).resolves.toEqual({ status: 'ok', email: 'yash.babbar@summit.in' });
    const [used, pw] = writes();
    expect(used.set).toMatchObject({ setPasswordTokenHash: null, setPasswordExpiresAt: null, acceptedAt: NOW });
    expect(String((pw.set as { passwordHash: string }).passwordHash)).toMatch(/^\$2[aby]\$10\$/);

    // Second use: the token no longer matches any row.
    calls.length = 0;
    results = [[]];
    await expect(repo.systemSetPartnerPassword(TOKEN, 'another-password', NOW)).resolves.toEqual({ status: 'invalid' });
    expect(writes()).toHaveLength(0);

    // A race where another request cleared the token first: the guarded update returns nothing.
    calls.length = 0;
    results = [[tokenRow()], []];
    await expect(repo.systemSetPartnerPassword(TOKEN, 'another-password', NOW)).resolves.toEqual({ status: 'invalid' });
    expect(writes().filter((w) => (w.set as { passwordHash?: string }).passwordHash)).toHaveLength(0);
  });
});

describe('invoice notes', () => {
  it('another manager reads the invoice as not found and writes nothing', async () => {
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.listNotes(other, INVOICE)).rejects.toMatchObject({ status: 404 });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.addSbcNote(other, INVOICE, 'Hello')).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('lists the notes of the manager’s own invoice', async () => {
    results = [[invoiceRow()], [sheetRow()], [{ id: 'n1', invoiceId: INVOICE, authorName: 'Yash', fromSbc: false, text: 'Paying Friday', createdAt: NOW }]];
    await expect(repo.listNotes(me, INVOICE)).resolves.toEqual([{ id: 'n1', invoiceId: INVOICE, authorName: 'Yash', fromSbc: false, text: 'Paying Friday', createdAt: NOW.toISOString() }]);
  });

  it('saves a reply as from SBC and names the partner to email when their login is active', async () => {
    results = [
      [invoiceRow()],
      [sheetRow()],
      [{ id: 'n2', invoiceId: INVOICE, authorName: 'manager', fromSbc: true, text: 'Thanks', createdAt: NOW }],
      [{ name: 'Yash Babbar', active: true, acceptedAt: NOW, email: 'yash.babbar@summit.in', status: 'active' }],
    ];
    const r = await repo.addSbcNote(me, INVOICE, '  Thanks  ');
    expect(writes()[0].values).toMatchObject({ sheetId: SHEET, invoiceId: INVOICE, authorId: MANAGER, fromSbc: true, text: 'Thanks' });
    expect(r).toMatchObject({ invoiceId: INVOICE, invoiceLabel: 'Duravant SC/09/03', notify: { email: 'yash.babbar@summit.in', name: 'Yash Babbar' } });
  });

  it('emails nobody when the partner has no active login, and refuses an empty reply', async () => {
    results = [[invoiceRow()], [sheetRow()], [{ id: 'n3', invoiceId: INVOICE, authorName: 'manager', fromSbc: true, text: 'x', createdAt: NOW }], [{ name: 'Yash', active: true, acceptedAt: null, email: 'y@s.in', status: 'active' }]];
    await expect(repo.addSbcNote(me, INVOICE, 'x')).resolves.toMatchObject({ notify: null });
    calls.length = 0;
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.addSbcNote(me, INVOICE, '   ')).rejects.toMatchObject({ status: 400, code: 'note' });
    expect(writes()).toHaveLength(0);
  });
});

describe('publish alerts', () => {
  const snap = (over: Record<string, unknown> = {}) => ({
    id: INVOICE,
    invoiceMonth: '2026-09-01',
    clientName: 'Duravant',
    invoiceNo: 'SC/09/03',
    partnerId: PARTNER,
    dueDate: '2026-10-16',
    amountInr: 6456984,
    status: 'open',
    paidOn: null,
    paidAmount: null,
    paidVia: null,
    partPaid: 0,
    remindersPausedUntil: null,
    pauseReason: null,
    partnerSlug: 'yash',
    partnerName: 'Yash Babbar',
    ...over,
  });
  const publishResults = (alertPartners: unknown[]) => [
    [sheetRow()],
    [{ seq: 1, publishedAt: NOW, snapshot: [snap()] }],
    [{ summary: 'Duravant SC/09/03 marked received' }],
    [{ invoice: { ...invoiceRow(), invoiceMonth: '2026-09-01', dueDate: '2026-10-16', amountInr: '6456984.00', status: 'received', partPaid: '0' }, partnerSlug: 'yash', partnerName: 'Yash Babbar' }],
    [{ id: 'v2', seq: 2, note: 'x', publishedAt: NOW, publishedByName: 'manager' }],
    [],
    alertPartners,
  ];
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it('emails a partner whose invoice changed, after the publish', async () => {
    sendEmail.mockResolvedValue({ ok: true });
    results = publishResults([{ id: PARTNER, name: 'Yash Babbar', email: 'yash.babbar@summit.in', status: 'active' }]);
    await expect(repo.publishSheet(me, SHEET)).resolves.toMatchObject({ seq: 2 });
    await flush();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'yash.babbar@summit.in', purpose: 'receivables.publish_alert' });
    expect(sendEmail.mock.calls[0][0].text).toContain('marked received');
  });

  it('never fails the publish when the email throws, and skips a disabled login', async () => {
    sendEmail.mockRejectedValue(new Error('provider down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    results = publishResults([{ id: PARTNER, name: 'Yash Babbar', email: 'yash.babbar@summit.in', status: 'active' }]);
    await expect(repo.publishSheet(me, SHEET)).resolves.toMatchObject({ seq: 2 });
    await flush();
    expect(log).toHaveBeenCalled();
    sendEmail.mockReset();
    results = publishResults([{ id: PARTNER, name: 'Yash Babbar', email: 'yash.babbar@summit.in', status: 'inactive' }]);
    await repo.publishSheet(me, SHEET);
    await flush();
    expect(sendEmail).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
