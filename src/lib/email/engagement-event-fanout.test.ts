import { describe, expect, it } from 'vitest';
import {
  approvalBellLines,
  approvalCcEmails,
  collectManagerParties,
  directFlowBellAudience,
  directFlowEmailPlan,
  emailsStaffViaResend,
  isBoardResolutionSendBack,
  inAppIncludesActor,
  opensClientOutgoingDraft,
  sendsFromActorMailbox,
  staffEmailTargetsForEvent,
  type FanoutRecipients,
} from './engagement-event-fanout';

const lead = { userId: 'lead-1', email: 'intern@vcfo.local', name: 'Lead' };
const manager = { userId: 'mgr-1', email: 'manager@vcfo.local', name: 'PM' };
const coManager = { userId: 'mgr-2', email: 'comgr@vcfo.local', name: 'Co-PM' };
const client = { userId: 'cli-1', email: 'client@vcfo.local', name: 'Client' };

const hrefs = { leadHref: '/app/intern/step', managerHref: '/app/manager/step' };

function recipients(partial: Partial<FanoutRecipients> = {}): FanoutRecipients {
  return {
    client,
    clients: [client],
    lead,
    leads: [lead],
    manager,
    managers: [manager],
    admins: [],
    ...partial,
  };
}

describe('staffEmailTargetsForEvent', () => {
  it('emails lead and manager on client submit', () => {
    const targets = staffEmailTargetsForEvent('client_submitted', recipients(), hrefs);
    expect(targets.map((t) => t.label).sort()).toEqual(['lead', 'manager']);
    expect(targets.map((t) => t.email).sort()).toEqual([
      'intern@vcfo.local',
      'manager@vcfo.local',
    ]);
    expect(targets.find((t) => t.label === 'manager')?.href).toBe(hrefs.managerHref);
  });

  it('includes co-managers from membership even when primary manager is null', () => {
    const targets = staffEmailTargetsForEvent(
      'client_submitted',
      recipients({ manager: null, managers: [coManager, manager] }),
      hrefs,
    );
    expect(targets.filter((t) => t.label === 'manager').map((t) => t.email).sort()).toEqual([
      'comgr@vcfo.local',
      'manager@vcfo.local',
    ]);
  });

  it('still emails the manager when there is no lead', () => {
    const targets = staffEmailTargetsForEvent(
      'client_submitted',
      recipients({ lead: null, leads: [] }),
      hrefs,
    );
    expect(targets).toEqual([
      { email: 'manager@vcfo.local', href: hrefs.managerHref, label: 'manager' },
    ]);
  });

  it('does not treat a client address as staff', () => {
    const targets = staffEmailTargetsForEvent(
      'client_submitted',
      recipients({
        manager: { ...manager, email: client.email },
        managers: [{ ...manager, email: client.email }],
      }),
      hrefs,
    );
    expect(targets.map((t) => t.label)).toEqual(['lead']);
  });

  it('emails only managers when a lead requests manager approval', () => {
    const targets = staffEmailTargetsForEvent('lead_requested_review', recipients(), hrefs);
    expect(targets).toEqual([
      { email: 'manager@vcfo.local', href: hrefs.managerHref, label: 'manager' },
    ]);
  });

  it('emails only managers when a lead asks to send a step to the client', () => {
    const targets = staffEmailTargetsForEvent('client_fill_requested', recipients(), hrefs);
    expect(targets).toEqual([
      { email: 'manager@vcfo.local', href: hrefs.managerHref, label: 'manager' },
    ]);
  });

  it('emails only leads when the manager declines that ask', () => {
    const targets = staffEmailTargetsForEvent('client_fill_declined', recipients(), hrefs);
    expect(targets).toEqual([
      { email: 'intern@vcfo.local', href: hrefs.leadHref, label: 'lead' },
    ]);
  });

  it('sends nothing to staff on approval — that mail goes to the client', () => {
    expect(staffEmailTargetsForEvent('client_fill_approved', recipients(), hrefs)).toEqual([]);
  });
});

