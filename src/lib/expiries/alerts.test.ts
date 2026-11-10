import { beforeEach, describe, expect, it, vi } from 'vitest';

const claim = vi.fn();
const ensureDraft = vi.fn();
const finish = vi.fn();
const setTask = vi.fn();
const staffCtx = vi.fn();
const people = vi.fn();
const getFilings = vi.fn();
const createTask = vi.fn();
const notify = vi.fn();
vi.mock('@/db/repositories/expiry-items', () => ({
  systemClaimExpiryAlert: (...a: unknown[]) => claim(...a),
  systemEnsureRenewalRequestDraft: (...a: unknown[]) => ensureDraft(...a),
  systemFinishExpiryAlert: (...a: unknown[]) => finish(...a),
  systemSetExpiryAlertTask: (...a: unknown[]) => setTask(...a),
  systemStaffContext: (...a: unknown[]) => staffCtx(...a),
}));
vi.mock('@/db/repositories/board-meetings', () => ({ systemMeetingPeople: (...a: unknown[]) => people(...a) }));
vi.mock('@/db/repositories/filings', () => ({ getFilings: (...a: unknown[]) => getFilings(...a) }));
vi.mock('@/db/repositories/tasks', () => ({ createTask: (...a: unknown[]) => createTask(...a) }));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://app.test' }));

const { runExpiryAlert } = await import('./alerts');

const ITEM = { id: 'x-1', engagementId: 'eng-1', companyName: 'Acme', kind: 'dsc', kindLabel: 'DSC', subjectName: 'Ravi Kumar', referenceLabel: null, expiresOn: '2026-11-14' };
const LEAD = { id: 'p-lead', name: 'Lia Lead', email: 'lia@sbc.test' };
const MANAGER = { id: 'p-man', name: 'Max Manager', email: 'max@sbc.test' };

beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue({ item: ITEM, engagement: { id: 'eng-1' }, alertId: 'al-1', taskId: null });
  people.mockResolvedValue({ lead: LEAD, manager: MANAGER, admin: null });
  staffCtx.mockImplementation(async (id: string) => (id === LEAD.id ? { userId: LEAD.id, role: 'intern' } : id === MANAGER.id ? { userId: MANAGER.id, role: 'manager' } : null));
  getFilings.mockResolvedValue({ rows: [{ particular: 'AOC-4', dueDate: '2026-11-29', filedOn: null }] });
  createTask.mockResolvedValue({ id: 't-1' });
});

describe('runExpiryAlert', () => {
  it('opens a task and a draft request as the lead, tells lead and manager at T-7, and flags the filing', async () => {
    const plans = await runExpiryAlert('x-1', 7, '2026-11-09');
    expect(createTask).toHaveBeenCalledWith({ userId: LEAD.id, role: 'intern' }, expect.objectContaining({ engagementId: 'eng-1', assigneeId: LEAD.id, dueAt: '2026-11-14' }));
    expect(setTask).toHaveBeenCalledWith('al-1', 't-1');
    expect(ensureDraft).toHaveBeenCalledWith('x-1', expect.objectContaining({ dueOn: '2026-11-14' }));
    const bells = notify.mock.calls[0]![0] as Array<{ userId: string; href: string; body: string }>;
    expect(bells.map((b) => [b.userId, b.href])).toEqual([
      [LEAD.id, '/app/intern/compliances/expiries'],
      [MANAGER.id, '/app/manager/compliances/expiries'],
    ]);
    expect(bells[0]!.body).toContain('It lapses before AOC-4 due 29 Nov 2026');
    expect(finish).toHaveBeenCalledWith('x-1', 7);
    expect(plans.map((p) => p.to)).toEqual([LEAD.email, MANAGER.email]);
  });

  it('tells only the lead at T-30 and does not reopen a task a retry already opened', async () => {
    claim.mockResolvedValue({ item: { ...ITEM, expiresOn: '2026-12-01' }, engagement: { id: 'eng-1' }, alertId: 'al-1', taskId: 't-1' });
    const plans = await runExpiryAlert('x-1', 30, '2026-11-09');
    expect(createTask).not.toHaveBeenCalled();
    expect(plans.map((p) => p.profileId)).toEqual([LEAD.id]);
  });

  it('does nothing when the stage was already finished', async () => {
    claim.mockResolvedValue(null);
    expect(await runExpiryAlert('x-1', 7, '2026-11-09')).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });
});
