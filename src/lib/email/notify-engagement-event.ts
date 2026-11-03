import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getItem } from '@/data/checklist';
import { sendMailViaOutlook } from '@/db/repositories/outlook-connections';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import type { EngagementParty, EngagementRecipients } from '@/db/repositories/engagement-recipients';
import {
  emptyEmailDispatch,
  pushEmailSubject,
  type EmailDispatchResult,
  type OutgoingEmailDraft,
} from '@/lib/email/email-dispatch';
import {
  approvalBellLines,
  approvalCcEmails,
  collectAdminParties,
  collectLeadParties,
  collectManagerParties,
  directFlowBellAudience,
  directFlowEmailPlan,
  emailsStaffViaResend,
  isBoardResolutionSendBack,
  inAppIncludesActor,
  opensClientOutgoingDraft,
  sendsFromActorMailbox,
  staffEmailTargetsForEvent,
  type EngagementProcessEvent,
} from '@/lib/email/engagement-event-fanout';
import { buildDocumentRequestEmail, buildProgressEmail, type ProgressEmailKind } from '@/lib/email/progress-emails';
import {
  companyFromAddress,
  formatReplyTo,
  sendEmail,
  type SendEmailResult,
} from '@/lib/email/send-email';
import type { NotificationKind } from '@/lib/checklist/checklist-notifications';
import { queueWhatsAppSends } from '@/lib/notify/send-whatsapp';
import { firstNameOf } from '@/lib/notify/templates';
import type { NotifyEvent } from '@/lib/notify/types';
import {
  adminProjectStepPath,
  clientBoardResolutionPath,
  clientIncorporationPath,
  internBoardResolutionPath,
  internEngagementStepPath,
} from '@/lib/projects/project-step-path';
import { siteUrl } from '@/lib/site-url';
import { directFlowRoleLabel } from '@/lib/incorporation/pre-inc-direct-flow';

export type { EmailDispatchResult };

type NotifyInput = {
  engagementId: string;
  itemId: string;
  event: EngagementProcessEvent;
  note?: string | null;
  /** Optional label for document requests (overrides step title in body). */
  requestLabel?: string;
  /** Actor userId — skip notifying the person who triggered the action (except deliver / BR share). */
  actorUserId?: string;
  /** Re-open compose without inserting another in-app row. */
  skipInAppNotifications?: boolean;
  /** In-app Received rows only — no Graph compose / Resend (Update client portal). */
  inAppOnly?: boolean;
  /** When set, lead→manager approval tries Graph from this staff mailbox first. */
  outlookCtx?: AuthContext;
  /** Direct-flow bell / mail text: who acted, and as which role. */
  actorName?: string | null;
  actorRole?: string | null;
};

function stepTitle(itemId: string): string {
  return getItem(itemId)?.title ?? itemId;
}

function emailKind(event: EngagementProcessEvent): ProgressEmailKind | null {
  switch (event) {
    case 'client_submitted':
      return 'client_submitted';
    case 'client_uploaded':
      return 'client_uploaded';
    case 'lead_requested_review':
      return 'lead_requested_review';
    case 'review_accepted':
      return 'review_accepted';
    case 'review_rejected':
      return 'review_rejected';
    case 'delivered':
      return 'delivered';
    case 'unlocked':
      return 'unlocked';
    case 'docs_shared':
      return 'docs_shared';
    case 'board_resolution_shared':
      return 'board_resolution_shared';
    case 'client_fill_requested':
      return 'client_fill_requested';
    case 'client_fill_approved':
      return 'client_fill_approved';
    case 'client_fill_declined':
      return 'client_fill_declined';
    case 'step_awaiting_client_approval':
      return 'step_awaiting_client_approval';
    case 'phase_approved':
      return 'phase_approved';
    case 'client_change_requested':
      return 'client_change_requested';
    case 'step_submitted':
      return 'step_submitted';
    case 'step_waiting_on_lead':
      return 'step_waiting_on_lead';
    case 'step_reopened':
    case 'request_created':
    case 'client_approved_step':
      return null;
  }
}

