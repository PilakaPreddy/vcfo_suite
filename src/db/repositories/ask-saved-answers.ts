import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { askSavedAnswers } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';
import { assertAskRole } from '@/lib/ask/access';

/**
 * ASK VCFO SAVED ANSWERS: document answers reused on an exact match of normalised wording, audience,
 * language, depth and knowledge version. Never a similar-meaning match, and never personal or live
 * data; `src/lib/ask/saved-answer.ts` decides what may be saved. A client can only reach `client`
 * rows, whichever audience is asked for.
 */

export interface SavedAnswerKey {
  questionKey: string;
  audience: 'client' | 'staff';
  language: string;
  depth: string;
  knowledgeVersion: string;
}

const audienceFor = (ctx: AuthContext, asked: SavedAnswerKey['audience']) => (ctx.role === 'client' ? 'client' : asked);

export async function findSavedAnswer(ctx: AuthContext, key: SavedAnswerKey): Promise<AnswerEnvelope | null> {
  assertAskRole(ctx);
  const [row] = await db
    .update(askSavedAnswers)
    .set({ hits: sql`${askSavedAnswers.hits} + 1`, lastHitAt: new Date() })
    .where(
      and(
        eq(askSavedAnswers.questionKey, key.questionKey),
        eq(askSavedAnswers.audience, audienceFor(ctx, key.audience)),
        eq(askSavedAnswers.language, key.language),
        eq(askSavedAnswers.depth, key.depth),
        eq(askSavedAnswers.knowledgeVersion, key.knowledgeVersion),
      ),
    )
    .returning({ answer: askSavedAnswers.answer });
  return row?.answer ?? null;
}

/** Answers from an older knowledge version can never match again, so saving clears them out. */
export async function saveAnswer(ctx: AuthContext, key: SavedAnswerKey, answer: AnswerEnvelope, sourceMessageId: string | null): Promise<void> {
  assertAskRole(ctx);
  await db.delete(askSavedAnswers).where(ne(askSavedAnswers.knowledgeVersion, key.knowledgeVersion));
  await db
    .insert(askSavedAnswers)
    .values({ ...key, audience: audienceFor(ctx, key.audience), answer, sourceMessageId })
    .onConflictDoNothing();
}
