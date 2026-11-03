import { inngest } from './client';
import { systemUpsertFetchedRate } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { fetchReferenceRate } from '@/lib/receivables/fx-rate-source';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Receivables FX rates, at 14:30 IST on weekdays (docs/specs/receivables/PLAN.md, Phase 9).
 * FBIL publishes the USD/INR reference rate around 13:30 IST on Indian business days, so an
 * hour later the configured FBIL-compatible source (`FX_RATE_SOURCE_URL`) is asked first and the
 * Frankfurter API (`FX_FRANKFURTER_URL`) is the fallback. The rate is stored once per day and
 * source; a manager's manual override for the day stays in force over it. When neither source
 * answers, nothing is stored and the Reports tab keeps showing the latest earlier rate.
 * Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const RECEIVABLES_FX_CURRENCIES = ['USD'] as const;

export const receivablesFxRates = inngest.createFunction(
  { id: 'receivables-fx-rates' },
  withRunNow('receivables-fx-rates', 'TZ=Asia/Kolkata 30 14 * * 1-5'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIst();
    const stored: Array<{ currency: string; rateDate: string; rate: number; source: string }> = [];
    const missing: string[] = [];
    for (const currency of RECEIVABLES_FX_CURRENCIES) {
      const rate = await step.run(`fetch-${currency}`, () => fetchReferenceRate(currency, today));
      if (!rate) {
        missing.push(currency);
        continue;
      }
      await step.run(`store-${currency}`, () => systemUpsertFetchedRate(rate));
      stored.push(rate);
    }
    if (missing.length) console.warn('[receivables-fx-rates] no rate from any source for', missing.join(', '));
    return { today, stored, missing };
  },
);
