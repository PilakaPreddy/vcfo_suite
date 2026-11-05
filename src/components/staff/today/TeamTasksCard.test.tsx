/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TeamTasksCard } from '@/components/staff/today/TeamTasksCard';
import { TaskStatusCard, WorkloadByLeadCard } from '@/components/staff/today/TodayCharts';
import type { TeamTaskRow } from '@/components/staff/today/today-rows';

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => search }));

const rows: TeamTaskRow[] = [
  {
    id: 'a:1',
    engagementId: 'e1',
    companyName: 'Acme India',
    title: 'Name approval',
    leadId: 'a',
    leadName: 'Asha Rao',
    area: 'Incorporation',
    dueAt: '2026-08-10',
    status: 'Overdue',
    withClient: false,
    href: '/app/manager/projects/acme/step/name',
  },
  {
    id: 'b:2',
    engagementId: 'e2',
    companyName: 'Beta Labs',
    title: 'GSTR-3B · Jul',
    leadId: 'b',
    leadName: 'Ravi Kumar',
    area: 'GST',
    dueAt: '2026-08-20',
    status: 'Waiting',
    withClient: true,
    href: '/app/manager/compliances/calendar',
  },
];

describe('TeamTasksCard', () => {
  it('lists every task with its lead, area and status, and switches to the board', () => {
    render(<TeamTasksCard rows={rows} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'Name approval' })).toHaveAttribute(
      'href',
      '/app/manager/projects/acme/step/name',
    );
    expect(within(table).getByText('Overdue')).toBeInTheDocument();
    expect(within(table).getByText('GST')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Board' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Waiting' })).toHaveTextContent('GSTR-3B · Jul');
  });
});

const withQuery = (node: ReactNode) => <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>;

describe('TeamTasksCard with tools', () => {
  const tools = {
    storageScope: 'u1',
    leads: [
      { id: 'a', name: 'Asha Rao' },
      { id: 'b', name: 'Ravi Kumar' },
    ],
    canReassign: true,
    markDone: vi.fn(async () => 0),
    setTaskStatus: vi.fn(),
  };

  it('opens on the saved view from ?view=waiting and shows the bulk bar for picked rows', () => {
    search = new URLSearchParams('view=waiting');
    render(withQuery(<TeamTasksCard rows={rows} tools={tools} />));
    const table = screen.getByRole('table');
    expect(within(table).queryByText('Name approval')).not.toBeInTheDocument();
    expect(within(table).getByText('GSTR-3B · Jul')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pick row 1' }));
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(within(bar).getByText('1 selected')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Export 1 task' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Assign 1 selected' })).toBeInTheDocument();
    search = new URLSearchParams();
  });

  it('ends each row with Open and the row menu, and binds C on a focused row (M-27)', () => {
    render(withQuery(<TeamTasksCard rows={rows} tools={tools} />));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('button', { name: 'More actions' })).toHaveLength(rows.length);
    expect(within(table).getAllByRole('button', { name: 'Open' })).toHaveLength(rows.length);
    const row = within(table).getAllByRole('row').find((r) => r.getAttribute('aria-keyshortcuts'));
    expect(row?.getAttribute('aria-keyshortcuts')).toContain('C');
  });

  it('keeps a plain status chip on rows without a status write', () => {
    render(withQuery(<TeamTasksCard rows={rows} tools={tools} />));
    expect(screen.queryByRole('button', { name: /Change status/ })).not.toBeInTheDocument();
    render(withQuery(<TeamTasksCard rows={[{ ...rows[0]!, id: 't:1', taskId: 't1', source: 'task', itemId: 'task:t1' }]} tools={tools} />));
    expect(screen.getByRole('button', { name: /Name approval · Acme India · status Overdue\. Change status/ })).toBeInTheDocument();
  });
});

describe('Today charts', () => {
  it('draws the task status legend with counts and one workload bar per lead', () => {
    render(
      <>
        <TaskStatusCard rows={rows} />
        <WorkloadByLeadCard rows={rows} rebalanceHref="/app/manager/team" />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Rebalance' })).toHaveAttribute('href', '/app/manager/team');
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
  });
});
