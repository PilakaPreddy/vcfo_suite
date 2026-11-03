import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Access rules for the receivables repositories (docs/specs/receivables/PLAN.md): a sheet is
 * edited only by its own manager and the firm-wide admins; another manager reads it as not found
 * and writes nothing; interns, clients and developers are refused before any query. The client
 * partner's access is tested in receivables/partner-portal.test.ts.
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

const repo = await import('@/db/repositories/receivables');

const SHEET = '11111111-1111-1111-1111-111111111101';
const INVOICE = '22222222-2222-2222-2222-222222222202';
const MANAGER = '33333333-3333-3333-3333-333333333303';
const ctx = (role: AuthContext['role'], userId = `user-${role}`): AuthContext => ({ userId, email: `${role}@vcfo.local`, name: role, role });
const writes = () => calls.filter((c) => c.op !== 'select');
const sheetRow = (over: Record<string, unknown> = {}) => ({
  id: SHEET,
  name: 'Summit Consulting',
  clientOrgName: 'Summit Consulting',
  managerUserId: MANAGER,
  publicKey: 'abcdefghijkl',
  requireKey: true,
  publishedVersionId: null,
  reminderRules: { enabled: true, daysBefore: [5, 3], onDueDate: true, dailyAfterDue: true, skipWeekends: true, sendHourIst: 9 },
  ...over,
});
const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: INVOICE,
  sheetId: SHEET,
  invoiceMonth: '2026-09-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/09/03',
  partnerId: null,
  dueDate: '2026-10-16',
  amountInr: '6456984.00',
  currency: 'INR',
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: '0',
  remindersPausedUntil: null,
  pauseReason: null,
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe('roles that never edit a sheet', () => {
  for (const role of ['intern', 'client', 'developer'] as const) {
    it(`refuses ${role} before any query`, async () => {
      await expect(repo.listMySheets(ctx(role))).rejects.toMatchObject({ status: 404 });
      await expect(repo.getManagerSheet(ctx(role), SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.markReceived(ctx(role), INVOICE, { paidOn: '2026-11-03', amount: 1 })).rejects.toMatchObject({ status: 404 });
      await expect(repo.publishSheet(ctx(role), SHEET)).rejects.toMatchObject({ status: 404 });
      expect(calls).toHaveLength(0);
    });
  }
});

describe('another manager', () => {
  it('reads the sheet as not found and writes nothing', async () => {
    const other = ctx('manager', '99999999-9999-9999-9999-999999999909');
    results = [[sheetRow()]];
    await expect(repo.getManagerSheet(other, SHEET)).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.addInvoice(other, SHEET, { invoiceMonth: '2026-09-01', clientName: 'X', dueDate: '2026-11-30', amountInr: 10 })).rejects.toMatchObject({ status: 404 });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.markReceived(other, INVOICE, { paidOn: '2026-11-03', amount: 6456984 })).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.publishSheet(other, SHEET)).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('cannot reach a sheet with no manager either', async () => {
    results = [[sheetRow({ managerUserId: null })]];
    await expect(repo.getManagerSheet(ctx('manager', MANAGER), SHEET)).rejects.toMatchObject({ status: 404 });
  });

  it('lists only its own sheets', async () => {
    results = [[]];
    await repo.listMySheets(ctx('manager', MANAGER));
    expect(calls).toHaveLength(1);
  });
});

