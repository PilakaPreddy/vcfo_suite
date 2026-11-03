import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableChanges, receivableInvoices, receivableSheets } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import type { PaidVia, SheetInvoice } from '@/lib/receivables/model';

/**
 * RECEIVABLES — shared parts: who may act, errors, row mapping and the change log.
 *
 * >>> ACCESS CONTROL (docs/specs/receivables/PLAN.md) <<<
 *   A sheet belongs to one manager (`receivable_sheets.manager_user_id`). That manager and the
 *   firm-wide admins (super admin, admin) read and write it; any other manager reads it as not
 *   found. Interns, clients and developers are refused before the first query. The public client
 *   page has no session: it reads only a published snapshot through `systemPublicSheet`, found
 *   by the secret key in the link.
 */

export type SheetRow = typeof receivableSheets.$inferSelect;
export type InvoiceRow = typeof receivableInvoices.$inferSelect;

const EDITORS = new Set(['super_admin', 'admin', 'manager']);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReceivablesError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

export const notFound = () => new ReceivablesError(404, 'not_found');
export const invalid = (code: string) => new ReceivablesError(400, code);
export const conflict = (code: string) => new ReceivablesError(409, code);

/** Throws before any query for a role that can never edit a sheet. */
export function assertEditorRole(ctx: AuthContext): void {
  if (!EDITORS.has(ctx.role)) throw notFound();
}

export function mayEditSheet(ctx: AuthContext, sheet: Pick<SheetRow, 'managerUserId'>): boolean {
  return isFirmWideAdmin(ctx.role) || (sheet.managerUserId !== null && sheet.managerUserId === ctx.userId);
}

/** The sheet, if and only if the caller may edit it; anything else reads as not found. */
export async function scopedSheet(ctx: AuthContext, sheetId: string): Promise<SheetRow> {
  assertEditorRole(ctx);
  if (!UUID.test(sheetId ?? '')) throw notFound();
  const [sheet] = await db.select().from(receivableSheets).where(eq(receivableSheets.id, sheetId)).limit(1);
  if (!sheet || !mayEditSheet(ctx, sheet)) throw notFound();
  return sheet;
}

/** A live invoice and its sheet, if and only if the caller may edit that sheet. */
export async function scopedInvoice(ctx: AuthContext, invoiceId: string): Promise<{ invoice: InvoiceRow; sheet: SheetRow }> {
  assertEditorRole(ctx);
  if (!UUID.test(invoiceId ?? '')) throw notFound();
  const [invoice] = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.id, invoiceId), isNull(receivableInvoices.deletedAt)))
    .limit(1);
  if (!invoice) throw notFound();
  const sheet = await scopedSheet(ctx, invoice.sheetId);
  return { invoice, sheet };
}

/** Postgres `numeric` arrives as a string; the domain works in plain rupees. */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Back to `numeric(14,2)` text. */
export function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function toInvoice(row: InvoiceRow): SheetInvoice {
  return {
    id: row.id,
    invoiceMonth: String(row.invoiceMonth),
    clientName: row.clientName,
    invoiceNo: row.invoiceNo,
    partnerId: row.partnerId,
    dueDate: String(row.dueDate),
    amountInr: num(row.amountInr) ?? 0,
    status: row.status === 'received' ? 'received' : 'open',
    paidOn: row.paidOn ? String(row.paidOn) : null,
    paidAmount: num(row.paidAmount),
    paidVia: (row.paidVia as PaidVia | null) ?? null,
    partPaid: num(row.partPaid) ?? 0,
    remindersPausedUntil: row.remindersPausedUntil ? String(row.remindersPausedUntil) : null,
    pauseReason: row.pauseReason,
  };
}

/** "Duravant SC/09/03" — how a change names its invoice. */
export function invoiceLabel(row: Pick<InvoiceRow, 'clientName' | 'invoiceNo'>): string {
  return row.invoiceNo ? `${row.clientName} ${row.invoiceNo}` : row.clientName;
}

type DbLike = Pick<typeof db, 'insert'>;

export async function logChange(
  input: {
    sheetId: string;
    invoiceId: string | null;
    actorId: string | null;
    summary: string;
    field?: string;
    before?: string | null;
    after?: string | null;
    affectsPage?: boolean;
  },
  tx: DbLike = db,
): Promise<void> {
  await tx.insert(receivableChanges).values({
    sheetId: input.sheetId,
    invoiceId: input.invoiceId,
    actorId: input.actorId,
    summary: input.summary,
    field: input.field ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    affectsPage: input.affectsPage ?? true,
  });
}
