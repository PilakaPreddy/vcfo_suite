import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { askAttachments } from '@/db/schema-ask';
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
  input: { kind: 'file' | 'paste'; fileName: string; contentType: string | null; sizeBytes: number; s3Key: string; conversationId?: string | null },
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
