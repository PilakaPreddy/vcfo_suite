import { inngest } from './client';
import { systemFilingAlertsDue, systemMarkFilingAlerted, type FilingAlert } from '@/db/repositories/assist-filings';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { FILING_FORM_LABEL, istDate, type FilingDeadline } from '@/lib/mca-filing/filing-state';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

function dayWords(d: FilingDeadline): string {
  if (d.daysLeft < 0) return `${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} overdue`;
  if (d.daysLeft === 0) return 'due today';
  return `due in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}`;
}

/**
 * MCA filing deadlines, daily 08:40 India time: an in-app notification to the engagement's lead
 * (else its manager) when the signed upload or the fee payment is within 3 days, or up to a week
 * late. In-app only: no email, no WhatsApp and nothing to clients. One alert per filing, deadline
 * and day, however often the job retries. Returns early while "Pause all jobs" is on. Registered
 * in app/api/inngest/route.ts.
 */
export const assistFilingDeadlines = inngest.createFunction(
  { id: 'assist-filing-deadlines' },
  withRunNow('assist-filing-deadlines', 'TZ=Asia/Kolkata 40 8 * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = istDate(new Date());
    return step.run('alert', async () => {
      const due: FilingAlert[] = await systemFilingAlertsDue(today);
      let sent = 0;
      for (const alert of due) {
        await createNotificationsForUsers(
          alert.due.map((d) => ({
            userId: alert.recipientId,
            kind: 'compliance.reminder' as const,
            title: `${d.label}: ${alert.companyName}`,
            body: `${FILING_FORM_LABEL[alert.form]}: ${dayWords(d)}, by ${d.dueOn}. ${d.source}.`,
            engagementId: alert.engagementId,
            companyName: alert.companyName,
            href: alert.href,
          })),
        );
        await systemMarkFilingAlerted(alert.filingId, alert.alertedOn, alert.due.map((d) => d.key), today);
        sent += alert.due.length;
      }
      return { filings: due.length, alerts: sent };
    });
  },
);
