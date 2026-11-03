import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * Access rules and writes of the Phase 9 receivables repositories (FX rates, reports, credit
 * notes, disputes, TDS and FIRAs): only the sheet's own manager and the firm-wide admins reach a
 * sheet; another manager reads it as not found and writes nothing; interns, clients, developers
 * and client partners are refused before any query.
 */

type Call = { op: string; values?: unknown; set?: unknown; conflict?: unknown };
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
  c.onConflictDoUpdate = (v: unknown) => {
    call.conflict = v;
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
const FIRA = '44444444-4444-4444-4444-444444444404';
const ctx = (role: AuthContext['role'], userId = `user-${role}`): AuthContext => ({ userId, email: `${role}@vcfo.local`, name: role, role });
const me = ctx('manager', MANAGER);
const other = ctx('manager', '99999999-9999-9999-9999-999999999909');
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
  amountInr: '100000.00',
  currency: 'INR',
  fcAmount: null,
  fxRate: null,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: '0',
  remindersPausedUntil: null,
  pauseReason: null,
  promisedOn: null,
  receivedFc: null,
  tdsInr: '0',
  tdsCertificateOn: null,
  disputedAt: null,
  disputeReason: null,
  disputeResolvedAt: null,
  deletedAt: null,
  ...over,
});
const firaRow = (over: Record<string, unknown> = {}) => ({
  id: FIRA,
  sheetId: SHEET,
  invoiceId: INVOICE,
  bankCreditId: null,
  status: 'awaited',
  firaNo: null,
  issuedOn: null,
  currency: 'USD',
  fcAmount: '1000.00',
  inrAmount: '84000.00',
  note: '',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe('roles that never touch a sheet', () => {
  for (const role of ['intern', 'client', 'developer', 'partner'] as const) {
    it(`refuses ${role} before any query`, async () => {
      const c = ctx(role);
      await expect(repo.reportData(c, SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.listRates(c, SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.setManualRate(c, SHEET, { currency: 'USD', rateDate: '2026-11-02', rate: 84 })).rejects.toMatchObject({ status: 404 });
      await expect(repo.addCreditNote(c, INVOICE, { issuedOn: '2026-11-02', amountInr: 10 })).rejects.toMatchObject({ status: 404 });
      await expect(repo.listCreditNotes(c, INVOICE)).rejects.toMatchObject({ status: 404 });
      await expect(repo.raiseDispute(c, INVOICE, { reason: 'Scope' })).rejects.toMatchObject({ status: 404 });
      await expect(repo.resolveDispute(c, INVOICE)).rejects.toMatchObject({ status: 404 });
      await expect(repo.setTds(c, INVOICE, { tdsInr: 10 })).rejects.toMatchObject({ status: 404 });
      await expect(repo.listFiras(c, SHEET)).rejects.toMatchObject({ status: 404 });
      expect(calls).toHaveLength(0);
    });
  }

  it('refuses a partner on a FIRA after the lookup, without writing', async () => {
    results = [[firaRow()]];
    await expect(repo.updateFira(ctx('partner'), FIRA, { status: 'received', firaNo: 'F1', issuedOn: '2026-11-02' })).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });
});

describe('another sheet’s manager', () => {
  it('reads not found and writes nothing', async () => {
    results = [[sheetRow()]];
    await expect(repo.reportData(other, SHEET)).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.setManualRate(other, SHEET, { currency: 'USD', rateDate: '2026-11-02', rate: 84 })).rejects.toMatchObject({ status: 404 });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.addCreditNote(other, INVOICE, { issuedOn: '2026-11-02', amountInr: 10 })).rejects.toMatchObject({ status: 404 });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.raiseDispute(other, INVOICE, { reason: 'Scope' })).rejects.toMatchObject({ status: 404 });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.setTds(other, INVOICE, { tdsInr: 10 })).rejects.toMatchObject({ status: 404 });
    results = [[firaRow()], [sheetRow()]];
    await expect(repo.updateFira(other, FIRA, { status: 'received', firaNo: 'F1', issuedOn: '2026-11-02' })).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.listFiras(other, SHEET)).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });
});

