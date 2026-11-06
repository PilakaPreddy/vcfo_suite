"use client";

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, CircleCheck, User, type LucideIcon } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageTransition } from '@/components/shell/PageTransition';
import { DashDonut, DashSection } from '@/components/dash/DashSection';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { CHART_STATUS, ChartLegend } from '@/components/charts';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { ProgressList } from '@/components/dash/progress-list';
import { useLeadHours } from '@/hooks/use-lead-hours';
import { useAnalyticsMetrics } from '@/components/metrics/use-metrics';
import { useQuery } from '@tanstack/react-query';
import { analyticsKpis, kpiChange, type KpiKey } from '@/lib/metrics/analytics-kpis';
import { OnTimeColumns } from '@/components/compliances/OnTimeColumns';
import type { StepTimeMetric } from '@/lib/metrics/practice-metrics';
import { shortCompany } from '@/components/super/parts/super-text';
import { cn } from '@/lib/utils';
import { SEO } from '@/components/SEO';
import { checklist } from '@/data/checklist';
import {
  clientHealthCounts,
  stepsCompletedPerWeek,
  workloadByLead,
  type AnalyticsProject,
} from '@/views/admin/analytics/analytics-stats';

const chartLoading = () => <div className="h-full animate-pulse rounded-md bg-surface-sunken" />;

const AnalyticsCompletionChart = dynamic(
  () => import('@/views/admin/AnalyticsCharts').then((m) => m.AnalyticsCompletionChart),
  { ssr: false, loading: chartLoading },
);
const AnalyticsDelayChart = dynamic(
  () => import('@/views/admin/AnalyticsCharts').then((m) => m.AnalyticsDelayChart),
  { ssr: false, loading: chartLoading },
);
const AnalyticsStepsChart = dynamic(
  () => import('@/views/admin/AnalyticsCharts').then((m) => m.AnalyticsStepsChart),
  { ssr: false, loading: chartLoading },
);

const ITEM_IDS = checklist.map((item) => item.id);

/* R-25: status colours only. Waiting is teal, overdue red, not started grey. */
const HEALTH_ROWS = [
  { key: 'progress', label: 'In progress', color: CHART_STATUS.active },
  { key: 'waiting', label: 'Waiting', color: CHART_STATUS.waiting },
  { key: 'overdue', label: 'Overdue', color: CHART_STATUS.overdue },
  { key: 'notStarted', label: 'Not started', color: CHART_STATUS.locked },
  { key: 'done', label: 'Done', color: CHART_STATUS.done },
] as const;

interface Kpi {
  label: string;
  value: number | string;
  /** Small muted text after the number, for example "/ 120". */
  of?: string;
  Icon: LucideIcon;
  /** An overdue number above zero is red (R-18). */
  bad?: boolean;
  /** Change against last month's stored snapshot (S-618); null hides the tag. */
  change?: number | null;
  /** True when a rise is good news (green), false when it is bad news (amber). */
  upIsGood?: boolean;
}

/**
 * Last month-end's stored tile values for the caller's own scope (`kpi_snapshots`, written by
 * the month-end job). Empty until the job has run once, and then no change tag shows.
 */
function useKpiSnapshot() {
  return useQuery({
    queryKey: ['metrics', 'kpi-snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/metrics/kpi-snapshot', { cache: 'no-store' });
      if (!res.ok) return { period: null, values: {} as Partial<Record<KpiKey, number>> };
      return (await res.json()) as { period: string | null; values: Partial<Record<KpiKey, number>> };
    },
    staleTime: 10 * 60_000,
  });
}

/** The change tag after a tile number: "+1" or "−2", green for good news and amber for bad. */
function ChangeTag({ change, upIsGood = true }: { change: number; upIsGood?: boolean }) {
  if (change === 0) return null;
  const good = change > 0 === upIsGood;
  return (
    <span
      className={cn(
        'ml-2 inline-flex h-5 items-center rounded-sm px-1.5 align-middle text-[11.5px] font-medium tabular-nums',
        good ? 'bg-positive-soft text-positive' : 'bg-warning-soft text-warning',
      )}
      title="Change since the end of last month"
    >
      {change > 0 ? `+${change}` : `−${Math.abs(change)}`}
    </span>
  );
}

/**
 * KP1 number tiles on a plain page (R-18, prototype NumberStrip): a 13px label after a 15px
 * muted icon, a 26px number, a 1.5px edge. Two tiles a row on a phone, auto-fit from sm.
 */
function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-col gap-1.5 rounded-md border-1.5 border-line bg-surface-raised px-4 py-3.5">
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-ink-2">
            <k.Icon className="h-[15px] w-[15px] flex-none text-ink-muted" strokeWidth={1.6} aria-hidden />
            <span className="truncate">{k.label}</span>
          </span>
          <b className={cn('text-[26px] font-medium leading-none tabular-nums', k.bad ? 'text-danger' : 'text-ink')}>
            {k.value}
            {k.of ? <small className="ml-1 text-[14px] font-medium text-ink-muted">{k.of}</small> : null}
            {k.change !== null && k.change !== undefined ? <ChangeTag change={k.change} upIsGood={k.upIsGood} /> : null}
          </b>
        </div>
      ))}
    </div>
  );
}

