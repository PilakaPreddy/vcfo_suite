import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * "My day" gathering with every repository replaced: each source becomes the right kind of item,
 * items outside the caller's part are left out, and a failing source never sinks the plan.
 */

const lead: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };
const manager: AuthContext = { userId: 'mgr-1', email: 'm@x.test', name: 'Manager', role: 'manager' };
const admin: AuthContext = { userId: 'adm-1', email: 'a@x.test', name: 'Admin', role: 'admin' };
const NOW = new Date('2026-11-10T04:00:00Z'); // 09:30 in India

const listTasks = vi.fn();
const listDocumentRequests = vi.fn();
const listExpiryItems = vi.fn();
const listNoticeCases = vi.fn();
const listRequestLists = vi.fn();
const pendingApprovals = vi.fn();

vi.mock('@/db/repositories/tasks', () => ({ listTasks: (...a: unknown[]) => listTasks(...a) }));
vi.mock('@/db/repositories/document-requests', () => ({ listDocumentRequests: (...a: unknown[]) => listDocumentRequests(...a) }));
vi.mock('@/db/repositories/expiry-items', () => ({ listExpiryItems: (...a: unknown[]) => listExpiryItems(...a) }));
vi.mock('@/db/repositories/notice-cases', () => ({ listNoticeCases: (...a: unknown[]) => listNoticeCases(...a) }));
vi.mock('@/db/repositories/request-lists', () => ({ listRequestLists: (...a: unknown[]) => listRequestLists(...a) }));
vi.mock('@/lib/ask/tools/staff-data', () => ({ loadStaffData: vi.fn() }));
vi.mock('@/lib/ask/tools/staff', () => ({
  routeKey: (e: { engagement: { slug?: string; id: string } }) => e.engagement.slug || e.engagement.id,
  pendingApprovals: (...a: unknown[]) => pendingApprovals(...a),
}));

const { gatherMyDay, gatherMyDayItems, stalledDays } = await import('./gather');

