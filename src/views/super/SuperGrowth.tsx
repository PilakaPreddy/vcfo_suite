'use client';

import { useMemo, useState } from 'react';
import { Plus, TrendingUp } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { CHART_STATUS, ChartLegend, DashBarChart, type ChartRow, type ChartSeries } from '@/components/charts';
import { PhaseBar } from '@/components/ui/step-track';
import {
  StackedBar,
  SuperNumberStrip,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { SuperCapacityCard } from '@/components/super/overview/SuperCapacityCard';
import { roomAcross } from '@/components/super/insights/super-insights-model';
import { indexPeople, usePeopleMetrics } from '@/components/metrics/use-metrics';
import { Button } from '@/components/ui/button';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { PipelineBoard, PipelineList } from '@/components/super/growth/PipelineBoard';
import { ProspectDialog } from '@/components/super/growth/ProspectDialog';
import { ConvertDialog } from '@/components/super/growth/ConvertDialog';
import { DemoRequestsCard } from '@/components/super/growth/DemoRequestsCard';
import { useApp } from '@/context/AppContext';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import {
  openCount,
  PROSPECT_STAGE_LABEL,
  winRate,
  WIN_RATE_WINDOW_LABEL,
  WIN_RATE_WINDOWS,
  type Prospect,
  type ProspectStage,
  type WinRateWindow,
} from '@/lib/growth/pipeline';
import { useDemoRequests, useProspectMutations, useProspects } from '@/views/super/growth/use-growth-data';

/**
 * GROWTH (prototype `GrowthScreen`), counts only.
 *
 * New engagements by the month they started (`created_at`) and certificates by the month they
 * were issued, over the last twelve months, plus how much of the current book is incorporated.
 *
 * The sales pipeline (G-21) reads `prospects` through `/api/super/growth/prospects`: a board by
 * stage and a list, add and edit, stage moves, and "Convert to client", which links a won
 * prospect to an engagement the super admin picks. The win rate is won / (won + lost) over
 * prospects closed in the chosen window, from stored rows only. Demo requests from the public
 * "Book a demo" form (G-30) sit below with "Add as prospect". Per-manager capacity is still
 * left out. No money (R-37).
 */
const SUPER_GROWTH_HREF = '/app/super/growth';

type PipelineView = 'board' | 'list';

export default function SuperGrowth() {
  const query = useSuperInsights();
  const peopleQuery = usePeopleMetrics();
  const people = useMemo(() => indexPeople(peopleQuery.data), [peopleQuery.data]);
  const insights = query.data;
  const { user } = useApp();
  const pipeline = useProspects();
  const demoRequests = useDemoRequests();
  const { create, update, convert, fromDemoRequest } = useProspectMutations();
  const [view, setView] = useState<PipelineView>('board');
  const [rateWindow, setRateWindow] = useState<WinRateWindow>('90');
  const [editing, setEditing] = useState<Prospect | 'new' | null>(null);
  const [converting, setConverting] = useState<Prospect | null>(null);

  const prospects = useMemo(() => pipeline.data?.prospects ?? [], [pipeline.data]);
  const engagements = useMemo(
    () => (insights?.clients ?? []).map((c) => ({ id: c.summary.id, companyName: c.summary.companyName })),
    [insights],
  );
  const companyByDbId = useMemo(() => new Map(engagements.map((e) => [engagementDbId(e.id), e.companyName])), [engagements]);
  const linkedCompany = useMemo(
    () =>
      new Map(
        prospects
          .filter((p) => p.engagementId)
          .map((p) => [p.id, companyByDbId.get(p.engagementId!) ?? 'Client linked'] as const),
      ),
    [prospects, companyByDbId],
  );
  const linkedIds = useMemo(
    () => new Set(engagements.filter((e) => prospects.some((p) => p.engagementId === engagementDbId(e.id))).map((e) => e.id)),
    [engagements, prospects],
  );

  const seo = <SEO title="Growth — VCFO Suite" description="New engagements and certificates over time." path={SUPER_GROWTH_HREF} />;

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading growth" />
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Growth could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const months = insights.months;
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const yearStarted = months.reduce((sum, m) => sum + m.engagementsStarted, 0);
  const yearCertificates = months.reduce((sum, m) => sum + m.certificatesIssued, 0);
  const incorporating = insights.clients.filter((c) => !c.summary.incorporated).length;

  const data: ChartRow[] = months.map((m) => ({
    month: m.label,
    started: m.engagementsStarted,
    certificates: m.certificatesIssued,
  }));
  const series: ChartSeries[] = [
    { key: 'started', label: 'New engagements', color: CHART_STATUS.active },
    { key: 'certificates', label: 'Certificates issued', color: CHART_STATUS.done },
  ];

  const phaseTotals = insights.clients[0]?.summary.phases.map((p) => p.total) ?? [];
  const phaseNames = insights.clients[0]?.summary.phases.map((p) => p.label) ?? [];
  const phaseDone = phaseTotals.map((_, i) =>
    insights.clients.reduce((sum, c) => sum + (c.summary.phases[i]?.done ?? 0), 0),
  );
  const phaseAll = phaseTotals.map((t) => t * insights.clients.length);

  const rate = winRate(prospects, rateWindow, new Date());
  const room = roomAcross(insights.team.managers, people.byProfileId);

  function move(p: Prospect, stage: ProspectStage) {
    if (p.stage === stage) return;
    update.mutate(
      { id: p.id, values: { stage } },
      {
        onSuccess: () => toastSuccess(`${p.company || p.name} moved to ${PROSPECT_STAGE_LABEL[stage].toLowerCase()}`),
        onError: (err) => toastError('Could not move the prospect', errorMessage(err)),
      },
    );
  }

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Growth" meta="Last 12 months">
          <Button onClick={() => setEditing('new')} disabled={!pipeline.data}>
            <Plus aria-hidden />
            Add prospect
          </Button>
        </SuperPageHead>

        <SuperNumberStrip
          items={[
            {
              label: `New engagements in ${current?.longLabel.split(' ')[0] ?? 'this month'}`,
              value: current?.engagementsStarted ?? 0,
              sub: previous ? `${previous.engagementsStarted} in ${previous.longLabel.split(' ')[0]}` : undefined,
            },
            { label: 'New engagements · 12 months', value: yearStarted },
            {
              label: 'Certificates · 12 months',
              value: yearCertificates,
              sub: current ? `${current.certificatesIssued} this month` : undefined,
              good: yearCertificates > 0,
            },
            { label: 'Clients in incorporation', value: incorporating },
            { label: 'Prospects in the pipeline', value: pipeline.data ? openCount(prospects) : '–' },
            {
              label: `Win rate · ${WIN_RATE_WINDOW_LABEL[rateWindow].toLowerCase()}`,
              value: rate.pct === null ? '–' : `${rate.pct}%`,
              sub: `${rate.won} won · ${rate.lost} lost`,
            },
            {
              // Open items left under the managers' capacities (prototype "Room across the managers").
              label: 'Room across the managers',
              value: room ?? '–',
              sub: room === null ? 'No capacity set' : 'open items',
              good: room !== null && room > 0,
            },
          ]}
        />

        <DashSection
          title="Sales pipeline"
          icon={TrendingUp}
          tone="info"
          meta={
            <span className="flex flex-wrap items-center gap-2">
              <SpectrumTabs
                label="Win rate window"
                items={WIN_RATE_WINDOWS.map((w) => ({ key: w, label: WIN_RATE_WINDOW_LABEL[w] }))}
                value={rateWindow}
                onChange={(k) => setRateWindow(k as WinRateWindow)}
              />
              <SpectrumTabs
                label="Pipeline view"
                items={[
                  { key: 'board', label: 'Board' },
                  { key: 'list', label: 'List' },
                ]}
                value={view}
                onChange={(k) => setView(k as PipelineView)}
              />
            </span>
          }
        >
          {pipeline.isPending ? (
            <SkeletonRows rows={4} />
          ) : pipeline.isError ? (
            <EmptyState
              title={errorMessage(pipeline.error, 'The pipeline could not load')}
              action={
                <Button size="sm" variant="outline" onClick={() => void pipeline.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : view === 'board' ? (
            <PipelineBoard prospects={prospects} linkedCompany={linkedCompany} onEdit={setEditing} onMove={move} onConvert={setConverting} />
          ) : (
            <PipelineList prospects={prospects} linkedCompany={linkedCompany} onEdit={setEditing} onMove={move} onConvert={setConverting} />
          )}
        </DashSection>

        <SuperCapacityCard title="Capacity · can the team take more?" managers={insights.team.managers} people={people.byProfileId} />

        <DemoRequestsCard
          requests={demoRequests.data ?? []}
          loading={demoRequests.isPending}
          error={demoRequests.isError ? errorMessage(demoRequests.error, 'Demo requests could not load.') : null}
          addingId={fromDemoRequest.isPending ? (fromDemoRequest.variables ?? null) : null}
          onAdd={(r) =>
            fromDemoRequest.mutate(r.id, {
              onSuccess: () => toastSuccess(`${r.company || r.name} added as a lead`),
              onError: (err) => toastError('Could not add the prospect', errorMessage(err)),
            })
          }
        />

        <DashSection title="New engagements and certificates" meta={`${yearStarted} started · ${yearCertificates} certificates`}>
          <DashBarChart data={data} categoryKey="month" series={series} height={220} emptyLabel="No engagements yet" />
          <ChartLegend className="mt-2" items={series.map((s) => ({ label: s.label, color: s.color }))} />
        </DashSection>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <DashSection title="Clients by incorporation" meta={String(insights.clients.length)}>
            <StackedBar
              segments={[
                { label: 'Incorporated', value: insights.clients.length - incorporating, tone: 'ok' },
                { label: 'In incorporation', value: incorporating, tone: 'prog' },
              ]}
            />
          </DashSection>
          <DashSection title="Steps done across the book" meta={`${phaseDone.reduce((a, b) => a + b, 0)} steps`}>
            {phaseTotals.length === 0 ? null : (
              <>
                <PhaseBar done={phaseDone} totals={phaseAll} names={phaseNames} tall />
                <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-4">
                  {phaseNames.map((name, i) => (
                    <li key={name} className="flex items-baseline gap-1.5">
                      <span className="truncate">{name}</span>
                      <b className="font-medium tabular-nums text-ink">
                        {phaseDone[i]}/{phaseAll[i]}
                      </b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DashSection>
        </div>
      </div>

      <ProspectDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        prospect={editing === 'new' ? null : editing}
        owners={pipeline.data?.owners ?? []}
        defaultOwnerId={user?.id ?? ''}
        saving={create.isPending || update.isPending}
        onSave={(values) => {
          const done = { onSuccess: () => setEditing(null), onError: (err: unknown) => toastError('Could not save the prospect', errorMessage(err)) };
          if (editing === 'new') create.mutate(values, done);
          else if (editing) update.mutate({ id: editing.id, values }, done);
        }}
      />
      <ConvertDialog
        prospect={converting}
        engagements={engagements}
        linkedIds={linkedIds}
        saving={convert.isPending}
        onOpenChange={(o) => !o && setConverting(null)}
        onConvert={(engagementId) => {
          if (!converting) return;
          const name = converting.company || converting.name;
          convert.mutate(
            { id: converting.id, engagementId },
            {
              onSuccess: () => {
                toastSuccess(`${name} linked to its engagement`);
                setConverting(null);
              },
              onError: (err) => toastError('Could not link the client', errorMessage(err)),
            },
          );
        }}
      />
    </PageTransition>
  );
}
