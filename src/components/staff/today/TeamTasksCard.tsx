'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BellRing, CheckCheck, Download } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, GRID_SUB, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { AreaPill, Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { FilterChip, FilterChipRow } from '@/components/ui/filter-chip';
import { StatusMenu, type SixWord } from '@/components/ui/status-menu';
import type { BulkAction } from '@/components/ui/bulk-bar';
import { CompanyTile, PersonCell } from '@/components/staff/today/today-parts';
import { BulkAssignMenu, RowMoreMenu, RowQuickActions } from '@/components/staff/today/row-actions';
import {
  TASK_STATUS_WORDS,
  copyRowLink,
  exportRowsCsv,
  reassignMany,
  remindMany,
  type ReassignTarget,
  useMarkDoneMany,
  useReassignMany,
  useSetTaskStatus,
} from '@/components/staff/today/work-actions';
import {
  TODAY_STATUS_ORDER,
  dayMonth,
  dueClass,
  todayStatusTone,
  type TeamTaskRow,
} from '@/components/staff/today/today-rows';
import { ReassignDialog, canMoveItem } from '@/views/admin/work/ReassignDialog';
import { toastError } from '@/lib/toast-errors';
import type { SavedView, ViewFilters } from '@/components/ui/saved-views';
import { shortCompany } from '@/components/super/parts/super-text';
import { cn } from '@/lib/utils';

/** Status filter words: "Open" for everything not done, then the six (R-13). */
const STATUS_FILTER = [
  { value: 'open', label: 'Open' },
  ...TODAY_STATUS_ORDER.map((s) => ({ value: s.status, label: s.status })),
];

/**
 * E-06: the default views of Team tasks. A view is a set of filters; the home card tiles open
 * them with `?view=overdue`, `?view=week` and `?view=waiting`.
 */
const TEAM_TASK_VIEWS: SavedView[] = [
  { key: 'all', label: 'All', filters: {} },
  { key: 'overdue', label: 'Overdue', filters: { status: 'Overdue' } },
  { key: 'week', label: 'This week', filters: { status: 'Due soon' } },
  { key: 'waiting', label: 'Waiting on clients', filters: { status: 'Waiting', holder: 'client' } },
];

/** The item key a row may be reminded about: a step or document request the client still owes. */
function teamRowRemindKey(row: Pick<TeamTaskRow, 'withClient' | 'itemId'>): string | null {
  return row.withClient && row.itemId && /^(step|request):/.test(row.itemId) ? row.itemId : null;
}

/** The writes behind Team tasks' bulk bar, quick actions and status chip (built where `useApp` exists). */
export interface TeamTaskTools {
  /** Per user, for saved views, density and the last visit. */
  storageScope: string;
  /** Project leads a row can be assigned to. */
  leads: Array<{ id: string; name: string }>;
  /** Admin, super admin or manager: Reassign is offered. */
  canReassign: boolean;
  markDone: (rows: TeamTaskRow[]) => Promise<unknown>;
  setTaskStatus: (row: TeamTaskRow, word: SixWord) => void;
  /** Moves steps and tasks to a lead, then refetches the reads behind the rows. */
  reassign?: (targets: ReassignTarget[], to: { id: string; name: string }) => Promise<number>;
}

/** Builds `TeamTaskTools` from the app context. */
export function useTeamTaskTools(opts: Pick<TeamTaskTools, 'storageScope' | 'leads' | 'canReassign'>): TeamTaskTools {
  const markDoneMany = useMarkDoneMany();
  const setStatus = useSetTaskStatus();
  const reassign = useReassignMany();
  return {
    ...opts,
    reassign,
    markDone: (rows) =>
      markDoneMany(
        rows.map((r) => ({
          source: r.source ?? 'step',
          engagementId: r.engagementId,
          title: r.title,
          catalogId: r.catalogId,
          requestId: r.requestId,
          taskId: r.taskId,
          done: r.status === 'Done',
        })),
      ),
    setTaskStatus: (row, word) => {
      if (row.taskId) setStatus(row.taskId, word, row.taskStatus, row.title);
    },
  };
}

