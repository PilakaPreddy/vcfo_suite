import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { searchAskChunks } from '@/db/repositories/ask-documents';
import { searchIndexItems } from '@/db/repositories/ask-index';
import { embedQuery } from '@/lib/ask/embeddings';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { expandQuery } from '@/lib/ask/query-expand';
import { fuseRanked } from '@/lib/ask/rank-fusion';
import { matchTopics, topicSource } from '@/lib/ask/topic-match';
import type { ApplicabilityContext } from '@/lib/ask/topics';

/** One piece of evidence handed to the model, citable by `id`. */
export interface RetrievedSource {
  id: string;
  kind: 'chunk' | 'topic' | 'card';
  label: string;
  text: string;
  url?: string | null;
}

/**
 * Evidence for a generated answer, at most `topK` in all, merged by rank fusion. Each list is already
 * filtered by access in its repository before it is ranked. A search failure leaves the other lists
 * standing. Record cards join only for a question about the firm's own data, so an explanation of the
 * law is answered from the law.
 *
 * Documents are searched on the words as asked and again on the widened words, so that a common word
 * the widening adds ("due", "file") cannot bury the source that holds the rare word the person typed.
 * The vector is taken from the question as asked.
 */
export async function retrieveSources(
  authCtx: AuthContext,
  input: {
    query: string;
    persona: 'client' | 'staff';
    topK: number;
    applicability: ApplicabilityContext | null;
    includeCards?: boolean;
    engagementId?: string | null;
  },
): Promise<RetrievedSource[]> {
  const { persona, topK } = input;
  const words = expandQuery(input.query);
  const queryVector = await embedQuery(input.query);
  const searched = <T,>(run: Promise<T[]>): Promise<T[]> =>
    run.catch((error) => {
      console.warn('[ask-vcfo] one retrieval search failed; answering from the others', error);
      return [];
    });
  const chunkSearch = (query: string) => searched(searchAskChunks(authCtx, { query, persona, limit: topK, queryVector }));
  const [cardHits, askedHits, widenedHits] = await Promise.all([
    input.includeCards
      ? searched(searchIndexItems(authCtx, { query: words, persona, limit: topK, engagementId: input.engagementId, queryVector }))
      : Promise.resolve([]),
    chunkSearch(input.query),
    words === input.query ? Promise.resolve([]) : chunkSearch(words),
  ]);
  const cards = cardHits.map<RetrievedSource>((h) => ({
    id: h.id,
    kind: 'card',
    label: h.companyName ? `${h.companyName}: ${h.title}` : h.title,
    text: persona === 'staff' && h.engagementId ? `${h.cardText}\nProject id: ${h.engagementId}` : h.cardText,
    url: h.href,
  }));
  const topics = matchTopics(input.query, input.applicability, persona, topK).map(topicSource);
  const topicLabels = new Set(topics.map((t) => t.label));
  const toSources = (hits: typeof askedHits) =>
    hits
      .filter((h) => !topicLabels.has(h.documentTitle))
      .map<RetrievedSource>((h) => ({
        id: h.id,
        kind: 'chunk',
        label: h.documentTitle,
        text: maskIdentityNumbers([h.contextPrefix, h.text].filter(Boolean).join('\n')),
        url: h.sourceUrl,
      }));
  return fuseRanked([cards, topics, toSources(askedHits), toSources(widenedHits)], topK);
}
