import { inngest } from './client';
import { withRunNow } from './dev-controls';
import { backfillEmbeddings } from '@/lib/ask/embeddings/backfill';
import { CARD_KINDS, type CardKind } from '@/lib/ask/index-cards/build';
import { ASK_INDEX_REFRESH_EVENT } from '@/lib/ask/index-cards/queue';
import { rebuildIndexCards, refreshIndexCard } from '@/lib/ask/index-cards/refresh';

/** One record card, after the write that changed its source. The refresh is safe to repeat. */
export const askIndexRefresh = inngest.createFunction(
  { id: 'ask-index-refresh', retries: 2, concurrency: { limit: 4 } },
  { event: ASK_INDEX_REFRESH_EVENT },
  async ({ event, step }) => {
    const { kind, id } = event.data as { kind?: CardKind; id?: string };
    if (!kind || !id || !CARD_KINDS.includes(kind)) return { skipped: 'invalid_payload' };
    await step.run('refresh', () => refreshIndexCard(kind, id));
    return { kind, id };
  },
);

/**
 * Nightly at 02:00 IST. It catches what no event reached: a write from a script or a job, or an event
 * lost in an outage. Unchanged cards stop at their hash, and any vector missing after a Bedrock
 * failure is filled here.
 */
export const askIndexSweep = inngest.createFunction(
  { id: 'ask-index-sweep', retries: 1 },
  withRunNow('ask-index-sweep', 'TZ=Asia/Kolkata 0 2 * * *'),
  async ({ step }) => {
    const cards = await step.run('rebuild', () => rebuildIndexCards());
    const embedded = await step.run('embed', () => backfillEmbeddings());
    return { cards, embedded };
  },
);
