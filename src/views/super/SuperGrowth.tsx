'use client';

import { useMemo, useState } from 'react';
import { Gauge, Plus, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import {
  SuperNumberStrip,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { SuperCapacityLines } from '@/components/super/overview/SuperCapacityCard';
import { roomAcross } from '@/lib/super/super-insights-model';
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
  type Prospect,
  type ProspectStage,
} from '@/lib/growth/pipeline';
import { useDemoRequests, useProspectMutations, useProspects } from '@/views/super/growth/use-growth-data';

/**
 * GROWTH (prototype `GrowthScreen`), counts only: four number tiles, the sales pipeline and
 * "Capacity · can the team take more?".
 *
 * The sales pipeline (G-21) reads `prospects` through `/api/super/growth/prospects`: a board by
 * stage and a list, add and edit, stage moves, and "Convert to client", which links a won
 * prospect to an engagement the super admin picks. Add prospect and the List view stay in the
 * card head because they are the only way to add a prospect and to see a lost one. Proposals won
 * is won / (won + lost) over prospects closed in the last 90 days, from stored rows only. Demo
 * requests from the public "Book a demo" form (G-30) sit below with "Add as prospect", their only
 * home. No money (R-37).
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
  const rate = winRate(prospects, '90', new Date());
  const room = roomAcross(insights.team.managers, people.byProfileId);
  const waiting = prospects.filter((p) => p.stage === 'won' && !p.engagementId).map((p) => p.company || p.name);

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
        <SuperPageHead title="Growth" meta="Last 12 months" />

        <SuperNumberStrip
          items={[
            {
              label: `New engagements in ${current?.longLabel.split(' ')[0] ?? 'this month'}`,
              value: current?.engagementsStarted ?? 0,
              sub: previous ? `${previous.engagementsStarted} in ${previous.longLabel.split(' ')[0]}` : undefined,
              icon: Sparkles,
            },
            { label: 'Prospects in the pipeline', value: pipeline.data ? openCount(prospects) : '–', icon: TrendingUp },
            { label: 'Proposals won this quarter', value: rate.pct === null ? '–' : `${rate.pct}%`, icon: Trophy },
            {
              // Open items left under the managers' capacities (prototype "Room across the managers").
              label: 'Room across the managers',
              value: room ?? '–',
              of: room === null ? undefined : 'open items',
              good: room !== null && room > 0,
              icon: Gauge,
            },
          ]}
        />

        <DashSection
          title="Sales pipeline"
          headIcon={{ icon: TrendingUp, tone: 'blue' }}
          right={
            <>
              <SpectrumTabs
                label="Pipeline view"
                items={[
                  { key: 'board', label: 'Board' },
                  { key: 'list', label: 'List' },
                ]}
                value={view}
                onChange={(k) => setView(k as PipelineView)}
              />
              <Button size="sm" onClick={() => setEditing('new')} disabled={!pipeline.data}>
                <Plus aria-hidden />
                Add prospect
              </Button>
            </>
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

        <SuperCapacityLines managers={insights.team.managers} people={people.byProfileId} waiting={waiting} />

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
