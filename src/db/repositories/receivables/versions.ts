import 'server-only';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableChanges, receivableInvoices, receivablePartners, receivableSheets, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isPublicKeyShape } from '@/lib/receivables/links';
import type { SnapshotRow } from '@/lib/receivables/model';
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
    .select({ seq: receivableVersions.seq, publishedAt: receivableVersions.publishedAt })
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
  return db.transaction(async (tx) => {
    const [version] = await tx
      .insert(receivableVersions)
      .values({ sheetId: sheet.id, seq, note: text, snapshot, publishedBy: ctx.userId, publishedByName: ctx.name })
      .returning();
    await tx.update(receivableSheets).set({ publishedVersionId: version.id, updatedAt: new Date() }).where(eq(receivableSheets.id, sheet.id));
    return { id: version.id, seq: version.seq, note: version.note, publishedAt: version.publishedAt, publishedByName: version.publishedByName };
  });
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

export type PublicSheet = {
  clientOrgName: string;
  publishedAt: Date;
  publishedByName: string;
  rows: SnapshotRow[];
  partners: Array<{ slug: string; name: string }>;
};

/**
 * SYSTEM (no AuthContext): the public client page has no session. It is found by the secret key
 * in the link; without a key, only a sheet whose manager turned the key off (`require_key` false)
 * is served, and only when exactly one such sheet exists. Returns only the latest published
 * snapshot, never the draft, and no ids of people or settings.
 */
export async function systemPublicSheet(input: { key?: string | null }): Promise<PublicSheet | null> {
  let sheet: { id: string; clientOrgName: string; publishedVersionId: string | null } | undefined;
  const cols = { id: receivableSheets.id, clientOrgName: receivableSheets.clientOrgName, publishedVersionId: receivableSheets.publishedVersionId };
  if (input.key) {
    if (!isPublicKeyShape(input.key)) return null;
    [sheet] = await db.select(cols).from(receivableSheets).where(eq(receivableSheets.publicKey, input.key)).limit(1);
  } else {
    const open = await db.select(cols).from(receivableSheets).where(eq(receivableSheets.requireKey, false)).limit(2);
    if (open.length !== 1) return null;
    sheet = open[0];
  }
  if (!sheet?.publishedVersionId) return null;
  const [v] = await db
    .select({ snapshot: receivableVersions.snapshot, publishedAt: receivableVersions.publishedAt, publishedByName: receivableVersions.publishedByName })
    .from(receivableVersions)
    .where(and(eq(receivableVersions.id, sheet.publishedVersionId), eq(receivableVersions.sheetId, sheet.id)))
    .limit(1);
  if (!v) return null;
  const partners = new Map<string, string>();
  for (const r of v.snapshot) if (r.partnerSlug && r.partnerName) partners.set(r.partnerSlug, r.partnerName);
  // The public page never needs internal ids.
  const rows = v.snapshot.map((r) => ({ ...r, partnerId: null }));
  return {
    clientOrgName: sheet.clientOrgName,
    publishedAt: v.publishedAt,
    publishedByName: v.publishedByName,
    rows,
    partners: [...partners].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
