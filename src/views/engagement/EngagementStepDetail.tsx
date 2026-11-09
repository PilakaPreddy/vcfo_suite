"use client";

import { ClientFileRequestsPanel } from "@/components/incorporation/ClientFileRequestsPanel";
import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import { redirect } from 'next/navigation';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import { PageTransition } from '@/components/shell/PageTransition';
import { PageBackButton } from '@/components/shell/PageBackButton';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { ClientChangeRequestButton } from '@/components/client/ClientChangeRequestButton';
import { ClientStepApproveButton } from '@/components/client/ClientStepApproveButton';
import { SEO } from '@/components/SEO';
import { StepDetailContent } from '@/components/admin/StepDetailContent';
import { RedirectTo } from '@/components/routing/RedirectTo';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { StepAboutPanel } from '@/views/client-record/StepAboutPanel';
import { recordStepPlace } from '@/views/client-record/RecordHeadParts';
import { StepWindowBar } from '@/views/engagement/step/StepWindowBar';
import { setEngagementWindowInDb } from '@/lib/projects/engagements-db';
import { canSetScheduleWindows, windowForStep } from '@/lib/projects/schedule-windows';
import { ChecklistJourneyRail } from '@/components/incorporation/ChecklistJourneyRail';
import { Surface } from '@/components/noir';
import { StepMark } from '@/components/ui/step-track';
import { ChecklistStatusPill } from '@/components/incorporation/ChecklistStatusBadge';
import { DocPackHeaderButton } from '@/components/doc-pack/DocPackHeaderButton';
import { DocPackRailCard } from '@/components/doc-pack/DocPackRailCard';
import { CopyForAssist } from '@/components/assist-profile/CopyForAssist';
import { AssistAgentHint } from '@/components/assist-profile/AssistAgentHint';
import { ReopenStepButton } from '@/components/incorporation/ReopenStepButton';
import { ASSIST_PROFILE_STEP_IDS } from '@/lib/assist-profile/paths';
import { useState } from 'react';
import { shortDate } from '@/components/timeline/timeline-model';
import { docPackStepPath } from '@/lib/doc-pack/paths';
import { useEngagementStepDetail } from '@/views/engagement/step-detail/use-engagement-step-detail';
import { createStepView } from '@/views/engagement/step-detail/create-step-view';

/** The record's names for the phases (prototype `PHASES`), for the staff step head and rail. */
const PHASE_SHORT: Record<string, string> = {
  'pre-inc-phase-1': 'Name application',
  'pre-inc-phase-2': 'Incorporation',
  'post-inc-phase-3': 'Post-incorporation',
  'registration-phase-4': 'Registrations',
};
const PHASE_RAIL: Record<string, string> = {
  'pre-inc-phase-1': 'Phase 1 · Name application',
  'pre-inc-phase-2': 'SPICe+ Part B',
  'post-inc-phase-3': 'Phase 3 · Post-incorporation',
  'registration-phase-4': 'Registrations',
};

/**
 * Shared checklist step detail for admin projects, intern engagements, and the
 * client portal. One component, three routes — the client opens exactly the
 * screen the project lead opens, minus the firm-side controls, which
 * `viewer="client"` removes inside `StepDetailContent`.
 */
