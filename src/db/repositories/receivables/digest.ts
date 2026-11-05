import 'server-only';
import { and, count, desc, eq, gt, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivableChanges, receivableInvoices, receivablePartners, receivableReminders, receivableSheets, receivableVersions } from '@/db/schema';
import { addDaysIso } from '@/lib/receivables/dates';
import type { DigestFailedReminder, DigestInput, DigestInvoice } from '@/lib/receivables/digest';
import { toInvoice } from './shared';

/**
 * RECEIVABLES MONDAY DIGEST sources (Phase 10). SYSTEM (no AuthContext): called only by the
 * Inngest job src/jobs/receivables-digest.ts, never from a route. It reads each sheet that has a
 * manager with an email and the digest switched on (`reminderRules.digestEnabled`, missing reads
 * as on), and hands back what the pure builder in src/lib/receivables/digest.ts needs. Each
 * sheet's data goes only to that sheet's own manager.
 */

export type DigestSheetSource = Omit<DigestInput, 'url'> & { sheetId: string; managerEmail: string };

/** The sheets that get a digest this Monday. */
export async function systemDigestSheetIds(): Promise<Array<{ sheetId: string; managerEmail: string }>> {
  const rows = await db
    .select({ sheetId: receivableSheets.id, rules: receivableSheets.reminderRules, email: profiles.email, status: profiles.status })
    .from(receivableSheets)
    .innerJoin(profiles, eq(profiles.id, receivableSheets.managerUserId))
    .where(isNotNull(receivableSheets.managerUserId));
  return rows.filter((r) => r.rules?.digestEnabled !== false && r.email && r.status !== 'inactive').map((r) => ({ sheetId: r.sheetId, managerEmail: r.email }));
}

/** One sheet's digest data as of `today` (India time). Null when the sheet or its manager is gone. */
export async function systemDigestSource(sheetId: string, today: string): Promise<DigestSheetSource | null> {
  const [sheet] = await db
    .select({ sheet: receivableSheets, managerEmail: profiles.email, managerName: profiles.name })
    .from(receivableSheets)
    .innerJoin(profiles, eq(profiles.id, receivableSheets.managerUserId))
    .where(eq(receivableSheets.id, sheetId))
    .limit(1);
  if (!sheet) return null;
  const weekAgo = addDaysIso(today, -7);
  const [invoices, partners, failed, versions] = await Promise.all([
    db
      .select()
      .from(receivableInvoices)
      .where(and(eq(receivableInvoices.sheetId, sheetId), isNull(receivableInvoices.deletedAt))),
    db.select({ id: receivablePartners.id, name: receivablePartners.name }).from(receivablePartners).where(eq(receivablePartners.sheetId, sheetId)),
    db
      .select({ invoiceId: receivableReminders.invoiceId, forDate: receivableReminders.forDate, toEmail: receivableReminders.toEmail, error: receivableReminders.error })
      .from(receivableReminders)
      .where(and(eq(receivableReminders.sheetId, sheetId), eq(receivableReminders.status, 'failed'), gte(receivableReminders.forDate, weekAgo), lte(receivableReminders.forDate, today)))
      .orderBy(desc(receivableReminders.forDate))
      .limit(20),
    db
      .select({ publishedAt: receivableVersions.publishedAt })
      .from(receivableVersions)
      .where(eq(receivableVersions.sheetId, sheetId))
      .orderBy(desc(receivableVersions.seq))
      .limit(1),
  ]);
  const last = versions[0]?.publishedAt ?? null;
  const since = last
    ? and(eq(receivableChanges.sheetId, sheetId), eq(receivableChanges.affectsPage, true), gt(receivableChanges.createdAt, last))
    : and(eq(receivableChanges.sheetId, sheetId), eq(receivableChanges.affectsPage, true));
  const [{ n }] = await db.select({ n: count() }).from(receivableChanges).where(since);

  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const byId = new Map(invoices.map((r) => [r.id, r]));
  const digestInvoices: DigestInvoice[] = invoices.map((row) => {
    const inv = toInvoice(row);
    return {
      id: inv.id,
      clientName: inv.clientName,
      invoiceNo: inv.invoiceNo,
      dueDate: inv.dueDate,
      amountInr: inv.amountInr,
      status: inv.status,
      paidOn: inv.paidOn,
      paidAmount: inv.paidAmount,
      promisedOn: row.promisedOn ? String(row.promisedOn) : null,
      partnerName: inv.partnerId ? (partnerName.get(inv.partnerId) ?? null) : null,
      disputed: inv.disputed,
    };
  });
  // Failed reminders of invoices deleted since are still reported, by what the reminder knew.
  const failedReminders: DigestFailedReminder[] = failed.map((f) => {
    const inv = byId.get(f.invoiceId);
    return { clientName: inv?.clientName ?? 'Deleted invoice', invoiceNo: inv?.invoiceNo ?? null, forDate: String(f.forDate), toEmail: f.toEmail, error: f.error };
  });
  return {
    sheetId,
    managerEmail: sheet.managerEmail,
    managerName: sheet.managerName || 'there',
    sheetName: sheet.sheet.name,
    clientOrgName: sheet.sheet.clientOrgName,
    today,
    invoices: digestInvoices,
    failedReminders,
    unpublishedChanges: Number(n) || 0,
    lastPublishedAt: last ? last.toISOString() : null,
  };
}
