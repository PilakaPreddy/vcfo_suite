import { inngest } from '@/jobs/client';
import { readStep, summariseStep, verifyStep } from '@/lib/watch/process';
import { WATCH_PROCESS_EVENT } from '@/lib/watch/types';

/**
 * Reads, summarises and checks one update. The concurrency key gives one run at a time per host, the
 * rule for government sites; each step is retried on its own, so a retry never pays twice.
 */
export const watchProcess = inngest.createFunction(
  { id: 'watch-process', retries: 2, concurrency: { limit: 1, key: 'event.data.host' } },
  { event: WATCH_PROCESS_EVENT },
  async ({ event, step }) => {
    const updateId = String((event.data as { updateId?: unknown })?.updateId ?? '');
    if (!updateId) return { skipped: 'invalid_payload' };
    if ((await step.run('read', () => readStep(updateId))) === 'stop') return { updateId, status: 'stopped' };
    const summary = await step.run('summarise', () => summariseStep(updateId));
    if (!summary) return { updateId, status: 'stopped' };
    const status = await step.run('verify', () => verifyStep(updateId, summary as Parameters<typeof verifyStep>[1]));
    return { updateId, status };
  },
);
