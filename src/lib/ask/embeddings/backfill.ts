import 'server-only';

import {
  systemListUnembeddedChunks,
  systemSetChunkEmbeddings,
} from '@/db/repositories/ask-documents';
import { systemListUnembeddedCards, systemSetCardEmbeddings } from '@/db/repositories/ask-index';
import { getEmbeddingProvider } from './index';

const BATCH = 50;

type Row = { id: string; text: string };

async function fill(
  list: (model: string, limit: number) => Promise<Row[]>,
  save: (model: string, rows: Array<{ id: string; embedding: number[] }>) => Promise<void>,
): Promise<number> {
  const provider = getEmbeddingProvider();
  if (!provider) return 0;
  let done = 0;
  for (;;) {
    const rows = await list(provider.model, BATCH);
    if (rows.length === 0) return done;
    const vectors = await provider.embed(rows.map((r) => r.text));
    await save(provider.model, rows.map((r, i) => ({ id: r.id, embedding: vectors[i]! })));
    done += rows.length;
  }
}

/**
 * Embeds every chunk and card with no vector, or a vector from another model. It runs after an
 * ingestion or a card refresh and from the backfill script, and does nothing on provider `none`.
 */
export async function backfillEmbeddings(): Promise<{ chunks: number; cards: number }> {
  return {
    chunks: await fill(systemListUnembeddedChunks, systemSetChunkEmbeddings),
    cards: await fill(systemListUnembeddedCards, systemSetCardEmbeddings),
  };
}