describe('the sheet’s manager', () => {
  const me = ctx('manager', MANAGER);

  it('adds an invoice and logs the change', async () => {
    results = [[sheetRow()], [invoiceRow({ amountInr: '10.00' })], []];
    const inv = await repo.addInvoice(me, SHEET, { invoiceMonth: '2026-09-14', clientName: ' Duravant ', invoiceNo: 'SC/09/03', dueDate: '2026-10-16', amountInr: 10 });
    expect(inv.amountInr).toBe(10);
    const [insert, change] = writes();
    expect(insert.values).toMatchObject({ sheetId: SHEET, clientName: 'Duravant', invoiceMonth: '2026-09-01', amountInr: '10.00', createdBy: MANAGER });
    expect(change.values).toMatchObject({ sheetId: SHEET, summary: 'Duravant SC/09/03 added', affectsPage: true });
  });

  it('rejects bad input before writing', async () => {
    results = [[sheetRow()]];
    await expect(repo.addInvoice(me, SHEET, { invoiceMonth: '2026-09-01', clientName: 'X', dueDate: '16-10-2026', amountInr: 10 })).rejects.toMatchObject({ status: 400, code: 'due_date' });
    results = [[sheetRow()]];
    await expect(repo.addInvoice(me, SHEET, { invoiceMonth: '2026-09-01', clientName: 'X', dueDate: '2026-10-16', amountInr: -5 })).rejects.toMatchObject({ status: 400, code: 'amount' });
    expect(writes()).toHaveLength(0);
  });

  it('marks a full payment received', async () => {
    results = [[invoiceRow()], [sheetRow()], [invoiceRow({ status: 'received', paidOn: '2026-11-03', paidAmount: '6456984.00' })], []];
    const inv = await repo.markReceived(me, INVOICE, { paidOn: '2026-11-03', amount: 6456984 });
    expect(inv.status).toBe('received');
    expect(writes()[0].set).toMatchObject({ status: 'received', paidOn: '2026-11-03', paidAmount: '6456984.00', paidVia: 'manual', remindersPausedUntil: null });
  });

  it('keeps the balance open on a part payment', async () => {
    results = [[invoiceRow()], [sheetRow()], [invoiceRow({ amountInr: '4456984.00', partPaid: '2000000.00' })], []];
    await repo.markReceived(me, INVOICE, { paidOn: '2026-11-03', amount: 2000000, part: true });
    expect(writes()[0].set).toMatchObject({ amountInr: '4456984.00', partPaid: '2000000.00' });
    expect(writes()[0].set).not.toHaveProperty('status');
  });

  it('logs a reminder pause as not affecting the page', async () => {
    results = [[invoiceRow()], [sheetRow()], [invoiceRow({ remindersPausedUntil: '2026-11-12' })], []];
    await repo.setReminderPause(me, INVOICE, { until: '2026-11-12', reason: 'Promised by 12 Nov' });
    expect(writes()[1].values).toMatchObject({ affectsPage: false, field: 'remindersPausedUntil' });
  });

  it('publishes a snapshot with partner names and points the sheet at it', async () => {
    results = [
      [sheetRow()],
      [{ seq: 2, publishedAt: new Date('2026-11-03T03:45:00Z') }],
      [{ summary: 'Duravant SC/09/03 marked received' }, { summary: 'Duravant SC/09/03 marked received' }],
      [{ invoice: invoiceRow({ partnerId: 'p1' }), partnerSlug: 'yash', partnerName: 'Yash Babbar' }],
      [{ id: 'v3', seq: 3, note: 'Duravant SC/09/03 marked received', publishedAt: new Date(), publishedByName: 'manager' }],
      [],
    ];
    const v = await repo.publishSheet(me, SHEET);
    expect(v.seq).toBe(3);
    const [insert, update] = writes();
    expect(insert.values).toMatchObject({ sheetId: SHEET, seq: 3, note: 'Duravant SC/09/03 marked received', publishedBy: MANAGER });
    expect((insert.values as { snapshot: Array<Record<string, unknown>> }).snapshot[0]).toMatchObject({ clientName: 'Duravant', amountInr: 6456984, partnerSlug: 'yash', partnerName: 'Yash Babbar' });
    expect(update.set).toMatchObject({ publishedVersionId: 'v3' });
  });
});

describe('firm-wide admins', () => {
  it('may edit any sheet', async () => {
    results = [[sheetRow()], [], [], [], [{ n: 0 }]];
    await expect(repo.getManagerSheet(ctx('admin'), SHEET)).resolves.toMatchObject({ unpublishedChanges: 0, latestVersion: null });
  });
});

