import { inngest } from './client';
import { planNoticeEscalations, runNoticeEscalation, type DueNoticeEscalation, type NoticeEmailPlan } from '@/lib/notices/escalations';
import { sendEmail } from '@/lib/email/send-email';
import { todayIso } from '@/lib/client-portal/compliances';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Scheduled, daily 08:10 India time: the notice desk's escalations (IDEAS-PLAN wave 2, section C).
 *
 *  1. Plan: every open case whose reply is due within seven days, within two days, or overdue,
 *     and that has not had that escalation for its current due date.
 *  2. Escalate, one step per case: claim the stage on the case (so a retry never repeats it), then
 *     bell rows for the owner and the manager, and for the partner once the reply is overdue.
 *  3. Email, one step per recipient: the system of record. Nothing goes to a client.
 * Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const noticeEscalations = inngest.createFunction(
  { id: 'notice-escalations' },
  withRunNow('notice-escalations', 'TZ=Asia/Kolkata 10 8 * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIso();
    const due = (await step.run('plan', () => planNoticeEscalations(today))) as DueNoticeEscalation[];

    let escalated = 0;
    let emails = 0;
    for (const d of due) {
      const plans = (await step.run(`escalate-${d.caseId}-${d.escalation}`, () => runNoticeEscalation(d, today))) as NoticeEmailPlan[];
      if (plans.length > 0) escalated += 1;
      for (const p of plans) {
        const ok = await step.run(`email-${p.caseId}-${d.escalation}-${p.profileId}`, async () => {
          const res = await sendEmail({ to: p.to, subject: p.subject, html: p.html, text: p.text, purpose: 'notice.escalation' });
          return res.ok || Boolean(res.skipped);
        });
        if (ok) emails += 1;
      }
    }
    return { due: due.length, escalated, emails };
  },
);
