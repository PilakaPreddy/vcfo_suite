import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivableInvoiceNotes, receivablePartners } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { InvoiceNoteDto } from '@/lib/receivables/wire';
import { invalid, invoiceLabel, scopedInvoice } from './shared';

/**
 * RECEIVABLES — notes on an invoice (Phase 8), the manager side.
 *
 * >>> ACCESS CONTROL <<<
 *   The sheet's own manager and the firm-wide admins read and reply, through `scopedInvoice`
 *   (another manager reads the invoice as not found; interns, clients, developers and partners
 *   are refused before the first query). The partner's own side is `partner-portal.ts`.
 */

type NoteRow = typeof receivableInvoiceNotes.$inferSelect;

function toNote(row: NoteRow): InvoiceNoteDto {
  return { id: row.id, invoiceId: row.invoiceId, authorName: row.authorName, fromSbc: row.fromSbc, text: row.text, createdAt: row.createdAt.toISOString() };
}

/** The invoice's notes, oldest first. */
export async function listNotes(ctx: AuthContext, invoiceId: string): Promise<InvoiceNoteDto[]> {
  const { invoice } = await scopedInvoice(ctx, invoiceId);
  const rows = await db
    .select()
    .from(receivableInvoiceNotes)
    .where(and(eq(receivableInvoiceNotes.invoiceId, invoice.id), eq(receivableInvoiceNotes.sheetId, invoice.sheetId)))
    .orderBy(asc(receivableInvoiceNotes.createdAt));
  return rows.map(toNote);
}

export type SbcNoteResult = {
  note: InvoiceNoteDto;
  invoiceId: string;
  invoiceLabel: string;
  /** The invoice's partner, when they have an active login to read the reply; else null. */
  notify: { email: string; name: string } | null;
};

/** A reply from SBC (`from_sbc` true). Returns who to tell; the route sends the email. */
export async function addSbcNote(ctx: AuthContext, invoiceId: string, text: string): Promise<SbcNoteResult> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body || body.length > 2000) throw invalid('note');
  const [row] = await db
    .insert(receivableInvoiceNotes)
    .values({ sheetId: sheet.id, invoiceId: invoice.id, authorId: ctx.userId, authorName: ctx.name || 'SBC', fromSbc: true, text: body })
    .returning();
  let notify: SbcNoteResult['notify'] = null;
  if (invoice.partnerId) {
    const [p] = await db
      .select({ name: receivablePartners.name, active: receivablePartners.active, acceptedAt: receivablePartners.acceptedAt, email: profiles.email, status: profiles.status })
      .from(receivablePartners)
      .innerJoin(profiles, eq(profiles.id, receivablePartners.profileId))
      .where(and(eq(receivablePartners.id, invoice.partnerId), eq(receivablePartners.sheetId, sheet.id)))
      .limit(1);
    if (p && p.active && p.acceptedAt && p.status === 'active') notify = { email: p.email, name: p.name };
  }
  return { note: toNote(row), invoiceId: invoice.id, invoiceLabel: invoiceLabel(invoice), notify };
}
