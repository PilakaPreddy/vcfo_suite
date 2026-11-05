import 'server-only';
import { and, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { bankCredits, fxRates, profiles, receivableFxAlerts, receivableFxForwards, receivableInvoices, receivableSheets } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isSupportedForeign, sortCurrencies } from '@/lib/receivables/currencies';
import { addDaysIso, todayIst } from '@/lib/receivables/dates';
import { isForeign, round2 } from '@/lib/receivables/fx';
import {
  WHAT_IF_MOVES,
  alertCrossed,
  bankSpreads,
  exposureByCurrency,
  hedgeCover,
  rateTrend,
  spreadSummary,
  unutilised,
  whatIf,
  type DeskForward,
  type DeskInvoice,
  type RatePoint,
} from '@/lib/receivables/fx-desk';
import type { FxAlertDto, FxAlertInput, FxAlertPatch, FxCurrencyDto, FxDeskDto, FxForwardDto, FxForwardInput, FxForwardPatch } from '@/lib/receivables/fx-desk-wire';
import type { FxSource, RateInForceDto } from '@/lib/receivables/reports-wire';
import { pickRateInForce, systemLatestRate } from './fx';
import { ISO_DATE, UUID, assertEditorRole, invalid, logChange, money, notFound, num, scopedSheet, type SheetRow } from './shared';

/**
 * RECEIVABLES FOREX DESK (Phase 10, docs/specs/receivables/PLAN.md) — everything the FX tab shows
 * and the forward contracts and rate alerts it manages. Scoped like every other sheet read and
 * write: the sheet's own manager and the firm-wide admins; another manager reads a sheet, a
 * forward or an alert as not found, and other roles are refused before the first query.
 *
 * The figures are worked out in src/lib/receivables/fx-desk.ts from the live invoices (the
 * draft), the sheet's forwards and the stored daily rates. The `system*` functions are for the
 * rates job and take no AuthContext.
 */

type ForwardRow = typeof receivableFxForwards.$inferSelect;
type AlertRow = typeof receivableFxAlerts.$inferSelect;

/** How many days of rates the chart shows. */
const HISTORY_DAYS = 90;
/** How far back the spreads may reach for a paid date's reference rate. */
const MAX_LOOKBACK_DAYS = 400;
/** A rate older than this no longer counts as today's on the card (a long weekend plus holidays). */
const TODAY_LOOKBACK_DAYS = 10;

/** Where a matched bank credit came from, as the spread table names the bank. */
const CREDIT_BANK: Record<string, string> = { hsbc_api: 'HSBC', alert_email: 'Bank alert email', manual: 'Bank statement' };
const NO_BANK = 'Entered by hand';

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();

function cleanCurrency(v: unknown): string {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!isSupportedForeign(c)) throw invalid('currency');
  return c;
}

function cleanDate(v: unknown, code: string): string {
  if (typeof v !== 'string' || !ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw invalid(code);
  return v;
}

function cleanText(v: unknown, max: number, code: string, required: boolean): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if ((required && !s) || s.length > max) throw invalid(code);
  return s;
}

function cleanPositive(v: unknown, max: number, code: string, places: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= max) throw invalid(code);
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function toForwardDto(r: ForwardRow): FxForwardDto {
  const amountFc = num(r.amountFc) ?? 0;
  const utilisedFc = num(r.utilisedFc) ?? 0;
  return {
    id: r.id,
    currency: r.currency,
    bank: r.bank,
    contractNo: r.contractNo,
    amountFc,
    forwardRate: num(r.forwardRate) ?? 0,
    bookedOn: String(r.bookedOn),
    maturityOn: String(r.maturityOn),
    utilisedFc,
    unutilisedFc: unutilised({ amountFc, utilisedFc }),
    status: (r.status === 'closed' || r.status === 'cancelled' ? r.status : 'open') as FxForwardDto['status'],
    note: r.note,
    createdAt: iso(r.createdAt),
  };
}

function toAlertDto(r: AlertRow, rate: number | null): FxAlertDto {
  const threshold = num(r.threshold) ?? 0;
  const direction = r.direction === 'below' ? 'below' : 'above';
  return {
    id: r.id,
    currency: r.currency,
    direction,
    threshold,
    active: r.active,
    lastTriggeredOn: r.lastTriggeredOn ? String(r.lastTriggeredOn) : null,
    crossedNow: alertCrossed({ direction, threshold }, rate),
    createdAt: iso(r.createdAt),
  };
}

