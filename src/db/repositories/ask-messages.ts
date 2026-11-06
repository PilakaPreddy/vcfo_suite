import 'server-only';

import { and, count, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { askConversations, askMessages } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope, AnswerOrigin } from '@/data/ask/schema';
import { getAskConversation, type AskMessageRow } from '@/db/repositories/ask-conversations';
import type { AskPath } from '@/lib/ask/paths';

/**
 * ASK VCFO MESSAGES — owner-only, always through the parent conversation's
 * ownership check. Usage columns feed cost tracking and the rate limit.
 */

export interface AppendAskMessageInput {
  sender: 'user' | 'assistant';
  text: string;
  answer?: AnswerEnvelope | null;
  origin?: AnswerOrigin | null;
  guard?: unknown;
  retrievedChunkIds?: string[];
  /** Names + arguments only — callers must not pass tool results. */
  toolCalls?: Array<{ name: string; args: unknown }>;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  /** The route this answer took; null when the message stopped before a route was chosen. */
  path?: AskPath | null;
  latencyMs?: number | null;
}

export async function appendAskMessage(
  ctx: AuthContext,
  conversationId: string,
  input: AppendAskMessageInput,
): Promise<AskMessageRow | null> {
  const conversation = await getAskConversation(ctx, conversationId);
  if (!conversation) return null;

  const now = new Date();
  const [row] = await db
    .insert(askMessages)
    .values({
      conversationId: conversation.id,
      sender: input.sender,
      text: input.text,
      answer: input.answer ?? null,
      origin: input.origin ?? null,
      guard: input.guard ?? null,
      retrievedChunkIds: input.retrievedChunkIds ?? [],
      toolCalls: input.toolCalls ?? [],
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      cacheReadTokens: input.cacheReadTokens ?? null,
      cacheWriteTokens: input.cacheWriteTokens ?? null,
      path: input.path ?? null,
      latencyMs: input.latencyMs ?? null,
      createdAt: now,
    })
    .returning();
  await db
    .update(askConversations)
    .set({ lastMessageAt: now })
    .where(eq(askConversations.id, conversation.id));
  return row ?? null;
}

/** Owner-only single message (library save from a generated answer). */
export async function getAskMessage(
  ctx: AuthContext,
  messageId: string,
): Promise<(AskMessageRow & { engagementId: string | null }) | null> {
  const [row] = await db
    .select({ message: askMessages, engagementId: askConversations.engagementId })
    .from(askMessages)
    .innerJoin(askConversations, eq(askConversations.id, askMessages.conversationId))
    .where(and(eq(askMessages.id, messageId), eq(askConversations.profileId, ctx.userId)))
    .limit(1);
  return row ? { ...row.message, engagementId: row.engagementId } : null;
}

/**
 * Model-backed answers the caller received since `since`. Deterministic and
 * reviewed-topic answers never record a model, so they count as zero.
 */
export async function countModelAnswersSince(ctx: AuthContext, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(askMessages)
    .innerJoin(askConversations, eq(askConversations.id, askMessages.conversationId))
    .where(
      and(
        eq(askConversations.profileId, ctx.userId),
        eq(askMessages.sender, 'assistant'),
        isNotNull(askMessages.model),
        inArray(askMessages.origin, ['generated', 'refusal']),
        gte(askMessages.createdAt, since),
      ),
    );
  return Number(row?.n ?? 0);
}