describe('FX rates', () => {
  it('lets manual win for a day, then FBIL over ECB, and a later day over an earlier one', () => {
    const r = (rateDate: string, source: string, rate: string) => ({ currency: 'USD', rateDate, source, rate });
    expect(repo.pickRateInForce([r('2026-11-02', 'ecb', '84.10'), r('2026-11-02', 'manual', '84.50'), r('2026-11-02', 'fbil', '84.20')])).toEqual({ currency: 'USD', rateDate: '2026-11-02', rate: 84.5, source: 'manual' });
    expect(repo.pickRateInForce([r('2026-11-02', 'ecb', '84.10'), r('2026-11-02', 'fbil', '84.20')])?.source).toBe('fbil');
    expect(repo.pickRateInForce([r('2026-10-30', 'manual', '83.90'), r('2026-11-02', 'ecb', '84.10')])).toMatchObject({ rateDate: '2026-11-02', source: 'ecb' });
    expect(repo.pickRateInForce([])).toBeNull();
  });

  it('upserts a fetched rate on currency, day and source', async () => {
    await repo.systemUpsertFetchedRate({ currency: 'usd', rateDate: '2026-11-02', rate: 84.123456, source: 'ecb' });
    const [w] = writes();
    expect(w.values).toMatchObject({ currency: 'USD', rateDate: '2026-11-02', rate: '84.123456', source: 'ecb' });
    expect(w.conflict).toBeTruthy();
  });

  it('stores a manager override as manual and logs it on the sheet', async () => {
    results = [[sheetRow()], [{ currency: 'USD', rateDate: '2026-11-02', rate: '84.500000', source: 'manual', note: 'Bank rate', updatedAt: new Date() }], []];
    const r = await repo.setManualRate(me, SHEET, { currency: 'USD', rateDate: '2026-11-02', rate: 84.5, note: ' Bank rate ' });
    expect(r).toMatchObject({ source: 'manual', rate: 84.5 });
    const [insert, change] = writes();
    expect(insert.values).toMatchObject({ source: 'manual', rate: '84.500000', note: 'Bank rate', setBy: MANAGER });
    expect(change.values).toMatchObject({ sheetId: SHEET, affectsPage: false });
  });

  it('refuses an override for INR, a future day or a silly rate', async () => {
    results = [[sheetRow()]];
    await expect(repo.setManualRate(me, SHEET, { currency: 'INR', rateDate: '2026-11-02', rate: 1 })).rejects.toMatchObject({ code: 'currency' });
    results = [[sheetRow()]];
    await expect(repo.setManualRate(me, SHEET, { currency: 'USD', rateDate: '2999-01-01', rate: 84 })).rejects.toMatchObject({ code: 'rate_date' });
    results = [[sheetRow()]];
    await expect(repo.setManualRate(me, SHEET, { currency: 'USD', rateDate: '2026-11-02', rate: -1 })).rejects.toMatchObject({ code: 'rate' });
    expect(writes()).toHaveLength(0);
  });
});

describe('credit notes, disputes and TDS for the sheet’s manager', () => {
  it('records a credit note and lowers the balance', async () => {
    results = [[invoiceRow()], [sheetRow()], [{ id: 'cn1', invoiceId: INVOICE, number: 'CN-1', issuedOn: '2026-11-02', amountInr: '20000.00', reason: 'Discount', createdAt: new Date() }], [invoiceRow({ amountInr: '80000.00' })], []];
    const r = await repo.addCreditNote(me, INVOICE, { number: 'CN-1', issuedOn: '2026-11-02', amountInr: 20000, reason: 'Discount' });
    expect(r.invoice.amountInr).toBe(80000);
    const [insert, update, change] = writes();
    expect(insert.values).toMatchObject({ invoiceId: INVOICE, amountInr: '20000.00', createdBy: MANAGER });
    expect(update.set).toMatchObject({ amountInr: '80000.00' });
    expect(change.values).toMatchObject({ field: 'amountInr', before: '100000.00', after: '80000.00' });
  });

  it('refuses a credit note for the whole balance', async () => {
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.addCreditNote(me, INVOICE, { issuedOn: '2026-11-02', amountInr: 100000 })).rejects.toMatchObject({ code: 'credit_note_too_large' });
    expect(writes()).toHaveLength(0);
  });

  it('pauses reminders on a dispute and lifts only that pause on resolve', async () => {
    results = [[invoiceRow()], [sheetRow()], [invoiceRow({ disputedAt: new Date(), remindersPausedUntil: repo.DISPUTE_PAUSE_UNTIL })], []];
    await repo.raiseDispute(me, INVOICE, { reason: 'Hours queried' });
    expect(writes()[0].set).toMatchObject({ disputeReason: 'Hours queried', remindersPausedUntil: repo.DISPUTE_PAUSE_UNTIL, pauseReason: 'Disputed: Hours queried' });

    calls.length = 0;
    results = [[invoiceRow({ disputedAt: new Date(), disputeReason: 'Hours queried', remindersPausedUntil: repo.DISPUTE_PAUSE_UNTIL })], [sheetRow()], [invoiceRow()], []];
    await repo.resolveDispute(me, INVOICE);
    expect(writes()[0].set).toMatchObject({ remindersPausedUntil: null, pauseReason: null });

    calls.length = 0;
    results = [[invoiceRow({ disputedAt: new Date(), remindersPausedUntil: '2026-11-20', pauseReason: 'Promised' })], [sheetRow()], [invoiceRow()], []];
    await repo.resolveDispute(me, INVOICE);
    expect(writes()[0].set).not.toHaveProperty('remindersPausedUntil');
  });

  it('refuses a second dispute and resolving one that is not open', async () => {
    results = [[invoiceRow({ disputedAt: new Date() })], [sheetRow()]];
    await expect(repo.raiseDispute(me, INVOICE, { reason: 'Again' })).rejects.toMatchObject({ code: 'already_disputed' });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.resolveDispute(me, INVOICE)).rejects.toMatchObject({ code: 'not_disputed' });
    expect(writes()).toHaveLength(0);
  });

  it('sets TDS and the certificate date', async () => {
    results = [[invoiceRow({ status: 'received' })], [sheetRow()], [invoiceRow({ status: 'received', tdsInr: '10000.00', tdsCertificateOn: '2026-11-02' })], []];
    await repo.setTds(me, INVOICE, { tdsInr: 10000, certificateOn: '2026-11-02' });
    expect(writes()[0].set).toMatchObject({ tdsInr: '10000.00', tdsCertificateOn: '2026-11-02' });
  });
});

