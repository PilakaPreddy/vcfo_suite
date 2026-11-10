import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlaDue } from './nightly';

/**
 * The nightly run with every repository mocked: a two-band fall opens one partner check-in, and
 * the SLA ladder sends each level once (a level the database already holds is not sent again).
 */

const ROW = { id: '11111111-1111-4111-8111-111111111111', slug: 'acme', companyName: 'Acme Private Limited', stage: 'Operational Readiness', createdAt: new Date('2026-01-01'), checklistState: {}, schedule: null };
const lead = { id: 'p-lead', name: 'Lata Lead', email: 'lead@x.test' };
const manager = { id: 'p-mgr', name: 'Manu Manager', email: 'mgr@x.test' };
const admin = { id: 'p-adm', name: 'Asha Admin', email: 'adm@x.test' };

const claimed = new Set<string>();
const systemClaimSlaLevel = vi.fn(async (i: { itemKey: string; stageLabel: string; level: string }) => {
  const key = `${i.itemKey}|${i.stageLabel}|${i.level}`;
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
});
const systemSaveHealth = vi.fn();
const createTask = vi.fn(async () => ({ id: 't-1' }));
const createNotificationsForUsers = vi.fn(async (_items: unknown[]) => [] as unknown[]);
const systemSetCheckInTask = vi.fn();

vi.mock('@/db/repositories/client-health', () => ({
  systemClaimSlaLevel: (i: never) => systemClaimSlaLevel(i),
  systemListHealthEngagements: async () => [ROW],
  systemOpenComplianceItems: async () => [],
  systemRawHealthCounts: async () => ({ byEngagement: new Map([[ROW.id, { oldestRequestAt: null, lastClientMessageAt: null, lastClientUploadAt: null, overdueInstances: 5, overdueTasks: 0, overdueEvents: 0, openNotices: 3 }]]), noticesAvailable: true }),
  systemSaveHealth: (...a: unknown[]) => systemSaveHealth(...a),
  systemSentSlaLevels: async () => new Map(),
  systemSetCheckInTask: (...a: unknown[]) => systemSetCheckInTask(...a),
  systemStepEnteredOn: async () => ({}),
}));
vi.mock('@/db/repositories/engagements', () => ({ checklistStateFromRow: () => ({}) }));
vi.mock('@/db/repositories/board-meetings', () => ({ systemMeetingPeople: async () => ({ lead, manager, admin }) }));
vi.mock('@/db/repositories/expiry-items', () => ({ systemStaffContext: async (id: string) => ({ userId: id, email: 'adm@x.test', name: 'Asha Admin', role: 'admin' }) }));
vi.mock('@/db/repositories/notice-cases', () => ({
  systemStaffContacts: async () => [
    { ...lead, role: 'intern' },
    { ...manager, role: 'manager' },
    { ...admin, role: 'admin' },
  ],
}));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (items: unknown[]) => createNotificationsForUsers(items) }));
vi.mock('@/db/repositories/tasks', () => ({ createTask: (...a: unknown[]) => createTask(...(a as [])) }));
vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://app.test' }));

const { computeAllHealth, ladderRecipient, openPartnerCheckIn, runSlaLadder } = await import('./nightly');

beforeEach(() => {
  vi.clearAllMocks();
  claimed.clear();
});

describe('computeAllHealth', () => {
  it('reports a fall of two bands and stores the score', async () => {
    systemSaveHealth.mockResolvedValueOnce({ previousBand: 'good', checkInTaskId: null });
    const out = await computeAllHealth('2026-11-10', new Date('2026-11-10T06:00:00Z'));
    // 5 overdue (32, capped) + 3 notices (18) + silence over 300 days (15) = 65 off.
    expect(systemSaveHealth.mock.calls[0][1]).toMatchObject({ score: 35, band: 'critical' });
    expect(out.falls).toEqual([{ engagementId: ROW.id, companyName: ROW.companyName, from: 'good', to: 'critical', score: 35 }]);
  });

  it('reports nothing on the first run or a one-band fall', async () => {
    systemSaveHealth.mockResolvedValueOnce({ previousBand: null, checkInTaskId: null });
    expect((await computeAllHealth('2026-11-10')).falls).toEqual([]);
    systemSaveHealth.mockResolvedValueOnce({ previousBand: 'at_risk', checkInTaskId: null });
    expect((await computeAllHealth('2026-11-10')).falls).toEqual([]);
  });
});

