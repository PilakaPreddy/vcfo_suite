import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import { answerEnvelopeSchema, CLIENT_VISUAL_TYPES, type AskShell } from '@/data/ask/schema';
import { sanitizeLinks } from '@/lib/ask/destinations';
import { resolveHref } from '@/lib/ask/resolve-href';

/**
 * Every metric, against its repository boundary. Which rows a role may see is the repositories'
 * job and is tested there and in `ask-metrics.test.ts`; what is proved here is that a metric always
 * reads as the caller, narrows to the named company, and never lets a row outside that company
 * into a client's answer.
 */

const NOW = new Date('2026-11-06T06:00:00Z');

const loadStaffEngagements = vi.fn();
const getFilings = vi.fn();
const listOpenRequestsForMetrics = vi.fn();
const listOpenTasksForMetrics = vi.fn();
const listDocumentsPendingReview = vi.fn();
const listOpenInvoicesForMetrics = vi.fn();
const listAnnouncements = vi.fn();
const listMeetings = vi.fn();
const listBatches = vi.fn();
const getPeopleMetrics = vi.fn();

vi.mock('@/lib/ask/tools/staff-data', () => ({ loadStaffEngagements: (...a: unknown[]) => loadStaffEngagements(...a) }));
vi.mock('@/db/repositories/filings', () => ({ getFilings: (...a: unknown[]) => getFilings(...a) }));
vi.mock('@/db/repositories/ask-metrics', () => ({
  listOpenRequestsForMetrics: (...a: unknown[]) => listOpenRequestsForMetrics(...a),
  listOpenTasksForMetrics: (...a: unknown[]) => listOpenTasksForMetrics(...a),
  listDocumentsPendingReview: (...a: unknown[]) => listDocumentsPendingReview(...a),
  listOpenInvoicesForMetrics: (...a: unknown[]) => listOpenInvoicesForMetrics(...a),
}));
vi.mock('@/db/repositories/announcements', () => ({ listAnnouncements: (...a: unknown[]) => listAnnouncements(...a) }));
vi.mock('@/db/repositories/board-meetings/meetings', () => ({ listMeetings: (...a: unknown[]) => listMeetings(...a) }));
vi.mock('@/db/repositories/labour-registers', () => ({ listBatches: (...a: unknown[]) => listBatches(...a) }));
vi.mock('@/db/repositories/metrics', () => ({
  getPeopleMetrics: (...a: unknown[]) => getPeopleMetrics(...a),
  registrationCells: () => ({ 'reg-gst': 'progress', 'reg-pf': 'done', 'reg-esi': 'not-needed' }),
}));

const { METRICS, getMetric } = await import('../catalog');

const ctx = (role: AuthContext['role']): AuthContext => ({ userId: `user-${role}`, email: `${role}@x.test`, name: role, role });
const env = (role: AuthContext['role'], shell: AskShell = 'admin', engagementId: string | null = null) => ({
  ctx: ctx(role),
  shell,
  engagementId,
  now: NOW,
});

const eng = (dbId: string, incorporationDate: string | null = '2026-07-10') => ({
  dbId,
  engagement: {
    id: dbId,
    slug: dbId,
    companyName: `${dbId} Pvt Ltd`,
    stage: incorporationDate ? 'Post-Incorporation' : 'Pre-Incorporation',
    incorporationDate,
    health: 'on-track',
    createdAt: '2026-06-01T00:00:00Z',
  },
  state: {},
});

const filing = (id: string, engagementId: string, compliance: string, dueDate: string, filedOn: string | null = null) => ({
  id,
  engagementId,
  companyName: `${engagementId} Pvt Ltd`,
  compliance,
  particular: `${compliance} return`,
  dueDate,
  filedOn,
  rawStatus: filedOn ? 'filed' : 'pending',
});