describe('FIRAs', () => {
  it('marks one received with its number and date', async () => {
    results = [[firaRow()], [sheetRow()], [firaRow({ status: 'received', firaNo: 'HSBC-1', issuedOn: '2026-11-02' })], [invoiceRow()], []];
    const f = await repo.updateFira(me, FIRA, { status: 'received', firaNo: ' HSBC-1 ', issuedOn: '2026-11-02' });
    expect(f).toMatchObject({ status: 'received', firaNo: 'HSBC-1', clientName: 'Duravant' });
    expect(writes()[0].set).toMatchObject({ status: 'received', firaNo: 'HSBC-1', issuedOn: '2026-11-02' });
  });

  it('creates the missing awaited rows when listing', async () => {
    const usd = invoiceRow({ status: 'received', currency: 'USD', fcAmount: '1000.00', receivedFc: '985.00', paidAmount: '83000.00' });
    results = [[sheetRow()], [usd], [], [], [{ fira: firaRow(), clientName: 'Duravant', invoiceNo: 'SC/09/03' }]];
    const list = await repo.listFiras(me, SHEET);
    expect(writes()[0].values).toEqual([expect.objectContaining({ sheetId: SHEET, invoiceId: INVOICE, status: 'awaited', currency: 'USD', fcAmount: '985.00', inrAmount: '83000.00' })]);
    expect(list[0]).toMatchObject({ status: 'awaited', clientName: 'Duravant' });
  });
});

describe('reportData', () => {
  it('builds every section from the live invoices', async () => {
    const usdOpen = invoiceRow({ id: 'u1', clientName: 'Emburse', currency: 'USD', fcAmount: '1000.00', fxRate: '83.000000', amountInr: '83000.00', dueDate: '2026-11-20' });
    const usdPaid = invoiceRow({ id: 'u2', clientName: 'Emburse', currency: 'USD', fcAmount: '1000.00', fxRate: '83.000000', amountInr: '83000.00', status: 'received', dueDate: '2026-10-01', paidOn: '2026-10-11', receivedFc: '980.00', paidAmount: '83300.00' });
    const tdsPaid = invoiceRow({ id: 't1', clientName: 'Vena', status: 'received', dueDate: '2026-10-01', paidOn: '2026-10-01', paidAmount: '90000.00', tdsInr: '10000.00' });
    const disputed = invoiceRow({ id: 'd1', clientName: 'Duravant', disputedAt: new Date('2026-11-01T00:00:00Z'), disputeReason: 'Scope' });
    results = [
      [sheetRow()],
      [usdOpen, usdPaid, tdsPaid, disputed],
      [{ currency: 'USD', rateDate: '2026-11-02', rate: '84.000000', source: 'fbil' }],
      [{ fira: firaRow({ invoiceId: 'u2' }), clientName: 'Emburse', invoiceNo: null }],
    ];
    // ensureAwaitedFiras: the received USD invoice, then the FIRA it already has.
    results.splice(3, 0, [usdPaid], [{ invoiceId: 'u2' }]);
    const r = await repo.reportData(me, SHEET);
    expect(r.fx.rate).toMatchObject({ rate: 84, source: 'fbil' });
    expect(r.fx.open[0]).toMatchObject({ id: 'u1', bookedInr: 83000, inrToday: 84000, changeInr: 1000 });
    expect(r.fx.realised[0]).toMatchObject({ id: 'u2', realisedInr: 1960, bankChargesFc: 20 });
    expect(r.tds).toMatchObject({ totals: { tdsInr: 10000, awaitedCount: 1 } });
    expect(r.disputes).toEqual([expect.objectContaining({ id: 'd1', reason: 'Scope' })]);
    expect(r.forecast.disputed.count).toBe(1);
    expect(r.ageing.total.count).toBe(1);
    expect(r.daysToPay.find((c) => c.client === 'Emburse')).toMatchObject({ avgDaysLate: 10 });
    expect(r.firas).toMatchObject({ awaited: 1, received: 0 });
    expect(writes()).toHaveLength(0);
  });
});
