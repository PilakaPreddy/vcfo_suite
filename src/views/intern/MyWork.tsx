'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BellRing, CheckCheck, CheckCircle2, Download, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { ActionMenu } from '@/components/ui/action-menu';
import { DashSection } from '@/components/dash/DashSection';
import { PlanTimeline } from '@/components/work/PlanTimeline';
import { shortDate } from '@/components/timeline/timeline-model';
import { WorkAreaCard, WorkStatusCard } from '@/views/manager/work-summary';
import type { Engagement } from '@/data/engagements';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { InternWorkKindChip } from '@/components/intern/InternWorkRow';
import { WorkBoard } from '@/components/work/WorkBoard';
import { InternWorkDrawer } from '@/components/intern/InternWorkDrawer';
import { LeadCompanyChip } from '@/components/intern/LeadCompanyChip';
import { FilterChip, FilterChipRow } from '@/components/ui/filter-chip';
import { SavedViews, type SavedView, type ViewFilters } from '@/components/ui/saved-views';
import { StatusMenu } from '@/components/ui/status-menu';
import type { BulkAction } from '@/components/ui/bulk-bar';
import { EFilingGrid, GRID_SUB, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { BulkAssignMenu, RowMoreMenu, RowQuickActions } from '@/components/staff/today/row-actions';
import { PersonCell } from '@/components/staff/today/today-parts';
import { AreaPill } from '@/components/ui/spectrum-chip';
import { ReassignDialog, canMoveItem } from '@/views/admin/work/ReassignDialog';
import type { TeamLead, TeamWorkItem } from '@/views/manager/team-work';
import { todayAreaOf, todayStatusOf, workItemChangedAt, type TodayStatus } from '@/components/staff/today/today-rows';
import {
  TASK_STATUS_WORDS,
  copyRowLink,
  exportRowsCsv,
  remindMany,
  useMarkDoneMany,
  useReassignMany,
  useSetTaskStatus,
} from '@/components/staff/today/work-actions';
import { internKindStatus } from '@/components/intern/intern-tones';
import { remindableItemKey } from '@/lib/reminders/reminder-rules';
import type { StatusCode } from '@/data/checklist';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useInternPortfolio } from '@/hooks/use-intern-portfolio';
import { useFilings } from '@/hooks/use-filings';
import { useOwnFocusTodos } from '@/hooks/use-personal-todos';
import { useApp } from '@/context/AppContext';
import { PlannerCalendar, type PlannerItem } from '@/components/work/PlannerCalendar';
import { PlanWeekDialog } from '@/components/work/PlanWeekDialog';
import { NewTodoDialog, PlannerTodos } from '@/components/work/PlannerTodos';
import { RunningSessionChip } from '@/components/work/RunningSessionChip';
import { filingInstanceIdMap, workItemKeyFor } from '@/lib/work/work-item-key';
import { addDaysYmd, istYmdOf, weekOf } from '@/lib/work/planner';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import {
  INTERN_TASKS_PATH,
  INTERN_WORK_VIEW_KEY,
  createCustomInternFocus,
  filterInternWork,
  formatDueLabel,
  formatIstWeekdayDay,
  internWorkPath,
  parseInternWorkDay,
  parseInternWorkFocus,
  parseInternWorkKindFilter,
  parseInternWorkTag,
  parseInternWorkView,
  sortInternWork,
  workPart,
  ymdInIst,
  type InternWorkFocus,
  type InternWorkItem,
  type InternWorkKindFilter,
  type InternWorkKpis,
  type InternWorkTag,
  type InternWorkView,
} from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';

/** The three list views plus the Planner (G-17), which lives only in this view's URL. */
export type WorkView = InternWorkView | 'plan';

const VIEWS: { key: WorkView; label: string }[] = [
  { key: 'plan', label: 'Planner' },
  { key: 'list', label: 'List' },
  { key: 'board', label: 'Board' },
];

/** The six status words (R-13) for the Status filter. */
const STATUS_WORDS: TodayStatus[] = ['Overdue', 'Due soon', 'In progress', 'Waiting', 'Not started', 'Done'];
const DUE_OPTIONS = [
  { value: 'week', label: 'This week' },
  { value: 'next', label: 'Next week' },
];

function parseWorkView(value: string | null | undefined): WorkView {
  if (value === 'plan' || value === 'tl') return 'plan';
  return parseInternWorkView(value);
}

/**
 * `internWorkPath` with the Planner view kept in the `view` param, on the page at `path` (the
 * lead's `/app/intern/tasks`, the manager's `/app/manager/work`, or one lead's page). `lead`
 * is the team pages' Lead filter.
 */