describe('openPartnerCheckIn', () => {
  it('opens a task for the partner, a bell and one email', async () => {
    const plans = await openPartnerCheckIn({ engagementId: ROW.id, companyName: ROW.companyName, from: 'good', to: 'critical', score: 35 }, '2026-11-10');
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }), expect.objectContaining({ engagementId: ROW.id, assigneeId: admin.id, dueAt: '2026-11-13' }));
    expect(systemSetCheckInTask).toHaveBeenCalledWith(ROW.id, 't-1');
    expect(createNotificationsForUsers).toHaveBeenCalledTimes(1);
    expect(plans.map((p) => p.to)).toEqual([admin.email]);
  });
});

describe('runSlaLadder', () => {
  const due: SlaDue[] = [
    {
      engagementId: ROW.id,
      clock: { itemKey: 'step:pre-2', stage: 'awaiting-client', startedOn: '2026-10-20', slaDays: 5, title: 'Board resolution', stepId: 'pre-2' },
      stageLabel: 'awaiting-client@2026-10-20',
      levels: ['lead', 'manager', 'partner'],
    },
  ];

  it('tells the lead, the manager and the partner with nudge and reassign links', async () => {
    const plans = await runSlaLadder(ROW.id, due, '2026-11-10');
    expect(plans.map((p) => p.to)).toEqual([lead.email, manager.email, admin.email]);
    expect(plans[0].text).toContain('/app/intern/engagements/acme/step/');
    expect(plans[1].text).toContain('/app/manager/mail?');
    expect(plans[2].text).toContain('Reassign: https://app.test/app/admin/projects/acme');
    const bells = createNotificationsForUsers.mock.calls[0][0] as unknown as Array<{ userId: string }>;
    expect(bells.map((b) => b.userId)).toEqual([lead.id, manager.id, admin.id]);
  });

  it('sends each level once, however often it runs', async () => {
    await runSlaLadder(ROW.id, due, '2026-11-10');
    const again = await runSlaLadder(ROW.id, due, '2026-11-10');
    expect(again).toEqual([]);
    expect(createNotificationsForUsers).toHaveBeenCalledTimes(1);
    expect(systemClaimSlaLevel).toHaveBeenCalledTimes(6);
  });

  it('claims every level but tells only the people in send (first sighting: the highest level)', async () => {
    const plans = await runSlaLadder(ROW.id, [{ ...due[0], send: ['partner'] }], '2026-11-10');
    expect(plans.map((p) => p.to)).toEqual([admin.email]);
    expect(systemClaimSlaLevel).toHaveBeenCalledTimes(3);
    const bells = createNotificationsForUsers.mock.calls[0][0] as unknown as Array<{ userId: string }>;
    expect(bells.map((b) => b.userId)).toEqual([admin.id]);
  });

  it('claims a backlog breach and tells nobody', async () => {
    const plans = await runSlaLadder(ROW.id, [{ ...due[0], send: [] }], '2026-11-10');
    expect(plans).toEqual([]);
    expect(systemClaimSlaLevel).toHaveBeenCalledTimes(3);
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });

  it('falls back to the manager when the client has no lead', () => {
    expect(ladderRecipient('lead', { lead: null, manager, admin })).toBe(manager);
    expect(ladderRecipient('manager', { lead, manager: null, admin })).toBe(admin);
    expect(ladderRecipient('partner', { lead, manager, admin: null })).toBeNull();
  });
});
