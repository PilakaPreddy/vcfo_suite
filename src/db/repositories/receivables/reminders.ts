import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivableInvoices, receivablePartners, receivableReminders, receivableSheets } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { ReminderRules } from '@/lib/receivables/model';
import { reminderQueue } from '@/lib/receivables/reminder-rule';
import { UUID, invalid, notFound, scopedSheet, toInvoice } from './shared';

/**
 * Reminders (Phase 5): one row per invoice per IST day, queued from the sheet's rules, sent by
 * the hourly job at the sheet's send hour. The unique (invoice, day) key means queueing twice
 * adds nothing and a reminder can never go twice.
 */

export type ReminderRow = typeof receivableReminders.$inferSelect;

/** Queues today's reminders of one sheet. Only invoices with a client partner get one; nothing while reminders are off. */
async function queueSheet(sheetId: string, rules: ReminderRules, today: string): Promise<number> {
  if (!rules.enabled) return 0;
  const rows = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.sheetId, sheetId), eq(receivableInvoices.status, 'open'), isNull(receivableInvoices.deletedAt)));
  const due = reminderQueue(rows.map(toInvoice), today, rules).filter((x) => x.invoice.partnerId);
  if (!due.length) return 0;
  const inserted = await db
    .insert(receivableReminders)
    .values(due.map(({ invoice, hit }) => ({ sheetId, invoiceId: invoice.id, partnerId: invoice.partnerId, forDate: today, kind: hit.kind, daysLeft: hit.daysLeft })))
    .onConflictDoNothing()
    .returning({ id: receivableReminders.id });
  return inserted.length;
}

const queueCols = {
  reminder: receivableReminders,
  clientName: receivableInvoices.clientName,
  invoiceNo: receivableInvoices.invoiceNo,
  amountInr: receivableInvoices.amountInr,
  dueDate: receivableInvoices.dueDate,
  invoiceStatus: receivableInvoices.status,
  partnerName: receivablePartners.name,
  partnerEmail: receivablePartners.email,
  partnerSlug: receivablePartners.slug,
};

/**
 * The Reminders tab: queues today's reminders for this sheet first (so the manager sees the queue
 * whenever the tab opens), then lists them, and the last 14 days of history.
 */
export async function getReminderDesk(ctx: AuthContext, sheetId: string, today: string, historyFrom: string) {
  const sheet = await scopedSheet(ctx, sheetId);
  await queueSheet(sheet.id, sheet.reminderRules, today);
  const [queue, history] = await Promise.all([
    db
      .select(queueCols)
      .from(receivableReminders)
      .innerJoin(receivableInvoices, eq(receivableInvoices.id, receivableReminders.invoiceId))
      .leftJoin(receivablePartners, eq(receivablePartners.id, receivableReminders.partnerId))
      .where(and(eq(receivableReminders.sheetId, sheet.id), eq(receivableReminders.forDate, today)))
      .orderBy(asc(receivableReminders.daysLeft)),
    db
      .select(queueCols)
      .from(receivableReminders)
      .innerJoin(receivableInvoices, eq(receivableInvoices.id, receivableReminders.invoiceId))
      .leftJoin(receivablePartners, eq(receivablePartners.id, receivableReminders.partnerId))
      .where(and(eq(receivableReminders.sheetId, sheet.id), gte(receivableReminders.forDate, historyFrom), ne(receivableReminders.forDate, today), ne(receivableReminders.status, 'queued')))
      .orderBy(desc(receivableReminders.forDate), asc(receivableReminders.daysLeft))
      .limit(200),
  ]);
  return { sheet, queue, history };
}

async function scopedReminder(ctx: AuthContext, reminderId: string): Promise<ReminderRow> {
  if (!UUID.test(reminderId ?? '')) throw notFound();
  const [r] = await db.select().from(receivableReminders).where(eq(receivableReminders.id, reminderId)).limit(1);
  if (!r) throw notFound();
  await scopedSheet(ctx, r.sheetId);
  return r;
}

