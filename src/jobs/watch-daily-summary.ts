import { inngest } from '@/jobs/client';
import { skipWhenPaused, PAUSED, withRunNow } from '@/jobs/dev-controls';
import { askFlags } from '@/lib/ask/config';
import { sendDailySummary } from '@/lib/watch/publish';

/**
 * Every evening: one bell row per person for the Normal and Staff-only updates published that day,
 * so routine items do not fill the bell. `notified_at` stops a repeat.
 */
export const watchDailySummary = inngest.createFunction(
  { id: 'watch-daily-summary', retries: 1 },
  withRunNow('watch-daily-summary', 'TZ=Asia/Kolkata 0 18 * * *'),
  async ({ step }) => {
    if (!askFlags().watch) return { skipped: 'watch_disabled' };
    if (await skipWhenPaused(step)) return PAUSED;
    return step.run('send-summary', () => sendDailySummary());
  },
);
