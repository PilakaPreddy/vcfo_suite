"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { stageDisplayLabel } from '@/lib/projects/stage';
import { usePathname, useSearchParams, type useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { ChevronRight, Plus, MapPin, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { FilterChip } from '@/components/ui/filter-chip';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { ClientIdentityTile } from '@/views/client-record/client-identity';
import {
  CLIENT_HEALTHS,
  ClientsLegend,
  HEALTH_TONE,
  NowCell,
  STAGE_CHIP_TONE,
  STAGE_WORD,
  nextInWeek,
  shortDate,
  type ClientRowFacts,
} from '@/views/admin/clients/client-row';
import { EFilingGrid, GRID_SUB, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { PhaseBar } from '@/components/ui/step-track';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { SavedViews, type ViewFilters } from '@/components/ui/saved-views';
import { CLIENT_LIST_VIEWS, useClientTableTools, windowEndsThisWeek } from '@/views/admin/clients-table-tools';
import { RecordTile } from '@/components/incorporation/RecordHead';
import { HealthChip, PersonAvatar } from '@/views/admin/firm-people/parts';
import { adminProjectPath, staffNewProjectPath, staffProjectBaseFromPathname } from '@/lib/projects/project-step-path';
import { ProjectActionsMenu } from '@/components/admin/ProjectActionsMenu';
import type { Engagement } from '@/data/engagements';
import { STUCK_LABEL } from '@/lib/projects/project-stuck';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { useApp } from '@/context/AppContext';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';

type View = 'table' | 'board';
type Router = ReturnType<typeof useRouter>;

interface EnrichedItem {
  e: Engagement;
  pct: number;
  done: number;
  total: number;
  intern: { id: string; name: string; initials?: string } | undefined;
  leads?: Array<{ id: string; name: string; initials?: string }>;
  stuck: import('@/lib/projects/project-stuck').StuckReason;
  /** ST5 phase track (four bars sized by step count). */
  phases?: Array<{ done: number; total: number; title: string }>;
  /** E-08: the latest step edit, submit, review or delivery time. */
  changedAt?: string;
  /** Stage, Now, next date and health from the step state (`clientRowFacts`). */
  facts: ClientRowFacts;
}

export interface ProjectsViewProps {
  engagements: Engagement[];
  teamMembers: Array<{ id: string; name: string; initials?: string }>;
  internOptions: Array<{ id: string; name: string; initials?: string }>;
  engagementsLoading: boolean;
  router: Router;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  enriched: EnrichedItem[];
}


const PHASE_ORDER = ['Pre-Incorporation', 'Post-Incorporation', 'Operational Readiness'] as const;

const VIEWS = [
  { key: 'table', label: 'Table' },
  { key: 'board', label: 'Board' },
];

/** Progress bar of a project: 8px, 3px corners, blurple, green when complete. */
function ProgressCell({ pct }: { pct: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative block h-2 min-w-[60px] flex-1 overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
        <i className={cn('absolute inset-y-0 left-0 rounded-bar', pct >= 100 ? 'bg-positive-mid' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 flex-none text-right text-[12px] tabular-nums text-ink-muted">{pct}%</span>
    </span>
  );
}

/** Which saved-view filter a project passes (E-06). */
function inShow(show: string, item: EnrichedItem): boolean {
  if (show === 'overdue') return item.e.health === 'overdue';
  if (show === 'week') return windowEndsThisWeek(item.e.schedule);
  if (show === 'waiting') return item.stuck === 'waiting_client';
  return true;
}

function leadLabelOf(item: EnrichedItem): string {
  return item.leads && item.leads.length > 0 ? item.leads.map((l) => l.name).join(', ') : (item.intern?.name ?? 'Unassigned');
}

export function ProjectsView(props: ProjectsViewProps) {
  const {
  engagementsLoading,
  router,
  view,
  setView,
  enriched,
  } = props;
  const pathname = usePathname();
  const staffBase = useStaffBasePath();
  const { user } = useApp();
  const projectBase = staffProjectBaseFromPathname(pathname, staffBase);
  const newProjectHref = staffNewProjectPath(projectBase);
  const params = useSearchParams();
  const [show, setShow] = useState('');
  const [stage, setStage] = useState('');
  const [health, setHealth] = useState('');
  const [nextWin, setNextWin] = useState('');
  const todayIso = new Date().toISOString().slice(0, 10);
  // E-05: a home card tile opens the list on one saved view.
  const viewParam = params?.get('view') ?? null;
  useEffect(() => {
    const v = CLIENT_LIST_VIEWS.find((x) => x.key === viewParam);
    if (v) setShow(v.filters.show ?? '');
  }, [viewParam]);
  const shownRows = enriched.filter(
    (item) =>
      inShow(show, item) &&
      (!stage || item.facts.stage === stage) &&
      (!health || item.facts.health === health) &&
      nextInWeek(item.facts.next, todayIso, nextWin),
  );
  const anyFilter = Boolean(show || stage || health || nextWin);
  const clearFilters = () => {
    setShow('');
    setStage('');
    setHealth('');
    setNextWin('');
  };
  const current: ViewFilters = { show };
  const tools = useClientTableTools({
    rows: shownRows,
    engagementOf: (item) => item.e,
    rowKey: (item) => item.e.id,
    leads: props.internOptions.length ? props.internOptions : props.teamMembers,
    canReassign: isAdminOrManager(user?.role),
    openHref: (item) => adminProjectPath(item.e, projectBase),
    csv: {
      file: 'projects.csv',
      header: ['Client', 'Contact', 'Stage', 'Now', 'Steps', 'Project lead', 'Next', 'Status'],
      cells: (item) => [
        item.e.companyName,
        item.e.clientDisplayName ?? '',
        STAGE_WORD[item.facts.stage],
        item.facts.now ? `${item.facts.now.code} ${item.facts.now.title}` : '',
        `${item.facts.done}/${item.facts.total}`,
        leadLabelOf(item),
        item.facts.next ?? '',
        item.facts.health,
      ],
    },
  });

  const columns: EFilingColumn<EnrichedItem>[] = [
    {
      key: 'company',
      header: 'Client',
      width: '240px',
      render: (item) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ClientIdentityTile id={item.e.id} name={item.e.companyName} size={30} />
          <span className="min-w-0">
            <Link href={adminProjectPath(item.e, projectBase)} className="block truncate font-medium text-ink hover:underline" title={item.e.companyName}>
              {item.e.companyName}
            </Link>
            {item.e.clientDisplayName ? (
              <span className={cn('block truncate text-[12px] text-ink-muted', GRID_SUB)}>{item.e.clientDisplayName}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      width: '120px',
      render: (item) => (
        <Chip tone={STAGE_CHIP_TONE[item.facts.stage]} fixed dot={false}>
          {STAGE_WORD[item.facts.stage]}
        </Chip>
      ),
    },
    {
      key: 'progress',
      header: 'Phases',
      width: '150px',
      render: (item) =>
        item.phases && item.phases.length > 0 ? (
          <PhaseBar
            done={item.phases.map((p) => p.done)}
            totals={item.phases.map((p) => p.total)}
            names={item.phases.map((p) => p.title)}
            className="w-full"
          />
        ) : (
          <ProgressCell pct={item.pct} />
        ),
    },
    { key: 'now', header: 'Now', render: (item) => <NowCell now={item.facts.now} /> },
    {
      key: 'owner',
      header: 'Team',
      width: '96px',
      render: (item) =>
        item.leads && item.leads.length > 0 ? (
          <AvatarStack people={item.leads.map((l) => l.name)} label={`Project leads: ${leadLabelOf(item)}`} />
        ) : (
          <span className="text-[12.5px] text-ink-muted">Unassigned</span>
        ),
    },
    {
      key: 'steps',
      header: 'Steps',
      width: '72px',
      align: 'right',
      render: (item) => (
        <span className="text-[13px] tabular-nums text-ink-muted">
          {item.facts.done}/{item.facts.total}
        </span>
      ),
    },
    {
      key: 'health',
      header: 'Status',
      width: '128px',
      render: (item) => (
        <span title={STUCK_LABEL[item.stuck]}>
          <Chip tone={HEALTH_TONE[item.facts.health]} fixed>
            {item.facts.health}
          </Chip>
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '56px',
      align: 'right',
      render: (item) => (
        <span data-grid-ctl className="inline-flex">
          <ProjectActionsMenu engagement={item.e} />
        </span>
      ),
    },
  ];

  const stageCount = (k: ClientRowFacts['stage']) => enriched.filter((x) => x.facts.stage === k).length;
  const headTools = (
    <div className="flex flex-wrap items-center gap-2">
      <SpectrumTabs size="md" label="Clients view" items={VIEWS} value={view} onChange={(k) => setView(k as View)} />
      {isFirmWideAdmin(user?.role) ? (
        <Button variant="quiet" size="sm" asChild>
          <Link href="/app/admin/projects/recycle-bin">
            <Trash2 strokeWidth={1.6} />
            Deleted
          </Link>
        </Button>
      ) : null}
      <Button size="sm" asChild>
        <Link href={newProjectHref}>
          <Plus strokeWidth={1.6} />
          Start GCC project
        </Link>
      </Button>
    </div>
  );

  return (
    <PageTransition>
      <SEO
        title="GCC Setup Projects — VCFO Suite"
        description="Portfolio of GCC setup projects — phase, delivery owner, and health at a glance."
        path={`${projectBase}/projects`}
      />

      <h1 className="sr-only">Clients</h1>
      {view === 'board' ? <div className="mb-4 flex justify-end">{headTools}</div> : null}

      {view === 'table' && (
        <section className="surface min-w-0 overflow-hidden" aria-label="Clients">
          {/* DataGrid head (prototype `ClientsGrid`): tile, "Clients", "n of N", stage tabs and filter chips. */}
          <div className="flex min-h-[52px] min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2">
            <CardHeadTile title="Clients" />
            <h2 className="min-w-0 truncate text-[15px] font-medium text-ink">Clients</h2>
            {!engagementsLoading ? (
              <span className="shrink-0 text-[12.5px] tabular-nums text-ink-muted">
                {shownRows.length === enriched.length ? enriched.length : `${shownRows.length} of ${enriched.length}`}
              </span>
            ) : null}
            <span className="flex-1" />
            {headTools}
          </div>
          {enriched.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2">
              <SpectrumTabs
                label="Stage"
                items={[
                  { key: '', label: 'All', count: enriched.length },
                  { key: 'incorporating', label: STAGE_WORD.incorporating, count: stageCount('incorporating') },
                  { key: 'compliance', label: STAGE_WORD.compliance, count: stageCount('compliance') },
                ]}
                value={stage}
                onChange={setStage}
              />
              <FilterChip
                label="Health"
                value={health}
                options={CLIENT_HEALTHS.map((h) => ({ value: h, label: h, count: enriched.filter((x) => x.facts.health === h).length }))}
                onChange={setHealth}
              />
              <FilterChip
                label="Next"
                value={nextWin}
                options={[
                  { value: 'week', label: 'This week' },
                  { value: 'next', label: 'Next week' },
                ]}
                onChange={setNextWin}
              />
              <span className="flex-1" />
              <SavedViews
                storageKey={`${user?.id ?? 'staff'}:projects`}
                views={CLIENT_LIST_VIEWS}
                current={current}
                onApply={(f) => setShow(f.show ?? '')}
              />
            </div>
          ) : null}
          {engagementsLoading ? <SkeletonRows className="p-4" /> : null}
          {!engagementsLoading && enriched.length === 0 ? (
            <EmptyState
              title="No GCC setup projects yet"
              className="m-4"
              action={
                <Button size="sm" onClick={() => router.push(newProjectHref)}>
                  Start GCC project
                </Button>
              }
            />
          ) : null}
          {!engagementsLoading && enriched.length > 0 ? (
            <>
              {/* Phone: one row card per project. */}
              <ul className="md:hidden">
                {shownRows.length === 0 ? (
                  <li className="p-4">
                    <EmptyState title="No clients match these filters" action={anyFilter ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} />
                  </li>
                ) : null}
                {shownRows.map((item) => (
                  <li key={item.e.id} className="flex items-start gap-3 border-b border-line-soft px-4 py-3 last:border-b-0">
                    <ClientIdentityTile id={item.e.id} name={item.e.companyName} size={30} />
                    <Link href={adminProjectPath(item.e, projectBase)} className="grid min-w-0 flex-1 gap-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <b className="min-w-0 truncate font-medium text-ink">{item.e.companyName}</b>
                        <Chip tone={HEALTH_TONE[item.facts.health]} className="ml-auto flex-none">
                          {item.facts.health}
                        </Chip>
                      </span>
                      <NowCell now={item.facts.now} className="text-[12.5px]" />
                      <span className="flex items-center gap-2">
                        {item.phases && item.phases.length > 0 ? (
                          <PhaseBar
                            done={item.phases.map((p) => p.done)}
                            totals={item.phases.map((p) => p.total)}
                            names={item.phases.map((p) => p.title)}
                            className="flex-1"
                          />
                        ) : (
                          <span className="flex-1" />
                        )}
                        <span className="flex-none text-[12px] tabular-nums text-ink-muted">
                          {item.facts.done}/{item.facts.total}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
                        <span className="min-w-0 truncate">{leadLabelOf(item)}</span>
                        {item.facts.next ? <span className="flex-none tabular-nums">· Next {shortDate(item.facts.next)}</span> : null}
                        {item.leads && item.leads.length > 0 ? (
                          <AvatarStack people={item.leads.map((l) => l.name)} className="ml-auto" />
                        ) : null}
                      </span>
                    </Link>
                    <ProjectActionsMenu engagement={item.e} />
                  </li>
                ))}
              </ul>
              <div className="hidden px-2 pb-2 md:block">
                <EFilingGrid
                  caption="GCC setup projects"
                  columns={columns}
                  rows={shownRows}
                  rowKey={(item) => item.e.id}
                  pageSize={14}
                  minWidth={880}
                  onRowClick={(item) => router.push(adminProjectPath(item.e, projectBase))}
                  empty="No clients match these filters"
                  onClearFilters={anyFilter ? clearFilters : undefined}
                  stickyHead
                  stickyFirstColumn
                  densityScope={`${user?.id ?? 'staff'}:projects`}
                  changedAt={(item) => item.changedAt}
                  visitKey={`${user?.id ?? 'staff'}:projects`}
                  {...tools.gridProps}
                />
                <ClientsLegend />
              </div>
            </>
          ) : null}
        </section>
      )}

      {tools.dialog}

      {view === 'board' && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          {PHASE_ORDER.map((phase) => {
            const items = enriched.filter((x) => x.e.stage === phase);
            return (
              <section key={phase} aria-label={stageDisplayLabel(phase)} className="min-w-0 rounded-md border-1.5 border-line bg-surface-sunken">
                <header className="flex h-11 items-center gap-2 border-b border-line-soft px-4">
                  <h2 className="text-[14px] font-medium text-ink">{stageDisplayLabel(phase)}</h2>
                  <Tag>{items.length}</Tag>
                </header>
                <div className="grid gap-2 p-3">
                  {items.length === 0 ? <EmptyState title="No projects" className="min-h-[72px] py-4" /> : null}
                  {items.map((item) => (
                    <button
                      key={item.e.id}
                      type="button"
                      onClick={() => router.push(adminProjectPath(item.e, projectBase))}
                      className={cn(
                        'grid w-full gap-2 rounded-md border-1.5 bg-surface-raised px-3 py-2.5 text-left hover:border-line-strong',
                        item.e.health === 'overdue' ? 'border-danger-mid' : 'border-line',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <RecordTile name={item.e.companyName} size={30} />
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[14px] font-medium text-ink">{item.e.companyName}</b>
                          {/* The stored registered address, when the client gave one; nothing otherwise. */}
                          {item.e.subsidiaryRegisteredAddress?.trim() ? (
                            <span
                              className="flex min-w-0 items-center gap-1 text-[12px] text-ink-muted"
                              title={item.e.subsidiaryRegisteredAddress}
                            >
                              <MapPin className="h-3 w-3 flex-none" strokeWidth={1.6} aria-hidden />
                              <span className="truncate">{item.e.subsidiaryRegisteredAddress}</span>
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight className="h-4 w-4 flex-none text-ink-faint" strokeWidth={1.6} aria-hidden />
                      </span>
                      <ProgressCell pct={item.pct} />
                      <span className="flex min-w-0 items-center gap-2">
                        <PersonAvatar name={item.intern?.name ?? '?'} size={24} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{item.intern?.name ?? 'Unassigned'}</span>
                        <HealthChip health={item.e.health} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