beforeEach(() => {
  vi.clearAllMocks();
  loadStaffEngagements.mockResolvedValue([eng('own'), eng('other'), eng('pre', null)]);
  getFilings.mockImplementation(async (_c: AuthContext, q: { engagementId?: string }) => ({
    rows: [
      filing('1', 'own', 'GST', '2026-10-20'),
      filing('2', 'other', 'Income Tax', '2026-10-31'),
      filing('3', 'own', 'GST', '2026-11-11'),
      filing('4', 'own', 'GST', '2026-06-11', '2026-06-10'),
    ].filter((r) => !q.engagementId || r.engagementId === q.engagementId),
    companies: [],
  }));
  listOpenRequestsForMetrics.mockResolvedValue([
    { title: 'PAN of director', dueOn: '2026-10-01', companyName: 'own Pvt Ltd', slug: 'own' },
    { title: 'Bank statement', dueOn: '2026-12-01', companyName: 'own Pvt Ltd', slug: 'own' },
  ]);
  listOpenTasksForMetrics.mockResolvedValue([
    { title: 'Late task', deadline: new Date('2026-10-01T00:00:00Z'), companyName: 'own Pvt Ltd', slug: 'own' },
    { title: 'Today task', deadline: new Date('2026-11-06T10:00:00Z'), companyName: null, slug: null },
    { title: 'No date', deadline: null, companyName: null, slug: null },
  ]);
  listDocumentsPendingReview.mockResolvedValue([{ fileName: 'moa.pdf', companyName: 'own Pvt Ltd', slug: 'own' }]);
  listOpenInvoicesForMetrics.mockResolvedValue([
    { clientName: 'Acme', invoiceNo: 'A-1', dueDate: '2026-10-01', amountInr: '150000.00', disputed: false },
    { clientName: 'Bravo', invoiceNo: null, dueDate: '2026-10-02', amountInr: '50000.00', disputed: true },
    { clientName: 'Cedar', invoiceNo: 'C-1', dueDate: '2026-12-01', amountInr: '25000.50', disputed: false },
  ]);
  listAnnouncements.mockResolvedValue([
    { title: 'New GST circular', publishedAt: '2026-11-04T00:00:00.000Z' },
    { title: 'Old circular', publishedAt: '2026-09-01T00:00:00.000Z' },
  ]);
  listMeetings.mockResolvedValue([
    { engagementId: 'own', companyName: 'own Pvt Ltd', meetingNo: 'BM 3', meetingDate: '2026-11-20', word: 'In progress' },
    { engagementId: 'own', companyName: 'own Pvt Ltd', meetingNo: 'BM 2', meetingDate: '2026-08-20', word: 'Done' },
  ]);
  listBatches.mockResolvedValue([
    { stateCode: 'TG', status: 'open', periodFrom: '2026-07-01', periodTo: '2026-09-30' },
    { stateCode: 'KA', status: 'attested', periodFrom: '2026-04-01', periodTo: '2026-06-30' },
  ]);
  getPeopleMetrics.mockResolvedValue([
    { role: 'intern', name: 'Divya', clients: 3, openItems: 9 },
    { role: 'intern', name: 'Arjun', clients: 2, openItems: 12 },
    { role: 'manager', name: 'Anita', clients: 5, openItems: 21 },
  ]);
});

