import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableInvoices, receivablePartners } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { monthStart } from '@/lib/receivables/dates';
import { isForeign, round2 } from '@/lib/receivables/fx';
import type { InvoiceInput, InvoicePatch, ReceiptInput, SheetInvoice } from '@/lib/receivables/model';
import { ISO_DATE, UUID, invalid, invoiceLabel, logChange, money, num, scopedInvoice, scopedSheet, toInvoice } from './shared';

export type { InvoiceInput, InvoicePatch, ReceiptInput };

/** The currencies an invoice may be raised in today. */
const CURRENCIES = new Set(['INR', 'USD']);

function cleanText(v: unknown, max: number, code: string, required = true): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) throw invalid(code);
    return null;
  }
  if (s.length > max) throw invalid(code);
  return s;
}

function cleanDate(v: unknown, code: string): string {
  if (typeof v !== 'string' || !ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw invalid(code);
  return v;
}

function cleanAmount(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) throw invalid('amount');
  return Math.round(n * 100) / 100;
}

function cleanCurrency(v: unknown): string {
  const c = typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : 'INR';
  if (!CURRENCIES.has(c)) throw invalid('currency');
  return c;
}

function cleanRate(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= 100_000) throw invalid('fx_rate');
  return Math.round(n * 1e6) / 1e6;
}

function cleanFc(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) throw invalid('fc_amount');
  return Math.round(n * 100) / 100;
}

/** The foreign-currency columns of an invoice: all null for INR, all required for USD. */
type FxColumns = { currency: string; fcAmount: string | null; fxRate: string | null; invoiceDate: string | null };

function cleanFx(input: { currency?: unknown; fcAmount?: unknown; fxRate?: unknown; invoiceDate?: unknown }): FxColumns & { bookedInr: number | null } {
  const currency = cleanCurrency(input.currency);
  const invoiceDate = input.invoiceDate === null || input.invoiceDate === undefined || input.invoiceDate === '' ? null : cleanDate(input.invoiceDate, 'invoice_date');
  if (!isForeign({ currency })) return { currency, fcAmount: null, fxRate: null, invoiceDate, bookedInr: null };
  if (!invoiceDate) throw invalid('invoice_date');
  const fc = cleanFc(input.fcAmount);
  const rate = cleanRate(input.fxRate);
  return { currency, fcAmount: money(fc), fxRate: rate.toFixed(6), invoiceDate, bookedInr: round2(fc * rate) };
}

/** A partner id must belong to the same sheet, or be null. */
async function cleanPartner(sheetId: string, partnerId: unknown): Promise<string | null> {
  if (partnerId === null || partnerId === undefined || partnerId === '') return null;
  if (typeof partnerId !== 'string' || !UUID.test(partnerId)) throw invalid('partner');
  const [p] = await db
    .select({ id: receivablePartners.id })
    .from(receivablePartners)
    .where(and(eq(receivablePartners.id, partnerId), eq(receivablePartners.sheetId, sheetId)))
    .limit(1);
  if (!p) throw invalid('partner');
  return p.id;
}

export async function addInvoice(ctx: AuthContext, sheetId: string, input: InvoiceInput): Promise<SheetInvoice> {
  const sheet = await scopedSheet(ctx, sheetId);
  const clientName = cleanText(input.clientName, 120, 'client')!;
  const invoiceNo = cleanText(input.invoiceNo, 40, 'invoice_no', false);
  const invoiceMonth = monthStart(cleanDate(input.invoiceMonth, 'invoice_month'));
  const dueDate = cleanDate(input.dueDate, 'due_date');
  const fx = cleanFx(input);
  // A foreign invoice books its INR at the invoice-date rate; the typed INR is ignored then.
  const amountInr = fx.bookedInr ?? cleanAmount(input.amountInr);
  const partnerId = await cleanPartner(sheet.id, input.partnerId);
  const [row] = await db
    .insert(receivableInvoices)
    .values({
      sheetId: sheet.id,
      clientName,
      invoiceNo,
      invoiceMonth,
      dueDate,
      amountInr: money(amountInr),
      currency: fx.currency,
      fcAmount: fx.fcAmount,
      fxRate: fx.fxRate,
      invoiceDate: fx.invoiceDate,
      partnerId,
      createdBy: ctx.userId,
    })
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: row.id, actorId: ctx.userId, summary: `${invoiceLabel(row)} added` });
  return toInvoice(row);
}

