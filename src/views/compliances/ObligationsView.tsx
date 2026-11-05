'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calendar, CalendarClock, CircleCheck, User } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { FilterSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { AreaPill } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Term } from '@/components/ui/term';
import { SkeletonRows } from '@/components/ui/empty-state';
import {
  PreIncorporationNotice,
} from '@/components/compliances/PreIncorporationNotice';
import { monthKeyOf, rowsInMonth } from '@/lib/compliance/filings';
import { cn } from '@/lib/utils';
import {
  ALL_COMPANIES,
  normaliseCompanyParam,
  pickedCompany,
  rowsForCompany,
  soleCompany,
  type ComplianceScope,
} from '@/views/compliances/compliance-scope';
import { areaLabel, daysUntil, plainDate } from '@/lib/compliance/spectrum-status';
import {
  FilingBand,
  FilterStrip,
  FlowCard,
  RailCard,
  WordChip,
  type RailItem,
  type StripItem,
} from '@/views/compliances/spectrum-parts';
import { GroupedGrid, KeyHint, useListKeys, type GridColumn, type GridGroup } from '@/views/compliances/grouped-grid';
import { ClientTile, PersonCell } from '@/views/compliances/identity';
import { areaSwatch } from '@/views/compliances/area-swatch';
import { useRegister } from '@/views/compliances/use-register';
import { useViewParams } from '@/views/compliances/view-params';
import { useApp } from '@/context/AppContext';
import { isAdminOrManager } from '@/lib/auth';
import { CategoryTabs } from '@/components/compliances/CategoryTabs';
import { useTasks, type TaskRowDto } from '@/views/compliances/tasks/api';
import { NewTaskButton } from '@/views/compliances/tasks/new-task';
import { NewWorkMenu } from '@/views/board-meetings/NewMeetingDialog';
import { statHref, taskColumns, taskGroups, taskHref, taskRowMatches } from '@/views/compliances/tasks/task-list';
import type { Category } from '@/views/compliances/tasks/task-model';
import {
  dueWithinSoon,
  flowCounts,
  groupObligations,
  matchesFilter,
  waitingOnClient,
  type ObligationClientRow,
  type ObligationFilter,
  type ObligationGroup,
} from '@/lib/compliance/obligation-groups';

type GroupBy = 'filing' | 'frequency' | 'law';

/** S-8: the strip labels follow the category in view. */
const STRIP_LABELS: Record<Category, [string, string, string, string, string]> = {
  stat: ['Overdue', 'Due in 15 days', 'Waiting on client', 'Filed', 'Upcoming'],
  ns: ['Overdue', 'Due this week', 'Waiting on client', 'Done', 'Not started'],
  all: ['Overdue', 'Due soon', 'Waiting on client', 'Filed or done', 'Upcoming'],
};
const FREQUENCIES: Array<[string, string]> = [
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['half-yearly', 'Half-yearly'],
  ['annual', 'Annual'],
  ['one-time', 'One-time'],
];
const FREQ_DOT: Record<string, string> = {
  monthly: 'bg-brand',
  quarterly: 'bg-identity',
  'half-yearly': 'bg-waiting-mid',
  annual: 'bg-warning-mid',
  'one-time': 'bg-upcoming-mid',
};

/** One client row with its obligation, for the flat "by frequency" and "by law" lists. */
interface FlatRow extends ObligationClientRow {
  group: ObligationGroup;
}

