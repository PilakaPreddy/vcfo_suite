import 'server-only';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableCreditNotes, receivableFiras, receivableInvoices } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isForeign } from '@/lib/receivables/fx';
import type { SheetInvoice } from '@/lib/receivables/model';
import type { CreditNoteDto, FiraDto } from '@/lib/receivables/reports-wire';
import { ISO_DATE, UUID, invalid, invoiceLabel, logChange, money, notFound, num, scopedInvoice, scopedSheet, toInvoice, type InvoiceRow } from './shared';

/**
 * RECEIVABLES ADJUSTMENTS (Phase 9) — what happens to an invoice besides being paid: credit
 * notes, disputes, the TDS the client deducted, and the FIRA the bank owes for a foreign receipt.
 * Every function goes through `scopedSheet` or `scopedInvoice`, so only the sheet's own manager
 * and the firm-wide admins reach it; anyone else reads not found before any write.
 *
 * A dispute pauses the invoice's reminders with a marker date (`DISPUTE_PAUSE_UNTIL`), so
 * resolving it lifts only that pause and leaves a pause the manager set by hand alone. None of
 * these changes appear on the client page except a credit note, which lowers the open balance.
 */

/** The pause date a dispute sets; far enough out that the reminder rule never reaches it. */
export const DISPUTE_PAUSE_UNTIL = '2999-12-31';

type FiraRow = typeof receivableFiras.$inferSelect;
type CreditNoteRow = typeof receivableCreditNotes.$inferSelect;

function cleanDate(v: unknown, code: string): string {
  if (typeof v !== 'string' || !ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw invalid(code);
  return v;
}

function cleanText(v: unknown, max: number, code: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > max) throw invalid(code);
  return s;
}

function iso(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

export function isDisputed(row: Pick<InvoiceRow, 'disputedAt' | 'disputeResolvedAt'>): boolean {
  return Boolean(row.disputedAt) && !row.disputeResolvedAt;
}

/* ------------------------------------------------------------------ credit notes */

function creditNoteDto(r: CreditNoteRow): CreditNoteDto {
  return { id: r.id, invoiceId: r.invoiceId, number: r.number, issuedOn: String(r.issuedOn), amountInr: num(r.amountInr) ?? 0, reason: r.reason, createdAt: iso(r.createdAt) };
}

export async function listCreditNotes(ctx: AuthContext, invoiceId: string): Promise<CreditNoteDto[]> {
  const { invoice } = await scopedInvoice(ctx, invoiceId);
  const rows = await db.select().from(receivableCreditNotes).where(eq(receivableCreditNotes.invoiceId, invoice.id)).orderBy(desc(receivableCreditNotes.issuedOn));
  return rows.map(creditNoteDto);
}

/**
 * Records a credit note and lowers the open balance by its amount. A credit note for the whole
 * balance is refused: an invoice cancelled in full is removed from the sheet instead.
 */
export async function addCreditNote(
  ctx: AuthContext,
  invoiceId: string,
  input: { number?: string | null; issuedOn: string; amountInr: number; reason?: string | null },
): Promise<{ creditNote: CreditNoteDto; invoice: SheetInvoice }> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  if (invoice.status !== 'open') throw invalid('not_open');
  const issuedOn = cleanDate(input.issuedOn, 'issued_on');
  const amount = Math.round(Number(input.amountInr) * 100) / 100;
  const open = num(invoice.amountInr) ?? 0;
  if (!Number.isFinite(amount) || amount <= 0) throw invalid('amount');
  if (amount >= open) throw invalid('credit_note_too_large');
  const number = cleanText(input.number, 40, 'number') || null;
  const reason = cleanText(input.reason, 300, 'reason');
  const [note] = await db
    .insert(receivableCreditNotes)
    .values({ sheetId: sheet.id, invoiceId: invoice.id, number, issuedOn, amountInr: money(amount), reason, createdBy: ctx.userId })
    .returning();
  const [row] = await db
    .update(receivableInvoices)
    .set({ amountInr: money(open - amount), updatedAt: new Date() })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({
    sheetId: sheet.id,
    invoiceId: invoice.id,
    actorId: ctx.userId,
    summary: `${invoiceLabel(invoice)} credit note${number ? ` ${number}` : ''} for ₹${money(amount)}`,
    field: 'amountInr',
    before: money(open),
    after: money(open - amount),
  });
  return { creditNote: creditNoteDto(note), invoice: toInvoice(row) };
}

/* ------------------------------------------------------------------ disputes */

