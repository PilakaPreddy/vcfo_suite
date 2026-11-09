import 'server-only';

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { askAttachments, askRuns } from '@/db/schema-ask';
import { AskForbiddenError, assertAskRole } from '@/lib/ask/access';

/**
 * Files and long pastes given to the chat. A row belongs to the person who gave it, whatever their
 * role: `profile_id = ctx.userId` is in every query. Clients have no attachment control yet.
 */
export type AskAttachmentRow = typeof askAttachments.$inferSelect;

function assertStaff(ctx: AuthContext): void {
  assertAskRole(ctx);
  if (ctx.role === 'client') throw new AskForbiddenError('Clients cannot attach files to the chat yet.');
}

export async function createAskAttachment(
  ctx: AuthContext,
  input: {
    kind: 'file' | 'paste';
    fileName: string;
    contentType: string | null;
    sizeBytes: number;
    s3Key: string;
    conversationId?: string | null;
    runId?: string | null;
    relativePath?: string | null;
    parentId?: string | null;
  },
): Promise<AskAttachmentRow> {
  assertStaff(ctx);
  const [row] = await db
    .insert(askAttachments)
    .values({ ...input, profileId: ctx.userId })
    .returning();
  return row!;
}

export async function getOwnAskAttachments(ctx: AuthContext, ids: readonly string[]): Promise<AskAttachmentRow[]> {
  assertStaff(ctx);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(askAttachments)
    .where(and(inArray(askAttachments.id, [...ids]), eq(askAttachments.profileId, ctx.userId)));
}

export async function updateOwnAskAttachment(
  ctx: AuthContext,
  id: string,
  patch: Partial<Pick<AskAttachmentRow, 'status' | 'docType' | 'sensitive' | 'error' | 'engagementId' | 'runId' | 'conversationId'>>,
): Promise<void> {
  assertStaff(ctx);
  await db
    .update(askAttachments)
    .set(patch)
    .where(and(eq(askAttachments.id, id), eq(askAttachments.profileId, ctx.userId)));
}

/** The files of one run, oldest first. Only the run owner's own rows come back. */
export async function listAskRunAttachments(ctx: AuthContext, runId: string): Promise<AskAttachmentRow[]> {
  assertStaff(ctx);
  return db
    .select()
    .from(askAttachments)
    .where(and(eq(askAttachments.runId, runId), eq(askAttachments.profileId, ctx.userId)))
    .orderBy(asc(askAttachments.createdAt));
}

export type DropAttachmentRefusal = 'not_found' | 'started' | 'too_many_files' | 'too_large';

/**
 * Adds one uploaded file to a drop, inside the drop's limits. The run row is locked for the length of
 * the insert, so four uploads arriving together cannot each see room for the last file. The drop must
 * be the caller's own, still queued and not yet started. Files unpacked from a ZIP later count too,
 * because they are rows of the same run; the ZIP itself counts as one file until it is unpacked.
 */
export async function createDropAttachment(
  ctx: AuthContext,
  input: { runId: string; fileName: string; contentType: string | null; sizeBytes: number; s3Key: string; relativePath: string | null },
  limits: { maxFiles: number; maxBytes: number },
): Promise<{ ok: true; row: AskAttachmentRow } | { ok: false; reason: DropAttachmentRefusal }> {
  assertStaff(ctx);
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({ id: askRuns.id, status: askRuns.status, startedAt: askRuns.startedAt, conversationId: askRuns.conversationId })
      .from(askRuns)
      .where(and(eq(askRuns.id, input.runId), eq(askRuns.profileId, ctx.userId), eq(askRuns.workflow, 'drop')))
      .for('update')
      .limit(1);
    if (!run) return { ok: false as const, reason: 'not_found' as const };
    if (run.status !== 'queued' || run.startedAt) return { ok: false as const, reason: 'started' as const };
    const [totals] = await tx
      .select({ files: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${askAttachments.sizeBytes}), 0)::bigint` })
      .from(askAttachments)
      .where(and(eq(askAttachments.runId, run.id), eq(askAttachments.profileId, ctx.userId), isNull(askAttachments.parentId)));
    const files = Number(totals?.files ?? 0);
    const bytes = Number(totals?.bytes ?? 0);
    if (files + 1 > limits.maxFiles) return { ok: false as const, reason: 'too_many_files' as const };
    if (bytes + input.sizeBytes > limits.maxBytes) return { ok: false as const, reason: 'too_large' as const };
    const [row] = await tx
      .insert(askAttachments)
      .values({
        profileId: ctx.userId,
        conversationId: run.conversationId,
        runId: run.id,
        kind: 'file',
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        s3Key: input.s3Key,
        relativePath: input.relativePath,
      })
      .returning();
    return { ok: true as const, row: row! };
  });
}
