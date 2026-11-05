"use client";

import { ClientFileRequestsPanel } from "@/components/incorporation/ClientFileRequestsPanel";
import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import { redirect } from 'next/navigation';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import { PageTransition } from '@/components/shell/PageTransition';
import { PageBackButton } from '@/components/shell/PageBackButton';
import { ClientChangeRequestButton } from '@/components/client/ClientChangeRequestButton';
import { ClientStepApproveButton } from '@/components/client/ClientStepApproveButton';
import { SEO } from '@/components/SEO';
import { StepDetailContent } from '@/components/admin/StepDetailContent';
import { RedirectTo } from '@/components/routing/RedirectTo';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { StepAboutPanel } from '@/views/client-record/StepAboutPanel';
import { StepWindowBar } from '@/views/engagement/step/StepWindowBar';
import { StepDaysMeta } from '@/components/metrics/step-days-meta';
import { setEngagementWindowInDb } from '@/lib/projects/engagements-db';
import { canSetScheduleWindows, windowForStep } from '@/lib/projects/schedule-windows';
import { ChecklistJourneyRail } from '@/components/incorporation/ChecklistJourneyRail';
import { Surface } from '@/components/noir';
import { StepMark } from '@/components/ui/step-track';
import { ChecklistStatusPill } from '@/components/incorporation/ChecklistStatusBadge';
import { DocPackHeaderButton } from '@/components/doc-pack/DocPackHeaderButton';
import { DocPackRailCard } from '@/components/doc-pack/DocPackRailCard';
import { DocSourceStrip } from '@/components/doc-pack/DocSourceStrip';
import { CopyForAssist } from '@/components/assist-profile/CopyForAssist';
import { ReopenStepButton } from '@/components/incorporation/ReopenStepButton';
import { ASSIST_PROFILE_STEP_IDS } from '@/lib/assist-profile/paths';
import { docPackStepPath } from '@/lib/doc-pack/paths';
import { useEngagementStepDetail } from '@/views/engagement/step-detail/use-engagement-step-detail';
import { createStepView } from '@/views/engagement/step-detail/create-step-view';

/**
 * Shared checklist step detail for admin projects, intern engagements, and the
 * client portal. One component, three routes — the client opens exactly the
 * screen the project lead opens, minus the firm-side controls, which
 * `viewer="client"` removes inside `StepDetailContent`.
 */
