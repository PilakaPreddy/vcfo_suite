"use client";

import { useEffect, useMemo, useState } from 'react';
import { redirect, useParams, usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { phaseWindowMeta } from '@/components/schedule/phase-window-meta';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DocPackPhasePill } from '@/components/doc-pack/DocPackPhasePill';
import { useDocPack } from '@/hooks/use-doc-pack';
import { docPackPagePath } from '@/lib/doc-pack/paths';
import { ChecklistStatusPill } from '@/components/incorporation/ChecklistStatusBadge';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import {
  checklist,
  BUCKET_LABEL,
  Bucket,
  getPreIncPhases,
  getPreIncPhaseStep,
  getPostIncPhases,
  getPostIncPhaseStep,
  getRegistrationPhases,
  getRegistrationPhaseStep,
} from '@/data/checklist';
import { MilestoneResponseRowSummary } from '@/views/incorporation/MilestoneResponseRowSummary';
import { ChecklistPhaseStepRow } from '@/components/incorporation/ChecklistPhaseStepRow';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import {
  adminProjectStepPath,
  internEngagementPath,
  internEngagementStepPath,
  isInternEngagementPathname,
} from '@/lib/projects/project-step-path';
import {
  engagementRouteParamFromParams,
  resolveEngagementFromRouteParam,
} from '@/lib/slug';
import { ChevronRight } from 'lucide-react';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { StepMark } from '@/components/ui/step-track';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { STAGE_LABEL, type Stage } from '@/lib/projects/stage';
import { RecordPhaseTrack } from '@/components/incorporation/RecordPhaseTrack';
import { RecordStat, RecordStats, RecordTile } from '@/components/incorporation/RecordHead';
import { stepMarkForStatus } from '@/components/incorporation/step-mark-for-gate';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import type { StatusCode } from '@/data/checklist';
import {
  InternEngagementOverview,
  InternOverviewSyncNotice,
} from '@/components/incorporation/InternEngagementOverview';
import {
  INTERN_PHASE_TABS_ENABLED,
  InternNowStrip,
  InternPhaseEntryCards,
} from '@/components/incorporation/InternOverviewProgress';
import {
  internOverviewCurrentItemInPhase,
  internOverviewNow,
  internOverviewPhases,
} from '@/lib/intern/intern-overview-progress';
import { deriveChecklistDisplayStatus } from '@/lib/checklist/checklist-display-status';
import { useBoardResolutionProgress } from '@/hooks/use-board-resolution-progress';
import {
  checklistGateViewerFrom,
  gateActiveCatalog,
  gateDisplayStatus,
  getStepGate,
} from '@/lib/checklist/checklist-step-gate';
import { notifyChecklistStepLocked } from '@/components/incorporation/ChecklistJourneyRail';
import { RecordTabBar, RecordTabPanel, useRecordTab } from '@/views/client-record/RecordTabs';
import { RecordStepsCard } from '@/views/client-record/RecordStepsCard';
import { RecordDocumentsButton, RecordMetaLine, RecordNumbers } from '@/views/client-record/RecordHeadParts';
import { RecordTimelineCard } from '@/components/timeline';
import { SpiceAttachmentsCard } from '@/components/incorporation/SpiceAttachmentsCard';

const ALL_BUCKETS: Bucket[] = ['pre-inc', 'post-inc', 'fema', 'statutory'];
const INTERN_BUCKETS: Bucket[] = ['pre-inc', 'post-inc', 'statutory'];
/** Sticky “You are here” strip on intern engagement overview. */
const INTERN_YOU_ARE_HERE_ENABLED = false;

/** Stage is a category, so its chip has no dot (prototype record head). */
const STAGE_TONE: Record<string, ChipTone> = {
  'Pre-Incorporation': 'violet',
  'Post-Incorporation': 'prog',
  'Operational Readiness': 'teal',
};

function StageChip({ stage }: { stage: string | null | undefined }) {
  if (!stage) return null;
  return (
    <Chip tone={STAGE_TONE[stage] ?? 'idle'} dot={false} fixed>
      {STAGE_LABEL[stage as Stage] ?? stage}
    </Chip>
  );
}

