'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { AssignClientDialog } from '@/components/super/assign/AssignClientDialog';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import { AreaPill, Chip } from '@/components/ui/spectrum-chip';
import { PhaseBar } from '@/components/ui/step-track';
import {
  attentionReason,
  HEALTH_LABEL,
  idleLabel,
  stepCode,
  superAreaOf,
  superPhaseTrack,
  superStageWord,
  superStateChip,
} from '@/components/super/overview/super-overview-format';
import {
  ClientTile,
  PersonAvatar,
  SuperFilterChips,
  SuperPageError,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { shortCompany, todayKey } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import { useSuperOverview } from '@/hooks/use-super-overview';
import { useSuperInsights } from '@/views/super/use-super-insights';
import {
  needsAttention,
  SUPER_PROJECTS_HREF,
  type SuperEngagementSummary,
} from '@/lib/super/super-overview';
import { cn } from '@/lib/utils';

/**
 * SUPER ADMIN PROJECTS (L1) — every engagement in the firm, one row each.
 *
 * Reads the same scoped aggregate as the Overview, so the list and the
 * dashboard can never disagree; filtering is client-side over rows the server
 * already ranked by urgency. Read-only, like the rest of this surface.
 *
 * The table is the shared `EFilingGrid` (Spectrum T1 rows). The chips are Admin,
 * Manager, Stage and Area (prototype); a link with `?filter=` lands on a slice, shown
 * as one more chip, and Clear all drops it. The Admin column reads the
 * manager's reporting line (G-20), and "Assign client" opens the same assign dialog
 * as the Overview.
 */

type Filter = 'all' | 'attention' | 'firm' | 'client';

const STAGES = ['Incorporating', 'Compliance'];
const AREAS = ['Incorporation', 'Registrations', 'Compliances'];

/** The word a `?filter=` slice shows on its chip, so the narrowed list says why it is short. */
const SLICE_WORD: Record<Exclude<Filter, 'all'>, string> = {
  attention: 'Needs attention',
  firm: 'With SBC',
  client: 'With client',
};

function parseFilter(value: string | null): Filter {
  return value === 'attention' || value === 'firm' || value === 'client' ? value : 'all';
}

function matchesFilter(summary: SuperEngagementSummary, filter: Filter): boolean {
  if (filter === 'attention') return needsAttention(summary);
  if (filter === 'firm') return summary.currentStep?.owner === 'firm';
  if (filter === 'client') return summary.currentStep?.owner === 'client';
  return true;
}

function SuperProjectsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const query = useSuperOverview();
  const overview = query.data;

  const filter = parseFilter(params.get('filter'));
  const [stage, setStage] = useState('');
  const [area, setArea] = useState('');
  const [admin, setAdmin] = useState('');
  const [manager, setManager] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const staff = useSuperStaff();
  const adminOf = staff.adminNameOf;

  const rows = useMemo(() => {
    if (!overview) return [];
    return overview.engagements.filter(
      (summary) =>
        matchesFilter(summary, filter) &&
        (!stage || superStageWord(summary) === stage) &&
        (!area || superAreaOf(summary) === area) &&
        (!admin || (adminOf(summary.managerId) ?? 'Unassigned') === admin) &&
        (!manager || (summary.managerName ?? 'Unassigned') === manager),
    );
  }, [overview, filter, stage, area, admin, manager, adminOf]);

  /**
   * The client's next date: the end of the current step's window (insights), else the earliest
   * open filing, from the insights read or the overview's 90-day filing window.
   */
  const insights = useSuperInsights().data;
  const nextDue = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of insights?.clients ?? []) {
      const due = c.currentStepDue ?? c.nextDueDate;
      if (due) out.set(c.summary.id, due.slice(0, 10));
    }
    for (const filing of overview?.filings ?? []) {
      if (filing.status === 'filed') continue;
      if (insights?.clients.some((c) => c.summary.id === filing.engagementId)) continue;
      const current = out.get(filing.engagementId);
      if (!current || filing.dueDate < current) out.set(filing.engagementId, filing.dueDate);
    }
    return out;
  }, [overview, insights]);

  const seo = (
    <SEO
      title="Projects — VCFO Suite"
      description="Every engagement in the firm, ranked by what needs a human."
      path={SUPER_PROJECTS_HREF}
    />
  );

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading clients" />
      </PageTransition>
    );
  }

  if (query.isError || !overview) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="The client list could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const columns = columnsFor(nextDue, adminOf);
  // Picking an admin narrows the manager list to the managers who report to that admin.
  const managerNames = [
    ...new Set(
      overview.engagements
        .filter((s) => !admin || (adminOf(s.managerId) ?? 'Unassigned') === admin)
        .map((s) => s.managerName ?? 'Unassigned'),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const adminNames = [...new Set(overview.engagements.map((s) => adminOf(s.managerId) ?? 'Unassigned'))].sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <PageTransition>
      {seo}

      <SuperFilterChips
        className="mb-3"
        onClear={() => {
          setAdmin('');
          setManager('');
          setStage('');
          setArea('');
          if (filter !== 'all') router.replace(SUPER_PROJECTS_HREF, { scroll: false });
        }}
        filters={[
          ...(filter !== 'all'
            ? [
                {
                  key: 'slice',
                  label: 'Showing',
                  value: SLICE_WORD[filter],
                  options: Object.values(SLICE_WORD),
                  onChange: (word: string) => {
                    const next = Object.entries(SLICE_WORD).find(([, w]) => w === word)?.[0];
                    router.replace(next ? `${SUPER_PROJECTS_HREF}?filter=${next}` : SUPER_PROJECTS_HREF, { scroll: false });
                  },
                },
              ]
            : []),
          {
            key: 'admin',
            label: 'Admin',
            value: admin,
            options: adminNames,
            onChange: (v) => {
              setAdmin(v);
              setManager('');
            },
          },
          { key: 'manager', label: 'Manager', value: manager, options: managerNames, onChange: setManager },
          { key: 'stage', label: 'Stage', value: stage, options: STAGES, onChange: setStage },
          { key: 'area', label: 'Area', value: area, options: AREAS, onChange: setArea },
        ]}
      />

      {/* R-09: no page title; the count and "Assign client" sit in the grid card head. */}
      <DashSection
        title="All clients"
        meta={`${rows.length} of ${overview.engagements.length}`}
        right={
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <UserPlus aria-hidden />
            Assign client
          </Button>
        }
        flush
      >
        <div className="hidden md:block">
          <EFilingGrid
            caption="Clients"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(row.href)}
            empty="No client matches these filters"
            minWidth={1040}
            pageSize={17}
          />
        </div>
        <div className="divide-y divide-line-soft md:hidden">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-ink-muted">No client matches these filters</p>
          ) : (
            rows.map((row) => (
              <button key={row.id} type="button" className="block w-full px-2 py-3 text-left" onClick={() => router.push(row.href)}>
                <ProjectMobileRow summary={row} />
              </button>
            ))
          )}
        </div>
      </DashSection>

      <AssignClientDialog open={assignOpen} onOpenChange={setAssignOpen} engagements={overview.engagements} staff={staff} />
    </PageTransition>
  );
}

