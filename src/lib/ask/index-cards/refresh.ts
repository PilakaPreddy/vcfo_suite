import 'server-only';

import {
  systemDeleteIndexItem,
  systemPruneIndexItems,
  systemReadCardSources,
  systemUpsertIndexItems,
} from '@/db/repositories/ask-index';
import { backfillEmbeddings } from '@/lib/ask/embeddings/backfill';
import { buildCard, CARD_KINDS, type CardKind } from './build';

/** Brings one card in line with its source row, removing it when the row is gone. */
export async function refreshIndexCard(kind: CardKind, id: string): Promise<void> {
  const [source] = await systemReadCardSources(kind, id);
  if (source) await systemUpsertIndexItems([buildCard(source)]);
  else await systemDeleteIndexItem(kind, id);
  await backfillEmbeddings().catch((error) => console.warn('[ask-vcfo] card embedding failed; the backfill will retry', error));
}

/** Rebuilds every card. Unchanged text keeps its vector, so a run with nothing new spends nothing. */
export async function rebuildIndexCards(): Promise<Record<CardKind, number>> {
  const counts = {} as Record<CardKind, number>;
  for (const kind of CARD_KINDS) {
    const cards = (await systemReadCardSources(kind)).map(buildCard);
    for (let i = 0; i < cards.length; i += 200) await systemUpsertIndexItems(cards.slice(i, i + 200));
    await systemPruneIndexItems(kind, cards.map((c) => c.sourceId));
    counts[kind] = cards.length;
  }
  return counts;
}