/** Skip (or un-skip) a queued reminder before it sends. */
export async function setReminderSkipped(ctx: AuthContext, reminderId: string, skipped: boolean): Promise<ReminderRow> {
  const r = await scopedReminder(ctx, reminderId);
  if (r.status !== 'queued' && r.status !== 'skipped') throw invalid('already_sent');
  const [row] = await db.update(receivableReminders).set({ status: skipped ? 'skipped' : 'queued' }).where(eq(receivableReminders.id, r.id)).returning();
  return row;
}

/** Today's wording for one reminder; null fields go back to the default text. */
export async function editReminder(ctx: AuthContext, reminderId: string, input: { subject: string | null; body: string | null }): Promise<ReminderRow> {
  const r = await scopedReminder(ctx, reminderId);
  if (r.status !== 'queued' && r.status !== 'skipped') throw invalid('already_sent');
  const subject = input.subject?.trim().slice(0, 200) || null;
  const body = input.body?.trim().slice(0, 5000) || null;
  const [row] = await db.update(receivableReminders).set({ subjectOverride: subject, bodyOverride: body }).where(eq(receivableReminders.id, r.id)).returning();
  return row;
}

/**
 * SYSTEM (no AuthContext): the hourly Inngest job. Queues today's reminders for every sheet whose
 * send hour is at most an hour away (or past), so the manager sees the queue an hour before it
 * goes. `sheetId` limits it to one sheet. Re-running adds nothing.
 */
export async function systemQueueReminders(today: string, opts: { hourIst?: number; sheetId?: string } = {}): Promise<number> {
  const sheets = await db
    .select({ id: receivableSheets.id, rules: receivableSheets.reminderRules })
    .from(receivableSheets)
    .where(opts.sheetId ? eq(receivableSheets.id, opts.sheetId) : undefined);
  let queued = 0;
  for (const sheet of sheets) {
    if (opts.hourIst !== undefined && opts.hourIst < sheet.rules.sendHourIst - 1) continue;
    queued += await queueSheet(sheet.id, sheet.rules, today);
  }
  return queued;
}

/**
 * SYSTEM (no AuthContext): the send step's work list. Each queued reminder of `today` whose invoice
 * is still open, with the partner, the invoice, the sheet's link and rules, and its manager (whose
 * Outlook it sends from).
 */
export async function systemDueReminders(today: string, opts: { sheetId?: string } = {}) {
  return db
    .select({
      reminder: receivableReminders,
      invoice: receivableInvoices,
      partnerName: receivablePartners.name,
      partnerEmail: receivablePartners.email,
      partnerSlug: receivablePartners.slug,
      sheetId: receivableSheets.id,
      publicKey: receivableSheets.publicKey,
      requireKey: receivableSheets.requireKey,
      rules: receivableSheets.reminderRules,
      managerUserId: receivableSheets.managerUserId,
      managerName: profiles.name,
      managerEmail: profiles.email,
    })
    .from(receivableReminders)
    .innerJoin(receivableInvoices, eq(receivableInvoices.id, receivableReminders.invoiceId))
    .innerJoin(receivableSheets, eq(receivableSheets.id, receivableReminders.sheetId))
    .leftJoin(receivablePartners, eq(receivablePartners.id, receivableReminders.partnerId))
    .leftJoin(profiles, eq(profiles.id, receivableSheets.managerUserId))
    .where(
      and(
        eq(receivableReminders.forDate, today),
        eq(receivableReminders.status, 'queued'),
        eq(receivableInvoices.status, 'open'),
        isNull(receivableInvoices.deletedAt),
        opts.sheetId ? eq(receivableReminders.sheetId, opts.sheetId) : undefined,
      ),
    );
}

export type DueReminder = Awaited<ReturnType<typeof systemDueReminders>>[number];

/** SYSTEM (no AuthContext): the send job records each outcome. */
export async function systemRecordReminder(ids: string[], outcome: { status: 'sent' | 'failed'; channel: 'outlook' | 'email' | null; toEmail: string | null; error?: string | null }): Promise<void> {
  if (!ids.length) return;
  await db
    .update(receivableReminders)
    .set({ status: outcome.status, channel: outcome.channel, toEmail: outcome.toEmail, error: outcome.error ?? null, sentAt: outcome.status === 'sent' ? new Date() : null })
    .where(inArray(receivableReminders.id, ids));
}
