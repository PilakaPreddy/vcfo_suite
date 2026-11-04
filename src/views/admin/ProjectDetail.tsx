"use client";

import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter, redirect } from 'next/navigation';
import { RedirectTo } from '@/components/routing/RedirectTo';
import { useApp } from '@/context/AppContext';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { TimelineRequestsPanel } from '@/components/incorporation/TimelineRequestsPanel';
import { WorkItemsPanel } from '@/components/incorporation/WorkItemsPanel';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { RecordStat, RecordStats, RecordTile } from '@/components/incorporation/RecordHead';
import { STAGE_LABEL, type Stage } from '@/lib/projects/stage';
import { DocPackPhasePill } from '@/components/doc-pack/DocPackPhasePill';
import { useDocPack } from '@/hooks/use-doc-pack';
import { docPackPagePath } from '@/lib/doc-pack/paths';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import { getActiveCatalogItems, type ChecklistItem } from '@/data/checklist';
import { adminProjectPath, adminProjectStepPath } from '@/lib/projects/project-step-path';
import {
  gateActiveCatalog,
  isChecklistStepSequentiallyComplete,
} from '@/lib/checklist/checklist-step-gate';
import { formatDate } from '@/lib/projects/deadlines';
import { resolveEngagementFromRouteParam } from '@/lib/slug';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { RaiseEscalationButton } from '@/components/super/escalations/RaiseEscalationButton';
import { phaseWindowMeta } from '@/components/schedule/phase-window-meta';
import { canSetScheduleWindows } from '@/lib/projects/schedule-windows';
import { RecordTabBar, RecordTabPanel, useRecordTab } from '@/views/client-record/RecordTabs';
import { RecordStepsCard } from '@/views/client-record/RecordStepsCard';
import { RecordDocumentsButton, RecordMetaLine, RecordNumbers } from '@/views/client-record/RecordHeadParts';
import { RecordTimelineCard } from '@/components/timeline';

/**
 * STAFF CLIENT RECORD (admin + manager; prototype `ClientRecordScreen`).
 *
 * The head shows the client tile in its identity colour, the name and stage, the contact,
 * manager and project lead with "Reassign", and the numbers line (step, days to COI, days with
 * the holder, the Now link). The Incorporation tab holds the Timeline card (the shared Gantt,
 * with "Edit the timeline" for the roles that set dates) and the Steps card with the ST5 phase
 * track and the step list. Gates run with the `client` viewer, so nothing on the step list is
 * editable here; staff read the steps as the client does.
 *
 * Underline tabs under the head switch the record in place (G-19): Incorporation, then
 * Registrations, Obligations, Documents and Notes (`src/views/client-record/RecordTabs.tsx`).
 */
const STAGE_TONE: Record<string, ChipTone> = {
  'Pre-Incorporation': 'violet',
  'Post-Incorporation': 'prog',
  'Operational Readiness': 'teal',
};