function workPath(
  filters: Parameters<typeof internWorkPath>[0] & { lead?: string | null; status?: string | null; due?: string | null },
  view: WorkView,
  path: string = INTERN_TASKS_PATH,
  extra?: Record<string, string>,
): string {
  const url = new URL(internWorkPath({ ...filters, view: view === 'plan' ? 'tl' : view }), 'http://work.local');
  if (view === 'plan') url.searchParams.set('view', 'plan');
  if (filters.lead) url.searchParams.set('lead', filters.lead);
  if (filters.status) url.searchParams.set('status', filters.status);
  if (filters.due) url.searchParams.set('due', filters.due);
  for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v);
  return `${path}${url.search}`;
}

/** Open items the planner may place: everything not done and not waiting on someone else. */
const PLANNABLE = new Set(['rejected', 'review', 'deliver', 'overdue', 'in-progress', 'filing', 'task']);

const FOCUS_OPTIONS: { value: InternWorkFocus; label: string }[] = [
  { value: 'action', label: 'Needs action' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'due', label: 'Due this week' },
  { value: 'progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

/**
 * E-06: the default saved views of Work. A view is a set of the URL filters below; the lead's
 * home card tiles open them with `?view=overdue`, `?view=week` and `?view=waiting`.
 */
const WORK_VIEWS: SavedView[] = [
  { key: 'all', label: 'All', filters: {} },
  { key: 'overdue', label: 'My overdue', filters: { focus: 'overdue' } },
  { key: 'week', label: 'This week', filters: { focus: 'due' } },
  { key: 'waiting', label: 'Waiting on clients', filters: { tag: 'client' } },
];

const TAG_LABEL: Record<InternWorkTag, string> = {
  rejected: 'Sent back',
  review: 'Review',
  deliver: 'Deliver',
  critical: 'Critical',
  overdue: 'Overdue',
  client: 'With client',
  manager: 'With manager',
  filings: 'Filings',
  steps: 'Steps',
};

/**
 * Lead Work (prototype `WorkScreen`): list, board and timeline of the lead's open steps and
 * filings. The views sit in a segmented switch; the filters are R-10 chips in the table head
 * bar and still live in the URL, so links from Today keep working. A row opens the task drawer
 * with the item's facts and its action; the step page stays one click away. The Planner view
 * holds the week calendar of time blocks and the personal to-dos; "Plan my week" and
 * "New to-do" sit in the head on every view (G-17).
 */
function InternMyWorkInner() {
  const { workItems, kpis, myEngagements } = useInternPortfolio();
  return <WorkScreen workItems={workItems} kpis={kpis} engagements={myEngagements} />;
}

/** The team part of a Work page: the leads, and each item's lead (manager Work, one lead's page). */
export interface WorkTeam {
  /** Leads the items can move to (`/api/work/reassign`); empty hides Assign and Reassign. */
  leads: TeamLead[];
  /** The team item for a work item id, with its lead and the Reassign row. */
  byId: Map<string, TeamWorkItem>;
  /** Show the Lead column, the Lead filter and the lead on board cards (the manager's Work). */
  showLead: boolean;
  /** The lead key of the viewer's own tasks: those items, and items waiting on a manager, are "Pending with me". */
  meKey?: string;
}

export interface WorkScreenProps {
  workItems: InternWorkItem[];
  kpis: InternWorkKpis;
  /** The engagements behind the items, for the Company filter. */
  engagements: Engagement[];
  /** The page the filters live on; the lead's Work by default. */
  path?: string;
  /** A page head in place of the "Work" title and its buttons (the one-lead page); `false` for none (a tab of another page). */
  head?: ReactNode | false;
  /** URL params of the host page kept on every filter change (`tab=leads` on the admin Work page). */
  extraParams?: Record<string, string>;
  /** Cards between the head and the views (the one-lead page's Status and By area). */
  summary?: ReactNode;
  /** The views offered, in order; all four by default. */
  views?: WorkView[];
  /** The Planner view's content in place of the user's own calendar and to-dos. */
  planner?: ReactNode;
  team?: WorkTeam;
  /** Where the table preferences and the saved views are kept. */
  storageScope?: string;
  seo?: { title: string; description: string; path: string };
}

/**
 * Work: the lead's own Work page (`/app/intern/tasks`), the manager's Work (`/app/manager/work`)
 * and the work part of one lead's page. With `team` the list adds the Lead column and filter,
 * bulk Assign and row Reassign (managers and admins move steps and tasks through
 * `/api/work/reassign`), the board shows each card's lead and the drawer marks items that wait
 * on the viewer.
 */
export function WorkScreen({
  workItems,
  kpis,
  engagements: myEngagements,
  path = INTERN_TASKS_PATH,
  head,
  extraParams,
  summary,
  views: allowedViews,
  planner,
  team,
  storageScope,
  seo = { title: 'My work — VCFO Suite', description: 'List, board, and timeline of your open steps and filings.', path: '/app/intern/tasks' },
}: WorkScreenProps) {
  const params = useSearchParams();
  const router = useRouter();
  const { user, tasks, engagementsLoading, getStateForEngagement } = useApp();
  const viewList = allowedViews ? VIEWS.filter((v) => allowedViews.includes(v.key)) : VIEWS;
  const scopeKey = storageScope ?? user?.id ?? 'lead';
  const register = useFilings();
  const { focus: todos, persist: persistTodos, byId: todoItems } = useOwnFocusTodos(user?.id ?? '', workItems);
  const now = useMemo(() => new Date(), []);
  const focus = parseInternWorkFocus(params.get('focus'));
  const tag = parseInternWorkTag(params.get('tag'));
  const companyId = params.get('company');
  const kind = parseInternWorkKindFilter(params.get('kind'));
  const day = parseInternWorkDay(params.get('day'));
  const leadFilter = team?.showLead ? params.get('lead') : null;
  const fitView = (v: WorkView): WorkView => (viewList.some((x) => x.key === v) ? v : viewList[0]!.key);
  const statusFilter = params.get('status');
  const dueFilter = params.get('due');
  const [view, setView] = useState<WorkView>(() => fitView(params.get('view') ? parseWorkView(params.get('view')) : 'plan'));
  const listRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [weekYmd, setWeekYmd] = useState(() => istYmdOf(now));
  const [planOpen, setPlanOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [moving, setMoving] = useState<InternWorkItem | null>(null);
  const reassign = useReassignMany();

  const viewKey = path === INTERN_TASKS_PATH ? INTERN_WORK_VIEW_KEY : `${INTERN_WORK_VIEW_KEY}:${path}`;
  useEffect(() => {
    const fromUrl = params.get('view');
    if (fromUrl) {
      setView(fitView(parseWorkView(fromUrl)));
      return;
    }
    try {
      const stored = window.localStorage.getItem(viewKey);
      if (stored) setView(fitView(parseWorkView(stored)));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fitView` and `viewKey` follow the props that do not change on a page.
  }, [params]);

  // Status words and areas (team items carry them; the lead's own are worked out here).
  const engIndex = useMemo(() => new Map(myEngagements.map((e) => [e.id, e])), [myEngagements]);
  const statusOf = useCallback(
    (item: InternWorkItem): TodayStatus => {
      const t = team?.byId.get(item.id);
      if (t) return t.status;
      const eng = engIndex.get(item.engagementId);
      const slice = eng && item.catalogId ? getStateForEngagement(eng)[item.catalogId] : undefined;
      return todayStatusOf(item, slice, now);
    },
    [team, engIndex, getStateForEngagement, now],
  );
  const areaOf = useCallback(
    (item: InternWorkItem): string => team?.byId.get(item.id)?.area ?? todayAreaOf(item, new Map()),
    [team],
  );
  const dueWeeks = useMemo(() => {
    const today = istYmdOf(now);
    return { week: new Set(weekOf(today)), next: new Set(weekOf(addDaysYmd(today, 7))) };
  }, [now]);
  const filtered = useMemo(
    () =>
      sortInternWork(
        filterInternWork(workItems, { focus, tag, companyId, kind, day }, now).filter(
          (item) =>
            (!leadFilter || team?.byId.get(item.id)?.leadId === leadFilter) &&
            (!statusFilter || statusOf(item) === statusFilter) &&
            (!dueFilter ||
              (item.dueAt && (dueFilter === 'next' ? dueWeeks.next : dueWeeks.week).has(ymdInIst(new Date(item.dueAt))))),
        ),
      ),
    [workItems, focus, tag, companyId, kind, day, now, leadFilter, team, statusFilter, dueFilter, statusOf, dueWeeks],
  );
  const openItem = openId ? workItems.find((item) => item.id === openId) ?? null : null;

  // Stored item keys (sessions, checklist, blocks, date requests) for each Work row.
  const filingIds = useMemo(() => filingInstanceIdMap(register.data?.rows ?? []), [register.data]);
  const keyOf = useMemo(() => {
    const out = new Map<string, string>();
    for (const item of workItems) {
      const key = workItemKeyFor(item, filingIds);
      if (key) out.set(item.id, key);
    }
    return out;
  }, [workItems, filingIds]);
  const idOfKey = useMemo(() => new Map([...keyOf.entries()].map(([id, key]) => [key, id])), [keyOf]);
  const openByKey = (key: string) => {
    const id = idOfKey.get(key);
    if (id) setOpenId(id);
  };

  const weekDays = useMemo(() => weekOf(weekYmd), [weekYmd]);
  const plannerItems = useMemo<PlannerItem[]>(
    () =>
      filtered
        .filter((item) => PLANNABLE.has(item.kind) && keyOf.has(item.id))
        .map((item) => ({
          key: keyOf.get(item.id)!,
          title: item.title,
          companyName: item.companyName,
          engagementId: item.engagementId,
          part: workPart(item),
          dueYmd: item.dueAt?.slice(0, 10),
          overdue: item.isOverdue,
          source: item.source,
          managerDated: Boolean(item.windowLabel),
          window: item.window,
        })),
    [filtered, keyOf],
  );
  const stepWeek = (delta: -1 | 0 | 1) => setWeekYmd((ymd) => (delta === 0 ? istYmdOf(new Date()) : addDaysYmd(ymd, delta * 7)));

  const companies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of myEngagements) seen.set(e.id, e.companyName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
  }, [myEngagements]);

  const go = (next: {
    focus?: InternWorkFocus;
    tag?: InternWorkTag | null;
    companyId?: string | null;
    kind?: InternWorkKindFilter;
    view?: WorkView;
    day?: string | null;
    lead?: string | null;
    status?: string | null;
    due?: string | null;
  }) => {
    const href = workPath(
      {
        focus: next.focus ?? focus,
        tag: next.tag === undefined ? tag : next.tag,
        companyId: next.companyId === undefined ? companyId : next.companyId,
        kind: next.kind ?? kind,
        day: next.day === undefined ? day : next.day,
        lead: next.lead === undefined ? leadFilter : next.lead,
        status: next.status === undefined ? statusFilter : next.status,
        due: next.due === undefined ? dueFilter : next.due,
      },
      next.view ?? view,
      path,
      extraParams,
    );
    router.replace(href, { scroll: false });
  };

  const chooseView = (next: WorkView) => {
    setView(next);
    try {
      window.localStorage.setItem(viewKey, next);
    } catch {
      /* ignore */
    }
    go({ view: next });
  };

  // J and K move the focus through the list rows; Enter on a focused row opens the drawer.
  useEffect(() => {
    if (view !== 'list' || openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== 'j' && e.key !== 'J' && e.key !== 'k' && e.key !== 'K') return;
      const rows = [...(listRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[tabindex]') ?? [])];
      if (rows.length === 0) return;
      const at = rows.findIndex((r) => r === document.activeElement);
      const next = e.key === 'j' || e.key === 'J' ? Math.min(at + 1, rows.length - 1) : Math.max(at - 1, 0);
      e.preventDefault();
      rows[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, openId]);

  // E-05: a home card tile opens Work on one saved view (`?view=overdue`). The view's filters
  // become the URL filters, on the list.
  const viewParam = params.get('view');
  useEffect(() => {
    const saved = WORK_VIEWS.find((v) => v.key === viewParam);
    if (!saved) return;
    router.replace(workPath(filtersOfView(saved.filters), 'list', path, extraParams), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `extraParams` is fixed for a page.
  }, [viewParam, router, path]);

  const anyFilter = Boolean(companyId || kind !== 'all' || focus !== 'all' || tag || day || leadFilter || statusFilter || dueFilter);
  const clearAll = () =>
    router.replace(workPath({ focus: 'all', tag: null, companyId: null, kind: 'all', day: null, lead: null, status: null, due: null }, view, path, extraParams), {
      scroll: false,
    });
  const currentView: ViewFilters = {
    focus: focus === 'all' ? '' : focus,
    tag: tag ?? '',
    company: companyId ?? '',
    kind: kind === 'all' ? '' : kind,
    day: day ?? '',
    ...(team?.showLead ? { lead: leadFilter ?? '' } : {}),
  };
  const applyView = (f: ViewFilters) => router.replace(workPath(filtersOfView(f), view, path, extraParams), { scroll: false });
  const leadOptions = useMemo(() => {
    if (!team?.showLead) return [];
    const seen = new Map<string, string>();
    for (const t of team.byId.values()) seen.set(t.leadId, t.leadName);
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [team]);
  const filters = (
    <FilterChipRow
      className="min-w-0 flex-1"
      onClear={anyFilter ? clearAll : undefined}
      chips={[
        {
          key: 'company',
          set: !!companyId,
          node: (
            <FilterChip
              label="Company"
              value={companyId ?? ''}
              options={companies.map(([id, name]) => ({ value: id, label: name }))}
              onChange={(v) => go({ companyId: v || null })}
            />
          ),
        },
        ...(team?.showLead
          ? [
              {
                key: 'lead',
                set: !!leadFilter,
                node: (
                  <FilterChip label="Lead" value={leadFilter ?? ''} options={leadOptions} onChange={(v) => go({ lead: v || null })} />
                ),
              },
            ]
          : []),
        {
          key: 'show',
          set: kind !== 'all',
          node: (
            <FilterChip
              label="Show"
              value={kind === 'all' ? '' : kind}
              options={[
                { value: 'steps', label: 'Steps only' },
                { value: 'filings', label: 'Filings only' },
              ]}
              onChange={(v) => go({ kind: (v || 'all') as InternWorkKindFilter })}
            />
          ),
        },
        {
          key: 'status',
          set: !!statusFilter,
          node: (
            <FilterChip
              label="Status"
              value={statusFilter ?? ''}
              options={STATUS_WORDS.map((w) => ({ value: w, label: w }))}
              onChange={(v) => go({ status: v || null })}
            />
          ),
        },
        {
          key: 'due',
          set: !!dueFilter,
          node: <FilterChip label="Due" value={dueFilter ?? ''} options={DUE_OPTIONS} onChange={(v) => go({ due: v || null })} />,
        },
        ...(focus !== 'all'
          ? [
              {
                key: 'focus',
                set: true,
                node: (
                  <FilterChip
                    label="View"
                    value={focus}
                    options={FOCUS_OPTIONS}
                    onChange={(v) => go({ focus: (v || 'all') as InternWorkFocus })}
                  />
                ),
              },
            ]
          : []),
        ...(tag
          ? [{ key: 'tag', set: true, node: <FilterChip label="Tag" value={tag} valueLabel={TAG_LABEL[tag]} options={[]} onChange={() => go({ tag: null })} /> }]
          : []),
        ...(day
          ? [
              {
                key: 'day',
                set: true,
                node: <FilterChip label="Day" value={day} valueLabel={formatIstWeekdayDay(day).label} options={[]} onChange={() => go({ day: null })} />,
              },
            ]
          : []),
      ]}
    />
  );
  const savedViews = (
    <SavedViews storageKey={`${scopeKey}:work`} views={WORK_VIEWS} current={currentView} onApply={applyView} className="mb-3" />
  );

  // Table parts for the list (E-01 to E-09).
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const engById = useMemo(() => new Map(myEngagements.map((e) => [e.id, e])), [myEngagements]);
  const changedAt = (item: InternWorkItem) => {
    const eng = engById.get(item.engagementId);
    const slice = eng && item.catalogId ? getStateForEngagement(eng)[item.catalogId] : undefined;
    return workItemChangedAt(item, slice, item.taskId ? taskById.get(item.taskId)?.updatedAt : undefined);
  };
  const taskStatusOf = (item: InternWorkItem): StatusCode | undefined => (item.taskId ? taskById.get(item.taskId)?.status : undefined);
  // A filing's real compliance instance id comes from the register row (its stored item key).
  const filingInstanceOf = (item: InternWorkItem): string | undefined => {
    const key = item.source === 'filing' ? keyOf.get(item.id) : undefined;
    return key?.startsWith('filing:') ? key.slice('filing:'.length) : undefined;
  };

  const statusRows = filtered.map((i) => ({ status: statusOf(i), area: areaOf(i) }));
  const exportShown = () =>
    exportRowsCsv(
      'work.csv',
      ['Step or filing', 'Client', ...(team ? ['Lead'] : []), 'Area', 'Status', 'Due'],
      filtered.map((i) => [
        i.title,
        i.companyName,
        ...(team ? [team.byId.get(i.id)?.leadName ?? ''] : []),
        areaOf(i),
        statusOf(i),
        i.dueAt?.slice(0, 10) ?? '',
      ]),
    );

  return (
    <PageTransition>
      <SEO title={seo.title} description={seo.description} path={seo.path} />

      {head === undefined ? (
      <div className="mb-5 flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Work</h1>
          <p className="text-[13.5px] text-ink-muted tabular-nums">
            {kpis.openCount} open · {kpis.companyCount} {kpis.companyCount === 1 ? 'company' : 'companies'}
          </p>
        </div>
        <RunningSessionChip
          titleFor={(key) => workItems.find((item) => item.id === idOfKey.get(key))?.title ?? null}
          onOpen={openByKey}
        />
        <SpectrumTabs
          size="md"
          label="Work view"
          items={viewList}
          value={view}
          onChange={(next) => chooseView(next as WorkView)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (view !== 'plan') chooseView('plan');
              setPlanOpen(true);
            }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.6} /> Plan my week
          </Button>
          <Button onClick={() => setTodoOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.6} /> New to-do
          </Button>
          <ActionMenu
            label="More actions"
            trigger={
              <Button size="icon" variant="secondary" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
              </Button>
            }
            items={[{ label: 'Export', Icon: Download, onSelect: exportShown }]}
          />
        </div>
      </div>
      ) : head}

      {head !== undefined ? (
        <SpectrumTabs
          size="md"
          label="Work view"
          items={viewList}
          value={view}
          onChange={(next) => chooseView(next as WorkView)}
          className="mb-3"
        />
      ) : null}
      {summary}
      <div className="mb-3 flex min-h-[44px] flex-wrap items-center gap-2">{filters}</div>

      {view === 'list' ? (
        <WorkCard title="Tasks" meta={`${filtered.filter((i) => i.kind !== 'done').length} open`}>
          <div className="px-4 pt-3">{savedViews}</div>
          <div ref={listRef}>
            <ListView
              items={filtered}
              now={now}
              onOpen={(item) => setOpenId(item.id)}
              scope={scopeKey}
              team={team}
              onReassign={setMoving}
              loading={engagementsLoading}
              onClearFilters={anyFilter ? clearAll : undefined}
              changedAt={changedAt}
              taskStatusOf={taskStatusOf}
              filingInstanceOf={filingInstanceOf}
            />
          </div>
        </WorkCard>
      ) : null}
      {view === 'board' ? (
        <>
          <WorkBoard items={filtered} now={now} onOpen={(item) => setOpenId(item.id)} ownerOf={team?.showLead ? (i) => team.byId.get(i.id)?.leadName : undefined} />
        </>
      ) : null}
      {view === 'plan' && planner ? planner : null}
      {view === 'plan' && !planner ? (
        <>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-4">
              <PlanTimeline items={filtered} now={now} onOpen={(item) => setOpenId(item.id)} />
              <PlannerCalendar days={weekDays} onWeek={stepWeek} onDate={setWeekYmd} items={plannerItems} now={now} onOpenItem={openByKey} />
            </div>
            <PlannerTodos
              assigned={filtered.filter(
                (i) => i.source === 'task' && i.kind !== 'done' && (!team || team.byId.get(i.id)?.leadId === team.meKey),
              )}
              waiting={filtered.filter((i) => i.kind === 'waiting-client' || i.kind === 'waiting-request')}
              focus={todos}
              byId={todoItems}
              persist={persistTodos}
              onOpenItem={setOpenId}
              planKeyOf={(i) => keyOf.get(i.id)}
              hand={
                team && team.leads.length > 0
                  ? {
                      leads: team.leads,
                      ownerOf: (i) => {
                        const t = team.byId.get(i.id);
                        return t ? { id: t.leadId, name: t.leadName } : undefined;
                      },
                      canHand: (i) => {
                        const t = team.byId.get(i.id);
                        return Boolean(t && canMoveItem(t.row));
                      },
                      onHand: (i, to) => {
                        const t = team.byId.get(i.id);
                        if (!t?.row.itemId) return;
                        void reassign([{ engagementId: t.engagementId, itemKey: t.row.itemId, title: t.title }], to);
                      },
                    }
                  : undefined
              }
            />
          </div>
          {/* The lead's own summary; a manager's Work has none in the prototype. */}
          {team ? null : (
            <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <WorkStatusCard title="My work · status" items={statusRows} />
              <WorkAreaCard items={statusRows} />
            </div>
          )}
        </>
      ) : null}

      <InternWorkDrawer
        item={openItem}
        workKey={openItem ? keyOf.get(openItem.id) ?? null : null}
        now={now}
        onClose={() => setOpenId(null)}
        ownerName={openItem && team ? team.byId.get(openItem.id)?.leadName : undefined}
        pendingWithMe={Boolean(
          team?.meKey && openItem && (openItem.kind === 'waiting-manager' || team.byId.get(openItem.id)?.leadId === team.meKey),
        )}
      />
      {team ? (
        <ReassignDialog row={moving ? team.byId.get(moving.id)?.row ?? null : null} onOpenChange={(o) => !o && setMoving(null)} leads={team.leads} />
      ) : null}
      <PlanWeekDialog open={planOpen} onOpenChange={setPlanOpen} days={weekDays} items={plannerItems} now={now} />
      <NewTodoDialog
        open={todoOpen}
        onOpenChange={setTodoOpen}
        onAdd={(title) => {
          persistTodos([createCustomInternFocus(title), ...todos]);
          if (view !== 'plan') chooseView('plan');
          toastSuccess('To-do added', title);
        }}
      />
    </PageTransition>
  );
}

/** A Work card (prototype `SectionCard`): title, meta and a right slot in the 52 px head. */
function WorkCard({
  title,
  meta,
  right,
  children,
}: {
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DashSection title={title} meta={meta} right={right} flush className="min-w-0 overflow-hidden">
      {children}
    </DashSection>
  );
}

/** A saved view's filters as the Work URL filters (missing keys clear the filter). */
function filtersOfView(f: ViewFilters) {
  return {
    focus: parseInternWorkFocus(f.focus),
    tag: parseInternWorkTag(f.tag ?? null),
    companyId: f.company || null,
    kind: parseInternWorkKindFilter(f.kind),
    day: f.day || null,
    lead: f.lead || null,
  };
}

/**
 * List view: T1 clean rows (R-07) on the shared grid. J and K move the focus; Enter opens the
 * drawer. With `scope` the list gets row selection and the bulk bar (Remind, Mark done, Export),
 * Open and Remind at the row end on hover and focus (R reminds), the row menu with Edit (E) and
 * Copy link (C) (M-27), the status menu on task rows, the density switch, the sticky head and
 * the new-since-last-visit squares. A lead cannot move work to another lead
 * (`/api/work/reassign` is for managers and admins), so Assign and Reassign come only with
 * `team`: bulk Assign, the Reassign row action (A) and the Lead and Area columns. A late row
 * gets the soft red fill.
 */
function ListView({
  items,
  now,
  onOpen,
  scope,
  team,
  onReassign,
  loading,
  onClearFilters,
  changedAt,
  taskStatusOf,
  filingInstanceOf,
}: {
  items: InternWorkItem[];
  now: Date;
  onOpen: (item: InternWorkItem) => void;
  /** The user id for the table preferences; without it the list is read-only. */
  scope?: string;
  team?: WorkTeam;
  onReassign?: (item: InternWorkItem) => void;
  loading?: boolean;
  onClearFilters?: () => void;
  changedAt?: (item: InternWorkItem) => string | undefined;
  taskStatusOf?: (item: InternWorkItem) => StatusCode | undefined;
  /** The filing's `compliance_instances.id`, when the register has it; Mark done files it. */
  filingInstanceOf?: (item: InternWorkItem) => string | undefined;
}) {
  const router = useRouter();
  const markDone = useMarkDoneMany();
  const setTaskStatus = useSetTaskStatus();
  const reassignMany = useReassignMany();
  const teamOf = (i: InternWorkItem) => team?.byId.get(i.id);
  const canReassign = Boolean(team && team.leads.length > 0 && onReassign);
  // M-27 Edit: a task opens its drawer; a step, filing or request opens the record it is edited on.
  const edit = (i: InternWorkItem) => (i.source === 'task' ? onOpen(i) : router.push(i.href));
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const sig = items.map((i) => i.id).join('|');
  useEffect(() => {
    setPicked((s) => {
      if (s.size === 0) return s;
      const live = new Set(sig.split('|'));
      const next = new Set([...s].filter((k) => live.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [sig]);

  const remind = (list: InternWorkItem[]) => {
    const targets = list
      .map((i) => ({ i, key: remindableItemKey(i) }))
      .filter((x): x is { i: InternWorkItem; key: string } => Boolean(x.key))
      .map(({ i, key }) => ({ engagementId: i.engagementId, itemKey: key, title: i.title }));
    if (targets.length > 0) void remindMany(targets);
  };

  const statusCell = (item: InternWorkItem) => {
    const chip = <InternWorkKindChip item={item} />;
    // E-03 only where a status write exists: a task (PATCH /api/tasks/:id).
    if (!scope || item.source !== 'task' || !item.taskId) return chip;
    return (
      <StatusMenu
        value={internKindStatus(item).word}
        words={TASK_STATUS_WORDS}
        label={`${item.title} · ${item.companyName}`}
        onChange={(w) => setTaskStatus(item.taskId!, w, taskStatusOf?.(item), item.title)}
      >
        {chip}
      </StatusMenu>
    );
  };

  const columns: EFilingColumn<InternWorkItem>[] = [
    {
      key: 'title',
      header: 'Step or filing',
      render: (item) => (
        <span className="flex min-w-0 flex-col">
          {/* G3: a done row shows a green tick and a muted title, never a strikethrough. */}
          <span title={item.title} className={cn('flex min-w-0 items-center gap-1.5 font-medium text-ink', item.kind === 'done' && 'text-ink-muted')}>
            {item.kind === 'done' ? <CheckCircle2 className="h-4 w-4 flex-none text-positive" strokeWidth={1.8} aria-label="Done" /> : null}
            <span className="truncate">{item.title}</span>
          </span>
          <span className={cn('truncate text-[12px] text-ink-muted md:hidden', GRID_SUB)}>{item.companyName}</span>
        </span>
      ),
    },
    {
      key: 'company',
      header: 'Client',
      width: '22%',
      render: (item) => <LeadCompanyChip name={item.companyName} engagementId={item.engagementId} />,
    },
    {
      key: 'step',
      header: 'Step',
      width: '84px',
      render: (item) =>
        item.catalogLabel ? (
          <span className="font-mono text-[12.5px] text-ink-2">{item.catalogLabel}</span>
        ) : (
          <span className="text-[12.5px] text-ink-muted">{item.source === 'filing' ? 'Filing' : item.source === 'request' ? 'Request' : 'Task'}</span>
        ),
    },
    ...(team
      ? [
          {
            key: 'area',
            header: 'Area',
            width: '120px',
            render: (item: InternWorkItem) => {
              const area = teamOf(item)?.area;
              return area ? <AreaPill area={area} /> : null;
            },
          },
        ]
      : []),
    ...(team?.showLead
      ? [
          {
            key: 'lead',
            header: 'Lead',
            width: '132px',
            render: (item: InternWorkItem) => {
              const name = teamOf(item)?.leadName;
              return name ? <PersonCell name={name} /> : null;
            },
          },
        ]
      : []),
    {
      key: 'due',
      header: 'Due',
      width: '84px',
      render: (item) => (
        <span className={cn('tabular-nums', item.isOverdue && item.kind !== 'done' && 'font-medium text-danger')}>
          {formatDueLabel(item.dueAt, now)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', width: '128px', render: statusCell },
  ];

  const assign = async (list: InternWorkItem[], to: { id: string; name: string }) => {
    const movable = list
      .map((i) => teamOf(i))
      .filter((t): t is TeamWorkItem => Boolean(t && canMoveItem(t.row) && t.leadId !== to.id));
    if (movable.length === 0) {
      toastError('Nothing to assign', 'Steps and tasks move one at a time; filings and requests move with the client.');
      return;
    }
    await reassignMany(movable.map((t) => ({ engagementId: t.engagementId, itemKey: t.row.itemId, title: t.title })), to);
    setPicked(new Set());
  };

  const bulkActions = (list: InternWorkItem[]): BulkAction[] => [
    ...(canReassign && team
      ? [
          {
            key: 'assign',
            label: 'Assign',
            render: (count: number) => <BulkAssignMenu people={team.leads} count={count} onPick={(p) => void assign(list, p)} />,
          },
        ]
      : []),
    {
      key: 'remind',
      label: 'Remind',
      icon: BellRing,
      disabled: !list.some((i) => remindableItemKey(i)),
      onClick: () => {
        remind(list);
        setPicked(new Set());
      },
    },
    {
      key: 'done',
      label: 'Mark done',
      icon: CheckCheck,
      disabled: list.every((i) => i.kind === 'done'),
      onClick: () => {
        void markDone(list.map((i) => ({ ...i, done: i.kind === 'done', filingInstanceId: filingInstanceOf?.(i) })));
        setPicked(new Set());
      },
    },
    {
      key: 'export',
      label: 'Export',
      icon: Download,
      onClick: () => {
        exportRowsCsv(
          'work.csv',
          ['Step or filing', 'Client', ...(team ? ['Lead'] : []), 'Status', 'Due', 'State'],
          list.map((i) => [
            i.title,
            i.companyName,
            ...(team ? [teamOf(i)?.leadName ?? ''] : []),
            internKindStatus(i).word,
            i.dueAt?.slice(0, 10) ?? '',
            i.why,
          ]),
        );
        setPicked(new Set());
      },
    },
  ];

  return (
    <div className="px-2 pb-2">
      <EFilingGrid
        caption="Work"
        columns={columns}
        rows={items}
        rowKey={(i) => i.id}
        onRowClick={onOpen}
        rowClassName={(i) =>
          cn('focus:bg-brand-soft focus:outline-none', i.isOverdue && i.kind !== 'done' ? 'bg-danger-soft/40' : undefined)
        }
        pageSize={12}
        minWidth={team ? 960 : 800}
        empty="No tasks match these filters"
        loading={loading}
        onClearFilters={onClearFilters}
        stickyHead
        stickyFirstColumn
        {...(scope
          ? {
              selectable: true,
              selected: picked,
              onSelectedChange: setPicked,
              bulkActions,
              bulkNoun: ['item', 'items'] as [string, string],
              rowActions: (i: InternWorkItem) => (
                <RowQuickActions
                  onOpen={() => onOpen(i)}
                  onRemind={remindableItemKey(i) ? () => remind([i]) : undefined}
                  onReassign={canReassign && teamOf(i) ? () => onReassign?.(i) : undefined}
                >
                  <RowMoreMenu onEdit={() => edit(i)} link={() => void copyRowLink(i.href)} />
                </RowQuickActions>
              ),
              rowShortcuts: [
                { key: 'r', run: (i: InternWorkItem) => remind([i]) },
                { key: 'e', run: edit },
                { key: 'c', run: (i: InternWorkItem) => void copyRowLink(i.href) },
                ...(canReassign ? [{ key: 'a', run: (i: InternWorkItem) => (teamOf(i) ? onReassign?.(i) : undefined) }] : []),
              ],
              densityScope: `${scope}:work`,
              changedAt,
              visitKey: `${scope}:work`,
            }
          : {})}
      />
    </div>
  );
}

function EmptyWork({ className }: { className?: string }) {
  return <EmptyState title="Nothing in this view" className={className} />;
}

export default function InternMyWork() {
  return (
    <Suspense fallback={<div className="text-[15px] text-ink-muted">Work</div>}>
      <InternMyWorkInner />
    </Suspense>
  );
}
