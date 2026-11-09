import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { Engagement } from '@/data/engagements';
import type { StaffData } from '@/lib/ask/tools/staff';

const listTasks = vi.fn();
const listDocumentRequests = vi.fn();
const listMeetings = vi.fn();
const listBatches = vi.fn();
const listBudgets = vi.fn();
const listDocuments = vi.fn();
vi.mock('@/db/repositories/tasks', () => ({ listTasks: (...a: unknown[]) => listTasks(...a) }));
vi.mock('@/db/repositories/document-requests', () => ({ listDocumentRequests: (...a: unknown[]) => listDocumentRequests(...a) }));
vi.mock('@/db/repositories/board-meetings/meetings', () => ({ listMeetings: (...a: unknown[]) => listMeetings(...a) }));
vi.mock('@/db/repositories/labour-registers', () => ({ listBatches: (...a: unknown[]) => listBatches(...a) }));
vi.mock('@/db/repositories/budgets/budgets', () => ({ listBudgets: (...a: unknown[]) => listBudgets(...a) }));
vi.mock('@/db/repositories/documents', () => ({ listDocuments: (...a: unknown[]) => listDocuments(...a) }));

const { mySteps, stuckProjects, STAFF_AREA_TOOLS } = await import('@/lib/ask/tools/staff-areas');

const lead: AuthContext = { userId: 'u-lead', email: 'l@x.test', name: 'Sasi', role: 'intern' };

function eng(id: string, name: string, state: StaffData['engagements'][number]['state'] = {}): StaffData['engagements'][number] {
  return {
    dbId: `db-${id}`,
    engagement: { id, slug: id, companyName: name, stage: 'Pre-Incorporation', health: 'on-track' } as Engagement,
    state,
  };
}

const data: StaffData = {
  engagements: [
    eng('routeware', 'Routeware Private Limited'),
    eng('trial', 'Trial Private Ltd', { 'pre-1': { status: 'overdue' } }),
  ],
  filings: [],
  now: new Date('2026-11-09'),
};

beforeEach(() => vi.clearAllMocks());

describe('stuckProjects', () => {
  it('names the stuck client and its overdue step, the way the Today chip does', () => {
    const trial = stuckProjects(data).find((r) => r.company === 'Trial Private Ltd');
    expect(trial?.reason).toBe('Blocked');
    expect(trial?.overdueSteps.length).toBe(1);
  });

  it('narrows to one company and reports an unknown one', async () => {
    const out = (await STAFF_AREA_TOOLS.listStuck!.run({ ctx: lead, data }, { company: 'trial' })) as { count: number };
    expect(out.count).toBe(1);
    expect(await STAFF_AREA_TOOLS.listStuck!.run({ ctx: lead, data }, { company: 'Nobody Ltd' })).toEqual({ error: 'no_match' });
  });
});

describe('mySteps', () => {
  it('lists only steps the firm side owns', () => {
    const rows = mySteps(data);
    for (const row of rows) expect(row.company).toMatch(/Routeware|Trial/);
    expect(rows.every((r) => r.status !== 'completed')).toBe(true);
  });
});

describe('area tools read through the scoped repositories as the caller', () => {
  it('lists open tasks with the company name, and only the caller\'s when asked', async () => {
    listTasks.mockResolvedValue([
      { id: 't1', engagementId: 'db-routeware', checklistKey: 'x', title: 'Call bank', status: 'in-progress', assigneeId: 'u-lead' },
      { id: 't2', engagementId: 'db-trial', checklistKey: 'y', title: 'Chase NOC', status: 'not-started', assigneeId: 'u-other' },
      { id: 't3', engagementId: 'db-trial', checklistKey: 'z', title: 'Done one', status: 'completed', assigneeId: 'u-lead' },
    ]);
    const all = (await STAFF_AREA_TOOLS.listTasks!.run({ ctx: lead, data }, {})) as { count: number; top: Array<{ company: string }> };
    expect(listTasks).toHaveBeenCalledWith(lead);
    expect(all.count).toBe(2);
    expect(all.top[0]!.company).toBe('Routeware Private Limited');
    const mine = (await STAFF_AREA_TOOLS.listTasks!.run({ ctx: lead, data }, { mine: true })) as { count: number };
    expect(mine.count).toBe(1);
  });

  it('turns a refused read into not_available', async () => {
    listBatches.mockRejectedValue(new Error('not permitted'));
    expect(await STAFF_AREA_TOOLS.listLabourRegisters!.run({ ctx: lead, data }, {})).toEqual({ error: 'not_available' });
  });

  it('needs a known company for the vault and never returns file keys', async () => {
    listDocuments.mockResolvedValue([
      { id: 'd1', engagementId: 'db-trial', fileName: 'noc.pdf', objectKey: 'secret/key', category: 'KYC', stepId: null, sharedWithClient: false, reviewStatus: 'pending', createdAt: '2026-11-01T00:00:00Z' },
    ]);
    expect(await STAFF_AREA_TOOLS.listVaultDocuments!.run({ ctx: lead, data }, { company: 'nobody' })).toEqual({ error: 'no_match' });
    const out = await STAFF_AREA_TOOLS.listVaultDocuments!.run({ ctx: lead, data }, { company: 'Trial' });
    expect(listDocuments).toHaveBeenCalledWith(lead, 'db-trial');
    expect(JSON.stringify(out)).not.toContain('secret/key');
  });
});
