/**
 * Pure fan-out rules for process emails + in-app notifications.
 * Kept free of `db` / Resend so tests can lock recipient targeting.
 */

export type FanoutParty = {
  userId: string;
  email: string;
  name: string;
};

export type FanoutRecipients = {
  client: FanoutParty | null;
  clients: FanoutParty[];
  lead: FanoutParty | null;
  leads: FanoutParty[];
  manager: FanoutParty | null;
  /** All PMs (membership + primary). Prefer this over `manager` alone. */
  managers: FanoutParty[];
  /** Firm admins / super admins. */
  admins: FanoutParty[];
  /** Extra CC from the engagement / env (client-facing mail). */
  progressCc?: string[];
};

export type EngagementProcessEvent =
  | 'client_submitted'
  | 'client_uploaded'
  | 'lead_requested_review'
  | 'review_accepted'
  | 'review_rejected'
  | 'delivered'
  | 'unlocked'
  | 'docs_shared'
  | 'board_resolution_shared'
  | 'request_created'
  | 'client_fill_requested'
  | 'client_fill_approved'
  | 'client_fill_declined'
  /* Three-party step approval. */
  | 'step_awaiting_client_approval'
  | 'phase_approved'
  | 'client_change_requested'
  /* The client approved one step (no phase finished yet): the bell only. */
  | 'client_approved_step'
  /* Pre-incorporation direct flow (see `src/lib/incorporation/pre-inc-direct-flow.ts`). */
  | 'step_submitted'
  | 'step_waiting_on_lead'
  | 'step_reopened';

export type StaffEmailTarget = {
  email: string;
  href: string;
  label: 'lead' | 'manager';
};

function uniqueParties(parties: Array<FanoutParty | null | undefined>): FanoutParty[] {
  const out: FanoutParty[] = [];
  const seen = new Set<string>();
  for (const party of parties) {
    if (!party?.userId || seen.has(party.userId)) continue;
    seen.add(party.userId);
    out.push(party);
  }
  return out;
}

export function collectLeadParties(recipients: FanoutRecipients): FanoutParty[] {
  return uniqueParties(
    recipients.leads.length > 0
      ? recipients.leads
      : recipients.lead
        ? [recipients.lead]
        : [],
  );
}

export function collectManagerParties(recipients: FanoutRecipients): FanoutParty[] {
  return uniqueParties(
    recipients.managers.length > 0
      ? recipients.managers
      : recipients.manager
        ? [recipients.manager]
        : [],
  );
}

export function collectAdminParties(recipients: FanoutRecipients): FanoutParty[] {
  return uniqueParties(recipients.admins ?? []);
}

function clientEmailSet(recipients: FanoutRecipients): Set<string> {
  const emails = [
    ...recipients.clients.map((c) => c.email.trim().toLowerCase()),
    recipients.client?.email?.trim().toLowerCase(),
  ].filter((e): e is string => Boolean(e));
  return new Set(emails);
}

