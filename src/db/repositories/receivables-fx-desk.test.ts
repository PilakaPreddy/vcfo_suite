import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import { addDaysIso, todayIst } from '@/lib/receivables/dates';

/**
 * Access rules and writes of the Phase 10 forex desk repository (FX tab, forward contracts, rate
 * alerts, and a receipt delivered against a forward): only the sheet's own manager and the
 * firm-wide admins reach a sheet; another manager reads it as not found and writes nothing;
 * interns, clients, developers and client partners are refused before any query.
 */

type Call = { op: string; values?: unknown; set?: unknown };
const calls: Call[] = [];
let results: unknown[][] = [];
function chain(call: Call): unknown {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate']) c[m] = () => c;
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
const db: Record<string, unknown> = { select: op('select'), selectDistinct: op('select'), insert: op('insert'), update: op('update'), delete: op('delete') };
db.transaction = async (fn: (tx: unknown) => unknown) => fn(db);
vi.mock('@/db/client', () => ({ db }));
vi.mock('server-only', () => ({}));

const repo = await import('@/db/repositories/receivables');

const SHEET = '11111111-1111-1111-1111-111111111101';
const INVOICE = '22222222-2222-2222-2222-222222222202';
const MANAGER = '33333333-3333-3333-3333-333333333303';
const FORWARD = '44444444-4444-4444-4444-444444444404';
const ALERT = '55555555-5555-5555-5555-555555555505';
const TODAY = todayIst();
const ctx = (role: AuthContext['role'], userId = `user-${role}`): AuthContext => ({ userId, email: `${role}@vcfo.local`, name: role, role });
const me = ctx('manager', MANAGER);
const admin = ctx('admin');
const other = ctx('manager', '99999999-9999-9999-9999-999999999909');
const writes = () => calls.filter((c) => c.op !== 'select');
const sheetRow = (over: Record<string, unknown> = {}) => ({ id: SHEET, name: 'Summit', clientOrgName: 'Summit Consulting', managerUserId: MANAGER, publicKey: 'abcdefghijkl', requireKey: true, ...over });
const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: INVOICE,
  sheetId: SHEET,
  invoiceMonth: '2026-10-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/10/01',
  partnerId: null,
  dueDate: addDaysIso(TODAY, 10),
  amountInr: '83000.00',
  currency: 'USD',
  fcAmount: '1000.00',
  fxRate: '83.000000',
  invoiceDate: addDaysIso(TODAY, -20),
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
const forwardRow = (over: Record<string, unknown> = {}) => ({
  id: FORWARD,
  sheetId: SHEET,
  currency: 'USD',
  bank: 'HSBC',
  contractNo: 'FW-1',
  amountFc: '1500.00',
  forwardRate: '85.000000',
  bookedOn: addDaysIso(TODAY, -30),
  maturityOn: addDaysIso(TODAY, 60),
  utilisedFc: '0',
  status: 'open',
  note: '',
  createdBy: MANAGER,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
});
const alertRow = (over: Record<string, unknown> = {}) => ({ id: ALERT, sheetId: SHEET, currency: 'USD', direction: 'above', threshold: '85.000000', active: true, lastTriggeredOn: null, createdBy: MANAGER, createdAt: new Date('2026-10-01T00:00:00Z'), ...over });
const forwardInput = { currency: 'USD', bank: 'HSBC', contractNo: 'FW-1', amountFc: 1500, forwardRate: 85, bookedOn: '2026-10-01', maturityOn: '2026-12-31' };

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe('roles that never touch a sheet', () => {
  for (const role of ['intern', 'client', 'developer', 'partner'] as const) {
    it(`refuses ${role} before any query`, async () => {
      const c = ctx(role);
      await expect(repo.fxDesk(c, SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.listForwards(c, SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.createForward(c, SHEET, forwardInput)).rejects.toMatchObject({ status: 404 });
      await expect(repo.updateForward(c, FORWARD, { bank: 'X' })).rejects.toMatchObject({ status: 404 });
      await expect(repo.closeForward(c, FORWARD)).rejects.toMatchObject({ status: 404 });
      await expect(repo.cancelForward(c, FORWARD)).rejects.toMatchObject({ status: 404 });
      await expect(repo.listAlerts(c, SHEET)).rejects.toMatchObject({ status: 404 });
      await expect(repo.createAlert(c, SHEET, { currency: 'USD', direction: 'above', threshold: 85 })).rejects.toMatchObject({ status: 404 });
      await expect(repo.updateAlert(c, ALERT, { active: false })).rejects.toMatchObject({ status: 404 });
      await expect(repo.deleteAlert(c, ALERT)).rejects.toMatchObject({ status: 404 });
      await expect(repo.markReceived(c, INVOICE, { paidOn: TODAY, amount: 84000, receivedFc: 1000, forwardId: FORWARD })).rejects.toMatchObject({ status: 404 });
      expect(calls).toHaveLength(0);
    });
  }
});

describe('another sheet’s manager', () => {
  it('reads not found and writes nothing', async () => {
    results = [[sheetRow()]];
    await expect(repo.fxDesk(other, SHEET)).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.listForwards(other, SHEET)).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.createForward(other, SHEET, forwardInput)).rejects.toMatchObject({ status: 404 });
    results = [[forwardRow()], [sheetRow()]];
    await expect(repo.updateForward(other, FORWARD, { bank: 'X' })).rejects.toMatchObject({ status: 404 });
    results = [[forwardRow()], [sheetRow()]];
    await expect(repo.cancelForward(other, FORWARD)).rejects.toMatchObject({ status: 404 });
    results = [[sheetRow()]];
    await expect(repo.createAlert(other, SHEET, { currency: 'USD', direction: 'above', threshold: 85 })).rejects.toMatchObject({ status: 404 });
    results = [[alertRow()], [sheetRow()]];
    await expect(repo.updateAlert(other, ALERT, { active: false })).rejects.toMatchObject({ status: 404 });
    results = [[alertRow()], [sheetRow()]];
    await expect(repo.deleteAlert(other, ALERT)).rejects.toMatchObject({ status: 404 });
    results = [[invoiceRow()], [sheetRow()]];
    await expect(repo.markReceived(other, INVOICE, { paidOn: TODAY, amount: 84000, receivedFc: 1000, forwardId: FORWARD })).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });

  it('reads a forward or alert that does not exist as not found', async () => {
    results = [[]];
    await expect(repo.updateForward(me, FORWARD, { bank: 'X' })).rejects.toMatchObject({ status: 404 });
    await expect(repo.deleteAlert(me, 'not-a-uuid')).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });
});

describe('the FX desk for the sheet’s manager', () => {
  it('works out exposure, hedges, spreads and alerts from the sheet’s rows', async () => {
    const received = invoiceRow({ id: '22222222-2222-2222-2222-222222222299', status: 'received', paidOn: addDaysIso(TODAY, -2), receivedFc: '1000.00', paidAmount: '84000.00' });
    const eur = invoiceRow({ id: '22222222-2222-2222-2222-222222222288', currency: 'EUR', fcAmount: '500.00', fxRate: '96.000000', amountInr: '48000.00' });
    const rate = (currency: string, rateDate: string, r: string, source = 'ecb') => ({ currency, rateDate, rate: r, source });
    results = [
      [sheetRow()],
      [invoiceRow(), received, eur, invoiceRow({ id: '22222222-2222-2222-2222-222222222277', currency: 'INR', fcAmount: null, fxRate: null })],
      [forwardRow()],
      [alertRow()],
      [{ source: 'hsbc_api', matchInvoiceIds: [received.id] }],
      [rate('USD', addDaysIso(TODAY, -2), '84.400000'), rate('USD', TODAY, '84.000000'), rate('USD', TODAY, '85.500000', 'manual'), rate('EUR', TODAY, '97.000000')],
    ];
    const d = await repo.fxDesk(me, SHEET);
    expect(d.today).toBe(TODAY);
    expect(d.currencies.map((c) => c.currency)).toEqual(['USD', 'EUR']);
    expect(d.currencies[0].today).toEqual({ currency: 'USD', rateDate: TODAY, rate: 85.5, source: 'manual' });
    expect(d.currencies[0].booked).toHaveLength(1);
    expect(d.exposure).toEqual([
      expect.objectContaining({ currency: 'USD', openFc: 1000, bookedInr: 83000, inrToday: 85500, changeInr: 2500 }),
      expect.objectContaining({ currency: 'EUR', openFc: 500, inrToday: 48500 }),
    ]);
    expect(d.hedges.find((h) => h.currency === 'USD')).toMatchObject({ hedgedFc: 1500, coverPct: 150 });
    expect(d.spreads).toEqual([expect.objectContaining({ bank: 'HSBC', effectiveRate: 84, referenceRate: 84.4, costInr: 400 })]);
    expect(d.alerts).toEqual([expect.objectContaining({ id: ALERT, crossedNow: true })]);
    expect(d.whatIf).toHaveLength(2);
    expect(writes()).toHaveLength(0);
  });
});

describe('forward contracts', () => {
  it('books a contract for the sheet’s manager and logs it off the client page', async () => {
    results = [[sheetRow()], [forwardRow()], []];
    const f = await repo.createForward(me, SHEET, { ...forwardInput, currency: 'usd', bank: ' HSBC ' });
    expect(f).toMatchObject({ id: FORWARD, amountFc: 1500, unutilisedFc: 1500, status: 'open' });
    const [insert, change] = writes();
    expect(insert.values).toMatchObject({ sheetId: SHEET, currency: 'USD', bank: 'HSBC', amountFc: '1500.00', forwardRate: '85.000000', createdBy: MANAGER });
    expect(change.values).toMatchObject({ sheetId: SHEET, affectsPage: false });
  });

  it('refuses INR, a maturity before booking and an amount below what is delivered', async () => {
    results = [[sheetRow()]];
    await expect(repo.createForward(me, SHEET, { ...forwardInput, currency: 'INR' })).rejects.toMatchObject({ code: 'currency' });
    results = [[sheetRow()]];
    await expect(repo.createForward(me, SHEET, { ...forwardInput, maturityOn: '2026-09-01' })).rejects.toMatchObject({ code: 'maturity_on' });
    results = [[forwardRow({ utilisedFc: '800.00' })], [sheetRow()]];
    await expect(repo.updateForward(admin, FORWARD, { amountFc: 500 })).rejects.toMatchObject({ code: 'amount_below_utilised' });
    results = [[forwardRow({ status: 'cancelled' })], [sheetRow()]];
    await expect(repo.updateForward(me, FORWARD, { status: 'open' })).rejects.toMatchObject({ code: 'forward_cancelled' });
    expect(writes()).toHaveLength(0);
  });

  it('closes and cancels', async () => {
    results = [[forwardRow()], [sheetRow()], [forwardRow({ status: 'closed' })], []];
    expect((await repo.closeForward(me, FORWARD)).status).toBe('closed');
    expect(writes()[0].set).toMatchObject({ status: 'closed' });
    calls.length = 0;
    results = [[forwardRow()], [sheetRow()], [forwardRow({ status: 'cancelled' })], []];
    expect((await repo.cancelForward(me, FORWARD)).status).toBe('cancelled');
    expect(writes()[0].set).toMatchObject({ status: 'cancelled' });
  });

  it('delivers a receipt against an open forward and closes it when used up', async () => {
    results = [[invoiceRow()], [sheetRow()], [forwardRow({ utilisedFc: '600.00' })], [invoiceRow({ status: 'received' })], [], [], []];
    await repo.markReceived(me, INVOICE, { paidOn: TODAY, amount: 84500, receivedFc: 1000, forwardId: FORWARD });
    const [invoiceUpdate, , forwardUpdate, forwardLog] = writes();
    expect(invoiceUpdate.set).toMatchObject({ status: 'received', receivedFc: '1000.00' });
    expect(forwardUpdate.set).toMatchObject({ utilisedFc: '1500.00', status: 'closed' });
    expect(forwardLog.values).toMatchObject({ invoiceId: INVOICE, field: 'fxForward', before: '600.00', after: '1500.00', affectsPage: false });
  });

  it('refuses a forward of another currency before writing anything', async () => {
    results = [[invoiceRow()], [sheetRow()], [forwardRow({ currency: 'EUR' })]];
    await expect(repo.markReceived(me, INVOICE, { paidOn: TODAY, amount: 84500, receivedFc: 1000, forwardId: FORWARD })).rejects.toMatchObject({ code: 'forward' });
    results = [[invoiceRow()], [sheetRow()], []];
    await expect(repo.markReceived(me, INVOICE, { paidOn: TODAY, amount: 84500, receivedFc: 1000, forwardId: FORWARD })).rejects.toMatchObject({ code: 'forward' });
    expect(writes()).toHaveLength(0);
  });
});

describe('invoices in any supported currency', () => {
  it('adds a EUR invoice at its booked rate and refuses an unknown currency', async () => {
    results = [[sheetRow()], [invoiceRow({ currency: 'EUR' })], []];
    await repo.addInvoice(me, SHEET, { clientName: 'Bosch', invoiceMonth: '2026-11-01', dueDate: '2026-12-01', amountInr: 1, currency: 'eur', fcAmount: 1000, fxRate: 97.25, invoiceDate: '2026-11-02' });
    expect(writes()[0].values).toMatchObject({ currency: 'EUR', fcAmount: '1000.00', fxRate: '97.250000', amountInr: '97250.00' });
    calls.length = 0;
    results = [[sheetRow()]];
    await expect(repo.addInvoice(me, SHEET, { clientName: 'X', invoiceMonth: '2026-11-01', dueDate: '2026-12-01', amountInr: 1, currency: 'BTC', fcAmount: 1, fxRate: 1, invoiceDate: '2026-11-02' })).rejects.toMatchObject({ code: 'currency' });
    expect(writes()).toHaveLength(0);
  });
});

describe('rate alerts', () => {
  it('adds an alert and refuses a bad direction or level', async () => {
    results = [[sheetRow()], [alertRow()]];
    await repo.createAlert(me, SHEET, { currency: 'usd', direction: 'above', threshold: 85 });
    expect(writes()[0].values).toMatchObject({ sheetId: SHEET, currency: 'USD', direction: 'above', threshold: '85.000000' });
    calls.length = 0;
    results = [[sheetRow()]];
    await expect(repo.createAlert(me, SHEET, { currency: 'USD', direction: 'sideways' as 'above', threshold: 85 })).rejects.toMatchObject({ code: 'direction' });
    results = [[sheetRow()]];
    await expect(repo.createAlert(me, SHEET, { currency: 'USD', direction: 'below', threshold: 0 })).rejects.toMatchObject({ code: 'threshold' });
    expect(writes()).toHaveLength(0);
  });

  it('lets a turned-on or moved alert fire again, and deletes', async () => {
    results = [[alertRow({ active: false, lastTriggeredOn: TODAY })], [sheetRow()], [alertRow()]];
    await repo.updateAlert(me, ALERT, { active: true });
    expect(writes()[0].set).toEqual({ active: true, lastTriggeredOn: null });
    calls.length = 0;
    results = [[alertRow({ lastTriggeredOn: TODAY })], [sheetRow()], [alertRow()]];
    await repo.updateAlert(me, ALERT, { active: false });
    expect(writes()[0].set).toEqual({ active: false });
    calls.length = 0;
    results = [[alertRow()], [sheetRow()], []];
    await repo.deleteAlert(me, ALERT);
    expect(writes()).toEqual([expect.objectContaining({ op: 'delete' })]);
  });
});

describe('system functions for the rates job', () => {
  it('lists the currencies in use, USD always, unsupported codes left out', async () => {
    results = [[{ currency: 'EUR' }, { currency: 'XYZ' }], [{ currency: 'GBP' }], [{ currency: 'EUR' }]];
    expect(await repo.systemFxCurrenciesInUse()).toEqual(['USD', 'EUR', 'GBP']);
  });

  it('loads active alerts with the manager and the open exposure', async () => {
    results = [
      [{ id: ALERT, sheetId: SHEET, currency: 'USD', direction: 'above', threshold: '85.000000', active: true, lastTriggeredOn: null, clientOrgName: 'Summit', managerEmail: 'm@x', managerName: 'Meera' }],
      [
        { sheetId: SHEET, currency: 'USD', fcAmount: '1000.00', fxRate: '83.000000', amountInr: '83000.00' },
        { sheetId: SHEET, currency: 'EUR', fcAmount: '10.00', fxRate: '90.000000', amountInr: '900.00' },
      ],
    ];
    expect(await repo.systemActiveAlerts()).toEqual([expect.objectContaining({ id: ALERT, threshold: 85, exposureFc: 1000, exposureBookedInr: 83000, managerEmail: 'm@x' })]);
  });

  it('marks an alert fired for the day', async () => {
    await repo.systemMarkAlertTriggered(ALERT, TODAY);
    expect(writes()[0].set).toEqual({ lastTriggeredOn: TODAY });
  });
});
