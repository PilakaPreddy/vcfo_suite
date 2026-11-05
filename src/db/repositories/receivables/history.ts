import 'server-only';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivableChanges, receivableInvoiceNotes, receivableReminders, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { ChangeDto, InvoiceHistoryDto, InvoiceHistoryItem, PendingChangesDto } from '@/lib/receivables/history-wire';
import { scopedInvoice, scopedSheet } from './shared';

/**
 * RECEIVABLES — the change trail (Phase 10): what the next Update publishes, and one invoice's
 * history (its changes, the reminders sent for it and its notes).
 *
 * >>> ACCESS CONTROL <<<
 *   Only the sheet's own manager and the firm-wide admins read these, through `scopedSheet` and
 *   `scopedInvoice`; another manager reads the sheet or invoice as not found, and interns,
 *   clients, developers and partners are refused before the first query. Every query below is
 *   also filtered by the sheet id that the scope check returned.
 */

const PENDING_LIMIT = 300;
const HISTORY_LIMIT = 200;

const changeCols = {
  id: receivableChanges.id,
  invoiceId: receivableChanges.invoiceId,
  summary: receivableChanges.summary,
  field: receivableChanges.field,
  before: receivableChanges.before,
  after: receivableChanges.after,
  affectsPage: receivableChanges.affectsPage,
  createdAt: receivableChanges.createdAt,
  actorName: profiles.name,
};

type ChangeRow = { id: string; invoiceId: string | null; summary: string; field: string | null; before: string | null; after: string | null; affectsPage: boolean; createdAt: Date; actorName: string | null };

function toChange(r: ChangeRow): ChangeDto {
  return {
    id: r.id,
    invoiceId: r.invoiceId,
    summary: r.summary,
    field: r.field,
    before: r.before,
    after: r.after,
    actorName: r.actorName ?? null,
    createdAt: r.createdAt.toISOString(),
    affectsPage: r.affectsPage,
  };
}

async function lastPublishedAt(sheetId: string): Promise<Date | null> {
  const [last] = await db
    .select({ publishedAt: receivableVersions.publishedAt })
    .from(receivableVersions)
    .where(eq(receivableVersions.sheetId, sheetId))
    .orderBy(desc(receivableVersions.seq))
    .limit(1);
  return last?.publishedAt ?? null;
}

/**
 * The changes the next Update publishes, newest first: every change since the last Update that
 * the client page shows (the same rows the unpublished count and the default Update note use).
 */
export async function listPendingChanges(ctx: AuthContext, sheetId: string): Promise<PendingChangesDto> {
  const sheet = await scopedSheet(ctx, sheetId);
  const since = await lastPublishedAt(sheet.id);
  const where = since
    ? and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.affectsPage, true), gt(receivableChanges.createdAt, since))
    : and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.affectsPage, true));
  const rows = await db
    .select(changeCols)
    .from(receivableChanges)
    .leftJoin(profiles, eq(profiles.id, receivableChanges.actorId))
    .where(where)
    .orderBy(desc(receivableChanges.createdAt))
    .limit(PENDING_LIMIT);
  return { since: since ? since.toISOString() : null, changes: (rows ?? []).map(toChange) };
}

const REMINDER_KINDS = new Set(['before', 'due', 'overdue']);
const REMINDER_STATUS = new Set(['queued', 'skipped', 'sent', 'failed']);

/**
 * One invoice's history, newest first: its change trail (each change marked published or still
 * in the draft), the reminders queued or sent for it and its notes.
 */
export async function invoiceHistory(ctx: AuthContext, invoiceId: string): Promise<InvoiceHistoryDto> {
  const { invoice, sheet } = await scopedInvoice(ctx, invoiceId);
  const [changes, reminders, notes, since] = await Promise.all([
    db
      .select(changeCols)
      .from(receivableChanges)
      .leftJoin(profiles, eq(profiles.id, receivableChanges.actorId))
      .where(and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.invoiceId, invoice.id)))
      .orderBy(desc(receivableChanges.createdAt))
      .limit(HISTORY_LIMIT),
    db
      .select()
      .from(receivableReminders)
      .where(and(eq(receivableReminders.sheetId, sheet.id), eq(receivableReminders.invoiceId, invoice.id)))
      .orderBy(desc(receivableReminders.forDate))
      .limit(HISTORY_LIMIT),
    db
      .select()
      .from(receivableInvoiceNotes)
      .where(and(eq(receivableInvoiceNotes.sheetId, sheet.id), eq(receivableInvoiceNotes.invoiceId, invoice.id)))
      .orderBy(desc(receivableInvoiceNotes.createdAt))
      .limit(HISTORY_LIMIT),
    lastPublishedAt(sheet.id),
  ]);
  const items: InvoiceHistoryItem[] = [
    ...(changes ?? []).map((c): InvoiceHistoryItem => ({
      kind: 'change',
      id: c.id,
      at: c.createdAt.toISOString(),
      title: c.summary,
      before: c.before,
      after: c.after,
      field: c.field,
      actorName: c.actorName ?? null,
      affectsPage: c.affectsPage,
      published: !c.affectsPage || (since !== null && c.createdAt <= since),
    })),
    ...(reminders ?? []).map((r): InvoiceHistoryItem => ({
      kind: 'reminder',
      id: r.id,
      // A sent reminder is placed at its send time; a queued, skipped or failed one at its creation.
      at: (r.sentAt ?? r.createdAt).toISOString(),
      forDate: String(r.forDate),
      reminderKind: (REMINDER_KINDS.has(r.kind) ? r.kind : 'overdue') as 'before' | 'due' | 'overdue',
      status: (REMINDER_STATUS.has(r.status) ? r.status : 'queued') as 'queued' | 'skipped' | 'sent' | 'failed',
      channel: r.channel === 'outlook' || r.channel === 'email' ? r.channel : null,
      toEmail: r.toEmail,
      error: r.error,
    })),
    ...(notes ?? []).map((n): InvoiceHistoryItem => ({ kind: 'note', id: n.id, at: n.createdAt.toISOString(), text: n.text, authorName: n.authorName, fromSbc: n.fromSbc })),
  ];
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { items };
}
