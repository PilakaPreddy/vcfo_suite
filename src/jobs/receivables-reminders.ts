import { inngest } from './client';
import { systemQueueReminders } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { sendDueReminders } from '@/lib/receivables/send-reminders';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Receivables reminders, hourly in India time (docs/specs/receivables/PLAN.md, Phase 5):
 *  1. Queue: for each sheet whose send hour is at most an hour away, today's reminders from its
 *     rules (5 and 3 days before due, the due date, every day after; weekends skipped). The
 *     manager sees and edits the queue in the Reminders tab.
 *  2. Send: from the sheet's send hour on, each queued reminder whose invoice is still open goes
 *     to its client partner from the manager's Outlook (firm email as the fallback).
 * Running every hour means a missed hour still sends later the same day; the unique (invoice,
 * day) key and the recorded status keep every reminder to one send. Returns early while
 * "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const receivablesReminders = inngest.createFunction(
  { id: 'receivables-reminders' },
  withRunNow('receivables-reminders', 'TZ=Asia/Kolkata 0 * * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const now = new Date();
    const today = todayIst(now);
    const hourIst = Number(new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 13));
    const queued = await step.run('queue', () => systemQueueReminders(today, { hourIst }));
    const sent = await step.run('send', () => sendDueReminders(today, { hourIst }));
    return { today, hourIst, queued, ...sent };
  },
);
