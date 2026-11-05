import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Engagement } from '@/data/engagements';
import type { FilingRow } from '@/lib/compliance/filings';

/**
 * Render checks for the staff compliance calendar: the bar (month picker and
 * FY chip), the day popover, and the Timeline view of filing windows, which
 * writes through the existing window route only for a manager.
 */

const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  useSearchParams: () => search,
  usePathname: () => '/app/manager/compliances/calendar',
}));
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/shell/PageTransition', () => ({ PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/ask/WhatsThisButton', () => ({ WhatsThisButton: () => null }));
vi.mock('@/components/admin/StatutoryCalendar', () => ({ StatutoryCalendar: () => null }));

let mayWrite = true;
vi.mock('@/views/compliances/use-register', () => ({ useMayWriteFilings: () => mayWrite }));

const setWindow = vi.fn(async (id: string, w: { from: string; to: string } | null) => ({ id, windowFrom: w?.from ?? null, windowTo: w?.to ?? null }));
vi.mock('@/lib/projects/engagements-db', () => ({ setFilingWindowInDb: (id: string, w: { from: string; to: string } | null) => setWindow(id, w) }));
const toastUndo = vi.fn();
const moveTask = vi.fn();
vi.mock('@/components/ui/undo-toast', () => ({ toastUndo: (...a: unknown[]) => toastUndo(...a) }));

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

const rows = [
  row({ id: 'a', filedOn: '2099-10-11' }),
  row({ id: 'b', engagementId: 'birch', companyName: 'Birch LLP' }),
  row({ id: 'c', obligationId: 'tds', particular: 'TDS payment', compliance: 'Income Tax', authority: 'IT', dueDate: '2099-11-07' }),
];

vi.mock('@/hooks/use-filings', () => ({
  useFilings: () => ({ data: { rows, companies: [] }, isPending: false, isError: false }),
}));
vi.mock('@/components/client-portal/pages/compliances/api', () => ({
  useCompFilings: () => ({ data: { rows: [] } }),
  useReminder: () => ({ set: { mutate: vi.fn(), isPending: false }, clear: { mutate: vi.fn(), isPending: false } }),
}));
// Non-statutory tasks from GET /api/compliances/tasks (COMPLIANCE-API.md section 2). Empty unless a test sets them.
let taskList: unknown[] = [];
const taskQueries: Array<Record<string, unknown>> = [];
vi.mock('@/views/compliances/tasks/api', async (orig) => ({
  ...(await orig<typeof import('@/views/compliances/tasks/api')>()),
  useTasks: (q: Record<string, unknown>) => {
    taskQueries.push(q);
    return { data: { tasks: taskList, today: '2099-10-16' }, isPending: false, isError: false };
  },
  useMoveTaskDates: () => ({ mutate: (...a: unknown[]) => moveTask(...a), isPending: false }),
}));
// The prefilled New task dialog is the task form's own concern; here it only has to open.
const newTaskPrefill = vi.fn();
vi.mock('@/views/compliances/tasks/new-task', () => ({
  NewTaskButton: ({ prefill }: { prefill?: { start: string; end: string } | null }) => {
    newTaskPrefill(prefill ?? null);
    return null;
  },
}));
const boardPack = {
  id: 't1',
  engagementId: 'acme',
  companyName: 'Acme Pvt Ltd',
  activityId: null,
  activityName: null,
  name: 'Board pack',
  periodLabel: null,
  title: 'Board pack',
  startDate: '2099-10-12',
  dueDate: '2099-10-22',
  urgency: 'High',
  urgencyBars: 3,
  visibility: 'both',
  stage: 'in-progress',
  stageLabel: 'In progress',
  word: 'In progress',
  hidden: false,
  week: 'Next week',
  daysToStart: -4,
  daysToDue: 6,
  owner: { id: 'lead-1', name: 'Bharath' },
  reviewer: null,
  repeats: 'one-time',
  remindBefore: 5,
  checklist: { done: 0, total: 0 },
  attachmentCount: 0,
  deliverable: null,
  completedAt: null,
  createdBy: null,
  createdAt: '2099-10-01T00:00:00Z',
};

vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

function engagement(id: string, name: string): Engagement {
  return { id, clientId: `c-${id}`, companyName: name, companyType: 'domestic', internId: 'lead-1', adminId: 'admin', createdAt: '2026-01-05', stage: 'Post-Incorporation', health: 'on-track', incorporationDate: '2026-06-01' } as Engagement;
}

const scope = {
  audience: 'staff' as const,
  engagements: [engagement('acme', 'Acme Pvt Ltd'), engagement('birch', 'Birch LLP')],
  preIncorporationIds: new Set<string>(),
};

const { ComplianceCalendarView } = await import('@/views/compliances/ComplianceCalendarView');

beforeEach(() => {
  setWindow.mockClear();
  toastUndo.mockClear();
  push.mockClear();
  mayWrite = true;
  taskList = [];
  taskQueries.length = 0;
  moveTask.mockClear();
  newTaskPrefill.mockClear();
});

