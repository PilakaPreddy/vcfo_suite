import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Cross-tenant rules of the client partner portal (Phase 8, docs/specs/receivables/PLAN.md):
 * only the `partner` role gets past the first line, a partner sees only their own rows of the
 * latest published version (never the draft, never another partner's), another partner's invoice
 * reads as not found and nothing is written, and a promise pauses reminders and logs a change that
 * needs no Update. The database is mocked: each query takes the next canned result.
 */

type Call = { op: string; table?: unknown; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'groupBy', 'returning', 'onConflictDoNothing']) c[m] = () => c;
  c.from = (t: unknown) => {
    call.table = t;
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
const op =
  (name: string) =>
  (table?: unknown): unknown => {
    const call: Call = { op: name, table };
    calls.push(call);
    return chain(call);
  };
const db: Record<string, unknown> = { select: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') };
db.transaction = async (fn: (tx: unknown) => unknown) => fn(db);
vi.mock('@/db/client', () => ({ db }));
vi.mock('server-only', () => ({}));

const repo = await import('@/db/repositories/receivables');
const schema = await import('@/db/schema');

const SHEET = '11111111-1111-1111-1111-111111111101';
const MINE = '22222222-2222-2222-2222-222222222201';
const THEIRS = '22222222-2222-2222-2222-222222222202';
const DRAFT_ONLY = '22222222-2222-2222-2222-222222222203';
const ME = '33333333-3333-3333-3333-333333333301';
const P_ME = '44444444-4444-4444-4444-444444444401';
const P_OTHER = '44444444-4444-4444-4444-444444444402';
const V1 = '55555555-5555-5555-5555-555555555501';
const TODAY = '2026-11-03';

const ctx = (role: AuthContext['role'], userId = ME): AuthContext => ({ userId, email: 'yash@summit.example', name: 'Yash Babbar', role });
const writes = () => calls.filter((c) => c.op !== 'select');

const link = (over: Record<string, unknown> = {}) => ({
  partnerId: P_ME,
  sheetId: SHEET,
  name: 'Yash Babbar',
  email: 'yash@summit.example',
  notifyOnPublish: true,
  clientOrgName: 'Summit Consulting',
  publishedVersionId: V1,
  ...over,
});
const snapRow = (id: string, partnerId: string | null, over: Record<string, unknown> = {}) => ({
  id,
  invoiceMonth: '2026-09-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/09/03',
  partnerId,
  dueDate: '2026-10-16',
  amountInr: 6456984,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  partnerSlug: partnerId === P_ME ? 'yash' : 'sandeep',
  partnerName: partnerId === P_ME ? 'Yash Babbar' : 'Sandeep Sharma',
  ...over,
});
const version = (rows = [snapRow(MINE, P_ME), snapRow(THEIRS, P_OTHER)]) => ({ id: V1, sheetId: SHEET, snapshot: rows, publishedAt: new Date('2026-11-02T10:00:00Z') });
const liveRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  sheetId: SHEET,
  clientName: 'Duravant',
  invoiceNo: 'SC/09/03',
  partnerId: P_ME,
  status: 'open',
  promisedOn: null,
  remindersPausedUntil: null,
  pauseReason: null,
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe('roles other than partner', () => {
  for (const role of ['super_admin', 'admin', 'manager', 'intern', 'client', 'developer'] as const) {
    it(`refuses ${role} with 403 before any query`, async () => {
      await expect(repo.partnerHome(ctx(role), TODAY)).rejects.toMatchObject({ status: 403 });
      await expect(repo.partnerInvoiceDetail(ctx(role), MINE, TODAY)).rejects.toMatchObject({ status: 403 });
      await expect(repo.setPromise(ctx(role), MINE, '2026-11-20', null, TODAY)).rejects.toMatchObject({ status: 403 });
      await expect(repo.addPartnerNote(ctx(role), MINE, 'Paying Friday')).rejects.toMatchObject({ status: 403 });
      await expect(repo.setNotifyOnPublish(ctx(role), false)).rejects.toMatchObject({ status: 403 });
      await expect(repo.partnerExportRows(ctx(role))).rejects.toMatchObject({ status: 403 });
      expect(calls).toHaveLength(0);
    });
  }

  it('refuses a partner login with no active partner row', async () => {
    results = [[]];
    await expect(repo.partnerHome(ctx('partner'), TODAY)).rejects.toMatchObject({ status: 403 });
    results = [[]];
    await expect(repo.setNotifyOnPublish(ctx('partner'), false)).rejects.toMatchObject({ status: 403 });
    expect(writes()).toHaveLength(0);
  });
});

describe('the partner home', () => {
  it('shows only the partner’s own published rows, with live promise and note count', async () => {
    results = [[link()], [version()], [{ id: MINE, promisedOn: '2026-11-20' }], [{ invoiceId: MINE, n: 2 }]];
    const home = await repo.partnerHome(ctx('partner'), TODAY);
    expect(home.rows.map((r) => r.id)).toEqual([MINE]);
    expect(home.rows[0]).toMatchObject({ promisedOn: '2026-11-20', noteCount: 2, partnerId: null });
    expect(home).toMatchObject({ clientOrgName: 'Summit Consulting', today: TODAY, publishedAt: '2026-11-02T10:00:00.000Z', partner: { name: 'Yash Babbar', notifyOnPublish: true } });
    expect(writes()).toHaveLength(0);
  });

  it('is empty, with no published date, before the first Update', async () => {
    results = [[link({ publishedVersionId: null })]];
    const home = await repo.partnerHome(ctx('partner'), TODAY);
    expect(home.publishedAt).toBeNull();
    expect(home.rows).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('ignores a version that is not the one the sheet points to', async () => {
    results = [[link({ publishedVersionId: V1 })], [{ ...version(), id: 'other-version' }]];
    const home = await repo.partnerHome(ctx('partner'), TODAY);
    expect(home.rows).toEqual([]);
  });

  it('exports only the partner’s own rows', async () => {
    results = [[link()], [version()]];
    const out = await repo.partnerExportRows(ctx('partner'));
    expect(out.rows.map((r) => r.id)).toEqual([MINE]);
  });
});

describe('another partner’s invoice and unpublished rows', () => {
  it('reads another partner’s invoice as not found', async () => {
    results = [[link()], [version()]];
    await expect(repo.partnerInvoiceDetail(ctx('partner'), THEIRS, TODAY)).rejects.toMatchObject({ status: 404 });
  });

  it('reads a draft-only invoice as not found', async () => {
    results = [[link()], [version()]];
    await expect(repo.partnerInvoiceDetail(ctx('partner'), DRAFT_ONLY, TODAY)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a malformed id before any query', async () => {
    await expect(repo.partnerInvoiceDetail(ctx('partner'), "x' or 1=1", TODAY)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('writes nothing on another partner’s or an unpublished invoice', async () => {
    results = [[link()], [version()]];
    await expect(repo.setPromise(ctx('partner'), THEIRS, '2026-11-20', 'x', TODAY)).rejects.toMatchObject({ status: 404 });
    results = [[link()], [version()]];
    await expect(repo.addPartnerNote(ctx('partner'), DRAFT_ONLY, 'hello')).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('writes nothing once the draft moved the invoice to another partner', async () => {
    results = [[link()], [version()], [liveRow(MINE, { partnerId: P_OTHER })]];
    await expect(repo.addPartnerNote(ctx('partner'), MINE, 'hello')).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });
});

describe('invoice details', () => {
  it('returns the reminders, the current pause and the notes', async () => {
    results = [
      [link()],
      [version()],
      [{ promisedOn: '2026-11-20', remindersPausedUntil: '2026-11-20', pauseReason: 'Promised to pay on 20-Nov-26' }],
      [{ forDate: '2026-11-02', kind: 'overdue', daysLeft: -17, status: 'sent', sentAt: new Date('2026-11-02T03:30:00Z') }],
      [{ id: 'n1', text: 'Paying Friday', authorName: 'Yash Babbar', fromSbc: false, createdAt: new Date('2026-11-02T05:00:00Z') }],
    ];
    const d = await repo.partnerInvoiceDetail(ctx('partner'), MINE, TODAY);
    expect(d.row).toMatchObject({ id: MINE, promisedOn: '2026-11-20', noteCount: 1 });
    expect(d.pause).toEqual({ until: '2026-11-20', reason: 'Promised to pay on 20-Nov-26' });
    expect(d.reminders).toEqual([{ forDate: '2026-11-02', label: '17 days overdue', status: 'sent', sentAt: '2026-11-02T03:30:00.000Z' }]);
    expect(d.notes[0]).toMatchObject({ id: 'n1', fromSbc: false, authorName: 'Yash Babbar' });
  });

  it('shows no pause once it has passed', async () => {
    results = [[link()], [version()], [{ promisedOn: null, remindersPausedUntil: '2026-10-01', pauseReason: 'Old' }], [], []];
    const d = await repo.partnerInvoiceDetail(ctx('partner'), MINE, TODAY);
    expect(d.pause).toBeNull();
  });
});

describe('promise to pay', () => {
  it('saves the promise, pauses reminders to that date, logs a change that needs no Update and adds the note', async () => {
    results = [[link()], [version()], [liveRow(MINE)]];
    await repo.setPromise(ctx('partner'), MINE, '2026-11-20', 'Client confirmed by phone', TODAY);
    const update = writes().find((c) => c.op === 'update');
    expect(update?.table).toBe(schema.receivableInvoices);
    expect(update?.set).toMatchObject({ promisedOn: '2026-11-20', promisedBy: ME, remindersPausedUntil: '2026-11-20', pauseReason: 'Promised to pay on 20-Nov-26' });
    const inserts = writes().filter((c) => c.op === 'insert');
    expect(inserts.find((c) => c.table === schema.receivableChanges)?.values).toMatchObject({ field: 'promisedOn', after: '2026-11-20', affectsPage: false, actorId: ME });
    expect(inserts.find((c) => c.table === schema.receivableInvoiceNotes)?.values).toMatchObject({ fromSbc: false, authorId: ME, text: 'Client confirmed by phone' });
  });

  it('keeps a longer pause the manager already set', async () => {
    results = [[link()], [version()], [liveRow(MINE, { remindersPausedUntil: '2026-12-31', pauseReason: 'Dispute' })]];
    await repo.setPromise(ctx('partner'), MINE, '2026-11-20', null, TODAY);
    const update = writes().find((c) => c.op === 'update');
    expect(update?.set).toMatchObject({ promisedOn: '2026-11-20' });
    expect(update?.set).not.toHaveProperty('remindersPausedUntil');
  });

  it('refuses a past date or one more than a year ahead without a query', async () => {
    await expect(repo.setPromise(ctx('partner'), MINE, '2026-11-02', null, TODAY)).rejects.toMatchObject({ status: 400, code: 'promised_on' });
    await expect(repo.setPromise(ctx('partner'), MINE, '2028-01-01', null, TODAY)).rejects.toMatchObject({ code: 'promised_on' });
    await expect(repo.setPromise(ctx('partner'), MINE, 'soon', null, TODAY)).rejects.toMatchObject({ code: 'promised_on' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a received invoice', async () => {
    results = [[link()], [version()], [liveRow(MINE, { status: 'received' })]];
    await expect(repo.setPromise(ctx('partner'), MINE, '2026-11-20', null, TODAY)).rejects.toMatchObject({ code: 'not_open' });
    expect(writes()).toHaveLength(0);
  });
});

describe('notes and the publish email switch', () => {
  it('adds a partner note on the partner’s own invoice', async () => {
    results = [[link()], [version()], [liveRow(MINE)]];
    await repo.addPartnerNote(ctx('partner'), MINE, '  Paying Friday  ');
    const insert = writes().find((c) => c.op === 'insert');
    expect(insert?.table).toBe(schema.receivableInvoiceNotes);
    expect(insert?.values).toMatchObject({ sheetId: SHEET, invoiceId: MINE, fromSbc: false, authorName: 'Yash Babbar', text: 'Paying Friday' });
  });

  it('refuses an empty or over-long note before any query', async () => {
    await expect(repo.addPartnerNote(ctx('partner'), MINE, '   ')).rejects.toMatchObject({ code: 'text' });
    await expect(repo.addPartnerNote(ctx('partner'), MINE, 'x'.repeat(repo.PARTNER_NOTE_MAX + 1))).rejects.toMatchObject({ code: 'text' });
    expect(calls).toHaveLength(0);
  });

  it('turns the publish email off on the partner’s rows', async () => {
    results = [[link()]];
    await repo.setNotifyOnPublish(ctx('partner'), false);
    const update = writes().find((c) => c.op === 'update');
    expect(update?.table).toBe(schema.receivablePartners);
    expect(update?.set).toEqual({ notifyOnPublish: false });
  });
});
