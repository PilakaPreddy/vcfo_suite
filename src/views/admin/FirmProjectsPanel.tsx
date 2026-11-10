'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Eyebrow } from '@/components/noir';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { PhaseBar } from '@/components/ui/step-track';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChip, FilterChipRow } from '@/components/ui/filter-chip';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { SavedViews, type ViewFilters } from '@/components/ui/saved-views';
import { engagementChangedAt } from '@/components/staff/today/today-rows';
import { CLIENT_LIST_VIEWS, useClientTableTools, windowEndsThisWeek } from '@/views/admin/clients-table-tools';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { ClientIdentityTile } from '@/views/client-record/client-identity';
import { AssignClientDialog, assignManagerInDb } from '@/views/admin/clients/AssignClientDialog';
import {
  CLIENT_HEALTHS,
  ClientsLegend,
  HEALTH_RANK as CLIENT_HEALTH_RANK,
  HEALTH_TONE,
  HolderSquare,
  STAGE_CHIP_TONE,
  STAGE_WORD,
  clientRowFacts,
} from '@/views/admin/clients/client-row';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { shortCompany } from '@/components/super/parts/super-text';
import { cn } from '@/lib/utils';
import { ProjectActionsMenu } from '@/components/admin/ProjectActionsMenu';
import { deriveStuckReason, STUCK_LABEL, type StuckReason } from '@/lib/projects/project-stuck';
import { ClientHealthChip } from '@/components/client-health/ClientHealthChip';
import { adminProjectPath } from '@/lib/projects/project-step-path';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { internCompanyPhaseProgress } from '@/lib/intern/intern-work';
import { sep } from '@/lib/date-format';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';

