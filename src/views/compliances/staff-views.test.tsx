import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { Engagement } from '@/data/engagements';
import type { FilingRow } from '@/lib/compliance/filings';

/**
 * Render checks for the new staff screens: the obligations list bands real
 * register rows by filing, and the registrations list reads the roster's step
 * state. Data hooks are stubbed; the views and their pure logic are real.
 */

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => '/app/manager/compliances/obligations',
}));
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/shell/PageTransition', () => ({ PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/ask/WhatsThisButton', () => ({ WhatsThisButton: () => null }));

const appState = {
  user: { id: 'u-manager', role: 'manager' },
  getStateForEngagement: (e: Engagement) =>
    e.id === 'acme' ? { 'reg-4': { status: 'completed', completedOn: '2026-10-10' }, 'reg-1': { status: 'awaiting-client' } } : {},
  internOptions: [],
  teamMembers: [],
  refreshEngagementChecklist: vi.fn(),
};
vi.mock('@/context/AppContext', () => ({ useApp: () => appState }));

function row(patch: Partial<FilingRow> & { id: string }): FilingRow {
  return {
    engagementId: 'acme',
    companyName: 'Acme Pvt Ltd',
    compliance: 'GST',
    particular: 'GSTR-3B',
    authority: 'GST',
    frequency: 'monthly',
    dueDate: '2099-10-20',
    filedOn: null,
    periodLabel: 'Sep 2099',
    fyLabel: 'FY 2099-00',
    rawStatus: 'upcoming',
    obligationId: 'gst-3b',
    windowFrom: null,
    windowTo: null,
    ...patch,
  };
}

const register = {
  rows: [
    row({ id: 'a', filedOn: '2099-10-11' }),
    row({ id: 'b', engagementId: 'birch', companyName: 'Birch LLP' }),
    row({ id: 'c', obligationId: 'tds', particular: 'TDS payment', compliance: 'Income Tax', dueDate: '2099-11-07' }),
  ],
  details: new Map(),
  fyStartYear: 2099,
  isPending: false,
  isError: false,
};
vi.mock('@/views/compliances/use-register', () => ({
  useRegister: () => register,
  useMayWriteFilings: () => false,
}));

