'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { FilterChip } from '@/components/ui/filter-chip';
import { CompanyTile, PersonCell } from '@/components/staff/today/today-parts';
import {
  TODAY_STATUS_ORDER,
  dayMonth,
  dueClass,
  todayStatusTone,
} from '@/components/staff/today/today-rows';
import { useFirmWorkRows, type FirmWorkRow } from '@/views/admin/work/use-firm-work-rows';
import { WorkScreen } from '@/views/intern/MyWork';
import { useTeamWork } from '@/views/manager/use-team-work';
import { WorkAreaCard, WorkStatusCard } from '@/views/manager/work-summary';
import { cn } from '@/lib/utils';

/* The admin's Work tabs (prototype `AdminWorkItems` and the Project leads list, G-18). The
   Managers tab reads `useFirmWorkRows` and the Project leads tab `useTeamWork`; both build on
   `buildInternWorkItems`, so a row is the same item the lead sees on their own Work page. */

const STATUS_FILTER = [
  { value: 'open', label: 'Open' },
  ...TODAY_STATUS_ORDER.map((s) => ({ value: s.status, label: s.status })),
];

const STATUS_RANK = Object.fromEntries(TODAY_STATUS_ORDER.map((s, i) => [s.status, i])) as Record<string, number>;

function sortRows(rows: FirmWorkRow[]): FirmWorkRow[] {
  return [...rows].sort(
    (a, b) => STATUS_RANK[a.status]! - STATUS_RANK[b.status]! || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'),
  );
}