/** The earliest window end that is still ahead (or the latest one if all have passed). */
function nextScheduleDate(schedule: EngagementSchedule | null | undefined, todayIso: string): string | null {
  const ends = [schedule?.incorporation?.to, ...Object.values(schedule?.steps ?? {}).map((w) => w?.to)].filter(
    (d): d is string => Boolean(d),
  );
  if (ends.length === 0) return null;
  const ahead = ends.filter((d) => d >= todayIso).sort();
  return ahead[0] ?? ends.sort().at(-1) ?? null;
}
function shortDate(iso: string): string {
  return sep(new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
}

type ManagerOption = { id: string; name: string; email: string };

async function fetchManagers(): Promise<ManagerOption[]> {
  const res = await fetch('/api/admin/managers');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (body.managers ?? []) as ManagerOption[];
}

type PhaseFilter = 'all' | 'Pre-Incorporation' | 'Post-Incorporation';

/**
 * `?view=` keys this list understands: the saved views, plus the admin home card's
 * Incorporating, In compliance and Stuck tiles, which open the list on that scope.
 */
const HOME_VIEWS: Record<string, ViewFilters> = {
  incorporating: { scope: 'incorporating' },
  compliance: { scope: 'compliance' },
  stuck: { show: 'stuck' },
  overdue: { show: 'overdue' },
};
const SCOPE_LABEL: Record<string, string> = { incorporating: 'Incorporating', compliance: 'In compliance' };
const SHOW_LABEL: Record<string, string> = { overdue: 'Overdue', week: 'Due this week', waiting: 'Waiting on client', stuck: 'Stuck' };
const STUCK_FILTERS = ['waiting_client', 'waiting_manager', 'waiting_lead', 'blocked', 'on_track'] as const;

/**
 * Firm-wide project list (admin Today "Clients · where each one is", and the Projects page).
 * A segmented phase switch and R-10 chips for status and manager filter it. Each row shows the
 * company, where it is now, the ST5 phase track (R-22), the manager, the stage, the next date
 * and the health chip; worst health first.
 */
export function FirmProjectsPanel({
  compact,
  title,
  viewParam,
}: {
  compact?: boolean;
  title?: string;
  /** `?view=` from the page URL (the Work page passes it; the home card list does not). */
  viewParam?: string | null;
}) {
  const { engagements, getStateForEngagement, internOptions, teamMembers, engagementsLoading, user, tasks } = useApp();
  const queryClient = useQueryClient();
  const firmAdmin = isFirmWideAdmin(user?.role);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignClientId, setAssignClientId] = useState<string | null>(null);
  const [health, setHealth] = useState('');
  const router = useRouter();
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [stuck, setStuck] = useState<StuckReason | ''>('');
  const [manager, setManager] = useState('');
  const [show, setShow] = useState('');
  const [scope, setScope] = useState('');
  const leads = internOptions.length ? internOptions : teamMembers;
  const leadName = (id: string) => leads.find((l) => l.id === id)?.name;

  const applyView = (f: ViewFilters) => {
    setPhase((f.phase as PhaseFilter) || 'all');
    setStuck((f.stuck as StuckReason) || '');
    setManager(f.manager ?? '');
    setShow(f.show ?? '');
    setScope(f.scope ?? '');
    setHealth(f.health ?? '');
  };
  // E-05: a home card tile opens this list on one view.
  useEffect(() => {
    if (!viewParam) return;
    const v = CLIENT_LIST_VIEWS.find((x) => x.key === viewParam)?.filters ?? HOME_VIEWS[viewParam];
    if (v) applyView(v);
  }, [viewParam]);

  const managersQuery = useQuery({
    queryKey: ['admin-managers'],
    queryFn: fetchManagers,
    staleTime: 5 * 60_000,
  });
  const managerName = (id: string | undefined | null) => {
    if (!id) return 'Unassigned';
    return managersQuery.data?.find((m) => m.id === id)?.name ?? 'Project manager';
  };

  const rows = useMemo(() => {
    // Every client shows, incorporating and compliance (prototype admin Clients).
    return engagements
      .filter((e) => (phase === 'all' ? true : e.stage === phase))
      .filter((e) => (!manager ? true : (e.managerId ?? e.adminId ?? 'unassigned') === manager))
      .filter((e) => (!scope ? true : isIncorporated(e, getStateForEngagement(e)) === (scope === 'compliance')))
      .map((e) => {
        const state = getStateForEngagement(e);
        const progress = internCompanyPhaseProgress(e, state);
        const leadIds = [...new Set([e.internId, ...(e.leadIds ?? [])].filter((id): id is string => Boolean(id)))];
        const done = progress.phases.reduce((n, p) => n + p.done, 0);
        const total = progress.phases.reduce((n, p) => n + p.total, 0);
        return {
          eng: e,
          reason: deriveStuckReason(e, state),
          step: progress.currentLabel.split(' · ').slice(0, 2).join(' · '),
          phaseDone: progress.phases.map((p) => p.done),
          phaseTotals: progress.phases.map((p) => p.total),
          phaseNames: progress.phases.map((p) => p.title),
          pct: total ? Math.round((done / total) * 100) : 0,
          leadNames: leadIds.map((id) => leadName(id)).filter((n): n is string => Boolean(n)),
          changedAt: engagementChangedAt(state),
          facts: clientRowFacts(e, state),
        };
      })
      .filter((r) => (!stuck ? true : r.reason === stuck))
      .filter((r) => (!health ? true : r.facts.health === health))
      .filter((r) =>
        show === 'overdue'
          ? r.eng.health === 'overdue'
          : show === 'week'
            ? windowEndsThisWeek(r.eng.schedule)
            : show === 'waiting'
              ? r.reason === 'waiting_client'
              : show === 'stuck'
                ? r.reason !== 'on_track'
                : true,
      )
      .sort(
        (a, b) =>
          CLIENT_HEALTH_RANK[a.facts.health] - CLIENT_HEALTH_RANK[b.facts.health] ||
          a.eng.companyName.localeCompare(b.eng.companyName),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leadName reads `leads`, listed here
  }, [engagements, getStateForEngagement, phase, stuck, manager, show, scope, leads, health]);

  const managerIds = new Set(
    engagements.map((e) => e.managerId ?? e.adminId ?? 'unassigned'),
  );
  const managerOptions = [...managerIds].map((id) => ({
    value: id,
    label: id === 'unassigned' ? 'Unassigned' : managerName(id),
  }));

  const todayIso = new Date().toISOString().slice(0, 10);
  const projectColumns: EFilingColumn<(typeof rows)[number]>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '210px',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ClientIdentityTile id={r.eng.id} name={r.eng.companyName} size={30} />
          <b className="truncate font-medium text-ink">{shortCompany(r.eng.companyName)}</b>
        </span>
      ),
    },
    {
      key: 'step',
      header: 'Now at',
      render: (r) =>
        r.facts.now ? (
          <span className="grid min-w-0" title={`${r.facts.now.code} · ${r.facts.now.title}`}>
            <span className="flex min-w-0 items-center gap-2">
              <HolderSquare holder={r.facts.now.holder} />
              <span className="truncate font-medium text-ink">{r.facts.now.title}</span>
            </span>
            <span className="grid-sub truncate pl-4 text-[12px] text-ink-muted">
              <span className="font-mono">{r.facts.now.code}</span>
              {r.leadNames[0] ? ` · ${r.leadNames[0]}` : ''}
            </span>
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '170px',
      render: (r) => (
        <span className="flex items-center gap-2">
          <PhaseBar done={r.phaseDone} totals={r.phaseTotals} names={r.phaseNames} className="min-w-[80px] flex-1" />
          <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">{r.pct}%</span>
        </span>
      ),
    },
    { key: 'manager', header: 'Manager', width: '92px', render: (r) => <span title={managerName(r.eng.managerId ?? r.eng.adminId)}>{managerName(r.eng.managerId ?? r.eng.adminId).split(/\s+/)[0]}</span> },
    {
      key: 'stage',
      header: 'Stage',
      width: '132px',
      render: (r) => (
        <Chip tone={STAGE_CHIP_TONE[r.facts.stage]} fixed dot={false}>
          {STAGE_WORD[r.facts.stage]}
        </Chip>
      ),
    },
    {
      key: 'next',
      header: 'Next',
      width: '76px',
      render: (r) => {
        const d = nextScheduleDate(r.eng.schedule, todayIso);
        return d ? <span className={cn('tabular-nums', d < todayIso && 'font-medium text-danger')}>{shortDate(d)}</span> : '—';
      },
    },
    {
      key: 'health',
      header: 'Health',
      width: '232px',
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <Chip fixed tone={HEALTH_TONE[r.facts.health]} title={STUCK_LABEL[r.reason]}>
            {r.facts.health}
          </Chip>
          {/* The computed band (nightly score) beside the manual health word. */}
          <ClientHealthChip engagementId={r.eng.id} />
        </span>
      ),
    },
    // The Today card reads only; the row menu is on the Projects list.
    ...(title
      ? []
      : [
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '72px',
      align: 'center' as const,
      wrap: true,
      render: (r) => (
        <span data-grid-ctl onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <ProjectActionsMenu engagement={r.eng} />
        </span>
      ),
    },
      ]),
  ];

  const current: ViewFilters = { phase: phase === 'all' ? '' : phase, stuck, manager, show, scope, health };
  const anyFilter = Object.values(current).some(Boolean);
  const clear = () => applyView({});
  const tools = useClientTableTools({
    rows,
    engagementOf: (r) => r.eng,
    rowKey: (r) => r.eng.id,
    leads,
    canReassign: isAdminOrManager(user?.role),
    openHref: (r) => adminProjectPath(r.eng, '/app/admin'),
    // The admin list moves clients between managers (prototype admin Clients): bulk Assign picks a
    // manager, and the row Reassign opens "Assign a client to a manager" on that client.
    ...(firmAdmin
      ? {
          assignTo: {
            people: (managersQuery.data ?? []).map((m) => ({ id: m.id, name: m.name })),
            onPick: async (list: typeof rows, person: { id: string; name: string }) => {
              try {
                for (const r of list) await assignManagerInDb(r.eng.id, person.id);
                await queryClient.invalidateQueries({ queryKey: ['engagements'] });
                toastSuccess(`Assigned to ${person.name}`, `${list.length} ${list.length === 1 ? 'client' : 'clients'}`);
              } catch (err) {
                toastError('Could not assign', errorMessage(err));
              }
            },
          },
          onReassignRow: (r: (typeof rows)[number]) => {
            setAssignClientId(r.eng.id);
            setAssignOpen(true);
          },
        }
      : {}),
    csv: {
      file: 'clients.csv',
      header: ['Client', 'Now at', 'Progress', 'Manager', 'Stage', 'Health'],
      cells: (r) => [r.eng.companyName, r.step, `${r.pct}%`, managerName(r.eng.managerId ?? r.eng.adminId), STAGE_WORD[r.facts.stage], r.facts.health],
    },
  });

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <SavedViews
        storageKey={`${user?.id ?? 'admin'}:clients`}
        views={CLIENT_LIST_VIEWS}
        current={{ show: current.show, stuck: current.stuck, phase: current.phase, manager: current.manager, scope: current.scope }}
        onApply={applyView}
      />
      <SpectrumTabs
        label="Phase"
        items={[
          { key: 'all', label: 'All phases' },
          { key: 'Pre-Incorporation', label: 'Pre-incorp' },
          { key: 'Post-Incorporation', label: 'Post-incorp' },
        ]}
        value={phase}
        onChange={(k) => setPhase(k as PhaseFilter)}
      />
      <FilterChipRow
        onClear={anyFilter ? clear : undefined}
        chips={[
          {
            key: 'status',
            set: !!stuck,
            node: (
              <FilterChip
                label="Status"
                value={stuck}
                options={STUCK_FILTERS.map((s) => ({ value: s, label: STUCK_LABEL[s] }))}
                onChange={(v) => setStuck(v as StuckReason | '')}
              />
            ),
          },
          { key: 'manager', set: !!manager, node: <FilterChip label="Manager" value={manager} options={managerOptions} onChange={setManager} /> },
          {
            key: 'health',
            set: !!health,
            node: (
              <FilterChip
                label="Health"
                value={health}
                options={CLIENT_HEALTHS.map((h) => ({ value: h, label: h }))}
                onChange={setHealth}
              />
            ),
          },
          ...(scope
            ? [{ key: 'scope', set: true, node: <FilterChip label="Clients" value={scope} valueLabel={SCOPE_LABEL[scope]} options={[]} onChange={setScope} /> }]
            : []),
          ...(show
            ? [{ key: 'show', set: true, node: <FilterChip label="Show" value={show} valueLabel={SHOW_LABEL[show]} options={[]} onChange={setShow} /> }]
            : []),
        ]}
      />
    </div>
  );

  // The Today card's two selects (prototype FirmClientsGrid): manager and stage.
  const todayFilters = (
    <span className="flex flex-wrap items-center gap-2">
      <Select value={manager || 'all'} onValueChange={(v) => setManager(v === 'all' ? '' : v)}>
        <SelectTrigger aria-label="Manager" className="h-8 w-auto min-w-[130px] gap-2 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All managers</SelectItem>
          {managerOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={scope || 'all'} onValueChange={(v) => setScope(v === 'all' ? '' : v)}>
        <SelectTrigger aria-label="Stage" className="h-8 w-auto min-w-[120px] gap-2 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stages</SelectItem>
          <SelectItem value="incorporating">Incorporating</SelectItem>
          <SelectItem value="compliance">Compliance</SelectItem>
        </SelectContent>
      </Select>
    </span>
  );

  // Clients, where each one is (K-37, audit 81/82/109/121): a T1 grid with the step, the
  // phase track, manager, stage, next date and health (C-0034).
  const grid = (
    <EFilingGrid
      caption="Clients"
      rows={rows}
      rowKey={(r) => r.eng.id}
      onRowClick={(r) => router.push(adminProjectPath(r.eng, '/app/admin'))}
      empty="No clients match these filters"
      minWidth={1000}
      actionsColumn="step"
      pageSize={title ? Math.max(1, rows.length) : 10}
      columns={projectColumns}
      loading={engagementsLoading}
      onClearFilters={anyFilter ? clear : undefined}
      stickyHead
      stickyFirstColumn
      {...(title
        ? {}
        : {
            densityScope: `${user?.id ?? 'admin'}:clients`,
            changedAt: (r: (typeof rows)[number]) => r.changedAt,
            visitKey: `${user?.id ?? 'admin'}:clients`,
            ...tools.gridProps,
          })}
    />
  );

  const assignDialog = firmAdmin ? (
    <AssignClientDialog
      open={assignOpen}
      onOpenChange={(open) => {
        setAssignOpen(open);
        if (!open) setAssignClientId(null);
      }}
      engagements={engagements}
      tasks={tasks}
      managers={(managersQuery.data ?? []).map((m) => ({ id: m.id, name: m.name }))}
      clientId={assignClientId}
    />
  ) : null;

  // Phone: one card per client under 768px; the wide grid shows from md.
  const phoneCards = (
    <ul className="md:hidden">
      {rows.map((r) => (
        <li key={r.eng.id} className="border-b border-line-soft last:border-b-0">
          <Link href={adminProjectPath(r.eng, '/app/admin')} className="flex items-start gap-3 px-3 py-3 hover:bg-surface-sunken/60">
            <ClientIdentityTile id={r.eng.id} name={r.eng.companyName} size={30} />
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <b className="min-w-0 truncate font-medium text-ink">{r.eng.companyName}</b>
                <Chip tone={HEALTH_TONE[r.facts.health]} className="ml-auto flex-none">
                  {r.facts.health}
                </Chip>
              </span>
              {r.facts.now ? (
                <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
                  <HolderSquare holder={r.facts.now.holder} />
                  <span className="font-mono text-[12px] text-ink-muted">{r.facts.now.code}</span>
                  <span className="min-w-0 truncate text-ink-2">{r.facts.now.title}</span>
                </span>
              ) : null}
              <span className="flex items-center gap-2">
                <PhaseBar done={r.phaseDone} totals={r.phaseTotals} names={r.phaseNames} className="flex-1" />
                <span className="flex-none text-[12px] tabular-nums text-ink-muted">{r.pct}%</span>
              </span>
              <span className="truncate text-[12.5px] text-ink-muted">
                {STAGE_WORD[r.facts.stage]} · {managerName(r.eng.managerId ?? r.eng.adminId)}
              </span>
            </span>
            <ChevronRight className="mt-1 h-4 w-4 flex-none text-ink-faint" strokeWidth={1.6} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );

  if (title) {
    return (
      <DashSection title={title} meta={String(rows.length)} right={todayFilters} flush>
        {grid}
        <ClientsLegend className="px-4 py-2 md:px-5" />
      </DashSection>
    );
  }

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>Projects</Eyebrow>
          <Button size="sm" onClick={() => router.push('/app/admin/projects/new')}>
            New project
          </Button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">{filters}</div>
      </div>
      {rows.length === 0 && !engagementsLoading ? (
        <div className="md:hidden">
          <EmptyState
            title="No clients match these filters"
            action={anyFilter ? <Button size="sm" variant="secondary" onClick={clear}>Clear filters</Button> : undefined}
          />
        </div>
      ) : null}
      {phoneCards}
      <div className="hidden md:block">
        {grid}
        <ClientsLegend />
      </div>
      {tools.dialog}
      {assignDialog}
    </div>
  );
}