/** CC on manager → client approval: firm admins + project leads (not the client). */
export function approvalCcEmails(
  recipients: FanoutRecipients,
  opts?: { excludeEmails?: string[] },
): string[] {
  const exclude = new Set(
    [
      ...clientEmailSet(recipients),
      ...(opts?.excludeEmails ?? []).map((e) => e.trim().toLowerCase()),
    ].filter(Boolean),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (party: FanoutParty | null | undefined) => {
    const addr = party?.email?.trim();
    if (!addr) return;
    const key = addr.toLowerCase();
    if (exclude.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(addr);
  };
  for (const admin of collectAdminParties(recipients)) push(admin);
  for (const lead of collectLeadParties(recipients)) push(lead);
  for (const extra of recipients.progressCc ?? []) {
    const addr = extra.trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/** Client → staff Resend (not Graph). */
export function emailsStaffViaResend(event: EngagementProcessEvent): boolean {
  return (
    event === 'client_submitted' ||
    event === 'client_uploaded' ||
    event === 'lead_requested_review' ||
    event === 'client_fill_requested' ||
    event === 'client_fill_declined' ||
    // Both land on the lead AND the managers, so they go out over Resend
    // rather than a single actor's mailbox.
    event === 'phase_approved' ||
    event === 'client_change_requested' ||
    // A client's direct-flow submit; a staff submit goes to the clients
    // instead (`directFlowEmailPlan`).
    event === 'step_submitted' ||
    event === 'step_waiting_on_lead'
  );
}

/** The board resolution being sent back to the lead: never a client's news. */
export function isBoardResolutionSendBack(event: EngagementProcessEvent, itemId: string): boolean {
  return event === 'review_rejected' && itemId.trim() === 'pre-2';
}

export type DirectFlowEmailPlan = 'staff' | 'clients' | 'none';

/**
 * Who gets mail for a direct-flow event (section 3.13 of the spec):
 * - `step_submitted` by a client → leads and managers (Resend);
 * - `step_submitted` by the lead → the clients, managers on CC;
 * - `step_waiting_on_lead` → leads (Resend);
 * - `step_reopened` → no mail, the bell is enough.
 */
export function directFlowEmailPlan(
  event: EngagementProcessEvent,
  actorRole: string | null | undefined,
): DirectFlowEmailPlan {
  if (event === 'step_submitted') return actorRole === 'client' ? 'staff' : 'clients';
  if (event === 'step_waiting_on_lead') return 'staff';
  return 'none';
}

/**
 * Bell recipients for the direct-flow and board-resolution events. Returns
 * null for every other event (their recipients stay in `notifyEngagementEvent`).
 * The actor is removed by the caller.
 */
export function directFlowBellAudience(
  event: EngagementProcessEvent,
  itemId: string,
): Array<'client' | 'lead' | 'manager' | 'admin'> | null {
  switch (event) {
    case 'step_submitted':
    case 'step_reopened':
      return ['client', 'lead', 'manager', 'admin'];
    case 'step_waiting_on_lead':
      return ['lead', 'manager'];
    case 'board_resolution_shared':
      return ['client', 'lead', 'manager', 'admin'];
    case 'lead_requested_review':
      return itemId.trim() === 'pre-2' ? ['manager', 'admin'] : null;
    case 'review_rejected':
      return itemId.trim() === 'pre-2' ? ['lead'] : null;
    default:
      return null;
  }
}

export type BellAudience = 'client' | 'lead' | 'manager' | 'admin';

export interface BellLine {
  audience: BellAudience;
  title: string;
  body: string;
}

/**
 * Bell rows for the client's approval round: a step handed to the client to
 * approve (the client hears it), and the client's answer — one step approved,
 * a whole phase approved, or a change asked for (the project leads and the
 * managers hear it). These events also mail (except a single-step approval),
 * but before 2026-11-03 none of them reached the bell. Null for every other
 * event. The actor is removed by the caller.
 */
export function approvalBellLines(
  event: EngagementProcessEvent,
  ctx: { company: string; title: string; note?: string | null },
): BellLine[] | null {
  const { company, title } = ctx;
  const note = ctx.note?.trim();
  const staff = (lineTitle: string, body: string): BellLine[] => [
    { audience: 'lead', title: lineTitle, body },
    { audience: 'manager', title: lineTitle, body },
  ];
  switch (event) {
    case 'client_approved_step':
      return staff(`${title} approved`, `${company} approved ${title}.`);
    case 'phase_approved':
      return staff('Phase approved', `${company} approved every step of ${title}.`);
    case 'client_change_requested':
      return staff(
        'Change requested',
        note ? `${company} asked for a change on ${title}: ${note}` : `${company} asked for a change on ${title}.`,
      );
    case 'step_awaiting_client_approval':
      return [{ audience: 'client', title: 'Ready for your approval', body: `${title} is ready for you to check and approve.` }];
    default:
      return null;
  }
}

/** Lead → manager approval asks: Graph from the lead's own mailbox when connected. */
export function sendsFromActorMailbox(event: EngagementProcessEvent): boolean {
  return event === 'lead_requested_review' || event === 'client_fill_requested';
}

/** Lead/manager → client: in-app compose + Graph Mail.Send. */
export function opensClientOutgoingDraft(
  event: EngagementProcessEvent,
  itemId?: string,
): boolean {
  if (itemId && isBoardResolutionSendBack(event, itemId)) return false;
  return (
    event === 'review_accepted' ||
    event === 'review_rejected' ||
    event === 'delivered' ||
    event === 'unlocked' ||
    event === 'docs_shared' ||
    event === 'board_resolution_shared' ||
    event === 'request_created'
  );
}

/**
 * Most events skip the actor so they don't notify themselves.
 * Deliver / board-resolution share also write a Received row for the acting lead.
 */
export function inAppIncludesActor(event: EngagementProcessEvent): boolean {
  return event === 'delivered' || event === 'board_resolution_shared';
}

/**
 * Who should receive Resend process mail.
 * Client submit/upload → every lead + every manager.
 * Intern request-approval → managers only (never Graph, never the client).
 */
export function staffEmailTargetsForEvent(
  event: EngagementProcessEvent,
  recipients: FanoutRecipients,
  hrefs: { leadHref: string; managerHref: string },
): StaffEmailTarget[] {
  if (!emailsStaffViaResend(event)) return [];

  const clientEmails = clientEmailSet(recipients);
  const targets: StaffEmailTarget[] = [];
  const seen = new Set<string>();

  const push = (party: FanoutParty | null | undefined, href: string, label: 'lead' | 'manager') => {
    const addr = party?.email?.trim();
    if (!addr) return;
    const key = addr.toLowerCase();
    if (clientEmails.has(key) || seen.has(key)) return;
    seen.add(key);
    targets.push({ email: addr, href, label });
  };

  if (event !== 'lead_requested_review' && event !== 'client_fill_requested') {
    for (const lead of collectLeadParties(recipients)) {
      push(lead, hrefs.leadHref, 'lead');
    }
  }
  // `phase_approved` and `client_change_requested` fall through to both loops:
  // the lead did the work and the manager approved it, so both need the news.
  // A declined request is the lead's news, not the manager's own; so is the
  // client waiting on the lead's NIC codes.
  if (event !== 'client_fill_declined' && event !== 'step_waiting_on_lead') {
    for (const manager of collectManagerParties(recipients)) {
      push(manager, hrefs.managerHref, 'manager');
    }
  }

  return targets;
}