describe('every metric', () => {
  const clientMetrics = METRICS.filter((m) => m.roles.includes('client'));

  it.each(METRICS.map((m) => [m.name, m] as const))('%s writes a valid staff card from data and from nothing', async (_name, metric) => {
    const filled = metric.answer(await metric.run(env('admin'), { period: metric.defaultPeriod }), { period: metric.defaultPeriod }, env('admin'));
    expect(answerEnvelopeSchema.safeParse(filled).success, JSON.stringify(filled)).toBe(true);
    expect(filled.origin).toBe('deterministic');
    expect(sanitizeLinks(filled.links, { shell: 'admin' }).length, `${metric.name} has a list link`).toBe(1);

    const empty = metric.answer({ count: 0, rows: [] }, {}, env('admin'));
    expect(answerEnvelopeSchema.safeParse(empty).success).toBe(true);
    expect(empty.line).not.toMatch(/\bundefined\b|\s\./);
  });

  it.each(clientMetrics.map((m) => [m.name, m] as const))('%s writes a client card in client shapes only', async (_name, metric) => {
    const e = env('client', 'client', 'own');
    const answer = metric.answer(await metric.run(e, { period: metric.defaultPeriod }), { period: metric.defaultPeriod }, e);
    expect(answerEnvelopeSchema.safeParse(answer).success).toBe(true);
    if (answer.visual) expect(CLIENT_VISUAL_TYPES).toContain(answer.visual.type);
    for (const link of sanitizeLinks(answer.links, { shell: 'client' })) {
      expect(resolveHref(link.dest, '/app/client')).toMatch(/^\/app\/client\//);
    }
  });

  it('always reads as the caller', async () => {
    for (const metric of METRICS) await metric.run(env('manager'), {});
    const boundaries = [loadStaffEngagements, getFilings, listOpenRequestsForMetrics, listOpenTasksForMetrics, listDocumentsPendingReview, listOpenInvoicesForMetrics, listMeetings, listBatches, getPeopleMetrics];
    for (const boundary of boundaries) {
      expect(boundary).toHaveBeenCalled();
      for (const call of boundary.mock.calls) expect((call[0] as AuthContext).role).toBe('manager');
    }
  });
});

describe('a client only ever sees their own company', () => {
  const clientEnv = env('client', 'client', 'own');

  it('never counts an engagement the repository returned for someone else', async () => {
    const value = await getMetric('registrations.in_progress')!.run(clientEnv, {});
    expect(value.rows.every((r) => r.label === 'own Pvt Ltd')).toBe(true);
    expect(value.count).toBe(1);
  });

  it('asks each scoped read for that one engagement', async () => {
    for (const name of ['filings.overdue', 'filings.due_soon', 'filings.filed']) {
      getFilings.mockClear();
      await getMetric(name)!.run(clientEnv, {});
      expect(getFilings.mock.calls[0]![1]).toEqual({ engagementId: 'own' });
    }
    await getMetric('requests.open')!.run(clientEnv, {});
    expect(listOpenRequestsForMetrics.mock.calls[0]![1]).toBe('own');
    await getMetric('board_meetings.upcoming')!.run(clientEnv, {});
    expect(listMeetings.mock.calls[0]![1]).toEqual({ engagementId: 'own' });
    await getMetric('labour_registers.pending')!.run(clientEnv, {});
    expect(listBatches.mock.calls[0]![1]).toEqual({ engagementId: 'own' });
  });

  it('states the company fact, whatever period was asked', async () => {
    const metric = getMetric('companies.incorporated')!;
    const filters = { period: 'last_fy' } as const;
    expect(metric.answer(await metric.run(clientEnv, filters), filters, clientEnv).line).toBe('Your company, own Pvt Ltd, was incorporated on 10 Jul 2026.');
    const pre = env('client', 'client', 'pre');
    expect(metric.answer(await metric.run(pre, filters), filters, pre).line).toBe('Your company, pre Pvt Ltd, has not been incorporated yet.');
  });

  it('never gives a client a staff row or a staff list', async () => {
    const metric = getMetric('filings.overdue')!;
    const answer = metric.answer(await metric.run(clientEnv, {}), {}, clientEnv);
    expect(answer.line).toBe('1 filing is overdue for your company.');
    expect(sanitizeLinks([{ dest: { to: 'list', list: 'projects' }, label: 'Open projects' }], { shell: 'client' })).toEqual([]);
    expect(sanitizeLinks([{ dest: { to: 'list', list: 'receivables' }, label: 'Open' }], { shell: 'client' })).toEqual([]);
  });
});

describe('the numbers', () => {
  const firm = env('admin');
  const line = async (name: string, filters: Parameters<(typeof METRICS)[number]['run']>[1] = {}, e = firm) => {
    const metric = getMetric(name)!;
    return metric.answer(await metric.run(e, filters), filters, e).line;
  };

  it('companies', async () => {
    expect(await line('companies.incorporated', { period: 'this_fy' })).toBe('2 companies were incorporated in FY 2026-27 across the firm.');
    expect(await line('companies.incorporated', { period: 'last_fy' })).toBe('No companies were incorporated in FY 2025-26 across the firm.');
    expect(await line('companies.incorporated', { period: 'all_time' })).toBe('2 companies were incorporated so far across the firm.');
    expect(await line('companies.incorporated', { fyStartYear: 2026 })).toBe('2 companies were incorporated in FY 2026-27 across the firm.');
    expect(await line('companies.in_progress')).toBe('1 company is still being incorporated across the firm.');
    expect(await line('clients.total')).toBe('There are 3 clients across the firm.');
    expect(await line('clients.new', { period: 'this_fy' })).toBe('3 clients were added in FY 2026-27 across the firm.');
    expect(await line('clients.new', { period: 'this_month' })).toBe('No clients were added in November 2026 across the firm.');
  });

  it('says whose number it is', async () => {
    expect(await line('clients.total', {}, env('manager'))).toBe('There are 3 clients on your projects.');
    expect(await line('filings.overdue', { client: { id: 'own', key: 'own', name: 'own Pvt Ltd' } })).toBe('1 filing is overdue for own Pvt Ltd.');
  });

  it('filings', async () => {
    expect(await line('filings.overdue')).toBe('2 filings are overdue across the firm.');
    expect(await line('filings.overdue', { area: 'GST' })).toBe('1 GST filing is overdue across the firm.');
    expect(await line('filings.due_soon')).toBe('1 filing is due in the next 15 days across the firm.');
    expect(await line('filings.filed', { period: 'this_fy' })).toBe('1 filing was filed in FY 2026-27 across the firm.');
    expect(await line('filings.filed', { period: 'last_fy' })).toBe('No filings were filed in FY 2025-26 across the firm.');
  });

  it('says when an overdue filing belongs to an earlier year, since the list shows one year at a time', async () => {
    getFilings.mockResolvedValue({ rows: [filing('1', 'own', 'GST', '2026-10-20'), filing('2', 'own', 'GST', '2026-03-20')], companies: [] });
    expect(await line('filings.overdue')).toBe('2 filings are overdue across the firm, 1 of them from an earlier financial year.');
  });

  it('work', async () => {
    expect(await line('requests.open')).toBe('2 document requests are open across the firm.');
    expect(await line('requests.overdue')).toBe('1 document request is overdue across the firm.');
    expect(await line('tasks.open')).toBe('3 tasks are open across the firm.');
    expect(await line('tasks.overdue')).toBe('1 task is overdue across the firm.');
    expect(await line('tasks.due_today')).toBe('1 task is due today across the firm.');
    expect(await line('documents.pending_review')).toBe('1 document is waiting for review across the firm.');
    expect(await line('board_meetings.upcoming')).toBe('1 board meeting is coming up across the firm.');
    expect(await line('labour_registers.pending')).toBe('1 labour register batch is still pending across the firm.');
    expect(await line('leads.workload')).toBe('2 project leads across the firm, busiest first.');
    expect(await line('people.team')).toBe('There are 3 people on the team across the firm.');
    expect(await line('updates.this_week')).toBe('1 update was posted here in the last 7 days, as of 06 Nov 2026.');
  });

  it('invoices count in rupees and leave out disputes when overdue', async () => {
    expect(await line('invoices.outstanding')).toBe('3 invoices are outstanding on your receivable sheets, ₹2,25,001 in all.');
    expect(await line('invoices.overdue')).toBe('1 invoice is overdue on your receivable sheets, ₹1,50,000 in all, leaving out disputed ones.');
  });

  it('draws a small chart once the rows are too many to read', async () => {
    getFilings.mockResolvedValue({
      rows: Array.from({ length: 12 }, (_, i) => filing(String(i), 'own', i % 3 ? 'GST' : 'Income Tax', '2026-10-20')),
      companies: [],
    });
    const metric = getMetric('filings.overdue')!;
    const answer = metric.answer(await metric.run(firm, {}), {}, firm);
    expect(answer.visual).toEqual({ type: 'bars', items: [{ k: 'GST', v: 8 }, { k: 'Income Tax', v: 4 }] });
  });

  it('keeps the names on the card while they fit', async () => {
    const metric = getMetric('filings.overdue')!;
    expect(metric.answer(await metric.run(firm, {}), {}, firm).visual?.type).toBe('projectRows');
  });
});