/* The clients grid (K-45, C-0109): Spectrum T1 rows with the ST5 phase bars, the area pill
   for the stage and the status chip in one of the six words. */
function columnsFor(
  nextDue: Map<string, string>,
  adminOf: (managerId: string | null) => string | null,
): EFilingColumn<SuperEngagementSummary>[] {
  const today = todayKey();
  return [
    {
      key: 'company',
      header: 'Client',
      width: '200px',
      wrap: true,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ClientTile id={row.id} name={row.companyName} />
          {/* A real link, so the record can open in a new tab; the row click still opens it. */}
          <Link href={row.href} className="min-w-0 font-medium leading-snug text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
            {shortCompany(row.companyName)}
          </Link>
        </span>
      ),
    },
    {
      key: 'now',
      header: 'Now at',
      wrap: true,
      render: (row) => (
        <span className="block min-w-[160px]">
          <span className="line-clamp-2 font-medium leading-snug text-ink">{row.currentStep?.title ?? 'Every step is done'}</span>
          <span className="block truncate text-[12px] text-ink-muted">
            {[stepCode(row.currentStep?.id), row.leadName ?? 'No lead'].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    { key: 'progress', header: 'Progress', width: '150px', render: (row) => <ProgressTrack summary={row} /> },
    {
      key: 'admin',
      header: 'Admin',
      width: '110px',
      render: (row) => {
        const name = adminOf(row.managerId);
        return name ? <span className="block min-w-0 truncate">{name}</span> : <span className="text-ink-faint">–</span>;
      },
    },
    {
      key: 'manager',
      header: 'Manager',
      width: '150px',
      wrap: true,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <PersonAvatar name={row.managerName ?? '?'} />
          <span className="min-w-0 leading-snug">{row.managerName ?? 'Unassigned'}</span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      width: '124px',
      render: (row) => <AreaPill area={superStageWord(row)} reg={row.incorporated ? undefined : 'mca'} />,
    },
    {
      key: 'next',
      header: 'Next',
      width: '68px',
      render: (row) => {
        const due = nextDue.get(row.id) ?? null;
        return <span className={cn('tabular-nums', due && due < today && 'font-medium text-danger')}>{plainDay(due)}</span>;
      },
    },
    {
      key: 'health',
      header: 'Health',
      width: '124px',
      // One chip, as in the prototype: the gate state in the six words. The stored health
      // label and the reason sit in the tooltip.
      render: (row) => {
        const chip = superStateChip(row);
        const stored = HEALTH_LABEL[row.health] ?? row.health;
        return (
          <Chip fixed tone={chip.tone} title={`${chip.title} · ${attentionReason(row)} · ${stored}`}>
            {chip.word}
          </Chip>
        );
      },
    },
  ];
}

function ProgressTrack({ summary }: { summary: SuperEngagementSummary }) {
  const track = superPhaseTrack(summary);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PhaseBar done={track.done} totals={track.totals} names={track.names} className="w-24" />
      <span className="text-[12.5px] tabular-nums text-ink-muted">{summary.progress.pct}%</span>
    </span>
  );
}

function ProjectMobileRow({ summary }: { summary: SuperEngagementSummary }) {
  const idle = idleLabel(summary);
  const chip = superStateChip(summary);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <ClientTile id={summary.id} name={summary.companyName} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{summary.companyName}</span>
        <Chip fixed tone={chip.tone} title={chip.title} className="shrink-0">
          {chip.word}
        </Chip>
      </div>
      <div className="mt-2">
        <ProgressTrack summary={summary} />
      </div>
      <p className="mt-1 min-w-0 truncate text-[12.5px] text-ink-muted">
        {attentionReason(summary)}
        {summary.leadName ? ` · ${summary.leadName}` : ''}
        {idle ? ` · ${idle}` : ''}
      </p>
    </div>
  );
}

export default function SuperProjects() {
  return (
    <Suspense
      fallback={<SuperPageSkeleton label="Loading clients" />}
    >
      <SuperProjectsInner />
    </Suspense>
  );
}