function options(rows: FirmWorkRow[], key: (r: FirmWorkRow) => string, label: (r: FirmWorkRow) => string) {
  return [...new Map(rows.map((r) => [key(r), label(r)])).entries()]
    .map(([value, text]) => ({ value, label: text }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const KIND_WORD: Record<string, string> = { step: 'Step', filing: 'Filing', request: 'Document request', task: 'Task' };

function ItemCell({ row }: { row: FirmWorkRow }) {
  return (
    <span className="flex min-w-0 flex-col">
      <Link href={row.href} className="truncate font-medium text-ink hover:underline" title={row.title} onClick={(e) => e.stopPropagation()}>
        {row.title}
      </Link>
      <span className="truncate text-[12.5px] text-ink-muted">{KIND_WORD[row.source ?? 'step'] ?? 'Step'} · {row.area}</span>
    </span>
  );
}

function CompanyCell({ row }: { row: FirmWorkRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CompanyTile name={row.companyName} />
      <span className="truncate">{row.companyName}</span>
    </span>
  );
}

const dueColumn: EFilingColumn<FirmWorkRow> = {
  key: 'due',
  header: 'Due',
  width: '76px',
  render: (r) => <span className={cn('tabular-nums', r.status !== 'Done' && dueClass(r.status))}>{dayMonth(r.dueAt) || '—'}</span>,
};

const statusColumn: EFilingColumn<FirmWorkRow> = {
  key: 'status',
  header: 'Status',
  width: '128px',
  render: (r) => (
    <Chip tone={todayStatusTone(r.status)} fixed>
      {r.status}
    </Chip>
  ),
};

function useFiltered(rows: FirmWorkRow[], person: (r: FirmWorkRow) => string) {
  const [status, setStatus] = useState('open');
  const [who, setWho] = useState('');
  const [company, setCompany] = useState('');
  const shown = sortRows(
    rows.filter(
      (r) =>
        (!status || (status === 'open' ? r.status !== 'Done' : r.status === status)) &&
        (!who || person(r) === who) &&
        (!company || r.engagementId === company),
    ),
  );
  return { shown, status, setStatus, who, setWho, company, setCompany };
}

/** Managers: a firm-wide feed of the items on each manager's engagements, with open and late counts per manager. */
export function ManagersWorkPanel() {
  const router = useRouter();
  const { rows, loading } = useFirmWorkRows();
  const f = useFiltered(rows, (r) => r.managerId);

  const byManager = useMemo(() => {
    const map = new Map<string, { id: string; name: string; open: number; overdue: number; waiting: number }>();
    for (const r of rows) {
      if (r.status === 'Done') continue;
      const entry = map.get(r.managerId) ?? { id: r.managerId, name: r.managerName, open: 0, overdue: 0, waiting: 0 };
      entry.open += 1;
      if (r.status === 'Overdue') entry.overdue += 1;
      if (r.status === 'Waiting') entry.waiting += 1;
      map.set(r.managerId, entry);
    }
    return [...map.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  }, [rows]);
  const maxOpen = Math.max(1, ...byManager.map((m) => m.open));

  const columns: EFilingColumn<FirmWorkRow>[] = [
    { key: 'item', header: 'Item', render: (r) => <ItemCell row={r} /> },
    { key: 'company', header: 'Company', width: '200px', render: (r) => <CompanyCell row={r} /> },
    { key: 'manager', header: 'Manager', width: '132px', render: (r) => <PersonCell name={r.managerName} /> },
    dueColumn,
    statusColumn,
  ];

  const anyFilter = f.status !== 'open' || Boolean(f.who) || Boolean(f.company);
  const scoped = rows.filter((r) => (!f.who || r.managerId === f.who) && (!f.company || r.engagementId === f.company));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Status" value={f.status} options={STATUS_FILTER} onChange={f.setStatus} />
          <FilterChip label="Manager" value={f.who} options={options(rows, (r) => r.managerId, (r) => r.managerName)} onChange={f.setWho} />
          <FilterChip label="Company" value={f.company} options={options(rows, (r) => r.engagementId, (r) => r.companyName)} onChange={f.setCompany} />
          {anyFilter ? (
            <Button
              size="sm"
              variant="link"
              onClick={() => {
                f.setStatus('open');
                f.setWho('');
                f.setCompany('');
              }}
            >
              Clear
            </Button>
          ) : null}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]">
      <DashSection title="Manager items" meta={String(f.shown.length)} flush loading={loading}>
        <EFilingGrid
          caption="Manager items"
          columns={columns}
          rows={f.shown}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(r.href)}
          pageSize={13}
          minWidth={700}
          empty="No items match these filters"
        />
      </DashSection>
      <div className="flex min-w-0 flex-col gap-5">
      <WorkStatusCard title="Status" items={scoped} loading={loading} />
      <DashSection title="Open by manager" meta={String(byManager.length)} bodyClassName="p-0" loading={loading}>
        {byManager.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-ink-muted">Nothing open.</p>
        ) : (
          <ul>
            {byManager.map((m) => (
              <li key={m.id || 'none'} className="border-t border-line-soft first:border-t-0">
                <button
                  type="button"
                  onClick={() => f.setWho(f.who === m.id ? '' : m.id)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-surface-sunken',
                    f.who === m.id && 'bg-brand-soft',
                  )}
                  aria-pressed={f.who === m.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-3">
                      <PersonCell name={m.name} full />
                      <span className="ml-auto tabular-nums text-ink-2">{m.open} open</span>
                    </span>
                    <span className="mt-1.5 flex h-2 gap-0.5" aria-hidden>
                      {m.overdue > 0 ? <i className="block rounded-[2px] bg-danger-mid" style={{ width: `${(m.overdue / maxOpen) * 100}%` }} /> : null}
                      {m.open - m.overdue > 0 ? (
                        <i className="block rounded-[2px] bg-brand" style={{ width: `${((m.open - m.overdue) / maxOpen) * 100}%` }} />
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {byManager.length > 0 ? (
          <span className="flex items-center gap-3 border-t border-line-soft px-4 py-2 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-[2px] bg-danger-mid" aria-hidden /> Overdue
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-[2px] bg-brand" aria-hidden /> Other open
            </span>
          </span>
        ) : null}
      </DashSection>
      <WorkAreaCard items={scoped} loading={loading} />
      </div>
      </div>
    </div>
  );
}

/**
 * Project leads: the Work screen over every lead's items (prototype manager Work and the old
 * leads grid): list, board, timeline and the admin's own planner, the Lead filter, bulk
 * Assign, row Reassign and the task drawer. The tab stays in the URL (`tab=leads`).
 */
export function LeadsWorkPanel() {
  const work = useTeamWork({ projectBase: '/app/admin' });
  return (
    <WorkScreen
      workItems={work.items}
      kpis={work.kpis}
      engagements={work.engagements}
      path="/app/admin/projects"
      extraParams={{ tab: 'leads' }}
      head={false}
      summary={
        <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <WorkStatusCard title="Team work · status" items={work.items} loading={work.loading} />
          <WorkAreaCard items={work.items} loading={work.loading} />
        </div>
      }
      team={work.team(true)}
      storageScope="admin-leads"
      seo={{ title: 'Work — VCFO Suite', description: 'Firm-wide projects and work items.', path: '/app/admin/projects' }}
    />
  );
}
