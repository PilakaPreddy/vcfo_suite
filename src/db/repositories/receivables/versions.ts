import 'server-only';
import { and, asc, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivableChanges, receivableInvoices, receivablePartners, receivableSheets, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { SnapshotRow } from '@/lib/receivables/model';
import { diffPublishForPartners, publishAlertEmail } from '@/lib/receivables/publish-alerts';
import { partnerHomeUrl } from '@/lib/receivables/partner-emails';
import { siteUrl } from '@/lib/site-url';
import { UUID, notFound, scopedSheet, toInvoice } from './shared';

export type VersionMeta = { id: string; seq: number; note: string; publishedAt: Date; publishedByName: string };

/** The live invoices with their partners, frozen as a version snapshot. */
async function snapshotOf(sheetId: string): Promise<SnapshotRow[]> {
  const rows = await db
    .select({ invoice: receivableInvoices, partnerSlug: receivablePartners.slug, partnerName: receivablePartners.name })
    .from(receivableInvoices)
    .leftJoin(receivablePartners, eq(receivablePartners.id, receivableInvoices.partnerId))
    .where(and(eq(receivableInvoices.sheetId, sheetId), isNull(receivableInvoices.deletedAt)))
    .orderBy(asc(receivableInvoices.invoiceMonth), asc(receivableInvoices.dueDate));
  return rows.map((r) => ({ ...toInvoice(r.invoice), partnerSlug: r.partnerSlug ?? null, partnerName: r.partnerName ?? null }));
}

/**
 * Update: the draft becomes the version the public page shows. The note defaults to the change
 * summaries since the previous version.
 */
export async function publishSheet(ctx: AuthContext, sheetId: string, note?: string): Promise<VersionMeta> {
  const sheet = await scopedSheet(ctx, sheetId);
  const [last] = await db
    .select({ seq: receivableVersions.seq, publishedAt: receivableVersions.publishedAt, snapshot: receivableVersions.snapshot })
    .from(receivableVersions)
    .where(eq(receivableVersions.sheetId, sheet.id))
    .orderBy(desc(receivableVersions.seq))
    .limit(1);
  let text = (note ?? '').trim().slice(0, 500);
  if (!text) {
    const changes = await db
      .select({ summary: receivableChanges.summary })
      .from(receivableChanges)
      .where(
        last
          ? and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.affectsPage, true), gt(receivableChanges.createdAt, last.publishedAt))
          : and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.affectsPage, true)),
      )
      .orderBy(asc(receivableChanges.createdAt));
    const unique = [...new Set(changes.map((c) => c.summary))];
    text = unique.length ? unique.slice(0, 3).join('; ') + (unique.length > 3 ? `; and ${unique.length - 3} more` : '') : 'Published with no changes';
  }
  const snapshot = await snapshotOf(sheet.id);
  const seq = (last?.seq ?? 0) + 1;
  const meta = await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(receivableVersions)
      .values({ sheetId: sheet.id, seq, note: text, snapshot, publishedBy: ctx.userId, publishedByName: ctx.name })
      .returning();
    await tx.update(receivableSheets).set({ publishedVersionId: version.id, updatedAt: new Date() }).where(eq(receivableSheets.id, sheet.id));
    return { id: version.id, seq: version.seq, note: version.note, publishedAt: version.publishedAt, publishedByName: version.publishedByName };
  });
  // Phase 8: the partner alerts go after the commit, fire-and-forget. A failure is logged and
  // never blocks or fails the publish.
  void sendPublishAlerts({ sheetId: sheet.id, clientOrgName: sheet.clientOrgName, previous: last?.snapshot ?? [], next: snapshot }).catch((e) =>
    console.error('[receivables] publish alerts failed', e instanceof Error ? e.message : e),
  );
  return meta;
}

/**
 * Emails each partner of the sheet whose invoices changed in this Update, when they have an
 * active, accepted login and `notify_on_publish` on. Called only by `publishSheet`, after the
 * sheet's manager was checked there.
 */
async function sendPublishAlerts(input: { sheetId: string; clientOrgName: string; previous: SnapshotRow[]; next: SnapshotRow[] }): Promise<void> {
  const changes = diffPublishForPartners(input.previous, input.next);
  if (!changes.size) return;
  const partners = await db
    .select({ id: receivablePartners.id, name: receivablePartners.name, email: profiles.email, status: profiles.status })
    .from(receivablePartners)
    .innerJoin(profiles, eq(profiles.id, receivablePartners.profileId))
    .where(
      and(
        eq(receivablePartners.sheetId, input.sheetId),
        eq(receivablePartners.active, true),
        eq(receivablePartners.notifyOnPublish, true),
        isNotNull(receivablePartners.acceptedAt),
      ),
    );
  const due = (partners ?? []).filter((p) => p.status === 'active' && changes.has(p.id));
  if (!due.length) return;
  const { sendEmail } = await import('@/lib/email/send-email');
  const url = partnerHomeUrl(siteUrl());
  for (const p of due) {
    const mail = publishAlertEmail({ partnerName: p.name, clientOrgName: input.clientOrgName, changes: changes.get(p.id) ?? [], url });
    try {
      const res = await sendEmail({ to: p.email, subject: mail.subject, html: mail.html, text: mail.text, purpose: 'receivables.publish_alert' });
      if (!res.ok && !res.skipped) console.error('[receivables] publish alert not sent', res.error);
    } catch (e) {
      console.error('[receivables] publish alert failed', e instanceof Error ? e.message : e);
    }
  }
}

export async function listVersions(ctx: AuthContext, sheetId: string): Promise<VersionMeta[]> {
  const sheet = await scopedSheet(ctx, sheetId);
  return db
    .select({ id: receivableVersions.id, seq: receivableVersions.seq, note: receivableVersions.note, publishedAt: receivableVersions.publishedAt, publishedByName: receivableVersions.publishedByName })
    .from(receivableVersions)
    .where(eq(receivableVersions.sheetId, sheet.id))
    .orderBy(desc(receivableVersions.seq));
}

export async function getVersion(ctx: AuthContext, versionId: string): Promise<VersionMeta & { snapshot: SnapshotRow[] }> {
  if (!UUID.test(versionId ?? '')) throw notFound();
  const [v] = await db.select().from(receivableVersions).where(eq(receivableVersions.id, versionId)).limit(1);
  if (!v) throw notFound();
  await scopedSheet(ctx, v.sheetId);
  return { id: v.id, seq: v.seq, note: v.note, publishedAt: v.publishedAt, publishedByName: v.publishedByName, snapshot: v.snapshot };
}
