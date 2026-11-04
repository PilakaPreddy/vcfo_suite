import 'server-only';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { bankCredits, receivableInvoices } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { matchCredit } from '@/lib/receivables/match';
import type { IncomingCredit } from '@/lib/receivables/bank-feed/types';
import { ISO_DATE, UUID, invalid, invoiceLabel, logChange, money, notFound, num, scopedSheet, toInvoice } from './shared';

export type CreditRow = typeof bankCredits.$inferSelect;

export async function listCredits(ctx: AuthContext, sheetId: string): Promise<CreditRow[]> {
  const sheet = await scopedSheet(ctx, sheetId);
  return db.select().from(bankCredits).where(eq(bankCredits.sheetId, sheet.id)).orderBy(desc(bankCredits.valueDate)).limit(200);
}

async function scopedCredit(ctx: AuthContext, creditId: string): Promise<CreditRow> {
  if (!UUID.test(creditId ?? '')) throw notFound();
  const [c] = await db.select().from(bankCredits).where(eq(bankCredits.id, creditId)).limit(1);
  if (!c) throw notFound();
  await scopedSheet(ctx, c.sheetId);
  return c;
}

/** The database or an open transaction; `settle` runs inside the caller's transaction. */
type Tx = Pick<typeof db, 'select' | 'update' | 'insert'>;

/**
 * Marks the invoices a credit pays as received. One invoice takes the whole credit; several
 * invoices each take their own open amount. Only open invoices of the credit's own sheet. Each
 * update is conditional on the invoice still being open, so an invoice is received once even
 * when two credits race for it; the loser throws and its transaction rolls back.
 */
async function settle(tx: Tx, sheetId: string, credit: CreditRow, invoiceIds: string[], actorId: string | null): Promise<void> {
  if (!invoiceIds.length) return;
  const rows = await tx
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.sheetId, sheetId), inArray(receivableInvoices.id, invoiceIds), eq(receivableInvoices.status, 'open'), isNull(receivableInvoices.deletedAt)));
  if (rows.length !== invoiceIds.length) throw invalid('invoice');
  const amount = num(credit.inrAmount) ?? 0;
  for (const r of rows) {
    const paid = rows.length === 1 ? amount : num(r.amountInr) ?? 0;
    const [done] = await tx
      .update(receivableInvoices)
      .set({ status: 'received', paidOn: String(credit.valueDate), paidAmount: money(paid), paidVia: 'bank', remindersPausedUntil: null, pauseReason: null, updatedAt: new Date() })
      .where(and(eq(receivableInvoices.id, r.id), eq(receivableInvoices.status, 'open')))
      .returning({ id: receivableInvoices.id });
    if (!done) throw invalid('invoice');
    await logChange({ sheetId, invoiceId: r.id, actorId, summary: `${invoiceLabel(r)} received (bank credit from ${credit.payer})`, field: 'status', before: 'open', after: 'received' }, tx);
  }
}

/** Only a credit still waiting for a decision may be confirmed or ignored. */
const UNDECIDED = ['to_confirm', 'unmatched'];

/**
 * Confirms a credit against invoices. The credit is claimed first with a conditional update, so
 * a double click or two managers confirming at once settle it once; the second gets
 * `already_decided`. The claim and the settle share one transaction, so a failure part-way
 * leaves neither the credit nor any invoice changed.
 */
export async function confirmCredit(ctx: AuthContext, creditId: string, invoiceIds: string[]): Promise<CreditRow> {
  const c = await scopedCredit(ctx, creditId);
  if (!UNDECIDED.includes(c.status)) throw invalid('already_decided');
  const ids = [...new Set(invoiceIds)].filter((id) => UUID.test(id));
  if (!ids.length) throw invalid('invoice');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(bankCredits)
      .set({ status: 'confirmed', matchInvoiceIds: ids, decidedBy: ctx.userId, decidedAt: new Date() })
      .where(and(eq(bankCredits.id, c.id), inArray(bankCredits.status, UNDECIDED)))
      .returning();
    if (!row) throw invalid('already_decided');
    await settle(tx, c.sheetId, row, ids, ctx.userId);
    return row;
  });
}

