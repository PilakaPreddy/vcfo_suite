import 'server-only';

import { askEmbeddingsConfig } from '@/lib/ask/config';
import { bedrockEmbeddingProvider } from './bedrock';
import type { EmbeddingProvider, QueryVector } from './types';

/**
 * Vectors for search. Provider `none` returns null and search runs on full text alone, which is the
 * default and the fallback whenever Bedrock cannot be reached.
 *
 * There is no vector index: search filters by access and compares directly, which suits a small
 * corpus on a small database. Add HNSW when `ask_chunks` or `ask_index_items` passes about 50,000
 * rows, and expect to size up from db.t4g.micro then. The threshold is an estimate, to be tested.
 */

let override: EmbeddingProvider | null | undefined;

/** Tests inject a fake provider; `undefined` restores env resolution. */
export function setEmbeddingProviderForTests(provider: EmbeddingProvider | null | undefined): void {
  override = provider;
}

let cached: { key: string; provider: EmbeddingProvider } | null = null;

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (override !== undefined) return override;
  const { provider, region, model } = askEmbeddingsConfig();
  if (provider === 'none' || !region) return null;
  const key = `${region}|${model}`;
  if (cached?.key !== key) cached = { key, provider: bedrockEmbeddingProvider(region, model) };
  return cached.provider;
}

/** The question's vector, or null: a failed embedding call must never fail the question. */
export async function embedQuery(text: string): Promise<QueryVector | null> {
  const provider = getEmbeddingProvider();
  if (!provider) return null;
  try {
    const [values] = await provider.embed([text]);
    return values ? { values, model: provider.model } : null;
  } catch (error) {
    console.warn('[ask-vcfo] embedding failed; searching on full text', error);
    return null;
  }
}