vi.mock('@/hooks/use-filings', () => ({
  useFilings: () => ({ data: { rows: register.rows, companies: [] }, isPending: false, isError: false }),
}));
vi.mock('@/components/client-portal/pages/compliances/api', () => ({
  useCompFilings: () => ({ data: { rows: [] } }),
  useReminder: () => ({ set: { mutate: vi.fn(), isPending: false }, clear: { mutate: vi.fn(), isPending: false } }),
}));
// The slim registration facts read (G-05, G-06): a number typed on the workbook and an
// expiry 10 days out for Acme's GST registration.
const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
vi.mock('@/hooks/use-registration-facts', () => ({
  useRegistrationFacts: () => ({
    data: {
      acme: {
        'reg-4': {
          stepId: 'reg-4',
          rowKey: 'gst',
          number: '29ABCDE1234F1Z5',
          registeredOn: null,
          certificate: null,
          issuedOn: null,
          expiresOn: soon,
          renewEveryMonths: null,
        },
      },
    },
  }),
  useSetRegistrationDates: () => ({ mutateAsync: vi.fn(), isPending: false }),
  openRegistrationCertificate: vi.fn(),
}));
// Non-statutory tasks as GET /api/compliances/tasks returns them (COMPLIANCE-API.md section 2).
function taskRow(patch: Record<string, unknown> & { id: string }) {
  return {
    engagementId: 'acme',
    companyName: 'Acme Pvt Ltd',
    activityId: 'ACT-004',
    activityName: 'MIS report',
    name: 'MIS report',
    periodLabel: 'Oct 2099',
    title: 'MIS report · Oct 2099',
    startDate: '2099-10-12',
    dueDate: '2099-10-20',
    urgency: 'High',
    urgencyBars: 3,
    visibility: 'both',
    stage: 'in-progress',
    stageLabel: 'In progress',
    word: 'In progress',
    hidden: false,
    week: 'Later',
    daysToStart: -2,
    daysToDue: 6,
    owner: { id: 'lead-1', name: 'Bharath Rao' },
    reviewer: { id: 'u-manager', name: 'Pranay' },
    repeats: 'monthly',
    remindBefore: 5,
    checklist: { done: 1, total: 3 },
    attachmentCount: 0,
    deliverable: null,
    completedAt: null,
    createdBy: { id: 'u-manager', name: 'Pranay' },
    createdAt: '2099-10-01T00:00:00Z',
    ...patch,
  };
}
const tasksData = {
  tasks: [
    taskRow({ id: 't1' }),
    taskRow({ id: 't2', engagementId: 'birch', companyName: 'Birch LLP', title: 'Board pack', name: 'Board pack', visibility: 'firm', urgency: 'Critical', stage: 'completed', word: 'Done', week: 'Done' }),
    taskRow({ id: 't3', title: 'Hidden one', stage: 'not-applicable', hidden: true }),
  ],
  today: '2099-10-16',
};
const taskQueries: unknown[] = [];
vi.mock('@/views/compliances/tasks/api', async (orig) => ({
  ...(await orig<typeof import('@/views/compliances/tasks/api')>()),
  useTasks: (q: { done?: boolean }) => {
    taskQueries.push(q);
    const tasks = q.done === undefined ? tasksData.tasks : tasksData.tasks.filter((t) => (t.stage === 'completed') === q.done);
    return { data: { ...tasksData, tasks }, isPending: false, isError: false };
  },
  useActivities: () => ({ data: [] }),
  useTaskDefaults: () => ({ data: undefined }),
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMoveTaskDates: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function engagement(id: string, name: string): Engagement {
  return {
    id,
    clientId: `c-${id}`,
    companyName: name,
    companyType: 'domestic',
    internId: 'lead-1',
    adminId: 'admin',
    createdAt: '2026-01-05',
    stage: 'Post-Incorporation',
    health: 'on-track',
    incorporationDate: '2026-06-01',
  } as Engagement;
}

const scope = {
  audience: 'staff' as const,
  engagements: [engagement('acme', 'Acme Pvt Ltd'), engagement('birch', 'Birch LLP')],
  preIncorporationIds: new Set<string>(),
};

const { ObligationsView } = await import('@/views/compliances/ObligationsView');
const { RegistrationsView } = await import('@/views/compliances/RegistrationsView');
const { FilingsView } = await import('@/views/compliances/FilingsView');
const { ComplianceCalendarView } = await import('@/views/compliances/ComplianceCalendarView');

describe('ObligationsView', () => {
  it('bands each obligation with its filed count and lists the clients under it', () => {
    search = new URLSearchParams();
    render(<ObligationsView basePath="/app/manager/compliances" scope={scope} />);
    const grid = screen.getByRole('region', { name: 'Obligations' });
    expect(within(grid).getByText('1 of 2 filed')).toBeInTheDocument();
    // The band name carries the glossary card on its leading form code, so the text is split.
    expect(grid).toHaveTextContent('TDS payment');
    expect(within(grid).getByText('Birch LLP', { selector: 'span' })).toBeInTheDocument();
    const link = within(grid).getAllByRole('link').find((a) => a.textContent?.includes('Birch LLP'));
    // S-2: the row opens the statutory detail page of that client's period.
    expect(link?.getAttribute('href')).toBe('/app/manager/compliances/obligations/gst-3b/b');
  });

  it('switches between statutory and non-statutory with counts (S-1, S-3, S-8)', () => {
    search = new URLSearchParams();
    render(<ObligationsView basePath="/app/manager/compliances" scope={scope} />);
    // Counts: 3 statutory client rows, 2 visible tasks (the not-applicable one is hidden).
    expect(screen.getByRole('tab', { name: /Statutory\s*3/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Non-statutory\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New task/ })).toBeInTheDocument();

    act(() => screen.getByRole('tab', { name: /Non-statutory/ }).click());
    expect(replace).toHaveBeenLastCalledWith('/app/manager/compliances/obligations?cat=ns', { scroll: false });
  });

  it('lists tasks by end week with urgency, visibility and the task link', () => {
    search = new URLSearchParams('cat=ns');
    render(<ObligationsView basePath="/app/manager/compliances" scope={scope} />);
    const grid = screen.getByRole('region', { name: 'Obligations' });
    expect(within(grid).getByText('Later')).toBeInTheDocument();
    expect(within(grid).getByText('Critical')).toBeInTheDocument();
    expect(within(grid).getByText('Firm')).toBeInTheDocument();
    expect(within(grid).queryByText('Hidden one')).toBeNull();
    const link = within(grid).getAllByRole('link').find((a) => a.textContent?.includes('MIS report'));
    expect(link?.getAttribute('href')).toBe('/app/manager/compliances/obligations/tasks/t1');
    // S-8: the strip counts tasks only; one done task (the strip tile and the Done week band).
    const done = screen.getAllByRole('button', { name: /^Done\s*1$/ });
    expect(done.filter((b) => !grid.contains(b))).toHaveLength(1);
  });

  it('hides New task from a lead (S-4)', () => {
    search = new URLSearchParams('cat=ns');
    appState.user = { id: 'lead-1', role: 'intern' };
    render(<ObligationsView basePath="/app/intern/compliances" scope={scope} />);
    expect(screen.queryByRole('button', { name: /New task/ })).toBeNull();
    appState.user = { id: 'u-manager', role: 'manager' };
  });

  it('filters the list from the number strip', () => {
    search = new URLSearchParams('state=done');
    render(<ObligationsView basePath="/app/manager/compliances" scope={scope} />);
    const grid = screen.getAllByRole('region', { name: 'Obligations' }).at(-1)!;
    expect(within(grid).queryByText('Birch LLP', { selector: 'span' })).toBeNull();
    expect(within(grid).getByText('Acme Pvt Ltd', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('RegistrationsView', () => {
  it('lists registration steps per client with the six words', () => {
    search = new URLSearchParams('company=acme');
    render(<RegistrationsView shellBase="/app/manager" scope={scope} />);
    const grid = screen.getByRole('region', { name: 'Registrations' });
    const gst = within(grid).getAllByRole('link').find((a) => a.textContent?.includes('GST Registration'));
    expect(gst?.getAttribute('href')).toBe(`/app/manager/registrations/${encodeURIComponent('acme~reg-4')}`);
    expect(within(grid).getAllByText('Done').length).toBeGreaterThan(0);
    expect(within(grid).getAllByText('Waiting').length).toBeGreaterThan(0);
  });

  it('shows the stored number and the renewal from the slim facts read', () => {
    search = new URLSearchParams('company=acme');
    render(<RegistrationsView shellBase="/app/manager" scope={scope} />);
    const grid = screen.getByRole('region', { name: 'Registrations' });
    expect(within(grid).getByText('29ABCDE1234F1Z5')).toBeInTheDocument();
    const renewals = screen.getByRole('heading', { name: 'Renewals and expiry' }).closest('section')!;
    expect(within(renewals).getByText('GST Registration')).toBeInTheDocument();
  });

  it('keeps filter state in memory when embedded in the client record', () => {
    search = new URLSearchParams();
    replace.mockClear();
    render(<RegistrationsView shellBase="/app/manager" scope={{ ...scope, engagements: [scope.engagements[0]!] }} embedded />);
    act(() => screen.getByRole('tab', { name: 'Grid' }).click());
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Grid' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('FilingsView and ComplianceCalendarView', () => {
  it('draws the register month in a T1 grid with the six words on All filings', () => {
    search = new URLSearchParams('period=2099-10&fy=2099&tab=all&cat=statutory');
    render(<FilingsView basePath="/app/manager/compliances" scope={scope} />);
    const grid = screen.getByRole('region', { name: 'Filings' });
    expect(within(grid).getAllByText('GSTR-3B').length).toBe(2);
    expect(within(grid).getByText('Done')).toBeInTheDocument();
    expect(within(grid).getByText('Not started')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/ })).toBeEnabled();
  });

  it('groups the month by filing with the client rows, the KPI tiles and the six regulators', () => {
    search = new URLSearchParams('period=2099-10&fy=2099&cat=statutory');
    render(<FilingsView basePath="/app/manager/compliances" scope={scope} />);
    expect(screen.getByRole('tab', { name: /By filing/ })).toHaveAttribute('aria-selected', 'true');
    const grid = screen.getByRole('region', { name: 'Filings' });
    expect(within(grid).getByText('1 of 2 filed')).toBeInTheDocument();
    expect(within(grid).getByText('Acme Pvt Ltd')).toBeInTheDocument();
    expect(within(grid).getByText('Birch LLP')).toBeInTheDocument();
    const open = within(grid).getByRole('link', { name: 'Open: GSTR-3B Sep 2099, Acme Pvt Ltd' });
    expect(open.getAttribute('href')).toBe('/app/manager/compliances/obligations/gst-3b/a');
    expect(within(grid).getByRole('link', { name: 'Open: GSTR-3B Sep 2099, Birch LLP' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by state' })).toHaveTextContent('Due this month');
    const regulators = screen.getByRole('heading', { name: 'By area' }).closest('section')!;
    expect(within(regulators).getByRole('button', { name: /^GST: 1 of 2 filed/ })).toBeInTheDocument();
    expect(within(regulators).getByRole('button', { name: /^Labour: 0 of 0 filed/ })).toBeInTheDocument();
  });

  it('adds done tasks with their deliverable under the All filter (F-1 to F-3)', () => {
    tasksData.tasks[1] = { ...tasksData.tasks[1]!, deliverable: { id: 'f1', fileName: 'board-pack.pdf' } } as (typeof tasksData.tasks)[number];
    search = new URLSearchParams('period=2099-10&fy=2099&tab=all');
    render(<FilingsView basePath="/app/manager/compliances" scope={scope} />);
    expect(taskQueries.some((q) => (q as { done?: boolean }).done === true)).toBe(true);
    // October: three filings (a, b, c is in November) and one done task.
    expect(screen.getByRole('tab', { name: /^All\s*3$/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Non-statutory\s*1$/ })).toBeInTheDocument();
    const grid = screen.getByRole('region', { name: 'Filings' });
    const link = within(grid).getByRole('link', { name: 'Board pack' });
    expect(link.getAttribute('href')).toBe('/app/manager/compliances/obligations/tasks/t2');
    expect(within(grid).getByRole('button', { name: 'Open board-pack.pdf' })).toBeInTheDocument();
    const regulators = screen.getByRole('heading', { name: 'By area' }).closest('section')!;
    expect(within(regulators).getByText('Internal')).toBeInTheDocument();

    act(() => screen.getByRole('tab', { name: /^Non-statutory/ }).click());
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('cat=non-statutory'), { scroll: false });
  });

  it('narrows the list to a regulator from the filter chip in the URL', () => {
    search = new URLSearchParams('period=2099-10&fy=2099&tab=all&area=it');
    render(<FilingsView basePath="/app/manager/compliances" scope={scope} />);
    const grid = screen.getByRole('region', { name: 'Filings' });
    expect(within(grid).queryByText('GSTR-3B')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Regulator filter' })).toBeInTheDocument();
  });

  it('plots the month with day tags and the coming-up rail', () => {
    search = new URLSearchParams('date=2099-10-20');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    // The GSTR-3B filing falls on 20 Oct; the two tasks (MIS report, Board pack) carry a day tag too.
    const text = document.body.textContent ?? '';
    expect(text).toContain('GSTR-3B');
    expect(text).toContain('MIS report');
    expect(text).toContain('Board pack');
    const coming = screen.getByRole('region', { name: 'Coming up', hidden: true });
    expect(within(coming).getByText('TDS payment')).toBeInTheDocument();
    expect(within(coming).getByText('MIS report · Oct 2099')).toBeInTheDocument();
  });
});
