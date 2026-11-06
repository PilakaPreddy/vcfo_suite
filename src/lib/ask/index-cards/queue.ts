import { askConfig } from '@/lib/ask/config';
import type { CardKind } from './build';

export const ASK_INDEX_REFRESH_EVENT = 'ask/index.refresh';

/**
 * Queues a card refresh after a write. It never throws and never slows the write, and does nothing
 * while Ask VCFO is off. Without Inngest (local dev) the refresh runs in-process. Rows that scripts
 * or jobs write are picked up by the nightly sweep instead.
 */
export function queueIndexRefresh(kind: CardKind, id: string): void {
  if (!askConfig().enabled) return;
  void (async () => {
    try {
      const { inngest } = await import('@/jobs/client');
      await inngest.send({ name: ASK_INDEX_REFRESH_EVENT, data: { kind, id } });
    } catch {
      const { refreshIndexCard } = await import('./refresh');
      await refreshIndexCard(kind, id);
    }
  })().catch((error) => console.error('[ask-vcfo] card refresh failed', error));
}