describe('reminders', () => {
  it('refuses the desk to an intern before any query', async () => {
    await expect(repo.getReminderDesk(ctx('intern'), SHEET, '2026-11-03', '2026-10-20')).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('will not skip or edit a reminder that already went', async () => {
    const REM = '44444444-4444-4444-4444-444444444404';
    results = [[{ id: REM, sheetId: SHEET, status: 'sent' }], [sheetRow()]];
    await expect(repo.setReminderSkipped(ctx('manager', MANAGER), REM, true)).rejects.toMatchObject({ status: 400, code: 'already_sent' });
    results = [[{ id: REM, sheetId: SHEET, status: 'sent' }], [sheetRow()]];
    await expect(repo.editReminder(ctx('manager', MANAGER), REM, { subject: 'x', body: 'y' })).rejects.toMatchObject({ code: 'already_sent' });
    expect(writes()).toHaveLength(0);
  });

  it('queues only invoices with a partner, and only from an hour before the send hour', async () => {
    results = [[{ id: SHEET, rules: sheetRow().reminderRules }]];
    await expect(repo.systemQueueReminders('2026-11-03', { hourIst: 7 })).resolves.toBe(0);
    expect(writes()).toHaveLength(0);
    calls.length = 0;
    results = [[{ id: SHEET, rules: sheetRow().reminderRules }], [invoiceRow({ partnerId: 'p1' }), invoiceRow({ id: 'no-partner', partnerId: null })], [{ id: 'r1' }]];
    await expect(repo.systemQueueReminders('2026-11-03', { hourIst: 8 })).resolves.toBe(1);
    const insert = writes()[0];
    expect(insert.values).toEqual([{ sheetId: SHEET, invoiceId: INVOICE, partnerId: 'p1', forDate: '2026-11-03', kind: 'overdue', daysLeft: -18 }]);
  });

  it('queues nothing while the sheet has reminders off (a new sheet starts off)', async () => {
    results = [[{ id: SHEET, rules: { ...sheetRow().reminderRules, enabled: false } }]];
    await expect(repo.systemQueueReminders('2026-11-03', { hourIst: 10 })).resolves.toBe(0);
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(1);
    expect(writes()).toHaveLength(0);
  });
});

describe('bank credits', () => {
  const credit = { source: 'manual' as const, externalRef: 'HSBC-1', valueDate: '2026-11-03', payer: 'DURAVANT INC', currency: 'INR', fcAmount: null, inrAmount: 6456984 };

  it('refuses a statement import from an intern before any query', async () => {
    await expect(repo.importCredits(ctx('intern'), SHEET, [credit])).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('skips a credit already stored under any source', async () => {
    results = [[sheetRow()], [{ id: 'existing' }]];
    await expect(repo.importCredits(ctx('manager', MANAGER), SHEET, [credit])).resolves.toEqual({ added: 0, auto: 0, duplicates: 1 });
    expect(writes()).toHaveLength(0);
  });

  it('stores a new credit and settles a sure match in the draft', async () => {
    const row = { id: 'c1', sheetId: SHEET, valueDate: '2026-11-03', payer: 'DURAVANT INC', inrAmount: '6456984.00', status: 'unmatched' };
    results = [[sheetRow()], [], [row], [invoiceRow()], [invoiceRow()], [], [], []];
    await expect(repo.importCredits(ctx('manager', MANAGER), SHEET, [{ ...credit, source: 'hsbc_api' }])).resolves.toEqual({ added: 1, auto: 1, duplicates: 0 });
    const [insert, settle, change, status] = writes();
    expect(insert.values).toMatchObject({ sheetId: SHEET, source: 'manual', externalRef: 'HSBC-1', inrAmount: '6456984.00' });
    expect(settle.set).toMatchObject({ status: 'received', paidOn: '2026-11-03', paidVia: 'bank', paidAmount: '6456984.00' });
    expect(change.values).toMatchObject({ actorId: MANAGER, summary: 'Duravant SC/09/03 received (bank credit from DURAVANT INC)' });
    expect(status.set).toMatchObject({ status: 'auto', matchInvoiceIds: [INVOICE] });
  });
});
