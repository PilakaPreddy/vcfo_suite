import { inngest } from './client';
import { todayIst } from '@/lib/receivables/dates';
import { runBankFeed } from '@/lib/receivables/bank-feed/run';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Receivables bank feed, hourly at :30 India time (docs/specs/receivables/PLAN.md, Phase 6).
 * Fetches the client account's credits of the last seven days, stores the new ones and runs the
 * matcher: sure matches are marked received in the draft, the rest wait in the From bank tab.
 * Skips until RECEIVABLES_BANK_FEED and RECEIVABLES_BANK_SHEET_ID are set (HSBC onboarding).
 * Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const receivablesBankFeed = inngest.createFunction(
  { id: 'receivables-bank-feed' },
  withRunNow('receivables-bank-feed', 'TZ=Asia/Kolkata 30 * * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    return step.run('fetch', () => runBankFeed(todayIst()));
  },
);