/** Marks an open invoice disputed: out of the ageing and the forecast, and no reminders until resolved. */
export async function raiseDispute(ctx: AuthContext, invoiceId: string, input: { reason: string }): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  if (invoice.status !== 'open') throw invalid('not_open');
  if (isDisputed(invoice)) throw invalid('already_disputed');
  const reason = cleanText(input.reason, 300, 'reason');
  if (!reason) throw invalid('reason');
  const [row] = await db
    .update(receivableInvoices)
    .set({
      disputedAt: new Date(),
      disputeReason: reason,
      disputeResolvedAt: null,
      remindersPausedUntil: DISPUTE_PAUSE_UNTIL,
      pauseReason: `Disputed: ${reason}`.slice(0, 200),
      updatedAt: new Date(),
    })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(invoice)} disputed: ${reason}`, field: 'disputedAt', after: reason, affectsPage: false });
  return toInvoice(row);
}

/** Settles the dispute. Reminders resume only if the dispute was what paused them. */
export async function resolveDispute(ctx: AuthContext, invoiceId: string): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  if (!isDisputed(invoice)) throw invalid('not_disputed');
  const pausedByDispute = invoice.remindersPausedUntil !== null && String(invoice.remindersPausedUntil) === DISPUTE_PAUSE_UNTIL;
  const [row] = await db
    .update(receivableInvoices)
    .set({ disputeResolvedAt: new Date(), ...(pausedByDispute ? { remindersPausedUntil: null, pauseReason: null } : {}), updatedAt: new Date() })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(invoice)} dispute resolved`, field: 'disputeResolvedAt', before: invoice.disputeReason, affectsPage: false });
  return toInvoice(row);
}

/* ------------------------------------------------------------------ TDS */

/** The TDS the client deducted (INR) and the day its certificate (Form 16A) arrived; null clears the date. */
export async function setTds(ctx: AuthContext, invoiceId: string, input: { tdsInr?: number; certificateOn?: string | null }): Promise<SheetInvoice> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  const set: Partial<typeof receivableInvoices.$inferInsert> = {};
  const parts: string[] = [];
  if (input.tdsInr !== undefined) {
    const tds = Math.round(Number(input.tdsInr) * 100) / 100;
    if (!Number.isFinite(tds) || tds < 0 || tds >= 1e12) throw invalid('tds');
    set.tdsInr = money(tds);
    parts.push(`TDS ₹${money(tds)}`);
  }
  if (input.certificateOn !== undefined) {
    set.tdsCertificateOn = input.certificateOn === null ? null : cleanDate(input.certificateOn, 'certificate_on');
    parts.push(set.tdsCertificateOn ? `certificate received ${set.tdsCertificateOn}` : 'certificate awaited');
  }
  if (!parts.length) return toInvoice(invoice);
  const [row] = await db
    .update(receivableInvoices)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(receivableInvoices.id, invoice.id))
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: invoice.id, actorId: ctx.userId, summary: `${invoiceLabel(invoice)} ${parts.join(', ')}`, field: 'tds', affectsPage: false });
  return toInvoice(row);
}

/* ------------------------------------------------------------------ FIRAs */

/**
 * Creates the awaited FIRA rows for received foreign invoices that have none yet. Called when
 * the sheet's FIRAs are read, so a receipt marked by hand or through the bank feed always gets
 * its row; it is idempotent per invoice. `sheetId` must already be scoped by the caller.
 */
export async function ensureAwaitedFiras(sheetId: string): Promise<number> {
  const received = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.sheetId, sheetId), eq(receivableInvoices.status, 'received'), ne(receivableInvoices.currency, 'INR'), isNull(receivableInvoices.deletedAt)));
  const foreign = received.filter((r) => isForeign({ currency: r.currency }));
  if (!foreign.length) return 0;
  const have = await db
    .select({ invoiceId: receivableFiras.invoiceId })
    .from(receivableFiras)
    .where(and(eq(receivableFiras.sheetId, sheetId), inArray(receivableFiras.invoiceId, foreign.map((r) => r.id))));
  const seen = new Set(have.map((h) => h.invoiceId));
  const missing = foreign.filter((r) => !seen.has(r.id));
  if (!missing.length) return 0;
  await db.insert(receivableFiras).values(
    missing.map((r) => ({
      sheetId,
      invoiceId: r.id,
      status: 'awaited',
      currency: r.currency.trim().toUpperCase(),
      fcAmount: num(r.receivedFc) !== null ? money(num(r.receivedFc)!) : num(r.fcAmount) !== null ? money(num(r.fcAmount)!) : null,
      inrAmount: num(r.paidAmount) !== null ? money(num(r.paidAmount)!) : null,
    })),
  );
  return missing.length;
}

