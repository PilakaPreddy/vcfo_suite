import 'server-only';

import { systemMeetingPeople } from '@/db/repositories/board-meetings';
import {
  systemClaimExpiryAlert,
  systemEnsureRenewalRequestDraft,
  systemFinishExpiryAlert,
  systemSetExpiryAlertTask,
  systemStaffContext,
} from '@/db/repositories/expiry-items';
import { getFilings } from '@/db/repositories/filings';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { createTask } from '@/db/repositories/tasks';
import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { siteUrl } from '@/lib/site-url';
import { alertCopy, daysUntil, filingsAfterDscExpiry, itemTitle, type AlertStage } from './model';

/**
 * One expiry alert (IDEAS-PLAN wave 2, section B), run by src/jobs/expiry-alerts.ts for each item
 * and stage due today. Everything stays inside the firm:
 *  - a renewal task for the lead (createTask as the lead, once per item and stage);
 *  - a draft client request list for the renewal documents (never sent by the job; a person
 *    reviews and sends it);
 *  - a bell row for the lead, and for the manager too at T-7 and on expiry;
 *  - the email plan for the same people, which the job sends in its own steps.
 * A DSC that lapses before an upcoming unfiled filing (getFilings, read as the lead) says so.
 */

export interface ExpiryEmailPlan {
  alertId: string;
  profileId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** The staff page each role opens. Super admins have their own shell segment. */
export function expiriesHref(role: string): string {
  const seg = role === 'super_admin' ? 'super' : role === 'intern' ? 'intern' : role === 'manager' ? 'manager' : 'admin';
  return `/app/${seg}/compliances/expiries`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

export async function runExpiryAlert(itemId: string, stage: AlertStage, today: string): Promise<ExpiryEmailPlan[]> {
  const claimed = await systemClaimExpiryAlert(itemId, stage, today);
  if (!claimed) return [];
  const { item, engagement, alertId } = claimed;
  const people = await systemMeetingPeople(engagement);
  const lead = people.lead ?? null;
  const manager = people.manager && people.manager.id !== lead?.id ? people.manager : null;
  // The job acts as the lead (or the manager when there is no lead), inside that person's scope.
  const leadCtx = await systemStaffContext(lead?.id);
  const managerCtx = await systemStaffContext(people.manager?.id);
  const actor = leadCtx ?? managerCtx ?? (await systemStaffContext(people.admin?.id));

  const days = daysUntil(item.expiresOn, today);
  let blocked: Array<{ particular: string; dueDate: string }> = [];
  if (item.kind === 'dsc' && actor) {
    const filings = await getFilings(actor, { engagementId: item.engagementId });
    blocked = filingsAfterDscExpiry(item.expiresOn, today, filings.rows);
  }
  const copy = alertCopy({ item, companyName: item.companyName, stage, days, blockedFilings: blocked });

  if (actor && !claimed.taskId) {
    const task = await createTask(actor, {
      engagementId: item.engagementId,
      title: copy.taskTitle,
      assigneeId: lead?.id ?? actor.userId,
      dueAt: item.expiresOn,
      notes: copy.body,
    });
    await systemSetExpiryAlertTask(alertId, task.id);
  }
  await systemEnsureRenewalRequestDraft(item.id, {
    title: `Renewal documents: ${itemTitle(item)}`,
    dueOn: item.expiresOn,
    createdBy: actor?.userId ?? null,
  });

  const recipients = [lead, stage <= 7 ? manager : null].filter((p): p is { id: string; name: string; email: string } => Boolean(p));
  // Each person's role decides the shell their link opens.
  const roleOf = (id: string) => (id === leadCtx?.userId ? leadCtx.role : id === managerCtx?.userId ? managerCtx.role : 'admin');
  if (recipients.length > 0) {
    await createNotificationsForUsers(
      recipients.map((p) => ({
        userId: p.id,
        kind: 'compliance.reminder' as const,
        title: copy.title,
        body: copy.body,
        engagementId: item.engagementId,
        companyName: item.companyName,
        href: expiriesHref(roleOf(p.id)),
      })),
    );
  }
  await systemFinishExpiryAlert(item.id, stage);

  return recipients
    .filter((p) => p.email)
    .map((p) => {
      const href = `${siteUrl()}${expiriesHref(roleOf(p.id))}`;
      return {
        alertId,
        profileId: p.id,
        to: p.email,
        subject: copy.title,
        html: renderEmailDocument({
          eyebrow: 'Expiry tracker',
          title: copy.title,
          bodyHtml: emailParagraph(`Hi ${escapeHtml(firstName(p.name))},`) + emailParagraph(escapeHtml(copy.body)),
          cta: { label: 'Open the expiry register', href },
        }),
        text: [`Hi ${firstName(p.name)},`, copy.body, `Open the expiry register: ${href}`].join('\n\n'),
      };
    });
}
