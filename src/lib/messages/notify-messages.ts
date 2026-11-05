import 'server-only';

import { createNotificationsForUsers } from '@/db/repositories/notifications';
import {
  resolveEngagementRecipients,
  type EngagementParty,
} from '@/db/repositories/engagement-recipients';
import { companyFromAddress, formatReplyTo, sendEmail } from '@/lib/email/send-email';
import { buildClientMessageEmail, buildStaffReplyEmail } from '@/lib/messages/message-emails';
import type { Message } from '@/lib/messages/types';

/**
 * Fan-out for client messages. Both functions run after the message is stored and never
 * throw: a failed email or bell row must not lose the message the person just wrote.
 *
 *  - a client message: a bell notification and an email to every lead on the engagement
 *    (the managers when the engagement has no lead yet);
 *  - a staff reply: an email to every client member of the engagement.
 */

/** Where the lead triages client messages (the Inbox card on Today). */
const LEAD_INBOX_PATH = '/app/intern/today';
/** The client's messages page in the portal. */
const CLIENT_MESSAGES_PATH = '/app/client/messages';

function inboxPathFor(party: EngagementParty, leads: EngagementParty[]): string {
  return leads.some((l) => l.userId === party.userId) ? LEAD_INBOX_PATH : '/app/manager/dashboard';
}

function preview(body: string): string {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 139).trimEnd()}…` : line;
}

export async function notifyClientMessage(
  message: Message,
  sender: { name: string; email: string },
): Promise<void> {
  try {
    const recipients = await resolveEngagementRecipients(message.engagementId);
    if (!recipients) return;
    const staff = recipients.leads.length > 0 ? recipients.leads : recipients.managers;
    if (staff.length === 0) return;

    await createNotificationsForUsers(
      staff.map((party) => ({
        userId: party.userId,
        kind: 'message.received' as const,
        title: `Message from ${message.senderName}`,
        body: preview(message.body),
        engagementId: recipients.appId,
        companyName: recipients.companyName,
        href: inboxPathFor(party, recipients.leads),
        actorName: message.senderName || sender.name,
      })),
    ).catch((err) => console.error('[messages] bell failed', err));

    await Promise.allSettled(
      staff.map((party) => {
        const copy = buildClientMessageEmail({
          companyName: recipients.companyName,
          senderName: message.senderName,
          body: message.body,
          inboxHref: inboxPathFor(party, recipients.leads),
        });
        return sendEmail({
          to: party.email,
          from: companyFromAddress({ companyName: recipients.companyName }),
          replyTo: formatReplyTo(sender),
          subject: copy.subject,
          html: copy.html,
          text: copy.text,
          purpose: 'messages.client_to_lead',
        });
      }),
    );
  } catch (err) {
    console.error('[messages] client message fan-out failed', err);
  }
}

export async function notifyStaffReply(
  message: Message,
  sender: { name: string; email: string },
): Promise<void> {
  try {
    const recipients = await resolveEngagementRecipients(message.engagementId);
    if (!recipients) return;
    const clients = recipients.clients.length > 0 ? recipients.clients : recipients.client ? [recipients.client] : [];
    const copy = buildStaffReplyEmail({
      companyName: recipients.companyName,
      senderName: message.senderName,
      body: message.body,
      portalHref: CLIENT_MESSAGES_PATH,
    });
    await Promise.allSettled(
      clients.map((party) =>
        sendEmail({
          to: party.email,
          replyTo: formatReplyTo(sender),
          subject: copy.subject,
          html: copy.html,
          text: copy.text,
          purpose: 'messages.staff_to_client',
        }),
      ),
    );
  } catch (err) {
    console.error('[messages] staff reply email failed', err);
  }
}