/** The awaited FIRA for one received foreign invoice; returns the existing row when there is one. */
export async function createAwaitedFira(ctx: AuthContext, invoiceId: string, input: { bankCreditId?: string | null } = {}): Promise<FiraDto> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  if (invoice.status !== 'received' || !isForeign({ currency: invoice.currency })) throw invalid('not_foreign_receipt');
  const [existing] = await db.select().from(receivableFiras).where(and(eq(receivableFiras.sheetId, sheet.id), eq(receivableFiras.invoiceId, invoice.id))).limit(1);
  if (existing) return firaDto(existing, invoice);
  const bankCreditId = input.bankCreditId && UUID.test(input.bankCreditId) ? input.bankCreditId : null;
  const [row] = await db
    .insert(receivableFiras)
    .values({
      sheetId: sheet.id,
      invoiceId: invoice.id,
      bankCreditId,
      status: 'awaited',
      currency: invoice.currency.trim().toUpperCase(),
      fcAmount: num(invoice.receivedFc) !== null ? money(num(invoice.receivedFc)!) : num(invoice.fcAmount) !== null ? money(num(invoice.fcAmount)!) : null,
      inrAmount: num(invoice.paidAmount) !== null ? money(num(invoice.paidAmount)!) : null,
    })
    .returning();
  return firaDto(row, invoice);
}

export function firaDto(r: FiraRow, inv?: Pick<InvoiceRow, 'clientName' | 'invoiceNo'> | null): FiraDto {
  return {
    id: r.id,
    invoiceId: r.invoiceId,
    clientName: inv?.clientName ?? null,
    invoiceNo: inv?.invoiceNo ?? null,
    status: r.status === 'received' ? 'received' : 'awaited',
    firaNo: r.firaNo,
    issuedOn: r.issuedOn ? String(r.issuedOn) : null,
    currency: r.currency,
    fcAmount: num(r.fcAmount),
    inrAmount: num(r.inrAmount),
    note: r.note,
    createdAt: iso(r.createdAt),
  };
}

/** The sheet's FIRAs, awaited first, after creating any that are missing. */
export async function listFiras(ctx: AuthContext, sheetId: string): Promise<FiraDto[]> {
  const sheet = await scopedSheet(ctx, sheetId);
  return listFirasOfSheet(sheet.id);
}

/** The FIRA list for a sheet already scoped by the caller. */
export async function listFirasOfSheet(sheetId: string): Promise<FiraDto[]> {
  await ensureAwaitedFiras(sheetId);
  const rows = await db
    .select({ fira: receivableFiras, clientName: receivableInvoices.clientName, invoiceNo: receivableInvoices.invoiceNo })
    .from(receivableFiras)
    .leftJoin(receivableInvoices, eq(receivableInvoices.id, receivableFiras.invoiceId))
    .where(eq(receivableFiras.sheetId, sheetId))
    .orderBy(desc(receivableFiras.createdAt))
    .limit(500);
  return rows
    .map((r) => firaDto(r.fira, r.clientName === null ? null : { clientName: r.clientName, invoiceNo: r.invoiceNo }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'awaited' ? -1 : 1));
}

/** Marks a FIRA received with the bank's number and date, or sets it back to awaited. */
export async function updateFira(
  ctx: AuthContext,
  firaId: string,
  input: { status: 'received'; firaNo: string; issuedOn: string; note?: string | null } | { status: 'awaited'; note?: string | null },
): Promise<FiraDto> {
  if (!UUID.test(firaId ?? '')) throw notFound();
  const [fira] = await db.select().from(receivableFiras).where(eq(receivableFiras.id, firaId)).limit(1);
  if (!fira) throw notFound();
  const sheet = await scopedSheet(ctx, fira.sheetId);
  const note = input.note === undefined ? fira.note : cleanText(input.note, 300, 'note');
  let set: Partial<typeof receivableFiras.$inferInsert>;
  if (input.status === 'received') {
    const firaNo = cleanText(input.firaNo, 60, 'fira_no');
    if (!firaNo) throw invalid('fira_no');
    set = { status: 'received', firaNo, issuedOn: cleanDate(input.issuedOn, 'issued_on'), note };
  } else if (input.status === 'awaited') {
    set = { status: 'awaited', firaNo: null, issuedOn: null, note };
  } else {
    throw invalid('status');
  }
  const [row] = await db
    .update(receivableFiras)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(receivableFiras.id, fira.id))
    .returning();
  let inv: InvoiceRow | undefined;
  if (row.invoiceId) [inv] = await db.select().from(receivableInvoices).where(eq(receivableInvoices.id, row.invoiceId)).limit(1);
  await logChange({
    sheetId: sheet.id,
    invoiceId: row.invoiceId,
    actorId: ctx.userId,
    summary: set.status === 'received' ? `${inv ? invoiceLabel(inv) : 'Foreign receipt'} FIRA ${set.firaNo} received` : `${inv ? invoiceLabel(inv) : 'Foreign receipt'} FIRA set back to awaited`,
    field: 'fira',
    affectsPage: false,
  });
  return firaDto(row, inv ?? null);
}