const FIELD_LABEL: Record<keyof InvoicePatch, string> = {
  clientName: 'client name',
  invoiceNo: 'invoice number',
  partnerId: 'client partner',
  dueDate: 'due date',
  amountInr: 'amount',
  invoiceMonth: 'invoice month',
  currency: 'currency',
  fcAmount: 'foreign amount',
  fxRate: 'booked rate',
  invoiceDate: 'invoice date',
};

const FX_FIELDS = ['currency', 'fcAmount', 'fxRate', 'invoiceDate'] as const;

/** Inline edits from the sheet. Each changed field is one change row. */
export async function updateInvoice(ctx: AuthContext, invoiceId: string, patch: InvoicePatch): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  const set: Partial<typeof receivableInvoices.$inferInsert> = {};
  const changes: Array<{ field: keyof InvoicePatch; before: string | null; after: string | null }> = [];
  const note = (field: keyof InvoicePatch, before: unknown, after: unknown) => {
    const b = before === null || before === undefined ? null : String(before);
    const a = after === null || after === undefined ? null : String(after);
    if (b !== a) changes.push({ field, before: b, after: a });
    return b !== a;
  };
  if ('clientName' in patch) {
    const v = cleanText(patch.clientName, 120, 'client')!;
    if (note('clientName', invoice.clientName, v)) set.clientName = v;
  }
  if ('invoiceNo' in patch) {
    const v = cleanText(patch.invoiceNo, 40, 'invoice_no', false);
    if (note('invoiceNo', invoice.invoiceNo, v)) set.invoiceNo = v;
  }
  if ('partnerId' in patch) {
    const v = await cleanPartner(sheet.id, patch.partnerId);
    if (note('partnerId', invoice.partnerId, v)) set.partnerId = v;
  }
  if ('dueDate' in patch) {
    const v = cleanDate(patch.dueDate, 'due_date');
    if (note('dueDate', invoice.dueDate, v)) set.dueDate = v;
  }
  if ('invoiceMonth' in patch) {
    const v = monthStart(cleanDate(patch.invoiceMonth, 'invoice_month'));
    if (note('invoiceMonth', invoice.invoiceMonth, v)) set.invoiceMonth = v;
  }
  if ('amountInr' in patch) {
    const v = cleanAmount(patch.amountInr);
    if (note('amountInr', num(invoice.amountInr), v)) set.amountInr = money(v);
  }
  if (FX_FIELDS.some((f) => f in patch)) {
    // The FX fields are checked together, the patch over the stored values, so a USD invoice
    // always keeps its amount, rate and date.
    const fx = cleanFx({
      currency: 'currency' in patch ? patch.currency : invoice.currency,
      fcAmount: 'fcAmount' in patch ? patch.fcAmount : invoice.fcAmount,
      fxRate: 'fxRate' in patch ? patch.fxRate : invoice.fxRate,
      invoiceDate: 'invoiceDate' in patch ? patch.invoiceDate : invoice.invoiceDate,
    });
    if (note('currency', invoice.currency, fx.currency)) set.currency = fx.currency;
    if (note('fcAmount', invoice.fcAmount === null ? null : money(num(invoice.fcAmount) ?? 0), fx.fcAmount)) set.fcAmount = fx.fcAmount;
    if (note('fxRate', invoice.fxRate === null ? null : (num(invoice.fxRate) ?? 0).toFixed(6), fx.fxRate)) set.fxRate = fx.fxRate;
    if (note('invoiceDate', invoice.invoiceDate ? String(invoice.invoiceDate) : null, fx.invoiceDate)) set.invoiceDate = fx.invoiceDate;
    // Before any part payment the open balance is the booked INR, so it follows the FX fields.
    if (fx.bookedInr !== null && !(num(invoice.partPaid) ?? 0) && !('amountInr' in patch) && note('amountInr', num(invoice.amountInr), fx.bookedInr)) set.amountInr = money(fx.bookedInr);
  }
  if (!changes.length) return toInvoice(invoice);
  const [row] = await db.update(receivableInvoices).set({ ...set, updatedAt: new Date() }).where(eq(receivableInvoices.id, invoice.id)).returning();
  for (const c of changes) {
    await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(row)} ${FIELD_LABEL[c.field]} edited`, field: c.field, before: c.before, after: c.after });
  }
  return toInvoice(row);
}

/**
 * Records a payment. A full payment (or any payment when `part` is false) marks the invoice
 * received; a part payment lowers the open balance and keeps it open. A small shortfall from FX,
 * TDS or bank charges still counts as full: the manager chooses, the code does not guess.
 *
 * `amount` is always the INR credited. For a foreign invoice `receivedFc` is the foreign amount
 * that arrived (the realised gain or loss is worked out from it and the booked rate), and a part
 * payment lowers the open balance by the booked INR of that foreign amount. For an INR invoice
 * `tdsInr` is the TDS the client deducted; it adds to the invoice's TDS and, on a part payment,
 * settles the balance along with the amount.
 */
export async function markReceived(ctx: AuthContext, invoiceId: string, input: ReceiptInput): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  if (invoice.status !== 'open') throw invalid('not_open');
  const paidOn = cleanDate(input.paidOn, 'paid_on');
  const amount = cleanAmount(input.amount);
  const open = num(invoice.amountInr) ?? 0;
  const foreign = isForeign({ currency: invoice.currency });
  const receivedFc = foreign && input.receivedFc !== null && input.receivedFc !== undefined ? cleanFc(input.receivedFc) : null;
  let tds = 0;
  if (!foreign && input.tdsInr !== null && input.tdsInr !== undefined) {
    tds = Math.round(Number(input.tdsInr) * 100) / 100;
    if (!Number.isFinite(tds) || tds < 0 || tds >= 1e12) throw invalid('tds');
  }
  const tdsSet = tds > 0 ? { tdsInr: money((num(invoice.tdsInr) ?? 0) + tds) } : {};
  const rate = num(invoice.fxRate);
  const settled = foreign && receivedFc !== null && rate ? round2(receivedFc * rate) : round2(amount + tds);
  if (input.part && settled < open) {
    const fcLeft = foreign && receivedFc !== null && num(invoice.fcAmount) !== null ? Math.max(0, (num(invoice.fcAmount) ?? 0) - receivedFc) : null;
    const [row] = await db
      .update(receivableInvoices)
      .set({
        amountInr: money(open - settled),
        partPaid: money((num(invoice.partPaid) ?? 0) + amount),
        // The open foreign balance shrinks with the open INR; `received_fc` is kept for the final receipt.
        ...(fcLeft !== null ? { fcAmount: money(fcLeft) } : {}),
        ...tdsSet,
        updatedAt: new Date(),
      })
      .where(eq(receivableInvoices.id, invoice.id))
      .returning();
    const what = receivedFc !== null ? `${invoice.currency} ${money(receivedFc)} (₹${money(amount)})` : `₹${amount}`;
    await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(row)} part payment ${what} on ${paidOn}`, field: 'partPaid', before: money(open), after: money(open - settled) });
    return toInvoice(row);
  }
  const [row] = await db
    .update(receivableInvoices)
    .set({
      status: 'received',
      paidOn,
      paidAmount: money(amount),
      paidVia: 'manual',
      ...(foreign ? { receivedFc: receivedFc === null ? null : money(receivedFc) } : {}),
      ...tdsSet,
      remindersPausedUntil: null,
      pauseReason: null,
      updatedAt: new Date(),
    })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(row)} marked received`, field: 'status', before: 'open', after: 'received' });
  return toInvoice(row);
}

/** Undo of Mark received. */
export async function reopenInvoice(ctx: AuthContext, invoiceId: string): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  if (invoice.status !== 'received') throw invalid('not_received');
  const [row] = await db
    .update(receivableInvoices)
    .set({ status: 'open', paidOn: null, paidAmount: null, paidVia: null, ...(isForeign({ currency: invoice.currency }) ? { receivedFc: null } : {}), updatedAt: new Date() })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(row)} set back to open`, field: 'status', before: 'received', after: 'open' });
  return toInvoice(row);
}

/** No reminders up to and including `until`. Null `until` resumes them. Not shown on the public page. */
export async function setReminderPause(ctx: AuthContext, invoiceId: string, input: { until: string | null; reason?: string | null }): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  const until = input.until === null ? null : cleanDate(input.until, 'until');
  const reason = until ? cleanText(input.reason, 200, 'reason', false) : null;
  const [row] = await db
    .update(receivableInvoices)
    .set({ remindersPausedUntil: until, pauseReason: reason, updatedAt: new Date() })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({
    sheetId: sheet.id,
    invoiceId: invoice.id,
    actorId: ctx.userId,
    summary: until ? `${invoiceLabel(row)} reminders paused until ${until}` : `${invoiceLabel(row)} reminders resumed`,
    field: 'remindersPausedUntil',
    before: invoice.remindersPausedUntil ? String(invoice.remindersPausedUntil) : null,
    after: until,
    affectsPage: false,
  });
  return toInvoice(row);
}

/** Soft delete: the row leaves the draft; published versions keep their copy. */
export async function deleteInvoice(ctx: AuthContext, invoiceId: string): Promise<void> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  await db.update(receivableInvoices).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(receivableInvoices.id, invoice.id));
  await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(invoice)} removed` });
}
