import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableEmailSends, receivablePartners, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { EmailRecipient, Partner, SnapshotRow } from '@/lib/receivables/model';
import { conflict, scopedSheet, type SheetRow } from './shared';
import { toPartner } from './sheets';

/**
 * The summary email (Phase 4): it is always built from the published version, so the email and
 * the client page say the same thing. Each send is logged with its recipients.
 */

export type SummarySource = {
  sheet: SheetRow;
  version: { id: string; seq: number; publishedAt: Date; snapshot: SnapshotRow[] };
  partners: Partner[];
  /** The recipients of the previous summary, the default for the next one. */
  lastSend: { to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[]; subject: string; sentAt: Date } | null;
};

export async function getSummarySource(ctx: AuthContext, sheetId: string): Promise<SummarySource> {
  const sheet = await scopedSheet(ctx, sheetId);
  if (!sheet.publishedVersionId) throw conflict('not_published');
  const [[v], partners, [last]] = await Promise.all([
    db
      .select({ id: receivableVersions.id, seq: receivableVersions.seq, publishedAt: receivableVersions.publishedAt, snapshot: receivableVersions.snapshot })
      .from(receivableVersions)
      .where(and(eq(receivableVersions.id, sheet.publishedVersionId), eq(receivableVersions.sheetId, sheet.id)))
      .limit(1),
    db.select().from(receivablePartners).where(eq(receivablePartners.sheetId, sheet.id)),
    db.select().from(receivableEmailSends).where(eq(receivableEmailSends.sheetId, sheet.id)).orderBy(desc(receivableEmailSends.sentAt)).limit(1),
  ]);
  if (!v) throw conflict('not_published');
  return {
    sheet,
    version: v,
    partners: partners.map(toPartner),
    lastSend: last ? { to: last.toList, cc: last.ccList, bcc: last.bccList, subject: last.subject, sentAt: last.sentAt } : null,
  };
}

export async function recordSummarySend(
  ctx: AuthContext,
  sheetId: string,
  input: { versionId: string; to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[]; subject: string; channel: 'outlook' | 'email' },
): Promise<void> {
  const sheet = await scopedSheet(ctx, sheetId);
  await db.insert(receivableEmailSends).values({
    sheetId: sheet.id,
    versionId: input.versionId,
    toList: input.to,
    ccList: input.cc,
    bccList: input.bcc,
    subject: input.subject.slice(0, 200),
    channel: input.channel,
    sentBy: ctx.userId,
  });
}

async function listSummarySends(ctx: AuthContext, sheetId: string) {
  const sheet = await scopedSheet(ctx, sheetId);
  return db
    .select({ id: receivableEmailSends.id, subject: receivableEmailSends.subject, toList: receivableEmailSends.toList, ccList: receivableEmailSends.ccList, bccList: receivableEmailSends.bccList, sentAt: receivableEmailSends.sentAt })
    .from(receivableEmailSends)
    .where(eq(receivableEmailSends.sheetId, sheet.id))
    .orderBy(desc(receivableEmailSends.sentAt))
    .limit(20);
}
