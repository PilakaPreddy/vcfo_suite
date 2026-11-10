import { inngest } from './client';
import { systemListMyDaySubscribers, type MyDaySubscriber } from '@/db/repositories/my-day';
import { sendEmail } from '@/lib/email/send-email';
import { gatherMyDay } from '@/lib/my-day/gather';
import { buildMyDayEmail } from '@/lib/my-day/email';
import { quietHoursEnd } from '@/lib/notify/prefs-gate';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Scheduled, weekdays 08:40 India time: the "My day" plan email (IDEAS-PLAN section F).
 *
 *  1. List the active staff members who turned "My day email" on in Settings (off by default).
 *  2. For each one, gather and rank the plan under that person's own AuthContext, so the email
 *     shows only what their Today card shows.
 *  3. Send one internal email through `sendEmail` (rule 6), after the person's quiet hours end.
 *     An empty plan sends nothing. No client is ever emailed by this job.
 *
 * Returns early while "Pause all jobs" is on. The integrator registers it in
 * app/api/inngest/route.ts and src/lib/dev/jobs-registry.ts.
 */
export const myDayEmail = inngest.createFunction(
  { id: 'my-day-email' },
  withRunNow('my-day-email', 'TZ=Asia/Kolkata 40 8 * * 1-5'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const people = (await step.run('subscribers', () => systemListMyDaySubscribers())) as MyDaySubscriber[];
    let sent = 0;
    let empty = 0;
    for (const person of people) {
      const wake = quietHoursEnd({ ...person.quiet, whatsapp: {} }, new Date());
      if (wake) await step.sleepUntil(`quiet-${person.ctx.userId}`, wake);
      const result = await step.run(`email-${person.ctx.userId}`, async () => {
        const items = await gatherMyDay(person.ctx);
        if (items.length === 0) return 'empty' as const;
        const copy = buildMyDayEmail({ recipientName: person.ctx.name, role: person.ctx.role, items });
        const res = await sendEmail({ to: person.ctx.email, subject: copy.subject, html: copy.html, text: copy.text, purpose: 'staff.my_day' });
        return res.ok || res.skipped ? ('sent' as const) : ('failed' as const);
      });
      if (result === 'sent') sent += 1;
      if (result === 'empty') empty += 1;
    }
    return { subscribers: people.length, emails: sent, empty };
  },
);
