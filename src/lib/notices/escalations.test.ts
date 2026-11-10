import { beforeEach, describe, expect, it, vi } from 'vitest';

const systemListEscalationCandidates = vi.fn();
const systemClaimEscalation = vi.fn();
const systemStaffContacts = vi.fn();
const systemMeetingPeople = vi.fn();
const createNotificationsForUsers = vi.fn();
vi.mock('@/db/repositories/notice-cases', () => ({
  systemListEscalationCandidates: (...a: unknown[]) => systemListEscalationCandidates(...a),
  systemClaimEscalation: (...a: unknown[]) => systemClaimEscalation(...a),
  systemStaffContacts: (...a: unknown[]) => systemStaffContacts(...a),
}));
vi.mock('@/db/repositories/board-meetings', () => ({ systemMeetingPeople: (...a: unknown[]) => systemMeetingPeople(...a) }));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (...a: unknown[]) => createNotificationsForUsers(...a) }));
vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://app.test' }));

const { escalationRecipients, planNoticeEscalations, runNoticeEscalation } = await import('./escalations');

const TODAY = '2026-11-10';
const person = (id: string, role = 'intern') => ({ id, name: `${id} name`, email: `${id}@x.test`, role });

function candidate(over: Record<string, unknown> = {}, last: { lastEscalation?: string | null; lastEscalationDueOn?: string | null } = {}) {
  const responseDueOn = (over.responseDueOn as string) ?? '2026-11-12';
  return {
    item: { id: 'n-1', engagementId: 'e-1', companyName: 'Acme', stage: 'received', responseDueOn, daysLeft: 2, ownerId: 'owner', ownerName: 'Owner', label: 'GST notice u/s 73', demandAmount: null, hearingOn: null, ...over },
    engagement: { id: 'e-1' },
    lastEscalation: last.lastEscalation ?? null,
    lastEscalationDueOn: last.lastEscalationDueOn ?? null,
  };
}

beforeEach(() => {
  for (const m of [systemListEscalationCandidates, systemClaimEscalation, systemStaffContacts, systemMeetingPeople, createNotificationsForUsers]) m.mockReset();
});

describe('escalationRecipients', () => {
  const people = { owner: person('owner'), lead: person('lead'), manager: person('mgr', 'manager'), admin: person('adm', 'admin') };
  it('reaches the owner and manager before the date, and the partner too after it', () => {
    expect(escalationRecipients('t7', people).map((p) => p.id)).toEqual(['owner', 'mgr']);
    expect(escalationRecipients('overdue', people).map((p) => p.id)).toEqual(['owner', 'mgr', 'adm']);
  });
  it('falls back to the lead without an owner, and never repeats a person', () => {
    expect(escalationRecipients('t2', { ...people, owner: null }).map((p) => p.id)).toEqual(['lead', 'mgr']);
    expect(escalationRecipients('overdue', { owner: person('mgr', 'manager'), lead: null, manager: person('mgr', 'manager'), admin: person('mgr', 'manager') }).map((p) => p.id)).toEqual(['mgr']);
  });
});

describe('planNoticeEscalations', () => {
  it('plans only the cases with a stage due today', async () => {
    systemListEscalationCandidates.mockResolvedValue([
      candidate({ id: 'a', responseDueOn: '2026-11-12' }),
      candidate({ id: 'b', responseDueOn: '2026-11-12' }, { lastEscalation: 't2', lastEscalationDueOn: '2026-11-12' }),
      candidate({ id: 'c', responseDueOn: '2026-11-05' }),
      candidate({ id: 'd', responseDueOn: '2026-11-05', stage: 'submitted' }),
    ]);
    expect(await planNoticeEscalations(TODAY)).toEqual([
      { caseId: 'a', escalation: 't2', dueOn: '2026-11-12' },
      { caseId: 'c', escalation: 'overdue', dueOn: '2026-11-05' },
    ]);
  });
});

describe('runNoticeEscalation', () => {
  it('claims the stage, rings the bells and plans the emails', async () => {
    systemListEscalationCandidates.mockResolvedValue([candidate({ responseDueOn: '2026-11-05', daysLeft: -5 })]);
    systemClaimEscalation.mockResolvedValue(true);
    systemMeetingPeople.mockResolvedValue({ lead: person('lead'), manager: person('mgr'), admin: person('adm') });
    systemStaffContacts.mockResolvedValue([person('owner'), person('lead'), person('mgr', 'manager'), person('adm', 'admin')]);
    const plans = await runNoticeEscalation({ caseId: 'n-1', escalation: 'overdue', dueOn: '2026-11-05' }, TODAY);
    expect(systemClaimEscalation).toHaveBeenCalledWith('n-1', 'overdue', '2026-11-05');
    expect(createNotificationsForUsers.mock.calls[0]![0].map((n: { userId: string }) => n.userId)).toEqual(['owner', 'mgr', 'adm']);
    expect(plans.map((p) => p.to)).toEqual(['owner@x.test', 'mgr@x.test', 'adm@x.test']);
    expect(plans[1]!.text).toContain('/app/manager/compliances/notices?case=n-1');
    expect(plans[0]!.subject).toMatch(/^Overdue notice reply/);
  });

  it('does nothing when another run already claimed it', async () => {
    systemListEscalationCandidates.mockResolvedValue([candidate()]);
    systemClaimEscalation.mockResolvedValue(false);
    expect(await runNoticeEscalation({ caseId: 'n-1', escalation: 't2', dueOn: '2026-11-12' }, TODAY)).toEqual([]);
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });

  it('does nothing when the due date moved since the plan', async () => {
    systemListEscalationCandidates.mockResolvedValue([candidate({ responseDueOn: '2026-11-15' })]);
    expect(await runNoticeEscalation({ caseId: 'n-1', escalation: 't2', dueOn: '2026-11-12' }, TODAY)).toEqual([]);
    expect(systemClaimEscalation).not.toHaveBeenCalled();
  });
});