const STEP_TIME_COLUMNS: EFilingColumn<StepTimeMetric>[] = [
  { key: 'step', header: 'Step', render: (s) => <span className="font-medium text-ink">{s.title}</span> },
  {
    key: 'median',
    header: 'Median days',
    width: '110px',
    align: 'right',
    render: (s) => <span className="tabular-nums">{s.medianDays ?? '–'}</span>,
  },
  {
    key: 'longest',
    header: 'Longest',
    width: '90px',
    align: 'right',
    render: (s) => (
      <span className={cn('tabular-nums', (s.longestDays ?? 0) > 7 && 'font-medium text-danger')}>{s.longestDays ?? '–'}</span>
    ),
  },
  {
    key: 'client',
    header: 'Longest client',
    width: '140px',
    render: (s) => (s.longestCompany ? shortCompany(s.longestCompany) : <span className="text-ink-faint">–</span>),
  },
];

/**
 * Analytics (prototype AnalyticsScreen). The monthly charts, filings on time and time in step
 * come from `/api/metrics/analytics` (G-27): the filed-against-due history in the compliance
 * rows and the step events. The live counts below them still come from the checklist state the
 * app already holds.
 */
export default function Analytics() {
  const [period, setPeriod] = useState<'6' | '12'>('6');
  const metrics = useAnalyticsMetrics(period === '6' ? 6 : 12);
  const months = metrics.data?.months ?? [];
  // Month words only ("Oct") on the axes; twelve months never repeat one.
  const data = months.map((m) => ({ m: m.label.split(' ')[0] ?? m.label, completion: m.completionPct, delay: m.avgDelayDays }));
  const filingRows = months.map((m) => ({ key: m.key, label: m.label.split(' ')[0] ?? m.label, onTime: m.onTime, late: m.late }));
  const filedTotal = months.reduce((n, m) => n + m.onTime + m.late, 0);
  const onTimeTotal = months.reduce((n, m) => n + m.onTime, 0);
  const lastRated = [...months].reverse().find((m) => m.completionPct !== null);
  const hasRates = months.some((m) => m.completionPct !== null);
  const hasDelay = months.some((m) => m.avgDelayDays !== null);
  const stepTime = metrics.data?.stepTime ?? [];
  const { engagements, getStateForEngagement, internOptions, teamMembers, role, engagementsLoading } = useApp();

  const projects = useMemo<AnalyticsProject[]>(
    () => engagements.map((eng) => ({ internId: eng.internId, state: getStateForEngagement(eng) })),
    [engagements, getStateForEngagement],
  );

  /** Live portfolio KPIs computed from real engagement state (the same rule as the month-end job). */
  const live = useMemo(() => analyticsKpis(projects.map((p) => p.state), ITEM_IDS), [projects]);
  const snapshot = useKpiSnapshot();
  const prev = snapshot.data?.values ?? {};

  const weeks = useMemo(() => stepsCompletedPerWeek(projects, ITEM_IDS, new Date()), [projects]);
  const weeksTotal = weeks.reduce((sum, w) => sum + w.steps, 0);
  const health = useMemo(() => clientHealthCounts(projects, ITEM_IDS), [projects]);
  const healthRows = HEALTH_ROWS.filter((h) => health[h.key] > 0);

  const leads = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const p of [...internOptions, ...teamMembers]) if (!seen.has(p.id)) seen.set(p.id, p);
    return [...seen.values()];
  }, [internOptions, teamMembers]);
  const workload = useMemo(() => workloadByLead(projects, ITEM_IDS, leads), [projects, leads]);
  /** Projects each lead leads, for the "N clients" line under the name. */
  const clientsByLead = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of projects) if (p.internId) out.set(p.internId, (out.get(p.internId) ?? 0) + 1);
    return out;
  }, [projects]);
  // Planned hours per lead this week (F-163), keyed by intern id like the workload rows.
  const leadHours = useLeadHours(role !== 'intern');
  const hoursByLead = useMemo(() => {
    const out = new Map<string, number>();
    for (const l of leadHours.data?.leads ?? []) if (l.internId) out.set(l.internId, l.hours);
    return out;
  }, [leadHours.data]);
  const hoursMax = Math.max(0, ...hoursByLead.values());
  const showWorkload = role !== 'intern' && workload.length > 0;


  return (
    <PageTransition>
      <SEO title="Analytics — VCFO Suite" description="Portfolio performance charts." path="/app/manager/analytics" />

      {/* Plain page head (R-02, R-09): no back link; the period switch on the right. */}
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Analytics</h1>
          <p className="text-[13.5px] text-ink-muted">{period === '6' ? 'Last 6 months' : 'Last 12 months'}</p>
        </div>
        <SpectrumTabs
          size="md"
          label="Period"
          items={[
            { key: '6', label: 'Last 6 months' },
            { key: '12', label: 'Last 12 months' },
          ]}
          value={period}
          onChange={(key) => setPeriod(key as '6' | '12')}
        />
      </header>

      <KpiStrip
        items={[
          { label: 'Projects', value: live.projects, Icon: Building2, change: kpiChange(live.projects, prev.projects) },
          {
            label: 'Steps completed',
            value: live.stepsDone,
            Icon: CircleCheck,
            change: kpiChange(live.stepsDone, prev.steps_done),
          },
          {
            label: 'Waiting on client',
            value: live.awaitingClient,
            Icon: User,
            change: kpiChange(live.awaitingClient, prev.awaiting_client),
            upIsGood: false,
          },
          {
            label: 'Overdue steps',
            value: live.overdue,
            Icon: AlertTriangle,
            bad: live.overdue > 0,
            change: kpiChange(live.overdue, prev.overdue_steps),
            upIsGood: false,
          },
        ]}
      />

      <div className="grid gap-5">
        <div className="grid items-start gap-5 md:grid-cols-2">
          <DashSection
            title="Compliance completion rate"
            meta={lastRated ? `${lastRated.completionPct}% in ${lastRated.label.split(' ')[0]} · target 95%` : 'Target 95%'}
            loading={metrics.isPending}
            loadingVariant="block"
          >
            {hasRates ? (
              <div className="h-[232px]">
                <AnalyticsCompletionChart data={data} />
              </div>
            ) : (
              <EmptyState title="No filing has fallen due yet" />
            )}
          </DashSection>

          <DashSection
            title="Average filing delay"
            meta="Days past due date · benchmark 2 days"
            loading={metrics.isPending}
            loadingVariant="block"
          >
            {hasDelay ? (
              <div className="h-[232px]">
                <AnalyticsDelayChart data={data} />
              </div>
            ) : (
              <EmptyState title="No filing date recorded yet" />
            )}
          </DashSection>
        </div>

        <div className="grid items-start gap-5 md:grid-cols-2">
          <DashSection
            title="Filings on time"
            meta={filedTotal ? `${Math.round((onTimeTotal / filedTotal) * 100)}%` : undefined}
            loading={metrics.isPending}
            loadingVariant="block"
          >
            {/* C4 (B-23): the same on-time and late columns as the Filings rail. */}
            {filedTotal ? (
              <OnTimeColumns data={filingRows} height={180} />
            ) : (
              <EmptyState title="No filing recorded yet" />
            )}
          </DashSection>

          <DashSection title="Steps completed per week" meta={`${weeksTotal} in 8 weeks`}>
            {engagementsLoading ? (
              <div className="h-[232px] animate-pulse rounded-md bg-surface-sunken" aria-hidden />
            ) : weeksTotal === 0 ? (
              <EmptyState title="No steps completed yet" />
            ) : (
              <div className="h-[232px]">
                <AnalyticsStepsChart data={weeks} />
              </div>
            )}
          </DashSection>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DashSection title="Time in step" meta="Open and finished steps" loading={metrics.isPending} flush>
            <EFilingGrid
              caption="Time in step"
              columns={STEP_TIME_COLUMNS}
              rows={stepTime}
              rowKey={(s) => s.stepId}
              empty="No step has been timed yet"
              pageSize={8}
              minWidth={480}
            />
          </DashSection>

          <div className="grid min-w-0 grid-cols-1 gap-5">
            <DashSection title="Client health" meta={`${projects.length} clients`}>
              {healthRows.length === 0 ? (
                engagementsLoading ? (
                  <SkeletonRows rows={3} />
                ) : (
                  <EmptyState title="No clients yet" />
                )
              ) : (
                <div className="flex flex-wrap items-center gap-6 py-2">
                  <DashDonut
                    size={96}
                    segments={healthRows.map((h) => ({ n: health[h.key], color: h.color }))}
                    centerLabel={projects.length}
                    centerCaption=""
                  />
                  <ChartLegend
                    layout="stack"
                    className="flex-1"
                    items={healthRows.map((h) => ({ label: h.label, color: h.color, count: health[h.key] }))}
                  />
                </div>
              )}
            </DashSection>

            {showWorkload ? (
              <DashSection title="Workload" meta="Hours planned this week" flush loading={leadHours.isPending}>
                {/* Prototype ProgressList (F-163): the hours each lead put in their planner this
                    week (time blocks), the bar sized against the busiest lead; the line under the
                    name keeps the open and overdue step counts. */}
                <ProgressList
                  items={workload.map((w) => {
                    const clients = clientsByLead.get(w.id) ?? 0;
                    const hours = hoursByLead.get(w.id) ?? 0;
                    const pct = hoursMax > 0 ? (hours / hoursMax) * 100 : 0;
                    return {
                      id: w.id,
                      name: w.name,
                      sub: `${clients} client${clients === 1 ? '' : 's'} · ${w.open} open · ${w.overdue} overdue`,
                      pct,
                      value: `${hours} h`,
                      tone: w.overdue > 0 ? 'warn' : 'accent',
                    };
                  })}
                />
              </DashSection>
            ) : null}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