describe('collectManagerParties', () => {
  it('falls back to primary manager when managers[] is empty', () => {
    expect(collectManagerParties(recipients({ managers: [] })).map((p) => p.userId)).toEqual([
      'mgr-1',
    ]);
  });
});

describe('approvalCcEmails', () => {
  const admin = { userId: 'adm-1', email: 'admin@sbcllp.in', name: 'Admin' };

  it('CCs firm admins and leads, not the client', () => {
    expect(
      approvalCcEmails(
        recipients({
          admins: [admin],
        }),
      ).sort(),
    ).toEqual(['admin@sbcllp.in', 'intern@vcfo.local']);
  });

  it('drops excluded addresses', () => {
    expect(
      approvalCcEmails(recipients({ admins: [admin] }), {
        excludeEmails: ['intern@vcfo.local'],
      }),
    ).toEqual(['admin@sbcllp.in']);
  });

  it('includes engagement progress CC addresses', () => {
    expect(
      approvalCcEmails(
        recipients({
          admins: [admin],
          progressCc: ['extra@sbcllp.in', 'intern@vcfo.local'],
        }),
      ).sort(),
    ).toEqual(['admin@sbcllp.in', 'extra@sbcllp.in', 'intern@vcfo.local']);
  });
});

describe('channel rules', () => {
  it('uses Resend for client→staff and intern→manager, Graph compose for staff→client', () => {
    expect(emailsStaffViaResend('client_submitted')).toBe(true);
    expect(emailsStaffViaResend('lead_requested_review')).toBe(true);
    expect(opensClientOutgoingDraft('client_submitted')).toBe(false);
    expect(opensClientOutgoingDraft('lead_requested_review')).toBe(false);
    expect(opensClientOutgoingDraft('review_accepted')).toBe(true);
    expect(opensClientOutgoingDraft('board_resolution_shared')).toBe(true);
    expect(emailsStaffViaResend('review_accepted')).toBe(false);
    expect(emailsStaffViaResend('board_resolution_shared')).toBe(false);
  });

  it('routes client-fill mail: staff Resend for ask/decline, direct send on approval', () => {
    expect(emailsStaffViaResend('client_fill_requested')).toBe(true);
    expect(emailsStaffViaResend('client_fill_declined')).toBe(true);
    expect(emailsStaffViaResend('client_fill_approved')).toBe(false);
    expect(opensClientOutgoingDraft('client_fill_approved')).toBe(false);
  });

  it('sends the lead→manager ask from the lead mailbox', () => {
    expect(sendsFromActorMailbox('client_fill_requested')).toBe(true);
    expect(sendsFromActorMailbox('lead_requested_review')).toBe(true);
    expect(sendsFromActorMailbox('client_submitted')).toBe(false);
  });

  it('writes a Received row for the acting lead on deliver and board-resolution share', () => {
    expect(inAppIncludesActor('delivered')).toBe(true);
    expect(inAppIncludesActor('board_resolution_shared')).toBe(true);
    expect(inAppIncludesActor('client_submitted')).toBe(false);
    expect(inAppIncludesActor('lead_requested_review')).toBe(false);
  });
});

