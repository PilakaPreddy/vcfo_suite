import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableEmailSends, receivablePartners, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { EmailRecipient, Partner, SnapshotRow } from '@/lib/receivables/model';
import { conflict, ReceivablesError, scopedSheet, type SheetRow } from './shared';
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
  lastSend: { to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[]; subject: string; sentAt: Date; status: SummarySendStatus; error: string | null } | null;
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
    lastSend: last ? { to: last.toList, cc: last.ccList, bcc: last.bccList, subject: last.subject, sentAt: last.sentAt, status: last.status as SummarySendStatus, error: last.error } : null,
  };
}

/**
 * Logs one summary send. The route writes it as `sending` before it answers, then the work after
 * the response marks it `sent` or `failed` with `finishSummarySend`, so a failure stays visible.
 */
export async function recordSummarySend(
  ctx: AuthContext,
  sheetId: string,
  input: { versionId: string; to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[]; subject: string; channel: 'outlook' | 'email'; status?: SummarySendStatus },
): Promise<{ id: string }> {
  const sheet = await scopedSheet(ctx, sheetId);
  const [row] = await db
    .insert(receivableEmailSends)
    .values({
      sheetId: sheet.id,
      versionId: input.versionId,
      toList: input.to,
      ccList: input.cc,
      bccList: input.bcc,
      subject: input.subject.slice(0, 200),
      channel: input.channel,
      status: input.status ?? 'sent',
      sentBy: ctx.userId,
    })
    .returning({ id: receivableEmailSends.id });
  return { id: row.id };
}

export type SummarySendStatus = 'sending' | 'sent' | 'failed';

export async function finishSummarySend(ctx: AuthContext, sheetId: string, sendId: string, outcome: { status: 'sent' | 'failed'; error?: string }): Promise<void> {
  const sheet = await scopedSheet(ctx, sheetId);
  await db
    .update(receivableEmailSends)
    .set({ status: outcome.status, error: outcome.error?.slice(0, 200) ?? null })
    .where(and(eq(receivableEmailSends.id, sendId), eq(receivableEmailSends.sheetId, sheet.id)));
}

/** The state of one send, which the Send email dialog polls after the 202. */
export async function getSummarySendStatus(ctx: AuthContext, sheetId: string, sendId: string): Promise<{ status: SummarySendStatus; error: string | null }> {
  const sheet = await scopedSheet(ctx, sheetId);
  const [row] = await db
    .select({ status: receivableEmailSends.status, error: receivableEmailSends.error })
    .from(receivableEmailSends)
    .where(and(eq(receivableEmailSends.id, sendId), eq(receivableEmailSends.sheetId, sheet.id)))
    .limit(1);
  if (!row) throw new ReceivablesError(404, 'not_found');
  return { status: row.status as SummarySendStatus, error: row.error };
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