function TaskCell({ row, link }: { row: TeamTaskRow; link?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <CompanyTile name={row.companyName} />
      <span className="flex min-w-0 flex-col">
        {link ? (
          <Link href={row.href} className="truncate font-medium text-ink hover:underline" title={row.title}>
            {row.title}
          </Link>
        ) : (
          <span className="truncate font-medium text-ink" title={row.title}>
            {row.title}
          </span>
        )}
        <span className={cn('truncate text-[12.5px] text-ink-muted', GRID_SUB)}>{shortCompany(row.companyName)}</span>
      </span>
    </span>
  );
}

type Props = {
  rows: TeamTaskRow[];
  /** Without tools the card is read-only: no checkboxes, quick actions or status menu. */
  tools?: TeamTaskTools;
  /** L1: the engagements are still loading. */
  loading?: boolean;
};

/**
 * Team tasks (prototype ManagerToday "Team tasks"): R-10 filter chips, a List or
 * Board switch, and a T1 table. Each row opens the step, the filing calendar or the project.
 * With `tools` the table gets row selection and the bulk bar (Assign, Remind, Mark done,
 * Export), quick actions on hover and focus (Enter opens, R reminds, A reassigns, C copies the
 * link), the row menu with Reassign and Copy link (M-27), the status menu on task rows, the
 * density switch and the new-since-last-visit squares.
 */
export function TeamTasksCard(props: Props) {
  return (
    <Suspense fallback={<TeamTasksBody {...props} viewParam={null} />}>
      <TeamTasksWithParams {...props} />
    </Suspense>
  );
}

function TeamTasksWithParams(props: Props) {
  const params = useSearchParams();
  return <TeamTasksBody {...props} viewParam={params?.get('view') ?? null} />;
}