describe('ComplianceCalendarView bar', () => {
  it('shows the FY chip and the month picker with a month grid and Today', () => {
    search = new URLSearchParams('date=2099-10-20');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    expect(screen.getByText('FY 2099-00')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Choose month' }).click());
    const picker = screen.getByRole('dialog', { name: 'Choose month and year' });
    expect(within(picker).getByRole('button', { name: 'October 2099' })).toHaveAttribute('aria-current', 'date');
    act(() => within(picker).getByRole('button', { name: 'December 2099' }).click());
    expect(screen.getByRole('button', { name: 'Choose month' })).toHaveTextContent('December');
  });

  it('opens the day on the month grid with links to each filing record', () => {
    search = new URLSearchParams('date=2099-10-20');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    // The date in the URL opens that day's popover; a filing opens its period's statutory page.
    expect(screen.getByRole('button', { name: /^20 October/, hidden: true })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('a[href="/app/manager/compliances/obligations/gst-3b/b"]')).not.toBeNull();
    expect(document.querySelector('a[href="/app/manager/compliances/obligations/gst-3b/a"]')).not.toBeNull();
  });

  it('groups one filing for several clients in Coming up', () => {
    search = new URLSearchParams('date=2099-10-01');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    const coming = screen.getByRole('region', { name: 'Coming up' });
    expect(within(coming).getByText('TDS payment')).toBeInTheDocument();
    expect(within(coming).getByText('GSTR-3B')).toBeInTheDocument();
  });
});

describe('Timeline view', () => {
  function openTimeline() {
    search = new URLSearchParams('date=2099-10-01');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    act(() => screen.getByRole('tab', { name: 'Timeline' }).click());
  }

  it('draws one lane per filing grouped by area, with zoom controls', () => {
    openTimeline();
    expect(screen.getByRole('group', { name: 'Zoom the timeline' })).toBeInTheDocument();
    expect(screen.getAllByText('GSTR-3B').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Income tax').length).toBeGreaterThan(1);
    const bars = screen.getAllByRole('slider');
    expect(bars).toHaveLength(2);
    expect(bars[0]!.getAttribute('aria-label')).toContain('GSTR-3B · 20 Oct · 2 clients');
  });

  it('moves a window for a manager through the window route, unfiled clients only, with Undo', async () => {
    openTimeline();
    const bar = screen.getAllByRole('slider')[0]!;
    await act(async () => {
      fireEvent.keyDown(bar, { key: 'ArrowRight' });
    });
    expect(setWindow).toHaveBeenCalledTimes(1);
    expect(setWindow).toHaveBeenCalledWith('b', { from: '2099-10-16', to: '2099-10-21' });
    expect(toastUndo).toHaveBeenCalledWith('Window · 16 Oct to 21 Oct', expect.any(Function));
    await act(async () => {
      (toastUndo.mock.calls[0]![1] as () => void)();
    });
    expect(setWindow).toHaveBeenLastCalledWith('b', null);
  });

  it('keeps the bars read-only for a project lead', async () => {
    mayWrite = false;
    openTimeline();
    const bar = screen.getAllByRole('slider')[0]!;
    expect(bar).toHaveAttribute('aria-readonly', 'true');
    await act(async () => {
      fireEvent.keyDown(bar, { key: 'ArrowRight' });
    });
    expect(setWindow).not.toHaveBeenCalled();
    act(() => {
      fireEvent.keyDown(bar, { key: 'Enter' });
    });
    expect(push).toHaveBeenCalledWith('/app/manager/compliances/obligations/gst-3b/a');
  });
});

describe('Statutory and non-statutory filter (C-1 to C-4)', () => {
  it('reads the tasks of the FY and counts both categories', () => {
    taskList = [boardPack];
    search = new URLSearchParams('date=2099-10-20');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    expect(taskQueries.at(-1)).toMatchObject({ from: '2099-04-01', to: '2100-03-31' });
    // October: 2 filings (a, b), 1 task.
    expect(screen.getByRole('tab', { name: /^All\s*3$/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Statutory\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Non-statutory\s*1$/ })).toBeInTheDocument();
  });

  it('shows a task with a hollow square, its start and urgency on hover, and a link to the task', () => {
    taskList = [boardPack];
    search = new URLSearchParams('date=2099-10-22');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    const mark = document.querySelector('[title="Board pack · Starts 12 Oct 2099 · High"]')!;
    expect(mark.querySelector('[data-hollow]')).not.toBeNull();
    expect(document.querySelector('a[href="/app/manager/compliances/obligations/tasks/t1"]')).not.toBeNull();
  });

  it('applies the filter to the grid and the rail', () => {
    taskList = [boardPack];
    search = new URLSearchParams('date=2099-10-20');
    render(<ComplianceCalendarView basePath="/app/manager/compliances" scope={scope} />);
    const container = document.body;
    const titles = () => [...container.querySelectorAll('[title]')].map((ev) => ev.getAttribute('title') ?? '');
    act(() => screen.getByRole('tab', { name: /^Non-statutory/ }).click());
    expect(titles().some((t) => t.includes('GSTR-3B'))).toBe(false);
    const coming = screen.getByRole('region', { name: 'Coming up' });
    expect(within(coming).getByText('Board pack')).toBeInTheDocument();
    expect(within(coming).queryByText('TDS payment')).toBeNull();
    expect(screen.getByRole('region', { name: 'Next deadline' })).toHaveTextContent('Board pack');

    act(() => screen.getByRole('tab', { name: /^Statutory/ }).click());
    expect(titles().some((t) => t.includes('Board pack'))).toBe(false);
    expect(within(screen.getByRole('region', { name: 'Coming up' })).queryByText('Board pack')).toBeNull();
  });
});