export default function EngagementStepDetail() {
  const state = useEngagementStepDetail();
  const {
    router,
    queryClient,
    user,
    refreshEngagementChecklist,
    engagementsSettled,
    aboutOpen,
    setAboutOpen,
    isClientRoute,
    isInternRoute,
    readOnlyView,
    engagementParam,
    stepParam,
    projectPath,
    stepPath,
    listRedirect,
    eng,
    item,
    task,
    eActivity,
    internPhase,
    docPack,
    docPackShell,
    checklistState,
    responses,
  } = state;

  if (eng && !isInternRoute && !isClientRoute && eng.slug && engagementParam !== eng.slug) {
    redirect(stepPath(eng, stepParam));
  }

  if (eng && item?.slug && stepParam !== item.slug) {
    redirect(stepPath(eng, item));
  }

  // Wait for the engagement list before deciding there is no engagement: on a
  // cold load this guard fired first and bounced a hard refresh back to the
  // checklist, which looked exactly like a step being locked.
  //
  // `engagementsLoading` alone is not enough. The engagements query is
  // `enabled: Boolean(user)`, so while the session is still hydrating the query
  // is idle and `isLoading` is FALSE with an empty list — which is how the
  // redirect kept firing intermittently. `engagementsSettled` is true only once
  // the query has actually resolved, so a genuinely engagement-less caller
  // still redirects rather than spinning.
  if (!eng) {
    // `user` can be momentarily null across a soft navigation between step
    // routes; on the client route `eng` is derived from it, so redirecting on
    // that tick bounced the reader out of a step they were allowed to read.
    if (!engagementsSettled || !user) return <StepLoadingShapes />;
    return <RedirectTo href={listRedirect} />;
  }
  /* S-519: an unknown step shows a "Step" card with a dashed "No step" area, not a bounce. */
  if (!item) {
    return (
      <DashSection title="Step" bodyClassName="p-4">
        <EmptyState
          title="No step"
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push(projectPath(eng))}>
              Open {eng.companyName}
            </Button>
          }
        />
      </DashSection>
    );
  }

  const {
    checklistLoading,
    handleCompleted,
    clientNothingYet,
    staffAwaitingLead,
    nothingYetIntro,
    railItems,
    internPhaseRailItems,
    stepWindowTarget,
    stepWindowValue,
    internPhaseRailGroups,
    openStep,
    internWorkspace,
    showHeadStatus,
    directFlow,
    approvalLabel,
    directFlowComplete,
    editedLine,
    gateNotice,
    leadWaitingNotice,
    docPackHref,
    selfRow,
    selfStatus,
    selfMark,
    railDone,
  } = createStepView(state, eng, item);

  /* Plain step head (VCFO Spectrum, prototype `StepView`): the ST5 mark, the 28px title, a muted
     line with the step code, company and phase, then the status chip. No back link on staff
     screens (R-09): the rail and the record already lead back. */
  const stepTitleRow = (
    <header className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {isClientRoute ? <PageBackButton className="-ml-1.5" /> : null}
      {selfMark ? <StepMark state={selfMark.state} tone={selfMark.tone} label={selfMark.label} /> : null}
      <div className="min-w-0 flex-[1_1_280px]">
        <h1 className="min-w-0 text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">
          {item.title}
        </h1>
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13.5px] text-ink-muted">
          {selfRow ? <span className="font-mono text-[13px]">Step {selfRow.stepNumber}</span> : null}
          {selfRow ? <span aria-hidden>·</span> : null}
          <span className="min-w-0 truncate">{eng.companyName}</span>
          {internPhase ? (
            <>
              <span aria-hidden>·</span>
              <span>{internPhase.title}</span>
            </>
          ) : null}
          {/* Staff only: opened, days in step and the window's end (G-13). */}
          {!isClientRoute ? (
            <StepDaysMeta engagementId={eng.id} stepId={item.id} dueOn={windowForStep(eng.schedule, item.id)?.to ?? null} />
          ) : null}
        </p>
      </div>
      {selfStatus && !directFlow && showHeadStatus ? <ChecklistStatusPill status={selfStatus} /> : null}
      {isClientRoute ? (
        <WhatsThisButton kind="step" refId={item.id} label={item.title} />
      ) : (
        <WhatsThisButton kind="step" refId={item.id} label={item.title} variant="outline" onOpen={() => setAboutOpen(true)} />
      )}
      {/* Narrow screens lose the rail (and its card); this stands in, never both. */}
      {docPackHref ? (
        <DocPackHeaderButton summary={docPack.data} packHref={docPackHref} className="lg:hidden" />
      ) : null}
    </header>
  );
  const stepMetaRow =
    editedLine || gateNotice || leadWaitingNotice ? (
      <div className="-mt-2 mb-4 space-y-2">
        {editedLine ? <p className="text-[12.5px] text-ink-muted">{editedLine}</p> : null}
        {gateNotice ? (
          <p role="status" className="rounded-md border-1.5 border-line bg-surface-sunken px-3 py-2 text-[13.5px] text-ink">
            {gateNotice}
          </p>
        ) : null}
        {leadWaitingNotice ? (
          <p role="status" className="rounded-md border-1.5 border-brand-line bg-brand-soft px-3 py-2 text-[13.5px] text-ink">
            {leadWaitingNotice}
          </p>
        ) : null}
      </div>
    ) : null;

  /* Below lg the head's document pack button stands in for this card, so it shows on lg only. */
  const docPackRailCard = docPackHref ? (
    <DocPackRailCard
      className="mt-3.5 hidden lg:block"
      summary={docPack.data}
      loading={docPack.isPending}
      error={docPack.isError}
      packHref={docPackHref}
      currentStepId={item.id}
      hrefForMissing={(input) => docPackStepPath(eng, docPackShell, input.stepId, input.tabId)}
    />
  ) : null;

  const stepWindowBar = !isClientRoute ? (
    <StepWindowBar
      className="mb-3.5"
      value={stepWindowValue}
      canEdit={canSetScheduleWindows(user?.role)}
      editSub={`${selfRow ? `Step ${selfRow.stepNumber} · ` : ''}${eng.companyName}`}
      scopeLabel={stepWindowTarget.kind === 'incorporation' ? 'SPICe+ Part A and Part B' : undefined}
      docPackHref={docPackHref}
      onSave={async (window) => {
        await setEngagementWindowInDb(eng.id, stepWindowTarget, window);
        await queryClient.invalidateQueries({ queryKey: ['engagements'] });
      }}
    />
  ) : null;

  const stepForm = (
    <>
      {docPackHref && docPack.data ? (
        <DocSourceStrip summary={docPack.data} stepId={item.id} packHref={docPackHref} />
      ) : null}
      {/* Staff shell only: the client never sees the Assist profile. */}
      {!isClientRoute && ASSIST_PROFILE_STEP_IDS.has(item.id) ? (
        <CopyForAssist
          engagementId={eng.id}
          hrefForMissing={(input) => docPackStepPath(eng, docPackShell, input.stepId, input.tabId)}
        />
      ) : null}
      <StepDetailContent
        item={item}
        task={task}
        engagementId={eng.id}
        responses={responses}
        activity={eActivity}
        onCompleted={task ? handleCompleted : undefined}
        theme="light"
        contentReady={!checklistLoading}
        hideDocumentsTab={internWorkspace}
        hideStatus={internWorkspace}
        hideWorkspaceRail={internWorkspace}
        viewer={isClientRoute ? 'client' : 'staff'}
        readOnly={readOnlyView && !isClientRoute}
        clientNothingYet={clientNothingYet || staffAwaitingLead}
        nothingYetIntro={nothingYetIntro}
      />

      {/* The client's two actions on a step, at STEP level — never per tab.
          They never edit the step itself, so this is the whole of what they
          can do: sign it off, or say what should change. */}
      {/* Lead, manager or admin: open a submitted direct-flow step again. */}
      {!isClientRoute && directFlowComplete ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <ReopenStepButton scopeId={eng.id} itemId={item.id} stepTitle={item.title} />
        </div>
      ) : null}

      {/* Direct flow: the client's only step-level action is asking for a
          change once the step is submitted — it reopens the step. */}
      {isClientRoute && directFlow && directFlowComplete ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <ClientChangeRequestButton
            engagementId={eng.id}
            stepId={item.id}
            stepTitle={item.title}
            onSent={() => void refreshEngagementChecklist(eng.id)}
          />
        </div>
      ) : null}

      {isClientRoute && !directFlow && (approvalLabel || !clientNothingYet) ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          {approvalLabel ? (
            <span className="mr-auto text-[12px] text-ink-muted">{approvalLabel}</span>
          ) : null}
          {/* While the firm holds the step (a change the client asked for is
              being made) only the status line remains — nothing to act on. */}
          {!clientNothingYet ? (
            <>
              <ClientChangeRequestButton
                engagementId={eng.id}
                stepId={item.id}
                stepTitle={item.title}
              />
              <ClientStepApproveButton
                engagementId={eng.id}
                stepId={item.id}
                itemState={checklistState[item.id]}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );

  /* S-506, S-512: the phase rail is a section card (icon tile, phase name, "x of y"); below lg it
     stacks under the main card instead of hiding. */
  const internPhaseRail = internWorkspace && internPhase ? (
    <aside className="min-w-0 lg:sticky lg:top-[var(--shell-sticky-top)] lg:self-start">
      <DashSection
        title={internPhase.title}
        meta={`${railDone} of ${internPhaseRailItems.length}`}
        bodyClassName="px-2 py-2"
      >
        {internPhase.id === 'registration-phase-4' ? (
          <div className="space-y-4">
            {internPhaseRailGroups.map((group) => (
              <div key={group.heading}>
                <p className="mb-1.5 px-2 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">
                  {group.heading}
                </p>
                <ChecklistJourneyRail
                  items={group.items}
                  selectedId={item.id}
                  allowLockedOpen
                  hideStatus
                  showAttachmentMenu
                  showStepCode={!isClientRoute}
                  onSelect={openStep}
                />
              </div>
            ))}
          </div>
        ) : (
          <ChecklistJourneyRail
            items={internPhaseRailItems}
            selectedId={item.id}
            allowLockedOpen
            hideStatus
            showAttachmentMenu
            showStepCode={!isClientRoute}
            onSelect={openStep}
          />
        )}
      </DashSection>
      {docPackRailCard}
    </aside>
  ) : null;

  return (
    <PageTransition>
      <SEO
        title={`${item.title} — ${eng.companyName}`}
        description={`Checklist step for ${eng.companyName}: forms, activity, and client responses.`}
        path={stepPath(eng, item)}
      />

      {internWorkspace ? (
        <div className="min-w-0">
          {checklistLoading && (
            <div className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
              <HexgridLoader size="sm" />
              Syncing client answers…
            </div>
          )}
          {stepTitleRow}
          {stepMetaRow}
          {stepWindowBar}
          {internPhase ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
              <div className="min-w-0">
                {stepForm}
                {!isClientRoute ? <ClientFileRequestsPanel engagementId={eng.id} item={item} /> : null}
              </div>
              {internPhaseRail}
            </div>
          ) : (
            <>
              {stepForm}
              {!isClientRoute ? <ClientFileRequestsPanel engagementId={eng.id} item={item} /> : null}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)]">
          <aside className="hidden lg:block lg:sticky lg:top-[var(--shell-sticky-top)] lg:self-start">
            <Surface className="max-h-[calc(100vh-var(--shell-sticky-top)-1.5rem)] overflow-y-auto p-3 sidebar-scroll">
              <ChecklistJourneyRail items={railItems} selectedId={item.id} onSelect={openStep} />
            </Surface>
          </aside>

          <div className="min-w-0">
            {checklistLoading && (
              <div className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
                <HexgridLoader size="sm" />
                Syncing client answers…
              </div>
            )}
            {stepTitleRow}
            {stepMetaRow}
            {stepWindowBar}
            {stepForm}
            {!isClientRoute ? <ClientFileRequestsPanel engagementId={eng.id} item={item} /> : null}
          </div>
        </div>
      )}
      {!isClientRoute ? (
        <StepAboutPanel
          stepId={aboutOpen ? item.id : null}
          stepLabel={selfRow ? `Step ${selfRow.stepNumber}` : undefined}
          engagementId={eng.id}
          onClose={() => setAboutOpen(false)}
        />
      ) : null}
    </PageTransition>
  );
}

/** R-48 (S-518): grey shapes for the head, the window bar, the main card and the rail while the engagement loads. */
function StepLoadingShapes() {
  return (
    <div className="min-w-0" aria-busy="true" aria-label="Loading the step">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-[22px] w-[22px] animate-pulse rounded-mark bg-surface-sunken" />
        <span className="h-8 w-[min(420px,70%)] animate-pulse rounded-md bg-surface-sunken" />
      </div>
      <span className="mb-3.5 block h-11 animate-pulse rounded-md bg-surface-sunken" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="surface p-4">
          <SkeletonRows rows={5} />
        </div>
        <div className="surface p-4">
          <SkeletonRows rows={6} className="gap-1.5" />
        </div>
      </div>
    </div>
  );
}
