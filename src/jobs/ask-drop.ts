import { inngest } from './client';
import { ASK_DROP_EVENT, dropAssembleStep, dropFinishStep, dropReadStep, dropUnpackStep, failAskDrop } from '@/lib/ask/drop/run';

/**
 * Ask VCFO drop: the files, folders and ZIPs a lead dropped into the chat, read and sorted into review
 * cards in the background while the person may close the panel. Each stage is its own step, and each
 * file its own read step, so a retry repeats only what failed and never pays for a file twice. One
 * drop runs at a time per person. The job prepares cards only; it never runs an action.
 */
export const askDrop = inngest.createFunction(
  {
    id: 'ask-drop',
    retries: 1,
    concurrency: { limit: 1, key: 'event.data.profileId' },
    onFailure: async ({ event, error }) => {
      const runId = String((event.data.event.data as { runId?: unknown })?.runId ?? '');
      if (runId) await failAskDrop(runId, error);
    },
  },
  { event: ASK_DROP_EVENT },
  async ({ event, step }) => {
    const runId = String((event.data as { runId?: unknown })?.runId ?? '');
    if (!runId) return { skipped: 'invalid_payload' };
    const toRead = await step.run('unpack', () => dropUnpackStep(runId));
    if (toRead === null) return { runId, skipped: 'not_runnable' };
    for (const attachmentId of toRead) await step.run(`read-${attachmentId}`, () => dropReadStep(runId, attachmentId));
    await step.run('assemble', () => dropAssembleStep(runId));
    const finished = await step.run('finish', () => dropFinishStep(runId));
    return { runId, status: finished?.status ?? 'skipped' };
  },
);
