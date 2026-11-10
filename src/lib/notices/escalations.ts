import 'server-only';

import { systemMeetingPeople } from '@/db/repositories/board-meetings';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { systemClaimEscalation, systemListEscalationCandidates, systemStaffContacts } from '@/db/repositories/notice-cases';
import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { siteUrl } from '@/lib/site-url';
import { dueEscalation, escalationAudience, escalationTitle, NOTICE_STAGE_LABEL, noticesHref, type Escalation } from './model';

/**
 * The notice desk's escalations (IDEAS-PLAN wave 2, section C), run by
 * src/jobs/notice-escalations.ts once a day. Seven and two days before a reply is due, the case
 * owner and the client's manager get a bell and an email; once it is overdue the partner (the
 * engagement's admin, else a firm admin) does too. Nothing goes to a client.
 */

export interface DueNoticeEscalation {
  caseId: string;
  escalation: Escalation;
  dueOn: string;
}

export interface NoticeEmailPlan {
  caseId: string;
  profileId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

type Person = { id: string; name: string; email: string };

/** The cases with an escalation due today. */
export async function planNoticeEscalations(today: string): Promise<DueNoticeEscalation[]> {
  const candidates = await systemListEscalationCandidates(today);
  return candidates.flatMap((c) => {
    const escalation = dueEscalation({ stage: c.item.stage, responseDueOn: c.item.responseDueOn, lastEscalation: c.lastEscalation, lastEscalationDueOn: c.lastEscalationDueOn }, today);
    return escalation && c.item.responseDueOn ? [{ caseId: c.item.id, escalation, dueOn: c.item.responseDueOn }] : [];
  });
}

/**
 * The people one escalation reaches, without repeats: the owner (the lead when the case has no
 * owner), the manager, and for an overdue reply the partner.
 */
export function escalationRecipients(escalation: Escalation, people: { owner: Person | null; lead: Person | null; manager: Person | null; admin: Person | null }): Person[] {
  const out: Person[] = [];
  const add = (p: Person | null) => {
    if (p && !out.some((o) => o.id === p.id)) out.push(p);
  };
  for (const who of escalationAudience(escalation)) {
    if (who === 'owner') add(people.owner ?? people.lead);
    if (who === 'manager') add(people.manager);
    if (who === 'partner') add(people.admin);
  }
  return out;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

/** Bells for one case's escalation, and the emails the job then sends. Empty when already done. */
export async function runNoticeEscalation(due: DueNoticeEscalation, today: string): Promise<NoticeEmailPlan[]> {
  const candidates = await systemListEscalationCandidates(today);
  const found = candidates.find((c) => c.item.id === due.caseId);
  if (!found || found.item.responseDueOn !== due.dueOn) return [];
  if (!(await systemClaimEscalation(due.caseId, due.escalation, due.dueOn))) return [];
  const { item, engagement } = found;
  const people = await systemMeetingPeople(engagement);
  const contacts = await systemStaffContacts([item.ownerId, people.lead?.id, people.manager?.id, people.admin?.id]);
  const contact = (id: string | null | undefined): Person | null => contacts.find((c) => c.id === id) ?? null;
  const recipients = escalationRecipients(due.escalation, { owner: contact(item.ownerId), lead: contact(people.lead?.id), manager: contact(people.manager?.id), admin: contact(people.admin?.id) });
  if (recipients.length === 0) return [];

  const days = Math.max(0, item.daysLeft ?? 0);
  const title = escalationTitle(due.escalation, { companyName: item.companyName, label: item.label, days });
  const body = [
    due.escalation === 'overdue' ? `The reply was due on ${item.responseDueOn}.` : `The reply is due on ${item.responseDueOn}.`,
    `Stage: ${NOTICE_STAGE_LABEL[item.stage]}.`,
    item.demandAmount ? `Demand: Rs. ${Number(item.demandAmount).toLocaleString('en-IN')}.` : null,
    item.hearingOn ? `Hearing: ${item.hearingOn}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  // Each person's own role decides the shell their link opens.
  const roleOf = (id: string) => contacts.find((c) => c.id === id)?.role ?? 'admin';
  await createNotificationsForUsers(
    recipients.map((p) => ({
      userId: p.id,
      kind: 'compliance.reminder' as const,
      title,
      body,
      engagementId: item.engagementId,
      companyName: item.companyName,
      href: `${noticesHref(roleOf(p.id))}?case=${item.id}`,
    })),
  );
  return recipients
    .filter((p) => p.email)
    .map((p) => {
      const href = `${siteUrl()}${noticesHref(roleOf(p.id))}?case=${item.id}`;
      return {
        caseId: item.id,
        profileId: p.id,
        to: p.email,
        subject: title,
        html: renderEmailDocument({
          eyebrow: 'Notice desk',
          title,
          bodyHtml: emailParagraph(`Hi ${escapeHtml(firstName(p.name))},`) + emailParagraph(escapeHtml(body)),
          cta: { label: 'Open the case', href },
        }),
        text: [`Hi ${firstName(p.name)},`, body, `Open the case: ${href}`].join('\n\n'),
      };
    });
}