/** Certificate of Incorporation step — accepting it is the `coi_issued` nudge. */
const COI_ITEM_ID = 'pre-12';

/**
 * Which process events also earn a WhatsApp nudge.
 *
 * Returns null for everything else — WhatsApp is a small, chosen subset, not a
 * mirror of the email fan-out. Email is unaffected either way.
 */
function whatsappEventFor(input: NotifyInput): NotifyEvent | null {
  if (input.event === 'delivered') {
    // `inAppOnly` marks a re-deliver; only the first Deliver nudges.
    return input.inAppOnly ? null : 'document_delivered';
  }
  if (
    (input.event === 'review_accepted' || input.event === 'step_submitted') &&
    input.itemId.trim() === COI_ITEM_ID
  ) {
    // Direct flow: the certificate step's Submit is what used to be Accept.
    return 'coi_issued';
  }
  // TODO(whatsapp): `step_awaiting_client_approval`, `phase_approved` and
  // `client_change_requested` are each specified to nudge on WhatsApp too.
  // Wiring them means adding three entries to `NOTIFY_EVENTS`, three variable
  // builders in `src/lib/notify/templates.ts`, and three
  // `WHATSAPP_TEMPLATE_*` SIDs — all inside `src/lib/notify/**`, which is
  // currently off-limits by owner instruction. Email is unaffected: it is
  // already complete for all three, and by the existing rule neither channel
  // is downgraded when the other is missing.
  return null;
}

function notificationKind(event: EngagementProcessEvent): NotificationKind {
  switch (event) {
    case 'client_submitted':
      return 'checklist.submit';
    case 'client_uploaded':
      return 'request.uploaded';
    case 'lead_requested_review':
      return 'checklist.submit';
    case 'review_accepted':
    case 'review_rejected':
      return 'checklist.review';
    case 'delivered':
      return 'checklist.deliver';
    case 'unlocked':
      return 'checklist.unlock';
    case 'docs_shared':
      return 'docs.share';
    case 'board_resolution_shared':
      return 'checklist.deliver';
    case 'client_fill_requested':
      return 'checklist.submit';
    case 'client_fill_declined':
      return 'checklist.review';
    case 'client_fill_approved':
      return 'request.created';
    case 'step_awaiting_client_approval':
      return 'request.created';
    case 'phase_approved':
    case 'client_approved_step':
      return 'checklist.review';
    case 'client_change_requested':
      return 'checklist.review';
    case 'step_submitted':
    case 'step_waiting_on_lead':
      return 'checklist.submit';
    case 'step_reopened':
      return 'checklist.unlock';
    case 'request_created':
      return 'request.created';
  }
}

/** "Kiran Rao (Client)" — the actor as the bell and the mail name them. */
function actorLabel(input: NotifyInput, recipients: EngagementRecipients): string {
  const party = findPartyByUserId(recipients, input.actorUserId);
  const name = input.actorName?.trim() || party?.name?.trim() || 'Someone';
  const role = input.actorRole ?? (party && isClientParty(recipients, party) ? 'client' : 'intern');
  return `${name} (${directFlowRoleLabel(role)})`;
}

/** Bell title + body for the direct-flow and board-resolution events. */
function directFlowBellCopy(
  input: NotifyInput,
  title: string,
  company: string,
  actor: string,
  audience: 'client' | 'lead' | 'manager' | 'admin',
): { title: string; body: string } {
  switch (input.event) {
    case 'step_submitted':
      return { title: `${title} submitted`, body: `${actor} submitted this step for ${company}.` };
    case 'step_waiting_on_lead':
      return {
        title: `${title}: NIC codes needed`,
        body: `${actor} submitted their part of this step for ${company}. Add the NIC codes to complete it.`,
      };
    case 'step_reopened':
      return { title: `${title} reopened`, body: `${actor} reopened this step for ${company}.` };
    case 'board_resolution_shared':
      return audience === 'client'
        ? { title: 'Board resolution ready', body: 'The board resolution is ready to download and sign.' }
        : {
            title: 'Board resolution approved',
            body: `The board resolution for ${company} was approved and sent to the client.`,
          };
    case 'lead_requested_review':
      return {
        title: 'Board resolution to approve',
        body: `${company}: the board resolution is waiting for your approval.`,
      };
    case 'review_rejected':
      return {
        title: 'Board resolution sent back',
        body: input.note?.trim()
          ? `${company}: ${input.note.trim()}`
          : `${company}: your manager sent the board resolution back.`,
      };
    default:
      return { title, body: `${title} for ${company}.` };
  }
}

