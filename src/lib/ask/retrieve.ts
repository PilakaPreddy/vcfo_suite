import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { searchAskChunks } from '@/db/repositories/ask-documents';
import { matchTopics, topicSource } from '@/lib/ask/topic-match';
import type { ApplicabilityContext } from '@/lib/ask/topics';

/** One piece of evidence handed to the model, citable by `id`. */
export interface RetrievedSource {
  id: string;
  kind: 'chunk' | 'topic';
  label: string;
  text: string;
  url?: string | null;
}

/**
 * Evidence for a generated answer, at most `topK` in all: matching topics plus full-text search
 * over ingested sources (audience-filtered in the repository). Topics take the first half of the
 * slots, and any slot the other kind cannot fill.
 */
export async function retrieveSources(
  authCtx: AuthContext,
  input: { query: string; persona: 'client' | 'staff'; topK: number; applicability: ApplicabilityContext | null },
): Promise<RetrievedSource[]> {
  let chunks: RetrievedSource[] = [];
  try {
    const hits = await searchAskChunks(authCtx, { query: input.query, persona: input.persona, limit: input.topK });
    chunks = hits.map((h) => ({
      id: h.id,
      kind: 'chunk',
      label: h.documentTitle,
      text: [h.contextPrefix, h.text].filter(Boolean).join('\n'),
      url: h.sourceUrl,
    }));
  } catch (error) {
    console.warn('[ask-vcfo] retrieval failed; answering from topics only', error);
  }
  const topics = matchTopics(input.query, input.applicability, input.persona, input.topK).map(topicSource);
  const topicSlots = Math.max(input.topK - chunks.length, Math.ceil(input.topK / 2));
  const picked = topics.slice(0, topicSlots);
  return [...picked, ...chunks.slice(0, input.topK - picked.length)];
}