function phasesForBucket(
  bucket: Bucket,
  preInc: ReturnType<typeof getPreIncPhases>,
  postInc: ReturnType<typeof getPostIncPhases>,
  registration: ReturnType<typeof getRegistrationPhases>,
) {
  if (bucket === 'pre-inc') return preInc;
  if (bucket === 'post-inc') return postInc;
  if (bucket === 'statutory') return registration;
  return null;
}

/** `/app/manager/engagements/x` → `/app/manager`: the shell root for links inside this page. */
function shellRootOf(pathname: string | null): string {
  const parts = (pathname ?? '').split('/').filter(Boolean);
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : '/app/admin';
}

function phaseStepNumber(bucket: Bucket, itemId: string, fallback: number): number {
  if (bucket === 'pre-inc') return getPreIncPhaseStep(itemId)?.stepNumber ?? fallback;
  if (bucket === 'post-inc') return getPostIncPhaseStep(itemId)?.stepNumber ?? fallback;
  if (bucket === 'statutory') return getRegistrationPhaseStep(itemId)?.stepNumber ?? fallback;
  return fallback;
}

export default function EngagementDetail() {
  const params = useParams();
  const pathname = usePathname();
  const routeParam = engagementRouteParamFromParams(params);
  const {
    engagements,
    tasks,
    teamMembers,
    user,
    getStateForEngagement,
    refreshEngagementChecklist,
    engagementsLoading,
    engagementsSettled,
  } = useApp();
  const router = useRouter();
  const [checklistRefreshing, setChecklistRefreshing] = useState(false);

  const isInternRoute = isInternEngagementPathname(pathname);
  const isIntern = user?.role === 'intern' || isInternRoute;
  const stepPath = isIntern ? internEngagementStepPath : adminProjectStepPath;

  const eng = useMemo(
    () => resolveEngagementFromRouteParam(engagements, routeParam),
    [engagements, routeParam],
  );
  const docPack = useDocPack(eng?.id);

  useEffect(() => {
    if (!eng?.id) return;
    let cancelled = false;
    setChecklistRefreshing(true);
    void refreshEngagementChecklist(eng.id).finally(() => {
      if (!cancelled) setChecklistRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eng?.id, refreshEngagementChecklist]);

  const checklistState = useMemo(
    () => (eng ? getStateForEngagement(eng) : {}),
    [getStateForEngagement, eng],
  );
  const { snapshot: brSnapshot } = useBoardResolutionProgress(eng?.id);

  const checklistLoading = engagementsLoading || checklistRefreshing;
  const preIncPhases = useMemo(() => getPreIncPhases(), []);
  const postIncPhases = useMemo(() => getPostIncPhases(), []);
  const registrationPhases = useMemo(() => getRegistrationPhases(), []);

  const internPhases = useMemo(() => internOverviewPhases(), []);

  const gateViewer = isIntern
    ? 'intern'
    : checklistGateViewerFrom('admin', user?.role);
  const gates = useMemo(
    () => gateActiveCatalog(checklistState, gateViewer),
    [checklistState, gateViewer],
  );

  const internNow = useMemo(
    () => (isIntern ? internOverviewNow(gates) : null),
    [isIntern, gates],
  );

  /* R-36: the bucket tabs and the phase picker switch in place. */
  const [bucketTab, setBucketTab] = useState<Bucket | null>(null);
  /* G-19: the lead's record tabs (Incorporation, Registrations, Obligations, Notes), `?tab=`. */
  const [recordTab, setRecordTab] = useRecordTab();
  const [phasePick, setPhasePick] = useState<Record<string, string>>({});

  if (isIntern && eng) {
    const canonical = internEngagementPath(eng);
    const suffix = canonical.split('/').pop();
    if (suffix && suffix !== routeParam) {
      redirect(canonical);
    }
  }

  // `engagementsLoading` is false while the session hydrates (the query is still idle), so a
  // fresh page load would bounce; wait until the engagements query has settled.
  if (!eng && !engagementsSettled) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <HexgridLoader />
      </div>
    );
  }

  if (!eng) {
    return (
      <div className="p-6 text-[13px] text-ink-muted">
        This project isn’t in your portfolio — it may have been removed or you don’t have access.
      </div>
    );
  }

  const eTasks = tasks.filter((t) => t.engagementId === eng.id);
  const done = eTasks.filter((t) => t.status === 'completed').length;
  const intern = teamMembers.find((t) => t.id === eng.internId);
  const visibleBuckets = isIntern ? INTERN_BUCKETS : ALL_BUCKETS;

  const statusOf = (it: (typeof checklist)[number]): StatusCode =>
    gateDisplayStatus(
      deriveChecklistDisplayStatus(it.id, it, checklistState[it.id], brSnapshot),
      getStepGate(gates, it.id),
    );

  const renderChecklistRow = (it: (typeof checklist)[number], displayOrder: number) => {
    const responses = extractItemResponses(it, checklistState[it.id]);
    const gate = getStepGate(gates, it.id);
    const openStep = () => {
      if (!isIntern && !gate.canOpen) {
        notifyChecklistStepLocked(gate.message);
        return;
      }
      router.push(stepPath(eng, it));
    };

    if (isIntern) {
      return (
        <ChecklistPhaseStepRow
          key={it.id}
          item={it}
          gate={gate}
          responses={responses}
          engagement={eng}
          onOpen={openStep}
          stepNumber={displayOrder}
        />
      );
    }

    const displayStatus = statusOf(it);
    const mark = stepMarkForStatus(displayStatus);
    const live = mark.state === 'now';

    return (
      <button
        key={it.id}
        type="button"
        onClick={openStep}
        className={
          'grid min-h-11 w-full grid-cols-[22px_1fr_auto_auto] items-center gap-3 border-b border-line-soft px-4 py-2.5 text-left transition-colors last:border-0 ' +
          (live ? 'bg-surface-sunken/70 hover:bg-surface-sunken' : 'hover:bg-surface-sunken/50')
        }
      >
        <StepMark state={mark.state} tone={mark.tone} label={mark.label} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="flex-none font-mono text-[12px] text-ink-muted">Step {displayOrder}</span>
            <span
              className={
                'min-w-0 truncate text-[14px] ' +
                (!gate.canOpen ? 'text-ink-muted' : live ? 'font-medium text-ink' : mark.state === 'next' ? 'text-ink-2' : 'text-ink')
              }
            >
              {it.title}
            </span>
          </div>
          {gate.kind === 'waiting' && gate.message && (
            <div className="mt-0.5 text-[12.5px] text-waiting">{gate.message}</div>
          )}
          <MilestoneResponseRowSummary item={it} responses={responses} variant="admin" />
        </div>
        {/* Upcoming steps show their real status, not a padlock — the gate is
            unchanged, it just is not drawn as a lock-out. */}
        <ChecklistStatusPill status={displayStatus} />
        {gate.canOpen ? (
          <ChevronRight className="h-4 w-4 text-ink-faint" strokeWidth={1.6} aria-hidden />
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
      </button>
    );
  };

  /* The first open step across the record, for the head's "Now" and the default tab. */
  const currentAdminStep = isIntern
    ? null
    : (() => {
        for (const b of visibleBuckets) {
          for (const it of checklist.filter((row) => row.bucket === b)) {
            const status = statusOf(it);
            if (status !== 'completed' && status !== 'not-applicable') return { bucket: b, item: it, status };
          }
        }
        return null;
      })();
  const activeBucket: Bucket =
    bucketTab && visibleBuckets.includes(bucketTab) ? bucketTab : currentAdminStep?.bucket ?? visibleBuckets[0]!;

  const docPackPill = (phaseId: string) => {
    const part = phaseId === 'pre-inc-phase-1' ? 'part-a' : phaseId === 'pre-inc-phase-2' ? 'part-b' : null;
    if (!part || !isIntern) return null;
    return <DocPackPhasePill summary={docPack.data} href={docPackPagePath(eng, 'intern', part)} />;
  };

  const internPhaseHref = (phaseId: string): string | null => {
    const phase = internPhases.find((group) => group.id === phaseId);
    if (!phase) return null;
    const item = internOverviewCurrentItemInPhase(phase.items, gates);
    if (!item) return internEngagementPath(eng);
    return internEngagementStepPath(eng, item);
  };

  return (
    <PageTransition>
      <SEO
        title={`${eng.companyName} — VCFO Suite`}
        description={`GCC setup project workspace for ${eng.companyName}.`}
        path={`/app/${user?.role}/engagements/${eng.id}`}
      />

      {isIntern ? (
        <InternEngagementOverview
          companyName={eng.companyName}
          clientEmail={eng.clientEmail}
          engagementId={eng.id}
          badge={<StageChip stage={eng.stage} />}
          meta={<RecordMetaLine engagement={eng} />}
          actions={<RecordDocumentsButton engagement={eng} onOpen={() => setRecordTab('documents')} />}
          stats={
            <RecordStats>
              <RecordNumbers
                engagement={eng}
                state={checklistState}
                gates={gates}
                hrefFor={(item) => internEngagementStepPath(eng, item)}
              />
            </RecordStats>
          }
        >
          <RecordTabBar
            engagement={eng}
            value={recordTab}
            onChange={setRecordTab}
            overviewCount={internNow ? `${internNow.stepNumber}/${internNow.stepTotal}` : undefined}
          />

          {recordTab !== 'overview' ? (
            <RecordTabPanel tab={recordTab} engagement={eng} shellBase="/app/intern" />
          ) : (
            <>
              {INTERN_YOU_ARE_HERE_ENABLED && internNow ? (
                <InternNowStrip
                  now={internNow}
                  onOpen={() => router.push(internEngagementStepPath(eng, internNow.item))}
                />
              ) : null}

              {checklistLoading ? (
                <InternOverviewSyncNotice>
                  <HexgridLoader size="sm" />
                  Syncing client answers…
                </InternOverviewSyncNotice>
              ) : null}

              {/* R-21: the Gantt; a lead reads it, managers and admins edit it. */}
              <RecordTimelineCard engagement={eng} state={checklistState} role={user?.role} />

              {INTERN_PHASE_TABS_ENABLED ? (
                <RecordStepsCard
                  engagement={eng}
                  state={checklistState}
                  gates={gates}
                  hrefFor={(item) => internEngagementStepPath(eng, item)}
                  onOpen={(item) => router.push(internEngagementStepPath(eng, item))}
                  leadName={intern?.name ?? (user?.id === eng.internId ? user?.name : null)}
                  metaForPhase={phaseWindowMeta(eng.schedule)}
                  trailingForPhase={docPackPill}
                  onOpenRegistrations={() => setRecordTab('registrations')}
                />
              ) : (
                <InternPhaseEntryCards
                  phases={internPhases}
                  gates={gates}
                  hrefForPhase={internPhaseHref}
                  metaForPhase={phaseWindowMeta(eng.schedule)}
                  trailingForPhase={docPackPill}
                />
              )}

              {/* Spec T6: the SPICe+ Part B attachments, under the SPICe+ steps. */}
              <SpiceAttachmentsCard engagementId={eng.id} shellBase="/app/intern" />
            </>
          )}
        </InternEngagementOverview>
      ) : (
        <>
          {/* Plain record head (C-0108): tile, 28px name, stage chip, a muted meta line, then the numbers. */}
          <header className="mb-5 grid gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <RecordTile name={eng.companyName} />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="min-w-0 text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">{eng.companyName}</h1>
                  <StageChip stage={eng.stage} />
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-ink-muted">
                  {eng.clientEmail?.trim() ? (
                    <>
                      <a
                        href={`mailto:${eng.clientEmail.trim()}`}
                        className="min-w-0 truncate hover:text-ink hover:underline"
                        title={`Email ${eng.companyName}`}
                      >
                        {eng.clientEmail.trim()}
                      </a>
                      <span aria-hidden>·</span>
                    </>
                  ) : null}
                  <span>
                    Delivery owner <b className="font-medium text-ink">{intern?.name ?? 'Unassigned'}</b>
                  </span>
                </p>
              </div>
            </div>
            <RecordStats>
              <RecordStat value={done} label="complete" />
              <RecordStat value={eTasks.length - done} label="remaining" />
              {currentAdminStep ? (
                <button
                  type="button"
                  onClick={() => router.push(stepPath(eng, currentAdminStep.item))}
                  className="flex min-w-0 flex-wrap items-center gap-2 text-left text-[14px] hover:underline"
                >
                  <span className="text-ink-muted">Now</span>
                  <b className="min-w-0 truncate font-medium text-ink">{currentAdminStep.item.title}</b>
                  <ChecklistStatusPill status={currentAdminStep.status} />
                </button>
              ) : null}
            </RecordStats>
          </header>

          <SpectrumTabs
            variant="underline"
            label="Record views"
            className="mb-4"
            items={visibleBuckets.map((b) => {
              const items = checklist.filter((it) => it.bucket === b);
              return {
                key: b,
                label: BUCKET_LABEL[b],
                count: `${items.filter((it) => statusOf(it) === 'completed').length}/${items.length}`,
              };
            })}
            value={activeBucket}
            onChange={(k) => setBucketTab(k as Bucket)}
          />

          {checklistLoading && (
            <div className="mb-4 flex items-center gap-2 text-[12px] text-ink-faint">
              <HexgridLoader size="sm" />
              Syncing client answers…
            </div>
          )}

          {(() => {
            const b = activeBucket;
            const items = checklist.filter((it) => it.bucket === b);
            const phases = phasesForBucket(b, preIncPhases, postIncPhases, registrationPhases);
            if (!phases || phases.length === 0) {
              return (
                <section className="surface min-w-0 overflow-hidden">
                  <div className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft px-4">
                    <CardHeadTile title="Steps" />
                    <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{BUCKET_LABEL[b]}</h2>
                    <span className="text-[12.5px] tabular-nums text-ink-muted">
                      {items.filter((it) => statusOf(it) === 'completed').length} of {items.length} done
                    </span>
                  </div>
                  {items.map((it) => renderChecklistRow(it, it.order))}
                </section>
              );
            }
            const track = phases.map((phase) => ({
              id: phase.id,
              label: phase.title.replace(/^Phase\s+\d+\s+[—–-]\s+/i, '').trim() || phase.title,
              done: phase.items.filter((it) => statusOf(it) === 'completed').length,
              total: phase.items.length,
            }));
            const firstOpen = track.find((p) => p.done < p.total)?.id ?? track[0]!.id;
            const pickedId = phasePick[b] && track.some((p) => p.id === phasePick[b]) ? phasePick[b]! : firstOpen;
            const phase = phases.find((ph) => ph.id === pickedId) ?? phases[0]!;
            const totalDone = track.reduce((n, p) => n + p.done, 0);
            const total = track.reduce((n, p) => n + p.total, 0);
            return (
              <section className="surface min-w-0 overflow-hidden">
                <div className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft px-4">
                  <CardHeadTile title="Steps" />
                  <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{BUCKET_LABEL[b]}</h2>
                  <span className="text-[12.5px] tabular-nums text-ink-muted">
                    {totalDone} of {total} done
                  </span>
                </div>
                {track.length > 1 ? (
                  <div className="border-b border-line-soft px-4 pb-3 pt-4">
                    <RecordPhaseTrack
                      phases={track}
                      picked={phase.id}
                      onPick={(id) => setPhasePick((prev) => ({ ...prev, [b]: id }))}
                    />
                  </div>
                ) : null}
                <div className="flex min-h-11 items-baseline gap-2 border-b border-line-soft px-4 py-2">
                  <span className="text-[13px] font-medium text-ink">{phase.title}</span>
                  {phase.subtitle ? <span className="text-[12.5px] text-ink-muted">{phase.subtitle}</span> : null}
                </div>
                <div role="region" aria-label={phase.title}>
                  {phase.items.map((it) => renderChecklistRow(it, phaseStepNumber(b, it.id, it.order)))}
                </div>
              </section>
            );
          })()}

          {/* Spec T6: the SPICe+ Part B attachments, under the Pre-Incorporation steps. */}
          {activeBucket === 'pre-inc' ? (
            <SpiceAttachmentsCard engagementId={eng.id} shellBase={shellRootOf(pathname)} />
          ) : null}
        </>
      )}
    </PageTransition>
  );
}
