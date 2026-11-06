import 'server-only';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { askConversations, askMessages } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import type { AskShell } from '@/data/ask/schema';
import { AskForbiddenError, assertAskRole, shellAllowedForRole } from '@/lib/ask/access';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';

/**
 * ASK VCFO CONVERSATIONS.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * A conversation belongs to exactly one profile. Every read and write checks
 * `profile_id = ctx.userId`; there is no admin override, so even a firm admin
 * cannot read a client's Ask VCFO history. Managers and Project Leads are
 * rejected before any query runs.
 *
 * A client-shell conversation is pinned to one engagement the caller can
 * access (client: their own; super admin: the engagement being previewed).
 */

export type AskConversationRow = typeof askConversations.$inferSelect;
export type AskMessageRow = typeof askMessages.$inferSelect;

export interface CreateAskConversationInput {
  shell: AskShell;
  /** Required for the client shell. */
  engagementId?: string | null;
}

export async function createAskConversation(
  ctx: AuthContext,
  input: CreateAskConversationInput,
): Promise<AskConversationRow | null> {
  assertAskRole(ctx);
  if (!shellAllowedForRole(ctx.role, input.shell)) throw new AskForbiddenError('Shell not allowed');

  let engagementDbId: string | null = null;
  if (input.shell === 'client') {
    if (!input.engagementId) throw new Error('A client conversation needs an engagement');
    const access = await assertEngagementAccess(ctx, input.engagementId);
    if (!access.ok) return null;
    engagementDbId = access.dbId;
  }

  const [row] = await db
    .insert(askConversations)
    .values({
      profileId: ctx.userId,
      role: ctx.role,
      shell: input.shell,
      engagementId: engagementDbId,
    })
    .returning();
  return row ?? null;
}

/** Owner-only read. Returns null for someone else's conversation. */
export async function getAskConversation(
  ctx: AuthContext,
  conversationId: string,
): Promise<AskConversationRow | null> {
  assertAskRole(ctx);
  const [row] = await db
    .select()
    .from(askConversations)
    .where(and(eq(askConversations.id, conversationId), eq(askConversations.profileId, ctx.userId)))
    .limit(1);
  return row ?? null;
}

/** Conversation + messages oldest first (resume, U3). */
export async function getAskConversationWithMessages(
  ctx: AuthContext,
  conversationId: string,
): Promise<{ conversation: AskConversationRow; messages: AskMessageRow[] } | null> {
  const conversation = await getAskConversation(ctx, conversationId);
  if (!conversation) return null;
  const messages = await db
    .select()
    .from(askMessages)
    .where(eq(askMessages.conversationId, conversation.id))
    .orderBy(asc(askMessages.createdAt));
  return { conversation, messages };
}

/** Page size of the full page's chat list (owner item F4). */
export const ASK_CONVERSATION_PAGE_SIZE = 40;
const TITLE_MAX = 80;

export interface AskConversationSummary {
  id: string;
  /** The first question, with spaces collapsed and cut to 80 characters. */
  title: string;
  updatedAt: Date;
  messageCount: number;
  shell: string;
  engagementId: string | null;
}

export interface ListOwnAskConversationsInput {
  /** Only chats of this shell (the provider's current shell). */
  shell?: AskShell;
  /** Only chats of this engagement (app or DB id); null means chats with no engagement. */
  engagementId?: string | null;
  /** Zero-based page of 40. */
  page?: number;
}

function summaryTitle(text: string | null): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Chat';
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
}

/**
 * The caller's own chats, newest first, 40 per page (owner item F4). Keyed on
 * `profile_id = ctx.userId` only: no role widens it, so a firm admin never sees
 * a client's chats. Chats with no message yet are left out.
 */
export async function listOwnAskConversations(
  ctx: AuthContext,
  input: ListOwnAskConversationsInput = {},
): Promise<{ conversations: AskConversationSummary[]; hasMore: boolean }> {
  assertAskRole(ctx);
  const page = Math.max(0, Math.floor(input.page ?? 0));
  // Plain table names: Drizzle prints a column in a one-table select with no table name, so the inner
  // query would compare its own columns and every title would come back empty.
  const firstQuestion = sql<string | null>`(select m.text from ask_messages m where m.conversation_id = ask_conversations.id and m.sender = 'user' order by m.created_at asc limit 1)`;
  const messageCount = sql<number>`(select count(*)::int from ask_messages m where m.conversation_id = ask_conversations.id)`;

  const filters = [eq(askConversations.profileId, ctx.userId), sql`${messageCount} > 0`];
  if (input.shell) filters.push(eq(askConversations.shell, input.shell));
  if (input.engagementId !== undefined) {
    filters.push(
      input.engagementId === null
        ? isNull(askConversations.engagementId)
        : eq(askConversations.engagementId, engagementDbId(input.engagementId)),
    );
  }

  const rows = await db
    .select({
      id: askConversations.id,
      shell: askConversations.shell,
      engagementId: askConversations.engagementId,
      lastMessageAt: askConversations.lastMessageAt,
      firstQuestion,
      messageCount,
    })
    .from(askConversations)
    .where(and(...filters))
    .orderBy(desc(askConversations.lastMessageAt), desc(askConversations.id))
    .limit(ASK_CONVERSATION_PAGE_SIZE + 1)
    .offset(page * ASK_CONVERSATION_PAGE_SIZE);

  return {
    conversations: rows.slice(0, ASK_CONVERSATION_PAGE_SIZE).map((r) => ({
      id: r.id,
      title: summaryTitle(r.firstQuestion),
      updatedAt: r.lastMessageAt,
      messageCount: Number(r.messageCount ?? 0),
      shell: r.shell,
      engagementId: r.engagementId,
    })),
    hasMore: rows.length > ASK_CONVERSATION_PAGE_SIZE,
  };
}

/** Owner-only delete. Messages go with it (cascade). False when not the caller's. */
export async function deleteOwnAskConversation(ctx: AuthContext, conversationId: string): Promise<boolean> {
  assertAskRole(ctx);
  const rows = await db
    .delete(askConversations)
    .where(and(eq(askConversations.id, conversationId), eq(askConversations.profileId, ctx.userId)))
    .returning({ id: askConversations.id });
  return rows.length > 0;
}