export async function ignoreCredit(ctx: AuthContext, creditId: string): Promise<CreditRow> {
  const c = await scopedCredit(ctx, creditId);
  if (!UNDECIDED.includes(c.status)) throw invalid('already_decided');
  const [row] = await db
    .update(bankCredits)
    .set({ status: 'ignored', decidedBy: ctx.userId, decidedAt: new Date() })
    .where(and(eq(bankCredits.id, c.id), inArray(bankCredits.status, UNDECIDED)))
    .returning();
  if (!row) throw invalid('already_decided');
  return row;
}

export type { IncomingCredit };

export type IngestResult = { added: number; auto: number; duplicates: number };

/**
 * Stores each new credit once and runs the matcher. A credit counts once per sheet by its bank
 * reference whatever the source, so a statement imported by hand and the same credit arriving
 * later from the API are not counted twice. Sure matches are settled at once (in the draft; the
 * client page shows them after Update); the rest wait in the From bank tab.
 */
async function ingest(sheetId: string, credits: IncomingCredit[], actorId: string | null): Promise<IngestResult> {
  const out: IngestResult = { added: 0, auto: 0, duplicates: 0 };
  for (const c of credits) {
    if (!ISO_DATE.test(c.valueDate) || !(c.inrAmount > 0) || !c.externalRef) continue;
    const ref = c.externalRef.slice(0, 120);
    const [seen] = await db
      .select({ id: bankCredits.id })
      .from(bankCredits)
      .where(and(eq(bankCredits.sheetId, sheetId), eq(bankCredits.externalRef, ref)))
      .limit(1);
    if (seen) {
      out.duplicates++;
      continue;
    }
    // One transaction per credit: the row, its auto-settle and its match status land together.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(bankCredits)
        .values({
          sheetId,
          source: c.source,
          externalRef: ref,
          valueDate: c.valueDate,
          payer: c.payer.slice(0, 200),
          currency: c.currency || 'INR',
          fcAmount: c.fcAmount === null ? null : money(c.fcAmount),
          inrAmount: money(c.inrAmount),
          narration: (c.narration ?? '').slice(0, 500),
          status: 'unmatched',
        })
        .onConflictDoNothing()
        .returning();
      // The unique index is (sheet_id, external_ref): another source inserted it first.
      if (!row) return 'duplicate' as const;
      const open = await tx
        .select()
        .from(receivableInvoices)
        .where(and(eq(receivableInvoices.sheetId, sheetId), eq(receivableInvoices.status, 'open'), isNull(receivableInvoices.deletedAt)));
      const m = matchCredit(
        { payer: c.payer, inrAmount: c.inrAmount, currency: c.currency, fcAmount: c.fcAmount },
        open.map((r) => ({ ...toInvoice(r), currency: r.currency, fcAmount: num(r.fcAmount) })),
      );
      if (m.status === 'auto') await settle(tx, sheetId, row, m.invoiceIds, actorId);
      await tx.update(bankCredits).set({ status: m.status, matchInvoiceIds: m.invoiceIds, matchNote: m.note }).where(eq(bankCredits.id, row.id));
      return m.status === 'auto' ? ('auto' as const) : ('added' as const);
    });
    if (result === 'duplicate') {
      out.duplicates++;
      continue;
    }
    out.added++;
    if (result === 'auto') out.auto++;
  }
  return out;
}

/** The manager imports a bank statement file (camt.053 or camt.054) by hand. */
export async function importCredits(ctx: AuthContext, sheetId: string, credits: IncomingCredit[]): Promise<IngestResult> {
  const sheet = await scopedSheet(ctx, sheetId);
  return ingest(sheet.id, credits.map((c) => ({ ...c, source: 'manual' as const })), ctx.userId);
}

/** SYSTEM (no AuthContext): the bank feed job, for the one sheet the feed is configured for. */
export async function systemIngestCredits(sheetId: string, credits: IncomingCredit[]): Promise<IngestResult> {
  return ingest(sheetId, credits, null);
}
