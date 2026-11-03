import 'server-only';
import { desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { failedEmails } from '@/db/schema-firm';
import type { AuthContext } from '@/auth/guards';
import type { FailedEmailRow } from '@/lib/dev/types';
import { maskEmail, scrubText } from '@/lib/dev/mask';
import { assertDeveloper } from './dev-scope';

/**
 * FAILED EMAILS — mail the provider refused, kept 30 days for "Retry" on the developer
 * console (`failed_emails`). Successful mail is never stored.
 *
 * Writers: `systemRecordFailedEmail` (from `src/lib/email/send-email.ts`, no person),
 * `systemPurgeFailedEmails` (the daily cleanup job). Readers and retry: developer or super
 * admin only. The list masks addresses and scrubs the subject; bodies never leave the server.
 */

const FAILED_EMAIL_KEEP_DAYS = 30;

export interface FailedEmailInput {
  to: string[];
  cc: string[];
  replyTo: string[];
  from: string | null;
  subject: string;
  templateKey: string | null;
  html: string;
  text: string;
  hadAttachments: boolean;
  error: string | null;
}

export async function systemRecordFailedEmail(input: FailedEmailInput): Promise<void> {
  await db.insert(failedEmails).values({
    toAddresses: input.to,
    ccAddresses: input.cc,
    replyTo: input.replyTo,
    fromAddress: input.from,
    subject: input.subject.slice(0, 500),
    templateKey: input.templateKey,
    html: input.html,
    textBody: input.text,
    hadAttachments: input.hadAttachments,
    error: input.error ? input.error.slice(0, 500) : null,
  });
}

export async function listFailedEmailsForDev(ctx: AuthContext): Promise<FailedEmailRow[]> {
  assertDeveloper(ctx);
  const rows = await db
    .select({
      id: failedEmails.id,
      to: failedEmails.toAddresses,
      subject: failedEmails.subject,
      templateKey: failedEmails.templateKey,
      error: failedEmails.error,
      attempts: failedEmails.attempts,
      hadAttachments: failedEmails.hadAttachments,
      createdAt: failedEmails.createdAt,
      lastAttemptAt: failedEmails.lastAttemptAt,
    })
    .from(failedEmails)
    .orderBy(desc(failedEmails.lastAttemptAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    to: (r.to ?? []).map((a) => maskEmail(a)).join(', '),
    subject: scrubText(r.subject),
    templateKey: r.templateKey,
    error: r.error ? scrubText(r.error) : null,
    attempts: r.attempts,
    canRetry: !r.hadAttachments,
    createdAt: r.createdAt.toISOString(),
    lastAttemptAt: r.lastAttemptAt.toISOString(),
  }));
}

/** The stored mail for a retry, server side only. Null when it is gone. */
export async function getFailedEmailForDev(ctx: AuthContext, id: string): Promise<(FailedEmailInput & { id: string; attempts: number }) | null> {
  assertDeveloper(ctx);
  const [r] = await db.select().from(failedEmails).where(eq(failedEmails.id, id)).limit(1);
  if (!r) return null;
  return {
    id: r.id,
    attempts: r.attempts,
    to: r.toAddresses ?? [],
    cc: r.ccAddresses ?? [],
    replyTo: r.replyTo ?? [],
    from: r.fromAddress,
    subject: r.subject,
    templateKey: r.templateKey,
    html: r.html,
    text: r.textBody,
    hadAttachments: r.hadAttachments,
    error: r.error,
  };
}

/** After a retry: a sent mail is deleted (never kept); a failed one counts the try. */
export async function settleFailedEmailForDev(ctx: AuthContext, id: string, outcome: { ok: boolean; error: string | null }): Promise<void> {
  assertDeveloper(ctx);
  if (outcome.ok) {
    await db.delete(failedEmails).where(eq(failedEmails.id, id));
    return;
  }
  await db
    .update(failedEmails)
    .set({ attempts: sql`${failedEmails.attempts} + 1`, lastAttemptAt: new Date(), error: outcome.error ? outcome.error.slice(0, 500) : null })
    .where(eq(failedEmails.id, id));
}

/** SYSTEM — the daily cleanup: delete rows older than 30 days. Returns how many went. */
export async function systemPurgeFailedEmails(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - FAILED_EMAIL_KEEP_DAYS * 86400000);
  const gone = await db.delete(failedEmails).where(lt(failedEmails.createdAt, before)).returning({ id: failedEmails.id });
  return gone.length;
}