function TeamTasksBody({ rows, tools, loading, viewParam }: Props & { viewParam: string | null }) {
  const router = useRouter();
  // Status starts on Open (prototype), so done rows show only when asked for.
  const [status, setStatus] = useState('open');
  const [lead, setLead] = useState('');
  const [company, setCompany] = useState('');
  const [area, setArea] = useState('');
  const [holder, setHolder] = useState('');
  const [view, setView] = useState('list');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [reassignRow, setReassignRow] = useState<TeamTaskRow | null>(null);

  const apply = (f: ViewFilters) => {
    setStatus(f.status ?? 'open');
    setLead(f.lead ?? '');
    setCompany(f.company ?? '');
    setArea(f.area ?? '');
    setHolder(f.holder ?? '');
    setView('list');
  };
  // E-05: a home card tile opens this card on one saved view.
  useEffect(() => {
    const v = TEAM_TASK_VIEWS.find((x) => x.key === viewParam);
    if (v) apply(v.filters);
  }, [viewParam]);

  const leads = useMemo(
    () => [...new Map(rows.map((r) => [r.leadId, r.leadName])).entries()].map(([value, label]) => ({ value, label })),
    [rows],
  );
  const companies = useMemo(
    () =>
      [...new Map(rows.map((r) => [r.engagementId, r.companyName])).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows],
  );
  const areas = useMemo(() => [...new Set(rows.map((r) => r.area))].map((a) => ({ value: a, label: a })), [rows]);

  const shown = rows.filter(
    (r) =>
      (!status || (status === 'open' ? r.status !== 'Done' : r.status === status)) &&
      (!lead || r.leadId === lead) &&
      (!company || r.engagementId === company) &&
      (!area || r.area === area) &&
      (!holder || r.withClient),
  );
  const shownSig = shown.map((r) => r.id).join('|');
  // Rows that leave the list (a filter, a refetch) leave the selection too.
  useEffect(() => {
    setPicked((s) => {
      if (s.size === 0) return s;
      const live = new Set(shownSig.split('|'));
      const next = new Set([...s].filter((k) => live.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [shownSig]);

  const current: ViewFilters = { status, lead, company, area, holder };
  const anyFilter = Object.values(current).some(Boolean);
  const clear = () => apply({});

  const remind = (list: TeamTaskRow[]) => {
    const targets = list
      .map((r) => ({ r, key: teamRowRemindKey(r) }))
      .filter((x): x is { r: TeamTaskRow; key: string } => Boolean(x.key))
      .map(({ r, key }) => ({ engagementId: r.engagementId, itemKey: key, title: r.title }));
    if (targets.length === 0) {
      toastError('Nothing to remind', 'Only steps and documents the client still owes get a reminder.');
      return;
    }
    void remindMany(targets);
  };
  const assign = async (list: TeamTaskRow[], to: { id: string; name: string }) => {
    const movable = list.filter((r) => canMoveItem(r) && r.leadId !== to.id);
    if (movable.length === 0) {
      toastError('Nothing to assign', 'Steps and tasks move one at a time; filings and requests move with the client.');
      return;
    }
    await (tools?.reassign ?? reassignMany)(
      movable.map((r) => ({ engagementId: r.engagementId, itemKey: r.itemId, title: r.title })),
      to,
    );
    setPicked(new Set());
  };

  const statusCell = (r: TeamTaskRow) => {
    const chip = (
      <Chip tone={todayStatusTone(r.status)} fixed>
        {r.status}
      </Chip>
    );
    // E-03 only where a status write exists: a task row (PATCH /api/tasks/:id).
    if (!tools || !r.taskId) return chip;
    return (
      <StatusMenu value={r.status} words={TASK_STATUS_WORDS} label={`${r.title} · ${r.companyName}`} onChange={(w) => tools.setTaskStatus(r, w)}>
        {chip}
      </StatusMenu>
    );
  };

  const columns: EFilingColumn<TeamTaskRow>[] = [
    { key: 'task', header: 'Task', render: (r) => <TaskCell row={r} link /> },
    { key: 'lead', header: 'Lead', width: '128px', render: (r) => <PersonCell name={r.leadName} /> },
    { key: 'area', header: 'Area', width: '128px', render: (r) => <AreaPill area={r.area} /> },
    {
      key: 'due',
      header: 'Due',
      width: '76px',
      render: (r) => <span className={cn('tabular-nums', r.status !== 'Done' && dueClass(r.status))}>{dayMonth(r.dueAt) || '—'}</span>,
    },
    { key: 'status', header: 'Status', width: '136px', render: statusCell },
  ];

  const bulkActions = (list: TeamTaskRow[]): BulkAction[] => {
    const done = () => setPicked(new Set());
    return [
      ...(tools?.canReassign
        ? [
            {
              key: 'assign',
              label: 'Assign',
              render: (count: number) => <BulkAssignMenu people={tools.leads} count={count} onPick={(p) => void assign(list, p)} />,
            },
          ]
        : []),
      {
        key: 'remind',
        label: 'Remind',
        icon: BellRing,
        disabled: !list.some((r) => teamRowRemindKey(r)),
        onClick: () => {
          remind(list);
          done();
        },
      },
      {
        key: 'done',
        label: 'Mark done',
        icon: CheckCheck,
        disabled: list.every((r) => r.status === 'Done'),
        onClick: () => {
          void tools?.markDone(list);
          done();
        },
      },
      {
        key: 'export',
        label: 'Export',
        icon: Download,
        onClick: () => {
          exportRowsCsv(
            'team-tasks.csv',
            ['Task', 'Company', 'Lead', 'Area', 'Due', 'Status'],
            list.map((r) => [r.title, r.companyName, r.leadName, r.area, r.dueAt?.slice(0, 10) ?? '', r.status]),
          );
          done();
        },
      },
    ];
  };

  const chips = [
    { key: 'status', set: !!status, node: <FilterChip label="Status" value={status} options={STATUS_FILTER} onChange={setStatus} /> },
    { key: 'lead', set: !!lead, node: <FilterChip label="Lead" value={lead} options={leads} onChange={setLead} /> },
    { key: 'company', set: !!company, node: <FilterChip label="Company" value={company} options={companies} onChange={setCompany} /> },
    { key: 'area', set: !!area, node: <FilterChip label="Area" value={area} options={areas} onChange={setArea} /> },
    ...(holder
      ? [{ key: 'holder', set: true, node: <FilterChip label="Held by" value={holder} valueLabel="Client" options={[]} onChange={setHolder} /> }]
      : []),
  ];

  return (
    <DashSection title="Team tasks" meta={String(shown.length)} flush>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-5">
        <FilterChipRow chips={chips} onClear={clear} className="min-w-0 flex-1" />
        <SpectrumTabs
          label="Team tasks view"
          items={[
            { key: 'list', label: 'List' },
            { key: 'board', label: 'Board' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'list' ? (
        <div className="border-t border-line-soft">
          <EFilingGrid
            caption="Team tasks"
            columns={columns}
            rows={shown}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(r.href)}
            pageSize={10}
            minWidth={680}
            empty="No tasks match these filters"
            loading={loading}
            onClearFilters={anyFilter ? clear : undefined}
            stickyHead
            stickyFirstColumn
            {...(tools
              ? {
                  selectable: true,
                  selected: picked,
                  onSelectedChange: setPicked,
                  bulkActions,
                  bulkNoun: ['task', 'tasks'] as [string, string],
                  // M-27 (D1): Open and Remind at the row end, then the row menu with Reassign (A)
                  // and Copy link (C). The row column holds three buttons, so Reassign lives in the menu.
                  actionsColumn: 'task',
                  rowActions: (r: TeamTaskRow) => (
                    <RowQuickActions onOpen={() => router.push(r.href)} onRemind={teamRowRemindKey(r) ? () => remind([r]) : undefined}>
                      <RowMoreMenu
                        reassign={
                          !tools.canReassign
                            ? undefined
                            : canMoveItem(r)
                              ? {
                                  people: tools.leads,
                                  currentId: r.leadId,
                                  onPick: (p) => void assign([r], p),
                                }
                              : { onOpen: () => setReassignRow(r) }
                        }
                        link={() => void copyRowLink(r.href)}
                      />
                    </RowQuickActions>
                  ),
                  rowShortcuts: [
                    { key: 'r', run: (r: TeamTaskRow) => (teamRowRemindKey(r) ? remind([r]) : undefined) },
                    ...(tools.canReassign ? [{ key: 'a', run: (r: TeamTaskRow) => setReassignRow(r) }] : []),
                    { key: 'c', run: (r: TeamTaskRow) => void copyRowLink(r.href) },
                  ],
                  densityScope: `${tools.storageScope}:team-tasks`,
                  changedAt: (r: TeamTaskRow) => r.changedAt,
                  visitKey: `${tools.storageScope}:team-tasks`,
                }
              : {})}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 border-t border-line-soft p-4 sm:grid-cols-2 xl:grid-cols-3">
          {TODAY_STATUS_ORDER.map((s) => {
            const list = shown.filter((r) => r.status === s.status);
            return (
              <section
                key={s.status}
                className="min-w-0 rounded-md border-1.5 border-line bg-surface-sunken p-2.5"
                aria-label={s.status}
              >
                <h3 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-medium text-ink-2">
                  <i className={cn('h-2 w-2 rounded-[2px]', s.bar)} aria-hidden />
                  {s.status}
                  <span className="ml-auto text-[12px] text-ink-muted">{list.length}</span>
                </h3>
                <ul className="grid gap-2">
                  {list.slice(0, 12).map((r) => (
                    <li key={r.id} className="grid gap-2 rounded-md border-1.5 border-line bg-surface-raised p-2.5">
                      <TaskCell row={r} link />
                      <span className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                        <PersonCell name={r.leadName} />
                        <span className={cn('ml-auto tabular-nums', r.status !== 'Done' && dueClass(r.status))}>
                          {dayMonth(r.dueAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                  {list.length > 12 ? (
                    <li className="px-1 text-[12.5px] text-ink-muted">{list.length - 12} more in the list</li>
                  ) : null}
                  {list.length === 0 ? (
                    <li className="rounded-md border-fine px-2 py-3 text-center text-[12.5px] text-ink-muted">
                      None
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {tools?.canReassign ? (
        <ReassignDialog row={reassignRow} onOpenChange={(open) => (!open ? setReassignRow(null) : undefined)} leads={tools.leads} />
      ) : null}
    </DashSection>
  );
}