function absolute(path: string): string {
  if (path.startsWith('http')) return path;
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

function findPartyByUserId(
  recipients: EngagementRecipients,
  userId?: string,
): EngagementParty | null {
  if (!userId) return null;
  if (recipients.lead?.userId === userId) return recipients.lead;
  const fromLeads = recipients.leads.find((l) => l.userId === userId);
  if (fromLeads) return fromLeads;
  if (recipients.manager?.userId === userId) return recipients.manager;
  const fromManagers = recipients.managers.find((m) => m.userId === userId);
  if (fromManagers) return fromManagers;
  const fromAdmins = recipients.admins.find((a) => a.userId === userId);
  if (fromAdmins) return fromAdmins;
  if (recipients.client?.userId === userId) return recipients.client;
  return recipients.clients.find((c) => c.userId === userId) ?? null;
}

function isClientParty(recipients: EngagementRecipients, party: EngagementParty | null): boolean {
  if (!party) return false;
  if (recipients.client?.userId === party.userId) return true;
  return recipients.clients.some((c) => c.userId === party.userId);
}

/** Reply-To for mail sent to staff (client submitted, intern request-approval). */
function replyToForStaff(
  recipients: EngagementRecipients,
  event: EngagementProcessEvent,
  actorUserId?: string,
): string | undefined {
  const actor = findPartyByUserId(recipients, actorUserId);
  if (
    event === 'lead_requested_review' ||
    event === 'client_fill_requested' ||
    event === 'client_fill_declined'
  ) {
    if (actor && !isClientParty(recipients, actor)) return formatReplyTo(actor);
    return formatReplyTo(recipients.lead ?? recipients.leads[0] ?? null);
  }
  if (actor && isClientParty(recipients, actor)) return formatReplyTo(actor);
  return formatReplyTo(recipients.client ?? recipients.clients[0] ?? null);
}

/** Client → lead From: company@verified-domain for Outlook filters. */
function fromForCompany(recipients: EngagementRecipients): string | undefined {
  return companyFromAddress({
    companyName: recipients.companyName,
  });
}

function clientParties(recipients: EngagementRecipients) {
  if (recipients.clients.length > 0) return recipients.clients;
  return recipients.client ? [recipients.client] : [];
}

function buildOutgoingClientDraft(
  input: NotifyInput,
  recipients: EngagementRecipients,
  company: string,
  title: string,
  clientHref: string,
): OutgoingEmailDraft | undefined {
  const parties = clientParties(recipients);
  const to = parties.map((p) => p.email).filter(Boolean);
  if (to.length === 0) return undefined;

  const href = absolute(clientHref);
  const progressKind = emailKind(input.event);
  const copy =
    input.event === 'request_created'
      ? buildDocumentRequestEmail({
          companyName: company,
          title,
          note: input.note,
          portalHref: href,
        })
      : progressKind
        ? buildProgressEmail({
            kind: progressKind,
            companyName: company,
            itemId: input.itemId,
            note: input.note,
            portalHref: href,
            audience: 'client',
            title: input.requestLabel,
          })
        : null;
  if (!copy) return undefined;

  const actor = findPartyByUserId(recipients, input.actorUserId);
  const cc =
    input.event === 'review_accepted'
      ? approvalCcEmails(recipients, {
          excludeEmails: actor?.email ? [actor.email] : [],
        })
      : [];
  return {
    to,
    ...(cc.length > 0 ? { cc } : {}),
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
    engagementId: recipients.appId,
    companyName: company,
    itemId: input.itemId,
  };
}

function recordSend(
  out: EmailDispatchResult,
  to: string,
  result: SendEmailResult,
  subject?: string,
) {
  out.attempted += 1;
  // Always report the intended staff/client recipient — not a test redirect address.
  const addr = (result.intendedTo?.[0] ?? to).trim();
  if (!addr) return;
  if (result.ok) {
    out.sent.push(addr);
    pushEmailSubject(out, subject);
  } else if (result.skipped) {
    out.skipped.push(addr);
    pushEmailSubject(out, subject);
  } else {
    out.failed.push(addr);
    pushEmailSubject(out, subject);
    if (result.error && result.error !== 'email_not_configured') {
      out.error = out.error ?? result.error;
    }
  }
}

/**
 * Fan-out process emails + in-app notifications for client / lead / manager.
 * Never throws — failures are logged so mutations stay successful.
 * Returns a dispatch summary for API → toast wiring.
 */
export async function notifyEngagementEvent(input: NotifyInput): Promise<EmailDispatchResult> {
  const email = emptyEmailDispatch();

  try {
    const recipients = await resolveEngagementRecipients(input.engagementId);
    if (!recipients) {
      console.warn('[notify] engagement not found', input.engagementId);
      return email;
    }

    const project = {
      id: recipients.appId,
      slug: recipients.slug,
    };
    const title = input.requestLabel?.trim() || stepTitle(input.itemId);
    const company = recipients.companyName;
    const kind = notificationKind(input.event);
    const clientHref =
      input.event === 'board_resolution_shared'
        ? clientBoardResolutionPath()
        : input.event === 'client_fill_approved' ||
            input.event === 'step_awaiting_client_approval'
          ? clientIncorporationPath(input.itemId)
          : '/app/client/incorporation';
    const leadHref =
      input.event === 'board_resolution_shared'
        ? internBoardResolutionPath(project)
        : internEngagementStepPath(project, input.itemId);
    const managerHref = adminProjectStepPath(project, input.itemId, 'manager');

    const notifDrafts: Array<
      Parameters<typeof createNotificationsForUsers>[0][number]
    > = [];

    const adminHref = adminProjectStepPath(project, input.itemId, 'admin');
    const pushNotif = (
      userId: string | undefined,
      role: 'client' | 'intern' | 'manager' | 'admin',
      nTitle: string,
      body: string,
    ) => {
      if (!userId) return;
      if (userId === input.actorUserId && !inAppIncludesActor(input.event)) return;
      // One row per person, even when they hold two roles on the engagement.
      if (notifDrafts.some((draft) => draft.userId === userId)) return;
      const href =
        role === 'client'
          ? clientHref
          : role === 'intern'
            ? leadHref
            : role === 'admin'
              ? adminHref
              : managerHref;
      notifDrafts.push({
        userId,
        kind,
        title: nTitle,
        body,
        engagementId: recipients.appId,
        companyName: company,
        itemId: input.itemId,
        href,
        // C-759: the bell names who did it.
        actorId: input.actorUserId,
        actorName: input.actorName?.trim() || findPartyByUserId(recipients, input.actorUserId)?.name?.trim() || undefined,
      });
    };

    const pushNotifToClients = (nTitle: string, body: string) => {
      for (const c of recipients.clients) {
        pushNotif(c.userId, 'client', nTitle, body);
      }
    };

    const pushNotifToLeads = (nTitle: string, body: string) => {
      for (const lead of collectLeadParties(recipients)) {
        pushNotif(lead.userId, 'intern', nTitle, body);
      }
    };

    const pushNotifToManagers = (nTitle: string, body: string) => {
      for (const mgr of collectManagerParties(recipients)) {
        pushNotif(mgr.userId, 'manager', nTitle, body);
      }
    };

    const bellAudience = directFlowBellAudience(input.event, input.itemId);
    if (!input.skipInAppNotifications && bellAudience) {
      // Direct flow + board resolution: one table decides who hears it
      // (`directFlowBellAudience`), each in their own shell's link.
      const actor = actorLabel(input, recipients);
      for (const audience of bellAudience) {
        const copy = directFlowBellCopy(input, title, company, actor, audience);
        if (audience === 'client') {
          for (const c of clientParties(recipients)) pushNotif(c.userId, 'client', copy.title, copy.body);
        } else if (audience === 'lead') {
          for (const lead of collectLeadParties(recipients)) pushNotif(lead.userId, 'intern', copy.title, copy.body);
        } else if (audience === 'manager') {
          for (const mgr of collectManagerParties(recipients)) pushNotif(mgr.userId, 'manager', copy.title, copy.body);
        } else {
          for (const admin of collectAdminParties(recipients)) pushNotif(admin.userId, 'admin', copy.title, copy.body);
        }
      }
    } else if (!input.skipInAppNotifications && approvalBellLines(input.event, { company, title })) {
      // The client's approval round (`approvalBellLines`): the step handed to
      // the client, and the client's approve / approve-the-phase / change ask.
      for (const line of approvalBellLines(input.event, { company, title, note: input.note }) ?? []) {
        if (line.audience === 'client') {
          for (const c of clientParties(recipients)) pushNotif(c.userId, 'client', line.title, line.body);
        } else if (line.audience === 'lead') {
          for (const lead of collectLeadParties(recipients)) pushNotif(lead.userId, 'intern', line.title, line.body);
        } else if (line.audience === 'manager') {
          for (const mgr of collectManagerParties(recipients)) pushNotif(mgr.userId, 'manager', line.title, line.body);
        } else {
          for (const admin of collectAdminParties(recipients)) pushNotif(admin.userId, 'admin', line.title, line.body);
        }
      }
    } else if (!input.skipInAppNotifications) {
    if (input.event === 'client_submitted') {
      pushNotifToLeads(
        'Client submission',
        `${company} submitted ${title} for review.`,
      );
      pushNotifToManagers(
        'Client submission',
        `${company} submitted ${title} for review.`,
      );
      pushNotifToClients('Submission received', `We received your submission for ${title}.`);
    } else if (input.event === 'client_uploaded') {
      pushNotifToLeads('Client upload', `${company} uploaded ${title}.`);
      pushNotifToManagers('Client upload', `${company} uploaded ${title}.`);
    } else if (input.event === 'lead_requested_review') {
      pushNotifToManagers(
        'Manager approval requested',
        `${company}: ${title} is waiting for your approval.`,
      );
    } else if (input.event === 'review_accepted') {
      pushNotifToClients('Submission accepted', `${title} was approved.`);
      pushNotifToLeads('Submission accepted', `${title} was accepted for ${company}.`);
      pushNotifToManagers(
        'Submission accepted',
        `${title} was accepted for ${company}.`,
      );
      for (const admin of collectAdminParties(recipients)) {
        if (!admin.userId || admin.userId === input.actorUserId) continue;
        notifDrafts.push({
          userId: admin.userId,
          kind,
          title: 'Submission accepted',
          body: `${title} was accepted for ${company}.`,
          engagementId: recipients.appId,
          companyName: company,
          itemId: input.itemId,
          href: adminHref,
        });
      }
    } else if (input.event === 'review_rejected') {
      const body = input.note?.trim()
        ? `${title}: ${input.note.trim()}`
        : `${title} needs updates — check the milestone for details.`;
      pushNotifToClients('Corrections requested', body);
      pushNotifToLeads('Corrections requested', `${title} needs updates for ${company}.`);
      pushNotifToManagers(
        'Corrections requested',
        `${title} needs updates for ${company}.`,
      );
    } else if (input.event === 'delivered') {
      const deliveredTitle = 'Delivered to client';
      const deliveredBody = `${title} was delivered for ${company}.`;
      pushNotifToClients('New from your VCFO team', `${title} is ready on your portal.`);
      pushNotifToLeads(deliveredTitle, deliveredBody);
      if (
        input.actorUserId &&
        !notifDrafts.some((n) => n.userId === input.actorUserId)
      ) {
        notifDrafts.push({
          userId: input.actorUserId,
          kind,
          title: deliveredTitle,
          body: deliveredBody,
          engagementId: recipients.appId,
          companyName: company,
          itemId: input.itemId,
          href: leadHref,
        });
      }
    } else if (input.event === 'unlocked') {
      pushNotifToClients('Fields unlocked', `You can update ${title} again and resubmit.`);
      pushNotifToLeads(
        'Fields unlocked',
        `Client fields unlocked on ${title} for ${company}.`,
      );
    } else if (input.event === 'docs_shared') {
      pushNotifToClients(
        'Incorporation drafts shared',
        'Draft incorporation forms are on your portal for download and upload.',
      );
      pushNotifToLeads(
        'Drafts shared',
        `Incorporation drafts shared with client for ${company}.`,
      );
    } else if (input.event === 'board_resolution_shared') {
      pushNotifToClients(
        'Board resolution ready',
        'The board resolution is ready to download and sign.',
      );
      // Include the acting lead: process row lands in Received; Graph send
      // writes email.sent on the Sent tab after they click Send.
      for (const lead of collectLeadParties(recipients)) {
        if (!lead.userId) continue;
        notifDrafts.push({
          userId: lead.userId,
          kind,
          title: 'Sent to client',
          body: `Board resolution sent to client for ${company}.`,
          engagementId: recipients.appId,
          companyName: company,
          itemId: input.itemId,
          href: leadHref,
        });
      }
    } else if (input.event === 'client_fill_requested') {
      pushNotifToManagers(
        'Client fill request',
        `${company}: approve before we ask the client to fill ${title}.`,
      );
    } else if (input.event === 'client_fill_approved') {
      pushNotifToClients('Please fill this step', `${title} is waiting for your details.`);
      pushNotifToLeads(
        'Client fill request approved',
        `${company}: the client was asked to fill ${title}.`,
      );
      pushNotifToManagers(
        'Client fill request approved',
        `${company}: the client was asked to fill ${title}.`,
      );
    } else if (input.event === 'client_fill_declined') {
      const declineBody = input.note?.trim()
        ? `${title}: ${input.note.trim()}`
        : `${title} was not sent to the client.`;
      pushNotifToLeads('Client fill request declined', declineBody);
    } else if (input.event === 'request_created') {
      pushNotifToClients('Document requested', `Please upload: ${title}.`);
      pushNotifToLeads(
        'Document requested',
        `Document request “${title}” sent to client for ${company}.`,
      );
    }
    }

    if (notifDrafts.length > 0) {
      try {
        await createNotificationsForUsers(notifDrafts);
      } catch (err) {
        console.error('[notify] in-app notifications failed', input.event, err);
      }
    }

    const progressKind = emailKind(input.event);
    const queue: Array<{
      to: string;
      subject: string;
      run: () => Promise<SendEmailResult>;
    }> = [];

    // Client → staff: Resend From company_name@sbctrack.in
    // Intern → manager: Graph from the lead mailbox when connected, else Resend
    // Lead/manager → client: in-app compose + Graph Mail.Send (CC admin + lead on accept)
    if (!input.inAppOnly && opensClientOutgoingDraft(input.event, input.itemId)) {
      email.outgoingDraft = buildOutgoingClientDraft(
        input,
        recipients,
        company,
        title,
        clientHref,
      );
    }

    let skippedResendBecauseOutlook = false;
    if (
      !input.inAppOnly &&
      sendsFromActorMailbox(input.event) &&
      input.outlookCtx &&
      progressKind
    ) {
      const staffTargets = staffEmailTargetsForEvent(input.event, recipients, {
        leadHref,
        managerHref,
      });
      const to = staffTargets.map((s) => s.email).filter(Boolean);
      if (to.length > 0) {
        const copy = buildProgressEmail({
          kind: progressKind,
          companyName: company,
          itemId: input.itemId,
          note: input.note,
          portalHref: absolute(staffTargets[0]!.href),
          audience: 'lead',
          title: input.requestLabel,
        });
        try {
          await sendMailViaOutlook(input.outlookCtx, {
            to,
            subject: copy.subject,
            html: copy.html,
            text: copy.text,
          });
          for (const addr of to) {
            email.attempted += 1;
            email.sent.push(addr);
          }
          pushEmailSubject(email, copy.subject);
          skippedResendBecauseOutlook = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'outlook_send_failed';
          if (message !== 'outlook_not_connected' && message !== 'outlook_not_configured') {
            console.error('[notify] outlook lead→manager failed', message);
          }
        }
      }
    }

    // Manager approved the lead's ask: the client hears it from the manager's
    // own mailbox when Outlook is connected, else Resend with the manager on
    // Reply-To. Leads and admins are CC'd so the ask is visible to the team.
    if (
      !input.inAppOnly &&
      (input.event === 'client_fill_approved' ||
        input.event === 'step_awaiting_client_approval') &&
      progressKind
    ) {
      const parties = clientParties(recipients);
      const to = parties.map((p) => p.email.trim()).filter(Boolean);
      if (to.length === 0) {
        console.warn('[notify] client fill approval has no client email', recipients.slug);
      } else {
        const actor = findPartyByUserId(recipients, input.actorUserId);
        const cc = approvalCcEmails(recipients, {
          excludeEmails: actor?.email ? [actor.email] : [],
        });
        const copy = buildProgressEmail({
          kind: progressKind,
          companyName: company,
          itemId: input.itemId,
          note: input.note,
          portalHref: absolute(clientHref),
          audience: 'client',
          title: input.requestLabel,
        });

        let sentViaOutlook = false;
        if (input.outlookCtx) {
          try {
            await sendMailViaOutlook(input.outlookCtx, {
              to,
              ...(cc.length > 0 ? { cc } : {}),
              subject: copy.subject,
              html: copy.html,
              text: copy.text,
            });
            for (const addr of to) {
              email.attempted += 1;
              email.sent.push(addr);
            }
            pushEmailSubject(email, copy.subject);
            sentViaOutlook = true;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'outlook_send_failed';
            if (message !== 'outlook_not_connected' && message !== 'outlook_not_configured') {
              console.error('[notify] outlook manager→client fill request failed', message);
            }
          }
        }

        if (!sentViaOutlook) {
          for (const addr of to) {
            queue.push({
              to: addr,
              subject: copy.subject,
              run: () =>
                sendEmail({
                  to: addr,
                  cc,
                  from: fromForCompany(recipients),
                  replyTo: actor ? formatReplyTo(actor) : undefined,
                  subject: copy.subject,
                  html: copy.html,
                  text: copy.text,
                  purpose: `progress.${input.event}.client`,
                }),
            });
          }
        }
      }
    }

    const directPlan = directFlowEmailPlan(input.event, input.actorRole);
    const directActor =
      input.event === 'step_submitted' || input.event === 'step_waiting_on_lead'
        ? actorLabel(input, recipients)
        : undefined;

    // A lead's direct-flow submit: the clients hear it, managers on CC.
    if (!input.inAppOnly && directPlan === 'clients' && progressKind) {
      const to = clientParties(recipients).map((p) => p.email.trim()).filter(Boolean);
      const cc = collectManagerParties(recipients)
        .map((m) => m.email.trim())
        .filter((addr) => addr && !to.some((t) => t.toLowerCase() === addr.toLowerCase()));
      const actor = findPartyByUserId(recipients, input.actorUserId);
      const copy = buildProgressEmail({
        kind: progressKind,
        companyName: company,
        itemId: input.itemId,
        portalHref: absolute(clientIncorporationPath(input.itemId)),
        audience: 'client',
        actor: directActor,
      });
      for (const addr of to) {
        queue.push({
          to: addr,
          subject: copy.subject,
          run: () =>
            sendEmail({
              to: addr,
              cc,
              from: fromForCompany(recipients),
              replyTo: actor ? formatReplyTo(actor) : undefined,
              subject: copy.subject,
              html: copy.html,
              text: copy.text,
              purpose: `progress.${input.event}.client`,
            }),
        });
      }
    }

    // Board resolution sent back: the lead's news only (never a client).
    if (!input.inAppOnly && isBoardResolutionSendBack(input.event, input.itemId) && progressKind) {
      for (const lead of collectLeadParties(recipients)) {
        const addr = lead.email.trim();
        if (!addr) continue;
        const copy = buildProgressEmail({
          kind: progressKind,
          companyName: company,
          itemId: input.itemId,
          note: input.note,
          portalHref: absolute(internBoardResolutionPath(project)),
          audience: 'lead',
        });
        queue.push({
          to: addr,
          subject: copy.subject,
          run: () =>
            sendEmail({
              to: addr,
              cc: [],
              from: fromForCompany(recipients),
              subject: copy.subject,
              html: copy.html,
              text: copy.text,
              purpose: `progress.${input.event}.lead`,
            }),
        });
      }
    }

    if (
      !input.inAppOnly &&
      emailsStaffViaResend(input.event) &&
      directPlan !== 'clients' &&
      progressKind &&
      !skippedResendBecauseOutlook
    ) {
      const staffTargets = staffEmailTargetsForEvent(input.event, recipients, {
        leadHref,
        managerHref,
      });

      if (staffTargets.length > 0) {
        for (const staff of staffTargets) {
          const copy = buildProgressEmail({
            kind: progressKind,
            companyName: company,
            itemId: input.itemId,
            note: input.note,
            portalHref: absolute(staff.href),
            audience: 'lead',
            title: input.requestLabel,
            actor: directActor,
          });
          const to = staff.email;
          const replyTo = replyToForStaff(recipients, input.event, input.actorUserId);
          queue.push({
            to,
            subject: copy.subject,
            run: () =>
              sendEmail({
                to,
                cc: [],
                from: fromForCompany(recipients),
                replyTo,
                subject: copy.subject,
                html: copy.html,
                text: copy.text,
                purpose: `progress.${input.event}.${staff.label}`,
              }),
          });
        }
      } else {
        console.warn(
          '[notify] staff email skipped — no manager/lead (or they match client)',
          recipients.slug,
          input.event,
        );
      }
    }

    const settled = await Promise.all(
      queue.map(async (job) => {
        try {
          return { to: job.to, subject: job.subject, result: await job.run() };
        } catch (err) {
          console.error('[notify] send failed', job.to, err);
          return {
            to: job.to,
            subject: job.subject,
            result: { ok: false, error: 'send_failed' } satisfies SendEmailResult,
          };
        }
      }),
    );

    for (const row of settled) {
      recordSend(email, row.to, row.result, row.subject);
    }

    email.sent = [...new Set(email.sent)];
    email.skipped = [...new Set(email.skipped)];
    email.failed = [...new Set(email.failed)];
    email.subjects = [...new Set(email.subjects ?? [])];

    // WhatsApp last, on the background path, so a WhatsApp send can never
    // slow this request or change anything above. Never throws.
    const whatsappEvent = whatsappEventFor(input);
    if (whatsappEvent) {
      await queueWhatsAppSends(
        clientParties(recipients).map((party) => ({
          engagementId: recipients.appId,
          recipientProfileId: party.userId,
          event: whatsappEvent,
          variables: {
            firstName: firstNameOf(party.name),
            companyName: company,
            stepTitle: title,
          },
        })),
      );
    }
  } catch (err) {
    console.error('[notify] engagement event failed', input.event, err);
  }

  return email;
}