describe('pre-incorporation direct flow notifications (section 3.13)', () => {
  const table: Array<{
    event: Parameters<typeof directFlowBellAudience>[0];
    itemId: string;
    actorRole: string;
    bell: string[];
    email: 'staff' | 'clients' | 'none';
  }> = [
    { event: 'step_submitted', itemId: 'pre-13', actorRole: 'client', bell: ['client', 'lead', 'manager', 'admin'], email: 'staff' },
    { event: 'step_submitted', itemId: 'pre-13', actorRole: 'intern', bell: ['client', 'lead', 'manager', 'admin'], email: 'clients' },
    { event: 'step_waiting_on_lead', itemId: 'pre-1', actorRole: 'client', bell: ['lead', 'manager'], email: 'staff' },
    { event: 'step_reopened', itemId: 'pre-13', actorRole: 'manager', bell: ['client', 'lead', 'manager', 'admin'], email: 'none' },
    { event: 'lead_requested_review', itemId: 'pre-2', actorRole: 'intern', bell: ['manager', 'admin'], email: 'none' },
    { event: 'board_resolution_shared', itemId: 'pre-2', actorRole: 'manager', bell: ['client', 'lead', 'manager', 'admin'], email: 'none' },
    { event: 'review_rejected', itemId: 'pre-2', actorRole: 'manager', bell: ['lead'], email: 'none' },
  ];

  it.each(table)('$event on $itemId by $actorRole', ({ event, itemId, actorRole, bell, email }) => {
    expect(directFlowBellAudience(event, itemId)).toEqual(bell);
    expect(directFlowEmailPlan(event, actorRole)).toBe(email);
  });

  it('a client submit emails leads and managers; waiting-on-lead emails leads only', () => {
    const submitted = staffEmailTargetsForEvent('step_submitted', recipients(), hrefs);
    expect(submitted.map((t) => t.label).sort()).toEqual(['lead', 'manager']);
    const waiting = staffEmailTargetsForEvent('step_waiting_on_lead', recipients(), hrefs);
    expect(waiting.map((t) => t.label)).toEqual(['lead']);
  });

  it('sending the board resolution back never reaches the client', () => {
    expect(isBoardResolutionSendBack('review_rejected', 'pre-2')).toBe(true);
    expect(opensClientOutgoingDraft('review_rejected', 'pre-2')).toBe(false);
    expect(directFlowBellAudience('review_rejected', 'pre-2')).not.toContain('client');
    // Other steps keep the client correction mail.
    expect(opensClientOutgoingDraft('review_rejected', 'post-1')).toBe(true);
  });

  it('leaves events outside the direct flow on their old rules', () => {
    expect(directFlowBellAudience('client_submitted', 'post-1')).toBeNull();
    expect(directFlowBellAudience('lead_requested_review', 'post-1')).toBeNull();
    expect(directFlowBellAudience('review_rejected', 'post-1')).toBeNull();
  });
});

describe('approvalBellLines', () => {
  const ctx = { company: 'Quarry Digital', title: 'Signed Board Resolution' };

  it('tells the leads and the managers when the client approves a step', () => {
    expect(approvalBellLines('client_approved_step', ctx)).toEqual([
      { audience: 'lead', title: 'Signed Board Resolution approved', body: 'Quarry Digital approved Signed Board Resolution.' },
      { audience: 'manager', title: 'Signed Board Resolution approved', body: 'Quarry Digital approved Signed Board Resolution.' },
    ]);
  });

  it('tells the leads and the managers about a phase approval and a change request', () => {
    expect(approvalBellLines('phase_approved', { ...ctx, title: 'Phase 1' })?.map((l) => l.audience)).toEqual([
      'lead',
      'manager',
    ]);
    const change = approvalBellLines('client_change_requested', { ...ctx, note: 'Wrong date' });
    expect(change?.[0]).toEqual({
      audience: 'lead',
      title: 'Change requested',
      body: 'Quarry Digital asked for a change on Signed Board Resolution: Wrong date',
    });
  });

  it('tells the client when a step is ready for their approval', () => {
    expect(approvalBellLines('step_awaiting_client_approval', ctx)).toEqual([
      { audience: 'client', title: 'Ready for your approval', body: 'Signed Board Resolution is ready for you to check and approve.' },
    ]);
  });

  it('leaves every other event to its own rules', () => {
    expect(approvalBellLines('client_submitted', ctx)).toBeNull();
    expect(approvalBellLines('step_submitted', ctx)).toBeNull();
  });
});