/** "3 days late", "Today", "In 4 days". */
function dueWords(iso: string, now: Date): string {
  const d = daysUntil(iso, now);
  if (d === null) return '—';
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} late`;
  if (d === 0) return 'Today';
  return `In ${d} day${d === 1 ? '' : 's'}`;
}

/**
 * OBLIGATIONS — the staff register grouped by filing (prototype C-0108).
 *
 * For each obligation a band with the date tile, the name, the area pill and
 * an "n of m filed" bar for the period that needs attention, then the client
 * rows under it. "By frequency" and "By law" regroup the same client rows. A
 * number strip filters the list; the rail carries the progress flow of this
 * month, "Due in the next 15 days", "Waiting on client" and "Filed recently"
 * (owner decision for the Obligations rail).
 *
 * Rows come from the scoped register (`useRegister`); `scope` is the caller's
 * roster for the company picker and the pre-COI notice. `?company=`, `?by=`
 * and `?state=` carry the state on refresh. `embedded` renders the list as a
 * tab of the client record (G-19): `scope` is that one client, the state stays
 * in memory and the page head is left to the record.
 */
export function ObligationsView({ basePath, scope, embedded = false }: { basePath: string; scope: ComplianceScope; embedded?: boolean }) {
  const params = useViewParams(`${basePath}/obligations`, embedded);
  const now = useMemo(() => new Date(), []);
  const { engagements } = scope;
  const sole = soleCompany(engagements);
  const companyId = sole ? sole.id : normaliseCompanyParam(params.get('company'), engagements);
  const byParam = params.get('by');
  const groupBy: GroupBy = byParam === 'frequency' || byParam === 'law' ? byParam : 'filing';
  const stateParam = params.get('state') ?? '';
  const filter: ObligationFilter = (['overdue', 'soon', 'waiting', 'done', 'none'] as const).includes(stateParam as never)
    ? (stateParam as ObligationFilter)
    : '';

  const catParam = params.get('cat');
  const cat: Category = catParam === 'ns' || catParam === 'all' ? catParam : 'stat';
  const hasStat = cat !== 'ns';
  const hasNs = cat !== 'stat';
  const { user } = useApp();
  // S-4: admin and manager create non-statutory tasks; leads do not. Super admin has the same rights.
  const canCreate = isAdminOrManager(user?.role);
  // Board meetings: every staff role (the lead included) can start one; clients cannot.
  const canMeet = Boolean(user?.role) && user?.role !== 'client';
  const [taskRequest, setTaskRequest] = useState(0);
  const typeParam = params.get('type');
  const workType: 'all' | 'task' | 'meeting' = typeParam === 'meeting' || typeParam === 'task' ? typeParam : 'all';

  const picked = pickedCompany(engagements, companyId);
  const pickedPreIncorporation = picked && scope.preIncorporationIds.has(picked.id) ? picked : null;

  const register = useRegister(now);
  const rows = rowsForCompany(register.rows, companyId);
  const groups = groupObligations(rows, register.details, now);
  const allClientRows = groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g })));

  const setParams = params.set;

  // S-2: a row opens the statutory detail page of that client's period (4.2).
  const hrefOf = (r: FlatRow): string => statHref(basePath, r.group.obligationId, r.row.id);

  // Non-statutory tasks (S-3). The client filter applies to them too; not-applicable rows stay hidden.
  const tasksQuery = useTasks({ engagementId: companyId !== ALL_COMPANIES ? companyId : undefined });
  const tasks: TaskRowDto[] = useMemo(() => (tasksQuery.data?.tasks ?? []).filter((t) => !t.hidden), [tasksQuery.data?.tasks]);
  const ofType = (t: TaskRowDto) => (workType === 'all' ? true : workType === 'meeting' ? Boolean(t.boardMeetingId) : !t.boardMeetingId);
  const shownTasks = tasks.filter((t) => ofType(t) && taskRowMatches(t, filter));
  const tHref = (t: TaskRowDto) => taskHref(basePath, t.id, t.boardMeetingId);

  const count = (f: ObligationFilter) => allClientRows.filter((r) => matchesFilter(r, f, now)).length;
  const taskCount = (f: ObligationFilter) => tasks.filter((t) => taskRowMatches(t, f)).length;
  /** S-8: the strip counts the category in view. */
  const tally = (f: ObligationFilter) => (hasStat ? count(f) : 0) + (hasNs ? taskCount(f) : 0);
  const L = STRIP_LABELS[cat];
  const strip: StripItem[] = [
    { key: 'overdue', label: L[0], value: tally('overdue'), Icon: AlertTriangle, valueClass: 'text-danger' },
    { key: 'soon', label: L[1], value: tally('soon'), Icon: Calendar, valueClass: 'text-warning' },
    { key: 'waiting', label: L[2], value: tally('waiting'), Icon: User },
    { key: 'done', label: L[3], value: tally('done'), Icon: CircleCheck, valueClass: 'text-positive' },
    { key: 'none', label: L[4], value: tally('none'), Icon: CalendarClock },
  ];

  const shownFlat: FlatRow[] = allClientRows.filter((r) => matchesFilter(r, filter, now));
  const gridGroups: GridGroup<FlatRow>[] =
    groupBy === 'filing'
      ? groups.map((g) => {
          const list = shownFlat.filter((r) => r.group.obligationId === g.obligationId);
          return { id: g.obligationId, label: g.name, rows: list, head: <FilingHead group={g} /> };
        })
      : groupBy === 'law'
        ? [...new Set(groups.map((g) => g.area))]
            .sort((a, b) => a.localeCompare(b))
            .map((a) => ({ id: a, label: areaLabel(a), dot: areaSwatch(a), rows: shownFlat.filter((r) => r.group.area === a) }))
        : FREQUENCIES.map(([key, label]) => ({
            id: key,
            label,
            dot: FREQ_DOT[key],
            rows: shownFlat.filter((r) => r.group.frequency.trim().toLowerCase() === key),
          }));

  const statusCol: GridColumn<FlatRow> = { key: 'status', label: 'Status', width: 128, render: (r) => <WordChip word={r.word} /> };
  const dueCol: GridColumn<FlatRow> = {
    key: 'due',
    label: 'Next due',
    width: 108,
    render: (r) => (
      <span className={cn('whitespace-nowrap', r.status === 'overdue' ? 'font-medium text-danger' : 'text-ink-muted')}>{plainDate(r.nextDue ?? r.row.dueDate, now)}</span>
    ),
  };
  const lastCol: GridColumn<FlatRow> = {
    key: 'last',
    label: 'Last filed',
    width: 120,
    className: 'hidden md:table-cell',
    render: (r) => <span className="text-ink-muted">{plainDate(r.lastFiled, now)}</span>,
  };
  const filingCols: GridColumn<FlatRow>[] = [
    {
      key: 'client',
      label: 'Filing · client',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5 md:pl-[56px]">
          <ClientTile id={r.row.engagementId} name={r.row.companyName} />
          <span className="min-w-0 truncate font-medium text-ink">{r.row.companyName}</span>
        </span>
      ),
    },
    {
      key: 'owner',
      label: 'Lead',
      width: 180,
      className: 'hidden md:table-cell',
      render: (r) => <PersonCell name={r.detail?.ownerName} />,
    },
    lastCol,
    statusCol,
    { ...dueCol, className: 'hidden md:table-cell' },
  ];
  const flatCols: GridColumn<FlatRow>[] = [
    {
      key: 'name',
      label: 'Obligation',
      render: (r) => (
        <span className="block min-w-0">
          <b className="block truncate text-[14px] font-medium text-ink">{r.group.name}</b>
          <span className="block truncate text-[12.5px] text-ink-muted">{r.row.companyName}</span>
        </span>
      ),
    },
    {
      key: 'law',
      label: 'Law',
      width: 140,
      className: 'hidden md:table-cell',
      render: (r) => <AreaPill area={areaLabel(r.group.area)} />,
    },
    lastCol,
    statusCol,
    dueCol,
  ];

  // Rail: this month's flow and the three lists (owner decision).
  const monthKey = monthKeyOf(now.toISOString())!;
  const flow = flowCounts(rowsInMonth(rows, monthKey), register.details);
  const soon = allClientRows
    .filter((r) => dueWithinSoon(r.row, now))
    .sort((a, b) => a.row.dueDate.localeCompare(b.row.dueDate))
    .slice(0, 5);
  const waiting = allClientRows
    .filter((r) => waitingOnClient(r.row, r.detail, now))
    .sort((a, b) => a.row.dueDate.localeCompare(b.row.dueDate))
    .slice(0, 5);
  const filedRecently = rows
    .filter((r) => r.filedOn)
    .sort((a, b) => (b.filedOn ?? '').localeCompare(a.filedOn ?? ''))
    .slice(0, 4);
  const rail = (list: FlatRow[], right: (r: FlatRow) => string, rightClass?: (r: FlatRow) => string | undefined): RailItem[] =>
    list.map((r) => ({
      key: r.key,
      title: r.group.name,
      sub: r.row.companyName,
      right: right(r),
      rightClass: rightClass?.(r),
      href: hrefOf(r),
    }));
  const taskRail = (list: TaskRowDto[]): RailItem[] =>
    list.map((t) => ({
      key: `task-${t.id}`,
      title: t.title,
      sub: t.companyName,
      right: plainDate(t.dueDate, now),
      rightClass: t.word === 'Overdue' ? 'font-medium text-danger' : undefined,
      href: tHref(t),
    }));
  const byDue = (a: TaskRowDto, b: TaskRowDto) => a.dueDate.localeCompare(b.dueDate);
  // The rail follows the category; All lists statutory rows first, then tasks.
  const soonItems: RailItem[] = [
    ...(hasStat ? rail(soon, (r) => plainDate(r.row.dueDate, now)) : []),
    ...(hasNs ? taskRail(tasks.filter((t) => t.word !== 'Done' && t.week === 'This week').sort(byDue)) : []),
  ].slice(0, 5);
  const waitingItems: RailItem[] = [
    ...(hasStat
      ? rail(
          waiting,
          (r) => dueWords(r.row.dueDate, now),
          (r) => cn('font-medium', r.status === 'overdue' ? 'text-danger' : 'text-waiting'),
        )
      : []),
    ...(hasNs ? taskRail(tasks.filter((t) => t.word === 'Waiting').sort(byDue)) : []),
  ].slice(0, 5);
  const doneItems: RailItem[] = [
    ...(hasStat
      ? filedRecently.map((r) => ({
          key: r.id,
          title: r.particular,
          sub: r.companyName,
          right: plainDate(r.filedOn, now),
          href: statHref(basePath, r.obligationId, r.id),
        }))
      : []),
    ...(hasNs
      ? taskRail(tasks.filter((t) => t.word === 'Done').sort((a, b) => (b.completedAt ?? b.dueDate).localeCompare(a.completedAt ?? a.dueDate)))
      : []),
  ].slice(0, 4);
  const inStage = (...st: TaskRowDto['stage'][]) => tasks.filter((t) => st.includes(t.stage)).length;
  const flowSteps =
    cat === 'stat'
      ? [
          { label: 'Data from client', value: flow.data },
          { label: 'Prepared', value: flow.prepared },
          { label: 'Filed', value: flow.filed },
          { label: 'Acknowledged', value: flow.acknowledged },
        ]
      : [
          { label: 'Not started', value: (hasStat ? count('none') : 0) + inStage('not-started', 'ready') },
          { label: 'Waiting on client', value: (hasStat ? count('waiting') : 0) + inStage('waiting') },
          { label: 'In progress', value: (hasStat ? flow.prepared : 0) + inStage('in-progress', 'review', 'rework') },
          { label: 'Done', value: (hasStat ? count('done') : 0) + inStage('completed') },
        ];

  // List keys (prototype `useListKeys`): arrows move between rows, "/" goes to the first filter.
  // Inside the client record the list ref stays unattached, so the record keeps its own keys.
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);
  useListKeys(listRef, filterRef);

  const head = (
    <span ref={filterRef} className="contents">
      {sole ? null : (
        <FilterSelect
          aria-label="Client"
          options={[{ value: ALL_COMPANIES, label: 'All my clients' }, ...engagements.map((e) => ({ value: e.id, label: e.companyName }))]}
          value={companyId}
          onChange={(e) => setParams({ company: e.target.value === ALL_COMPANIES ? null : e.target.value })}
        />
      )}
      {filter || (!sole && companyId !== ALL_COMPANIES) ? (
        <Button size="sm" variant="ghost" onClick={() => setParams({ state: null, company: null })}>
          Clear
        </Button>
      ) : null}
      {canCreate || canMeet ? (
        <NewWorkMenu
          canCreateTask={canCreate}
          onTask={() => setTaskRequest((n) => n + 1)}
          companies={engagements.map((e) => ({ id: e.id, name: e.companyName }))}
          defaultCompany={companyId !== ALL_COMPANIES ? companyId : sole?.id}
          basePath={basePath}
        />
      ) : null}
      {canCreate ? (
        <NewTaskButton
          hideTrigger
          openRequest={taskRequest}
          engagements={engagements}
          defaultClient={companyId !== ALL_COMPANIES ? companyId : sole?.id}
          now={now}
          onCreated={(t) => {
            // Show the new row: open the task list and drop filters that would hide it.
            const next: Record<string, string | null> = { cat: cat === 'stat' ? 'ns' : cat, state: null };
            if (companyId !== ALL_COMPANIES && companyId !== t.engagementId) next.company = null;
            setParams(next);
          }}
        />
      ) : null}
    </span>
  );

  // S-1: the category switch over the list; the group switch stays for statutory rows (S-2).
  const bar = (
    <>
      <CategoryTabs value={cat} onChange={(c) => setParams({ cat: c === 'stat' ? null : c })} stat={allClientRows.length} ns={tasks.length} />
      {hasStat ? (
        <SpectrumTabs
          label="Group by"
          className="sm:ml-auto"
          items={[
            { key: 'filing', label: 'By filing' },
            { key: 'frequency', label: 'By frequency' },
            { key: 'law', label: 'By law' },
          ]}
          value={groupBy}
          onChange={(v) => setParams({ by: v === 'filing' ? null : v })}
        />
      ) : (
        <SpectrumTabs
          label="Type"
          className="sm:ml-auto"
          items={[
            { key: 'all', label: 'All' },
            { key: 'task', label: 'Tasks' },
            { key: 'meeting', label: 'Meetings', count: tasks.filter((t) => t.boardMeetingId).length || undefined },
          ]}
          value={workType}
          onChange={(v) => setParams({ type: v === 'all' ? null : v })}
        />
      )}
    </>
  );
  const taskGrid = (top: boolean) => (
    <GroupedGrid
      title={top ? 'Obligations' : 'Non-statutory tasks'}
      right={top ? head : undefined}
      bar={top ? bar : undefined}
      columns={taskColumns(now)}
      groups={taskGroups(shownTasks)}
      rowKey={(t) => t.id}
      rowHref={tHref}
      empty={tasksQuery.isPending ? 'Loading tasks' : tasksQuery.isError ? 'Could not load the tasks' : 'No tasks in view'}
      footer={embedded || !top ? undefined : <KeyHint />}
    />
  );

  return (
    <PageTransition>
      {embedded ? null : (
        <SEO title="Obligations — VCFO Suite" description="Statutory obligations grouped by filing, with each client's status." path={`${basePath}/obligations`} />
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {embedded ? null : <h1 className="sr-only">Obligations</h1>}
        <FilterStrip items={strip} value={filter} onChange={(k) => setParams({ state: k || null })} />

        {pickedPreIncorporation ? (
          <PreIncorporationNotice scope={{ audience: scope.audience, companyName: pickedPreIncorporation.companyName }} />
        ) : null}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div ref={embedded ? undefined : listRef} className="min-w-0">
            {register.isPending ? (
              <div className="surface p-4" aria-busy="true" aria-label="Loading obligations">
                <SkeletonRows rows={6} />
              </div>
            ) : register.isError ? (
              <p className="surface px-4 py-6 text-center text-[13px] text-ink-muted">Could not load the register. Try again in a moment.</p>
            ) : hasStat ? (
              <div className="grid min-w-0 gap-5">
                <GroupedGrid
                  title="Obligations"
                  right={head}
                  bar={bar}
                  columns={groupBy === 'filing' ? filingCols : flatCols}
                  groups={gridGroups}
                  rowKey={(r) => r.key}
                  rowHref={hrefOf}
                  empty="No obligations in view"
                  footer={embedded ? undefined : <KeyHint />}
                />
                {cat === 'all' ? taskGrid(false) : null}
              </div>
            ) : (
              taskGrid(true)
            )}
          </div>
          <div className="grid min-w-0 gap-3">
            <FlowCard title="This month" steps={flowSteps} />
            <RailCard title={cat === 'stat' ? 'Due in the next 15 days' : cat === 'ns' ? 'This week' : 'Due soon'} items={soonItems} />
            <RailCard title="Waiting on client" items={waitingItems} />
            <RailCard title={cat === 'stat' ? 'Filed recently' : 'Done recently'} items={doneItems} />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

/** Band of one filing (the shared `FilingBand`): date tile, name and due date, area pill, filed count with a green bar. */
function FilingHead({ group }: { group: ObligationGroup }) {
  return (
    <FilingBand
      iso={group.dueDate}
      status={group.status}
      name={<Term>{group.name}</Term>}
      sub={`Due ${plainDate(group.dueDate)}`}
      area={areaLabel(group.area)}
      filed={group.filed}
      total={group.total}
    />
  );
}