export default function ProjectDetail() {
  const params = useParams();
  const slugParam = params.slug as string;
  const {
    engagements,
    engagementsLoading,
    getStateForEngagement,
    refreshEngagementChecklist,
    teamMembers,
    user,
  } = useApp();
  const staffBase = useStaffBasePath();
  const router = useRouter();
  // G-19: the record's tabs (Incorporation, Registrations, Obligations, Notes), `?tab=`.
  const [recordTab, setRecordTab] = useRecordTab();

  const eng = useMemo(
    () => resolveEngagementFromRouteParam(engagements, slugParam),
    [engagements, slugParam],
  );
  const docPack = useDocPack(eng?.id);
  const docPackPill = useCallback(
    (phaseId: string) => {
      const part = phaseId === 'pre-inc-phase-1' ? 'part-a' : phaseId === 'pre-inc-phase-2' ? 'part-b' : null;
      if (!part || !eng) return null;
      return <DocPackPhasePill summary={docPack.data} href={docPackPagePath(eng, staffBase, part)} />;
    },
    [docPack.data, eng, staffBase],
  );

  useEffect(() => {
    if (!eng?.id) return;
    void refreshEngagementChecklist(eng.id);
  }, [eng?.id, refreshEngagementChecklist]);

  const state = useMemo(
    () => (eng ? getStateForEngagement(eng) : {}),
    [eng, getStateForEngagement],
  );
  // Client viewer on purpose: read-only gating, identical to the client portal.
  const gates = useMemo(() => gateActiveCatalog(state, 'client'), [state]);

  if (!eng && engagementsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <HexgridLoader />
      </div>
    );
  }

  if (eng?.slug && slugParam !== eng.slug) {
    redirect(adminProjectPath(eng, staffBase));
  }

  if (!eng) return <RedirectTo href={`${staffBase}/projects`} />;

  const catalog = getActiveCatalogItems();
  const totalSteps = catalog.length;
  const totalDone = catalog.filter((item) =>
    isChecklistStepSequentiallyComplete(state[item.id]?.status ?? 'not-started', state[item.id], item.id),
  ).length;
  const stepHref = (item: ChecklistItem) => adminProjectStepPath(eng, item, staffBase);
  const leadName = teamMembers.find((m) => m.id === eng.internId)?.name ?? null;
  const incorporationDate = eng.incorporationDate;

  return (
    <PageTransition>
      <SEO
        title={`${eng.companyName} — VCFO Suite`}
        description="Pre- and post-incorporation milestones for this India entity setup."
        path={adminProjectPath(eng, staffBase)}
      />

      {/* Plain record head (VCFO Spectrum C-0108): no band, no back link (R-09). */}
      <header className="mb-5 grid gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <RecordTile name={eng.companyName} identityId={eng.id} />
          <div className="min-w-0 flex-[1_1_320px]">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">{eng.companyName}</h1>
              {eng.stage ? (
                <Chip tone={STAGE_TONE[eng.stage] ?? 'idle'} dot={false} fixed>
                  {STAGE_LABEL[eng.stage as Stage] ?? eng.stage}
                </Chip>
              ) : null}
            </div>
            <RecordMetaLine engagement={eng} />
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2">
            {/* G-20: raise the client to an admin or the super admin. */}
            <RaiseEscalationButton engagementId={eng.id} companyName={eng.companyName} size="sm" />
            <RecordDocumentsButton engagement={eng} onOpen={() => setRecordTab('documents')} />
          </div>
        </div>
        <RecordStats>
          <RecordNumbers engagement={eng} state={state} gates={gates} hrefFor={stepHref} />
          {incorporationDate ? <RecordStat value={formatDate(new Date(incorporationDate))} label="incorporated" /> : null}
        </RecordStats>
      </header>

      <RecordTabBar
        engagement={eng}
        value={recordTab}
        onChange={setRecordTab}
        overviewCount={`${totalDone}/${totalSteps}`}
        className="mb-5"
      />
      {recordTab === 'overview' ? (
        <div className="grid gap-5">
          <TimelineRequestsPanel engagementId={eng.id} canDecide={canSetScheduleWindows(user?.role)} />
          {/* R-21: the Gantt; "Edit" sets the incorporation window and the expected COI. */}
          <RecordTimelineCard engagement={eng} state={state} role={user?.role} />
          <RecordStepsCard
            engagement={eng}
            state={state}
            gates={gates}
            hrefFor={stepHref}
            onOpen={(item) => router.push(stepHref(item))}
            leadName={leadName}
            metaForPhase={phaseWindowMeta(eng.schedule)}
            trailingForPhase={docPackPill}
            onOpenRegistrations={() => setRecordTab('registrations')}
          />
          <WorkItemsPanel engagementId={eng.id} />
        </div>
      ) : (
        <RecordTabPanel tab={recordTab} engagement={eng} shellBase={staffBase} />
      )}
    </PageTransition>
  );
}