const data = {
  now: NOW,
  engagements: [{ dbId: 'db-1', engagement: { id: 'db-1', slug: 'acme', companyName: 'Acme Pvt Ltd' }, state: {} }],
  filings: [
    { id: 'f-late', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', compliance: 'GST', particular: 'GSTR-3B', dueDate: '2026-11-07', filedOn: null, periodLabel: 'Oct 2026' },
    { id: 'f-today', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', compliance: 'TDS', particular: 'TDS payment', dueDate: '2026-11-10', filedOn: null, periodLabel: null },
    { id: 'f-filed', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', compliance: 'GST', particular: 'GSTR-1', dueDate: '2026-11-01', filedOn: '2026-11-01', periodLabel: null },
    { id: 'f-later', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', compliance: 'ROC', particular: 'AOC-4', dueDate: '2026-11-30', filedOn: null, periodLabel: null },
  ],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  listTasks.mockResolvedValue([
    { id: 't-mine', engagementId: 'db-1', checklistKey: '', status: 'in-progress', assigneeId: 'lead-1', dueAt: '2026-11-09T06:00:00Z', title: 'Draft MOA' },
    { id: 't-other', engagementId: 'db-1', checklistKey: '', status: 'in-progress', assigneeId: 'someone', title: 'Not mine' },
    { id: 't-open', engagementId: 'db-1', checklistKey: '', status: 'not-started', title: 'Unassigned', updatedAt: '2026-11-05T06:00:00Z' },
    { id: 't-done', engagementId: 'db-1', checklistKey: '', status: 'completed', assigneeId: 'lead-1', title: 'Done' },
  ]);
  listDocumentRequests.mockResolvedValue([
    { id: 'd-up', engagementId: 'db-1', taskId: '', label: 'PAN card', status: 'uploaded', requestedBy: '' },
    { id: 'd-pend', engagementId: 'db-1', taskId: '', label: 'Rent deed', status: 'pending', requestedBy: '' },
  ]);
  listExpiryItems.mockResolvedValue([
    { id: 'x-soon', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', kindLabel: 'DSC', subjectName: 'R. Shah', expiresOn: '2026-11-13', daysLeft: 3, renewedAt: null },
    { id: 'x-gone', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', kindLabel: 'Trade licence', subjectName: 'Acme', expiresOn: '2026-11-08', daysLeft: -2, renewedAt: null },
  ]);
  listNoticeCases.mockResolvedValue([
    { id: 'n-near', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', label: 'GST notice u/s 61', responseDueOn: '2026-11-12', daysLeft: 2, open: true, ownerId: 'other' },
    { id: 'n-far', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', label: 'IT notice', responseDueOn: '2026-12-30', daysLeft: 50, open: true, ownerId: null },
  ]);
  listRequestLists.mockResolvedValue([
    { id: 'r-stalled', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', title: 'GST October', status: 'sent', dueOn: null, lastRemindedAt: null, firstSentAt: '2026-11-01T05:00:00Z', progress: { total: 4, done: 2, percent: 50 } },
    { id: 'r-fresh', engagementId: 'db-1', companyName: 'Acme Pvt Ltd', title: 'TDS Q2', status: 'sent', dueOn: null, lastRemindedAt: '2026-11-09T05:00:00Z', firstSentAt: '2026-11-02T05:00:00Z', progress: { total: 4, done: 0, percent: 0 } },
  ]);
  pendingApprovals.mockReturnValue([
    { engagementId: 'acme', company: 'Acme Pvt Ltd', stepId: 'pre-1', stepTitle: 'Name approval', kind: 'client_submit', daysWaiting: 2 },
    { engagementId: 'acme', company: 'Acme Pvt Ltd', stepId: 'pre-2', stepTitle: 'Board resolution', kind: 'board_resolution', daysWaiting: 1 },
  ]);
});

describe('gatherMyDayItems for a lead', () => {
  it('turns each source into the right kind of item and leaves the rest out', async () => {
    const items = await gatherMyDayItems(lead, { now: NOW, data });
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));

    expect(byId['filing:f-late']).toMatchObject({ kind: 'overdue', weight: 3, engagementId: 'acme', href: '/app/intern/compliances/filings' });
    expect(byId['filing:f-today']).toMatchObject({ kind: 'due_today', weight: 0 });
    expect(byId['filing:f-filed']).toBeUndefined();
    expect(byId['filing:f-later']).toBeUndefined();

    expect(byId['task:t-mine']).toMatchObject({ kind: 'overdue', weight: 1, href: '/app/intern/tasks' });
    expect(byId['task:t-open']).toMatchObject({ kind: 'task', weight: 5 });
    expect(byId['task:t-other']).toBeUndefined();
    expect(byId['task:t-done']).toBeUndefined();

    // A lead reviews the client's submission but does not decide a board resolution.
    expect(byId['step:acme:pre-1']).toMatchObject({ kind: 'client_reply', weight: 2 });
    expect(byId['step:acme:pre-2']).toBeUndefined();

    expect(byId['docreq:d-up']).toMatchObject({ kind: 'client_reply', href: '/app/intern/requests' });
    expect(byId['docreq:d-pend']).toBeUndefined();

    expect(byId['expiry:x-soon']).toMatchObject({ kind: 'expiry', weight: 4, href: '/app/intern/compliances/expiries' });
    expect(byId['expiry:x-gone']).toMatchObject({ kind: 'overdue', weight: 2 });

    expect(byId['notice:n-near']).toMatchObject({ kind: 'notice', weight: 5, href: '/app/intern/compliances/notices' });
    expect(byId['notice:n-far']).toBeUndefined();

    expect(byId['reqlist:r-stalled']).toMatchObject({ kind: 'request_list', weight: 9, href: '/app/intern/requests' });
    expect(byId['reqlist:r-fresh']).toBeUndefined();
  });

  it('reads every source with the caller’s own context', async () => {
    await gatherMyDayItems(lead, { now: NOW, data });
    for (const fn of [listTasks, listDocumentRequests, listExpiryItems, listNoticeCases, listRequestLists]) {
      expect(fn.mock.calls[0]![0]).toBe(lead);
    }
    expect(listExpiryItems.mock.calls[0]![1]).toEqual({ withinDays: 7 });
    expect(listNoticeCases.mock.calls[0]![1]).toEqual({ open: true });
  });

  it('ranks the plan: overdue by days late first, then due today, and so on', async () => {
    const ranked = await gatherMyDay(lead, { now: NOW, data });
    expect(ranked.map((r) => r.id)).toEqual([
      'filing:f-late',
      'expiry:x-gone',
      'task:t-mine',
      'filing:f-today',
      'step:acme:pre-1',
      'docreq:d-up',
      'expiry:x-soon',
      'notice:n-near',
      'reqlist:r-stalled',
      'task:t-open',
    ]);
  });

  it('keeps the other sources when one fails', async () => {
    listNoticeCases.mockRejectedValue(new Error('relation does not exist'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const items = await gatherMyDayItems(lead, { now: NOW, data });
    expect(items.some((i) => i.kind === 'notice')).toBe(false);
    expect(items.some((i) => i.id === 'filing:f-late')).toBe(true);
    warn.mockRestore();
  });
});

describe('gatherMyDayItems for managers and admins', () => {
  it('gives a manager approvals and links to the manager pages', async () => {
    const items = await gatherMyDayItems(manager, { now: NOW, data });
    const approval = items.find((i) => i.id === 'step:acme:pre-2');
    expect(approval).toMatchObject({ kind: 'approval', href: '/app/manager/projects/acme/step/' + approval!.href.split('/step/')[1] });
    expect(items.find((i) => i.id === 'filing:f-late')!.href).toBe('/app/manager/compliances/filings');
    // Unassigned tasks are a lead's; a manager sees only tasks assigned to them.
    expect(items.find((i) => i.id === 'task:t-open')).toBeUndefined();
  });

  it('leaves out a notice another person owns for a firm-wide admin', async () => {
    const items = await gatherMyDayItems(admin, { now: NOW, data });
    expect(items.find((i) => i.id === 'notice:n-near')).toBeUndefined();
    expect(items.find((i) => i.id === 'filing:f-late')!.href).toBe('/app/admin/compliances/filings');
  });
});

describe('stalledDays', () => {
  it('counts a list past its due date even when recently reminded', () => {
    expect(
      stalledDays({ status: 'sent', dueOn: '2026-11-08', lastRemindedAt: '2026-11-09T05:00:00Z', firstSentAt: null, progress: { percent: 10 } }, '2026-11-10'),
    ).toBe(1);
  });
  it('ignores complete, draft and fully received lists', () => {
    expect(stalledDays({ status: 'complete', dueOn: '2026-11-01', lastRemindedAt: null, firstSentAt: null, progress: { percent: 100 } }, '2026-11-10')).toBeNull();
    expect(stalledDays({ status: 'sent', dueOn: '2026-11-01', lastRemindedAt: null, firstSentAt: null, progress: { percent: 100 } }, '2026-11-10')).toBeNull();
  });
});
