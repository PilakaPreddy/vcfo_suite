'use client';

import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { useMemo } from 'react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ClientTile,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import { INC_STAGES, incStageOf, phaseNameOf } from '@/components/super/overview/super-overview-format';
import type { SuperInsightClient } from '@/lib/super/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { usePracticeMetrics } from '@/components/metrics/use-metrics';
import { ExpectedCoiCard } from '@/components/metrics/practice-cards';
import type { StageRow } from '@/lib/metrics/practice-metrics';
import { superEngagementHref } from '@/lib/super/super-overview';

/**
 * PRACTICE · INCORPORATION (prototype `PracticeScreen` area "Incorporation").
 *
 * The pipeline across the page by named stage, then days in each stage beside the expected
 * certificates, and the certificates issued most recently. Read from the engagement rows and the
 * step events. The client list lives on the Clients page (Stage: Incorporating). Read-only.
 */
const SUPER_INCORPORATION_HREF = '/app/super/practice/incorporation';

export default function SuperPracticeIncorporation() {
  const query = useSuperInsights();
  const insights = query.data;
  // Days in each stage and expected certificates come from the step events (G-13).
  const practiceQuery = usePracticeMetrics();
  const practice = practiceQuery.data;

  const incorporating = useMemo(
    () => (insights?.clients ?? []).filter((client) => !client.summary.incorporated),
    [insights],
  );

  const seo = (
    <SEO
      title="Incorporation — VCFO Suite"
      description="Every client in incorporation: stage, days in each stage and expected certificates."
      path={SUPER_INCORPORATION_HREF}
    />
  );

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading incorporation" />
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Incorporation could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const issued = insights.clients
    .filter((c) => c.startedPreInc && c.certificateDate)
    .sort((a, b) => (b.certificateDate ?? '').localeCompare(a.certificateDate ?? ''))
    .slice(0, 8);

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Incorporation" meta={`${incorporating.length} clients`} />

        <Pipeline clients={incorporating} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <StageDays rows={practice?.incorporation.stageDays ?? []} loading={practiceQuery.isPending} />
          <ExpectedCoiCard
            rows={practice?.incorporation.expected ?? []}
            loading={practiceQuery.isPending}
            hrefFor={(row) => superEngagementHref(row.engagementId)}
          />
        </div>

        <DashSection title="Certificates issued" meta={issued.length ? String(issued.length) : undefined} flush>
          {issued.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No certificate recorded yet" />
            </div>
          ) : (
            <ul>
              {issued.map((c) => (
                <li key={c.summary.id} className="border-t border-line-soft first:border-t-0">
                  <Link href={c.summary.href} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-surface-sunken/60 md:px-5">
                    <ClientTile id={c.summary.id} name={c.summary.companyName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{shortCompany(c.summary.companyName)}</span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {[c.summary.managerName, c.daysToCoi !== null ? `${c.daysToCoi} days to COI` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <b className="w-16 flex-none text-right text-[13px] font-medium tabular-nums">{plainDay(c.certificateDate)}</b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashSection>
      </div>
    </PageTransition>
  );
}

/** Days in each stage over the last 12 months (prototype columns; the firm stores no per-stage target). */
function StageDays({ rows, loading }: { rows: StageRow[]; loading: boolean }) {
  const days = (n: number | null) => (n === null ? '–' : `${n} ${n === 1 ? 'day' : 'days'}`);
  const columns: EFilingColumn<StageRow>[] = [
    { key: 'stage', header: 'Stage', render: (r) => <span className="font-medium text-ink">{phaseNameOf(r.label)}</span> },
    { key: 'avg', header: 'Average', width: '90px', align: 'right', render: (r) => <span className="font-medium tabular-nums">{days(r.avgDays)}</span> },
    {
      key: 'slowest',
      header: 'Slowest now',
      render: (r) =>
        r.slowest ? (
          <span className="whitespace-nowrap">
            {shortCompany(r.slowestCompany ?? 'A client')}, {days(r.slowest.days)}
          </span>
        ) : (
          <span className="text-ink-faint">None open</span>
        ),
    },
  ];
  return (
    <DashSection title="Days in each stage · this year" headIcon={{ icon: Clock, tone: 'violet' }} loading={loading} flush>
      <EFilingGrid caption="Days in each stage" columns={columns} rows={rows} rowKey={(r) => r.phaseId} empty="No stage has started yet" minWidth={420} />
    </DashSection>
  );
}

/** The named stages across the page, each with the clients whose current step sits in it. */
function Pipeline({ clients }: { clients: SuperInsightClient[] }) {
  const byStage = INC_STAGES.map((stage) => ({
    ...stage,
    clients: clients.filter((c) => incStageOf(c.summary) === stage.key),
  }));

  return (
    <DashSection title="Incorporation pipeline" meta={String(clients.length)}>
      {clients.length === 0 ? (
        <EmptyState title="No client is in incorporation" />
      ) : (
        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {byStage.map((stage, i) => (
            <li key={stage.key} className="relative min-h-[150px] min-w-0 rounded-md border-1.5 border-line px-4 py-3.5">
              {i < byStage.length - 1 ? (
                <ChevronRight
                  size={16}
                  strokeWidth={1.6}
                  className="absolute -right-[19px] top-1/2 hidden -translate-y-1/2 text-ink-faint xl:block"
                  aria-hidden
                />
              ) : null}
              <span className="block truncate text-[13px] font-medium text-ink-2">{stage.label}</span>
              <b className="mt-1.5 block text-[26px] font-medium leading-none tabular-nums">{stage.clients.length}</b>
              <ul className="mt-3 grid gap-2">
                {stage.clients.map((c) => (
                  <li key={c.summary.id}>
                    <Link href={c.summary.href} className="flex min-w-0 items-center gap-2 text-[13px] hover:underline">
                      <ClientTile id={c.summary.id} name={c.summary.companyName} className="h-[22px] w-[22px] text-[9.5px]" />
                      <span className="truncate">{shortCompany(c.summary.companyName)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </DashSection>
  );
}