type RateRow = { currency: string; rateDate: string | Date; rate: string; source: string };

/** The rate in force per currency and day (manual, then FBIL, then ECB), oldest day first. */
export function ratesInForceByDay(rows: RateRow[]): Map<string, Array<RatePoint & { source: FxSource }>> {
  const groups = new Map<string, RateRow[]>();
  for (const r of rows) {
    const key = `${r.currency}|${String(r.rateDate)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out = new Map<string, Array<RatePoint & { source: FxSource }>>();
  for (const list of groups.values()) {
    const best = pickRateInForce(list.map((r) => ({ ...r, rateDate: String(r.rateDate) })) as Parameters<typeof pickRateInForce>[0]);
    if (!best) continue;
    out.set(best.currency, [...(out.get(best.currency) ?? []), { date: best.rateDate, rate: best.rate, source: best.source }]);
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function deskInvoice(r: typeof receivableInvoices.$inferSelect, bank: string | null): DeskInvoice {
  return {
    id: r.id,
    clientName: r.clientName,
    invoiceNo: r.invoiceNo,
    currency: (r.currency ?? 'INR').trim().toUpperCase() || 'INR',
    status: r.status === 'received' ? 'received' : 'open',
    fcAmount: num(r.fcAmount),
    fxRate: num(r.fxRate),
    amountInr: num(r.amountInr) ?? 0,
    dueDate: String(r.dueDate),
    paidOn: r.paidOn ? String(r.paidOn) : null,
    receivedFc: num(r.receivedFc),
    paidAmount: num(r.paidAmount),
    bank,
  };
}

/**
 * Everything the FX tab shows. The queries run in this order: the sheet, its invoices, its
 * forwards, its alerts, its matched bank credits, then the stored rates of the currencies in use.
 */
export async function fxDesk(ctx: AuthContext, sheetId: string): Promise<FxDeskDto> {
  const sheet = await scopedSheet(ctx, sheetId);
  const today = todayIst();
  const invoiceRows = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.sheetId, sheet.id), isNull(receivableInvoices.deletedAt)));
  const forwardRows: ForwardRow[] = await db.select().from(receivableFxForwards).where(eq(receivableFxForwards.sheetId, sheet.id)).orderBy(desc(receivableFxForwards.maturityOn));
  const alertRows: AlertRow[] = await db.select().from(receivableFxAlerts).where(eq(receivableFxAlerts.sheetId, sheet.id)).orderBy(receivableFxAlerts.currency, receivableFxAlerts.threshold);
  const credits = await db
    .select({ source: bankCredits.source, matchInvoiceIds: bankCredits.matchInvoiceIds })
    .from(bankCredits)
    .where(and(eq(bankCredits.sheetId, sheet.id), inArray(bankCredits.status, ['auto', 'confirmed'])));

  const bankOf = new Map<string, string>();
  for (const c of credits) for (const id of c.matchInvoiceIds ?? []) bankOf.set(id, CREDIT_BANK[c.source] ?? c.source);
  const foreignRows = invoiceRows.filter((r) => isForeign({ currency: r.currency }));
  const invoices = foreignRows.map((r) => deskInvoice(r, r.status === 'received' ? (bankOf.get(r.id) ?? NO_BANK) : null));
  const forwards = forwardRows.map(toForwardDto);

  // The currencies in use: open invoices, receipts the spreads cover, open forwards, alerts, and USD always.
  const historyFloor = addDaysIso(today, -HISTORY_DAYS);
  const paidDates = invoices.filter((i) => i.status === 'received' && i.paidOn).map((i) => i.paidOn!);
  const earliest = paidDates.reduce((a, d) => (d < a ? d : a), historyFloor);
  const floor = [addDaysIso(earliest, -TODAY_LOOKBACK_DAYS), addDaysIso(today, -MAX_LOOKBACK_DAYS)].sort().at(-1)!;
  const currencies = sortCurrencies([
    'USD',
    ...invoices.filter((i) => i.status === 'open' || (i.paidOn ?? '') >= floor).map((i) => i.currency),
    ...forwards.filter((f) => f.status === 'open').map((f) => f.currency),
    ...alertRows.map((a) => a.currency),
  ]).filter(isSupportedForeign);

  const rateRows: RateRow[] = await db
    .select({ currency: fxRates.currency, rateDate: fxRates.rateDate, rate: fxRates.rate, source: fxRates.source })
    .from(fxRates)
    .where(and(inArray(fxRates.currency, currencies), gte(fxRates.rateDate, floor)));
  const byDay = ratesInForceByDay(rateRows);

  const spot: Record<string, number | null> = {};
  const cards: FxCurrencyDto[] = [];
  for (const currency of currencies) {
    const all = (byDay.get(currency) ?? []).filter((p) => p.date <= today);
    const latest = all.at(-1);
    let todayRate: RateInForceDto | null = latest && latest.date >= addDaysIso(today, -TODAY_LOOKBACK_DAYS) ? { currency, rateDate: latest.date, rate: latest.rate, source: latest.source } : null;
    // Nothing recent in the window: the latest stored rate, however old, as the Reports tab does.
    if (!todayRate) todayRate = latest ? { currency, rateDate: latest.date, rate: latest.rate, source: latest.source } : await systemLatestRate(currency);
    spot[currency] = todayRate?.rate ?? null;
    const history = all.filter((p) => p.date >= historyFloor).map(({ date, rate }) => ({ date, rate }));
    cards.push({
      currency,
      today: todayRate,
      history,
      trend: rateTrend(history, today),
      booked: invoices
        .filter((i) => i.currency === currency && i.status === 'open' && i.fxRate && i.fcAmount)
        .map((i) => {
          const row = foreignRows.find((r) => r.id === i.id)!;
          return { id: i.id, label: `${i.clientName}${i.invoiceNo ? ` ${i.invoiceNo}` : ''}`, date: row.invoiceDate ? String(row.invoiceDate) : String(row.invoiceMonth), rate: i.fxRate!, fcAmount: i.fcAmount! };
        }),
    });
  }

  const exposure = exposureByCurrency(invoices, spot);
  const deskForwards: DeskForward[] = forwards.map((f) => ({ ...f }));
  const hedges = hedgeCover(exposure, deskForwards, spot, today);
  const history: Record<string, RatePoint[]> = Object.fromEntries([...byDay].map(([c, pts]) => [c, pts.map(({ date, rate }) => ({ date, rate }))]));
  const spreads = bankSpreads(invoices, history);
  const sum = (pick: (e: (typeof exposure)[number]) => number | null) => round2(exposure.reduce((a, e) => a + (pick(e) ?? 0), 0));

  return {
    today,
    currencies: cards,
    exposure,
    exposureTotals: { bookedInr: sum((e) => e.bookedInr), inrToday: sum((e) => e.inrToday ?? e.bookedInr), changeInr: sum((e) => e.changeInr) },
    hedges,
    forwards,
    whatIfMoves: [...WHAT_IF_MOVES],
    whatIf: whatIf(exposure, hedges),
    spreads,
    spreadSummary: spreadSummary(spreads),
    alerts: alertRows.map((a) => toAlertDto(a, spot[a.currency] ?? null)),
  };
}

/* ------------------------------------------------------------------ forwards */

async function scopedForward(ctx: AuthContext, forwardId: string): Promise<{ forward: ForwardRow; sheet: SheetRow }> {
  assertEditorRole(ctx);
  if (!UUID.test(forwardId ?? '')) throw notFound();
  const [forward] = await db.select().from(receivableFxForwards).where(eq(receivableFxForwards.id, forwardId)).limit(1);
  if (!forward) throw notFound();
  const sheet = await scopedSheet(ctx, forward.sheetId);
  return { forward, sheet };
}

function forwardLabel(f: Pick<ForwardRow, 'currency' | 'bank' | 'contractNo'>): string {
  return `${f.currency} forward ${f.contractNo ? `${f.contractNo} ` : ''}with ${f.bank || 'the bank'}`;
}

export async function listForwards(ctx: AuthContext, sheetId: string): Promise<FxForwardDto[]> {
  const sheet = await scopedSheet(ctx, sheetId);
  const rows: ForwardRow[] = await db.select().from(receivableFxForwards).where(eq(receivableFxForwards.sheetId, sheet.id)).orderBy(desc(receivableFxForwards.maturityOn));
  return rows.map(toForwardDto);
}

export async function createForward(ctx: AuthContext, sheetId: string, input: FxForwardInput): Promise<FxForwardDto> {
  const sheet = await scopedSheet(ctx, sheetId);
  const currency = cleanCurrency(input.currency);
  const bank = cleanText(input.bank, 80, 'bank', true);
  const contractNo = cleanText(input.contractNo, 60, 'contract_no', false) || null;
  const amountFc = cleanPositive(input.amountFc, 1e12, 'amount_fc', 2);
  const forwardRate = cleanPositive(input.forwardRate, 100_000, 'forward_rate', 6);
  const bookedOn = cleanDate(input.bookedOn, 'booked_on');
  const maturityOn = cleanDate(input.maturityOn, 'maturity_on');
  if (maturityOn < bookedOn) throw invalid('maturity_on');
  const note = cleanText(input.note, 200, 'note', false);
  const [row] = await db
    .insert(receivableFxForwards)
    .values({ sheetId: sheet.id, currency, bank, contractNo, amountFc: money(amountFc), forwardRate: forwardRate.toFixed(6), bookedOn, maturityOn, note, createdBy: ctx.userId })
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `${forwardLabel(row)} booked: ${currency} ${money(amountFc)} at ₹${forwardRate.toFixed(4)}`, field: 'fxForward', affectsPage: false });
  return toForwardDto(row);
}

/** Edits the contract's terms, or closes or reopens it. A cancelled contract stays as it is. */
export async function updateForward(ctx: AuthContext, forwardId: string, patch: FxForwardPatch): Promise<FxForwardDto> {
  const { forward, sheet } = await scopedForward(ctx, forwardId);
  if (forward.status === 'cancelled') throw invalid('forward_cancelled');
  const set: Partial<typeof receivableFxForwards.$inferInsert> = {};
  if ('currency' in patch) set.currency = cleanCurrency(patch.currency);
  if ('bank' in patch) set.bank = cleanText(patch.bank, 80, 'bank', true);
  if ('contractNo' in patch) set.contractNo = cleanText(patch.contractNo, 60, 'contract_no', false) || null;
  if ('amountFc' in patch) {
    const a = cleanPositive(patch.amountFc, 1e12, 'amount_fc', 2);
    if (a < (num(forward.utilisedFc) ?? 0)) throw invalid('amount_below_utilised');
    set.amountFc = money(a);
  }
  if ('forwardRate' in patch) set.forwardRate = cleanPositive(patch.forwardRate, 100_000, 'forward_rate', 6).toFixed(6);
  if ('bookedOn' in patch) set.bookedOn = cleanDate(patch.bookedOn, 'booked_on');
  if ('maturityOn' in patch) set.maturityOn = cleanDate(patch.maturityOn, 'maturity_on');
  if (String(set.maturityOn ?? forward.maturityOn) < String(set.bookedOn ?? forward.bookedOn)) throw invalid('maturity_on');
  if ('note' in patch) set.note = cleanText(patch.note, 200, 'note', false);
  if ('status' in patch) {
    if (patch.status !== 'open' && patch.status !== 'closed') throw invalid('status');
    set.status = patch.status;
  }
  if (!Object.keys(set).length) return toForwardDto(forward);
  const [row] = await db.update(receivableFxForwards).set({ ...set, updatedAt: new Date() }).where(eq(receivableFxForwards.id, forward.id)).returning();
  const what = set.status && set.status !== forward.status ? (set.status === 'closed' ? 'closed' : 'reopened') : 'edited';
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `${forwardLabel(row)} ${what}`, field: 'fxForward', affectsPage: false });
  return toForwardDto(row);
}

export async function closeForward(ctx: AuthContext, forwardId: string): Promise<FxForwardDto> {
  return updateForward(ctx, forwardId, { status: 'closed' });
}

/** Cancelling keeps the row for the record; it no longer counts as cover. */
export async function cancelForward(ctx: AuthContext, forwardId: string): Promise<FxForwardDto> {
  const { forward, sheet } = await scopedForward(ctx, forwardId);
  if (forward.status === 'cancelled') return toForwardDto(forward);
  const [row] = await db.update(receivableFxForwards).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(receivableFxForwards.id, forward.id)).returning();
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `${forwardLabel(row)} cancelled`, field: 'fxForward', affectsPage: false });
  return toForwardDto(row);
}

/**
 * For Mark received: the open forward a receipt is delivered against. It must be on the same
 * sheet, in the invoice's currency, open and not fully used. Called after the invoice is scoped,
 * so the caller may already edit `sheetId`.
 */
export async function forwardForReceipt(sheetId: string, forwardId: unknown, currency: string): Promise<ForwardRow> {
  if (typeof forwardId !== 'string' || !UUID.test(forwardId)) throw invalid('forward');
  const [f] = await db
    .select()
    .from(receivableFxForwards)
    .where(and(eq(receivableFxForwards.id, forwardId), eq(receivableFxForwards.sheetId, sheetId)))
    .limit(1);
  if (!f || f.status !== 'open' || f.currency !== currency.trim().toUpperCase() || unutilised({ amountFc: num(f.amountFc) ?? 0, utilisedFc: num(f.utilisedFc) ?? 0 }) <= 0) throw invalid('forward');
  return f;
}

/**
 * Delivers `fc` of a receipt against the forward, up to what is left on it. A fully used forward
 * closes. Logged on the sheet's change trail with the invoice it came from.
 */
export async function utiliseForward(input: { forward: ForwardRow; fc: number; actorId: string; invoiceId: string; invoiceLabel: string }): Promise<void> {
  const { forward } = input;
  const amount = num(forward.amountFc) ?? 0;
  const used = num(forward.utilisedFc) ?? 0;
  const take = round2(Math.min(Math.max(0, input.fc), Math.max(0, amount - used)));
  if (take <= 0) return;
  const after = round2(used + take);
  await db
    .update(receivableFxForwards)
    .set({ utilisedFc: money(after), ...(after >= amount ? { status: 'closed' } : {}), updatedAt: new Date() })
    .where(eq(receivableFxForwards.id, forward.id));
  await logChange({
    sheetId: forward.sheetId,
    invoiceId: input.invoiceId,
    actorId: input.actorId,
    summary: `${input.invoiceLabel}: ${forward.currency} ${money(take)} delivered against ${forwardLabel(forward)}`,
    field: 'fxForward',
    before: money(used),
    after: money(after),
    affectsPage: false,
  });
}

/* -------------------------------------------------------------------- alerts */

async function scopedAlert(ctx: AuthContext, alertId: string): Promise<{ alert: AlertRow; sheet: SheetRow }> {
  assertEditorRole(ctx);
  if (!UUID.test(alertId ?? '')) throw notFound();
  const [alert] = await db.select().from(receivableFxAlerts).where(eq(receivableFxAlerts.id, alertId)).limit(1);
  if (!alert) throw notFound();
  const sheet = await scopedSheet(ctx, alert.sheetId);
  return { alert, sheet };
}

function cleanDirection(v: unknown): 'above' | 'below' {
  if (v !== 'above' && v !== 'below') throw invalid('direction');
  return v;
}

export async function listAlerts(ctx: AuthContext, sheetId: string): Promise<FxAlertDto[]> {
  const sheet = await scopedSheet(ctx, sheetId);
  const rows: AlertRow[] = await db.select().from(receivableFxAlerts).where(eq(receivableFxAlerts.sheetId, sheet.id)).orderBy(receivableFxAlerts.currency, receivableFxAlerts.threshold);
  return rows.map((r) => toAlertDto(r, null));
}

export async function createAlert(ctx: AuthContext, sheetId: string, input: FxAlertInput): Promise<FxAlertDto> {
  const sheet = await scopedSheet(ctx, sheetId);
  const currency = cleanCurrency(input.currency);
  const direction = cleanDirection(input.direction);
  const threshold = cleanPositive(input.threshold, 100_000, 'threshold', 6);
  const [row] = await db.insert(receivableFxAlerts).values({ sheetId: sheet.id, currency, direction, threshold: threshold.toFixed(6), createdBy: ctx.userId }).returning();
  return toAlertDto(row, null);
}

/** Turning an alert back on, or moving its level, lets it fire again today. */
export async function updateAlert(ctx: AuthContext, alertId: string, patch: FxAlertPatch): Promise<FxAlertDto> {
  const { alert } = await scopedAlert(ctx, alertId);
  const set: Partial<typeof receivableFxAlerts.$inferInsert> = {};
  if ('currency' in patch) set.currency = cleanCurrency(patch.currency);
  if ('direction' in patch) set.direction = cleanDirection(patch.direction);
  if ('threshold' in patch) set.threshold = cleanPositive(patch.threshold, 100_000, 'threshold', 6).toFixed(6);
  if ('active' in patch) {
    if (typeof patch.active !== 'boolean') throw invalid('active');
    set.active = patch.active;
  }
  if (!Object.keys(set).length) return toAlertDto(alert, null);
  if (set.threshold !== undefined || set.direction !== undefined || set.currency !== undefined || (set.active && !alert.active)) set.lastTriggeredOn = null;
  const [row] = await db.update(receivableFxAlerts).set(set).where(eq(receivableFxAlerts.id, alert.id)).returning();
  return toAlertDto(row, null);
}

export async function deleteAlert(ctx: AuthContext, alertId: string): Promise<void> {
  const { alert } = await scopedAlert(ctx, alertId);
  await db.delete(receivableFxAlerts).where(eq(receivableFxAlerts.id, alert.id));
}

/* -------------------------------------------------------------- system (job) */

/** SYSTEM (no AuthContext): every supported currency on an open invoice or an open forward, plus USD. */
export async function systemFxCurrenciesInUse(): Promise<string[]> {
  const inv = await db
    .selectDistinct({ currency: receivableInvoices.currency })
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.status, 'open'), isNull(receivableInvoices.deletedAt), ne(receivableInvoices.currency, 'INR')));
  const fwd = await db.selectDistinct({ currency: receivableFxForwards.currency }).from(receivableFxForwards).where(eq(receivableFxForwards.status, 'open'));
  const alerts = await db.selectDistinct({ currency: receivableFxAlerts.currency }).from(receivableFxAlerts).where(eq(receivableFxAlerts.active, true));
  return sortCurrencies(['USD', ...[...inv, ...fwd, ...alerts].map((r) => r.currency)]).filter(isSupportedForeign);
}

export type DueAlertCheck = {
  id: string;
  sheetId: string;
  clientOrgName: string;
  currency: string;
  direction: 'above' | 'below';
  threshold: number;
  active: boolean;
  lastTriggeredOn: string | null;
  managerEmail: string | null;
  managerName: string | null;
  exposureFc: number;
  exposureBookedInr: number;
};

/**
 * SYSTEM (no AuthContext): the active alerts with their sheet's manager and the sheet's open
 * exposure in the alert's currency. An alert on a sheet with no manager has no email.
 */
export async function systemActiveAlerts(): Promise<DueAlertCheck[]> {
  const rows = await db
    .select({
      id: receivableFxAlerts.id,
      sheetId: receivableFxAlerts.sheetId,
      currency: receivableFxAlerts.currency,
      direction: receivableFxAlerts.direction,
      threshold: receivableFxAlerts.threshold,
      active: receivableFxAlerts.active,
      lastTriggeredOn: receivableFxAlerts.lastTriggeredOn,
      clientOrgName: receivableSheets.clientOrgName,
      managerEmail: profiles.email,
      managerName: profiles.name,
    })
    .from(receivableFxAlerts)
    .innerJoin(receivableSheets, eq(receivableSheets.id, receivableFxAlerts.sheetId))
    .leftJoin(profiles, eq(profiles.id, receivableSheets.managerUserId))
    .where(eq(receivableFxAlerts.active, true));
  if (!rows.length) return [];
  const open = await db
    .select({ sheetId: receivableInvoices.sheetId, currency: receivableInvoices.currency, fcAmount: receivableInvoices.fcAmount, fxRate: receivableInvoices.fxRate, amountInr: receivableInvoices.amountInr })
    .from(receivableInvoices)
    .where(and(inArray(receivableInvoices.sheetId, [...new Set(rows.map((r) => r.sheetId))]), eq(receivableInvoices.status, 'open'), isNull(receivableInvoices.deletedAt), ne(receivableInvoices.currency, 'INR')));
  return rows.map((r) => {
    const mine = open.filter((i) => i.sheetId === r.sheetId && i.currency === r.currency);
    const exposureFc = round2(mine.reduce((a, i) => a + (num(i.fcAmount) ?? 0), 0));
    const exposureBookedInr = round2(mine.reduce((a, i) => a + ((num(i.fcAmount) ?? 0) * (num(i.fxRate) ?? 0) || (num(i.amountInr) ?? 0)), 0));
    return {
      id: r.id,
      sheetId: r.sheetId,
      clientOrgName: r.clientOrgName,
      currency: r.currency,
      direction: r.direction === 'below' ? 'below' : 'above',
      threshold: num(r.threshold) ?? 0,
      active: r.active,
      lastTriggeredOn: r.lastTriggeredOn ? String(r.lastTriggeredOn) : null,
      managerEmail: r.managerEmail ?? null,
      managerName: r.managerName ?? null,
      exposureFc,
      exposureBookedInr,
    };
  });
}

/** SYSTEM (no AuthContext): the alert fired today, so it waits until tomorrow. */
export async function systemMarkAlertTriggered(alertId: string, day: string): Promise<void> {
  if (!UUID.test(alertId) || !ISO_DATE.test(day)) throw invalid('alert');
  await db.update(receivableFxAlerts).set({ lastTriggeredOn: day }).where(eq(receivableFxAlerts.id, alertId));
}