export default function EngagementStepDetail() {
  const state = useEngagementStepDetail();
  const [stepTab, setStepTab] = useState('forms');
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
  const staffCode = isClientRoute ? null : recordStepPlace(item.id)?.code ?? null;
  const headCode = staffCode ?? (selfRow ? `Step ${selfRow.stepNumber}` : null);
  /* Activity on this step, as `StepDetailContent` filters it: the tab beside Forms (prototype `StepView`). */
  const activityNeedle = item.title.toLowerCase().split(' ').slice(0, 2).join(' ');
  const stepActivity = eActivity.filter(
    (a) => a.target?.toLowerCase().includes(activityNeedle) || item.forms.some((f) => a.target?.toLowerCase().includes(f.toLowerCase())),
  );
  const stepTitleRow = (
    <header className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {isClientRoute ? <PageBackButton className="-ml-1.5" /> : null}
      {selfMark ? <StepMark state={selfMark.state} tone={selfMark.tone} label={selfMark.label} /> : null}
      <div className="min-w-0 flex-[1_1_280px]">
        <h1 className="min-w-0 text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">
          {item.title}
        </h1>
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13.5px] text-ink-muted">
          {headCode ? <span className="font-mono text-[13px]">{headCode}</span> : null}
          {headCode ? <span aria-hidden>·</span> : null}
          <span className="min-w-0 truncate">{eng.companyName}</span>
          {internPhase ? (
            <>
              <span aria-hidden>·</span>
              <span>{isClientRoute ? internPhase.title : PHASE_SHORT[internPhase.id] ?? internPhase.title}</span>
            </>
          ) : null}
        </p>
      </div>
      {selfStatus && showHeadStatus ? <ChecklistStatusPill status={selfStatus} /> : null}
      {isClientRoute ? (
        <WhatsThisButton kind="step" refId={item.id} label={item.title} />
      ) : (
        <WhatsThisButton kind="step" refId={item.id} label={item.title} variant="outline" className="h-control-md px-3.5 text-[14px]" onOpen={() => setAboutOpen(true)} />
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
    />
  ) : null;

  const stepWindowBar = !isClientRoute ? (
    <StepWindowBar
      className="mb-3.5"
      value={stepWindowValue}
      canEdit={canSetScheduleWindows(user?.role)}
      editSub={`${headCode ? `${headCode} · ` : ''}${eng.companyName}`}
      scopeLabel={stepWindowTarget.kind === 'incorporation' ? 'SPICe+ Part A and Part B' : undefined}
      docPackHref={docPackHref}
      trailing={
        ASSIST_PROFILE_STEP_IDS.has(item.id) ? (
          <CopyForAssist
            engagementId={eng.id}
            className="mb-0 border-0 bg-transparent p-0"
            hrefForMissing={(input) => docPackStepPath(eng, docPackShell, input.stepId, input.tabId)}
          />
        ) : undefined
      }
      onSave={async (window) => {
        await setEngagementWindowInDb(eng.id, stepWindowTarget, window);
        await queryClient.invalidateQueries({ queryKey: ['engagements'] });
      }}
    />
  ) : null;

  const assistHint = !isClientRoute ? <AssistAgentHint stepId={item.id} /> : null;

  const stepFormBody = (
    <>
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

  /* R-11: Forms and Activity are views of one step, so underline tabs. The client keeps the form alone. */
  const stepForm = isClientRoute ? (
    stepFormBody
  ) : (
    <div className="grid gap-3.5">
      <SpectrumTabs
        variant="underline"
        label="Step views"
        items={[
          { key: 'forms', label: 'Forms' },
          { key: 'activity', label: 'Activity', count: stepActivity.length },
        ]}
        value={stepTab}
        onChange={setStepTab}
      />
      {stepTab === 'forms' ? (
        <div className="min-w-0">{stepFormBody}</div>
      ) : (
        <DashSection title="Activity" meta={String(stepActivity.length)} flush>
          {stepActivity.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No activity yet" />
            </div>
          ) : (
            <ul>
              {stepActivity.map((a) => (
                <li key={a.id} className="flex min-h-row items-center gap-3 border-b border-line-soft px-4 py-2 text-[13.5px] last:border-0 md:px-5">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {a.actor} {a.verb}
                  </span>
                  <span className="flex-none text-[12.5px] tabular-nums text-ink-muted">{shortDate(a.at.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          )}
        </DashSection>
      )}
    </div>
  );

  /* S-506, S-512: the phase rail is a section card (icon tile, phase name, "x of y"); below lg it
     stacks under the main card instead of hiding. */
  const internPhaseRail = internWorkspace && internPhase ? (
    <aside className="min-w-0 lg:sticky lg:top-[var(--shell-sticky-top)] lg:self-start">
      <DashSection
        title={isClientRoute ? internPhase.title : PHASE_RAIL[internPhase.id] ?? internPhase.title}
        meta={`${railDone} of ${internPhaseRailItems.length}`}
        bodyClassName={isClientRoute ? 'px-2 py-2' : 'px-4 py-3 md:px-4'}
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
                  showAttachmentMenu={isClientRoute}
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
            showAttachmentMenu={isClientRoute}
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
          {assistHint}
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
            {assistHint}
            {stepForm}
            {!isClientRoute ? <ClientFileRequestsPanel engagementId={eng.id} item={item} /> : null}
          </div>
        </div>
      )}
      {!isClientRoute ? (
        <StepAboutPanel
          stepId={aboutOpen ? item.id : null}
          stepLabel={headCode ?? undefined}
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
