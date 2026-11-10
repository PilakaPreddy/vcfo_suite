import { inngest } from './client';
import { systemListDueExpiryAlerts, systemMarkExpiryAlertEmailed, systemSeedExpiryItems, type DueExpiryAlert } from '@/db/repositories/expiry-items';
import { runExpiryAlert, type ExpiryEmailPlan } from '@/lib/expiries/alerts';
import { sendEmail } from '@/lib/email/send-email';
import { todayIso } from '@/lib/client-portal/compliances';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Scheduled, daily 07:40 India time: the expiry tracker (IDEAS-PLAN wave 2, section B).
 *
 *  1. Seed: backfill DSC, DIR-3 KYC and registration expiries from every engagement's checklist,
 *     credentials "reg" rows and current directors (idempotent; hand-set dates are kept).
 *  2. Plan: every item whose next stage (T-60, T-30, T-7, or expired) is due today.
 *  3. Alert, one step per item and stage: a renewal task for the lead, a draft client request for
 *     the renewal documents, and bell rows for the lead (and the manager at T-7 and on expiry).
 *  4. Email, one step per recipient: the system of record. Nothing goes to a client; the draft
 *     request waits for a person to send it.
 * Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const expiryAlerts = inngest.createFunction(
  { id: 'expiry-alerts' },
  withRunNow('expiry-alerts', 'TZ=Asia/Kolkata 40 7 * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIso();
    const seeded = await step.run('seed', () => systemSeedExpiryItems(today));
    const due = (await step.run('plan', () => systemListDueExpiryAlerts(today))) as DueExpiryAlert[];

    let alerts = 0;
    let emails = 0;
    for (const d of due) {
      const plans = (await step.run(`alert-${d.itemId}-${d.stage}`, () => runExpiryAlert(d.itemId, d.stage, today))) as ExpiryEmailPlan[];
      if (plans.length > 0) alerts += 1;
      for (const p of plans) {
        const ok = await step.run(`email-${p.alertId}-${p.profileId}`, async () => {
          const res = await sendEmail({ to: p.to, subject: p.subject, html: p.html, text: p.text, purpose: 'expiry.alert' });
          if (res.ok || res.skipped) await systemMarkExpiryAlertEmailed(p.alertId);
          return res.ok || Boolean(res.skipped);
        });
        if (ok) emails += 1;
      }
    }
    return { seeded, due: due.length, alerts, emails };
  },
);
