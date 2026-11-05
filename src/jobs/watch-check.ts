import { inngest } from '@/jobs/client';
import { skipWhenPaused, PAUSED, withRunNow } from '@/jobs/dev-controls';
import { systemDueWatchSources, systemEnsureWatchSources, systemGetWatchSource } from '@/db/repositories/reg-sources';
import { systemStuckRegUpdateIds } from '@/db/repositories/reg-updates';
import { askFlags } from '@/lib/ask/config';
import { checkWatchSource } from '@/lib/watch/check';
import { hostOf, queueWatchProcess } from '@/lib/watch/process';
import { WATCH_SOURCES } from '@/lib/watch/sources-seed';

/**
 * Hourly: reads each official source that is due (feeds every 3 hours, pages twice a day) and sends
 * new items to `watch-process`. One step per source, in turn, so one slow site holds nothing else
 * up after a retry. It also picks up updates a lost event or a spent budget left behind. It returns
 * at once while WATCH_ENABLED is off.
 */
const STUCK_AFTER_MS = 2 * 3_600_000;

export const watchCheck = inngest.createFunction(
  { id: 'watch-check', retries: 1, concurrency: { limit: 1 } },
  withRunNow('watch-check', 'TZ=Asia/Kolkata 7 * * * *'),
  async ({ step }) => {
    if (!askFlags().watch) return { skipped: 'watch_disabled' };
    if (await skipWhenPaused(step)) return PAUSED;
    const due = await step.run('due-sources', async () => {
      await systemEnsureWatchSources(WATCH_SOURCES);
      return (await systemDueWatchSources(new Date())).map((row) => row.id);
    });
    let queued = 0;
    for (const id of due) {
      const count = await step.run(`check-${id}`, async () => {
        const source = await systemGetWatchSource(id);
        if (!source) return 0;
        const { queuedIds } = await checkWatchSource(source);
        await queueWatchProcess(queuedIds.map((updateId) => ({ id: updateId, host: hostOf(source.feedUrl) })));
        return queuedIds.length;
      });
      queued += count;
    }
    const stuck = await step.run('stuck-updates', async () => {
      const ids = await systemStuckRegUpdateIds(new Date(Date.now() - STUCK_AFTER_MS));
      await queueWatchProcess(ids.map((updateId) => ({ id: updateId, host: 'retry' })));
      return ids.length;
    });
    return { sources: due.length, queued, stuck };
  },
);
