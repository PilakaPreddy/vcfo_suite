import { inngest } from './client';
import { computeAllHealth, openPartnerCheckIn, planSlaLadder, runSlaLadder, type HealthFall, type SlaDue, type StaffEmailPlan } from '@/lib/client-health/nightly';
import { sendEmail } from '@/lib/email/send-email';
import { todayIso } from '@/lib/client-portal/compliances';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Scheduled, nightly 02:10 India time: client health and the SLA ladder (IDEAS-PLAN wave 2,
 * section E; logic in src/lib/client-health/nightly.ts).
 *
 *  1. Score every live client and store the score, band and signals (`client_health_scores`).
 *  2. For each client whose band fell by two levels or more, open a partner check-in task with a
 *     bell, then email the partner.
 *  3. The SLA ladder: per client, claim each level now due (lead at 1x the SLA, manager at 2x,
 *     partner at 3x) in `sla_escalations`, write the bells, then send each email in its own step.
 * Email goes through `sendEmail`, the system of record; there is no WhatsApp and nothing reaches
 * a client. Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const clientHealthNightly = inngest.createFunction(
  { id: 'client-health-nightly' },
  withRunNow('client-health-nightly', 'TZ=Asia/Kolkata 10 2 * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIso();

    const scored = (await step.run('compute-health', () => computeAllHealth(today))) as { computed: number; falls: HealthFall[] };

    const send = async (p: StaffEmailPlan, purpose: string) =>
      step.run(`email-${p.key}-${p.profileId}`, async () => {
        const res = await sendEmail({ to: p.to, subject: p.subject, html: p.html, text: p.text, purpose });
        return res.ok || Boolean(res.skipped);
      });

    let checkIns = 0;
    let emails = 0;
    for (const fall of scored.falls) {
      const plans = (await step.run(`check-in-${fall.engagementId}`, () => openPartnerCheckIn(fall, today))) as StaffEmailPlan[];
      if (plans.length > 0) checkIns += 1;
      for (const p of plans) if (await send(p, 'client_health.check_in')) emails += 1;
    }

    const ladder = (await step.run('plan-sla', () => planSlaLadder(today))) as Array<{ engagementId: string; due: SlaDue[] }>;
    let escalated = 0;
    for (const group of ladder) {
      const plans = (await step.run(`sla-${group.engagementId}`, () => runSlaLadder(group.engagementId, group.due, today))) as StaffEmailPlan[];
      escalated += plans.length;
      for (const p of plans) if (await send(p, 'sla.escalation')) emails += 1;
    }

    return { computed: scored.computed, falls: scored.falls.length, checkIns, slaClients: ladder.length, escalated, emails };
  },
);
