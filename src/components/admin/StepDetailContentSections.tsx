'use client';

import { m as motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { STATUS_LABEL } from '@/data/checklist';
import { MilestoneResponseForm } from '@/views/incorporation/MilestoneResponseForm';
import { Phase1StepPanel } from '@/components/incorporation/Phase1StepPanel';
import { ResponsibleRoleBadge } from '@/components/incorporation/ResponsibleRoleBadge';
import { ChecklistReviewActions } from '@/components/admin/ChecklistReviewActions';
import { RequestManagerApproval } from '@/components/admin/RequestManagerApproval';
import { RequestClientFill } from '@/components/admin/RequestClientFill';
import { ClientStepFieldPreview } from '@/components/client/ClientStepFieldPreview';
import { InternStepActionBar } from '@/components/admin/InternStepActionBar';
import { BoardResolutionStepLink } from '@/components/incorporation/BoardResolutionStepLink';
import { FirstMeetingStepPanel } from '@/views/board-meetings/FirstMeetingStepPanel';
import { StepWorkspaceRail } from '@/components/admin/StepWorkspaceRail';
import { Eyebrow, Mono, GoldDivider, StatusDot, AccentButton } from '@/components/noir';
import {
  FileText,
  Upload,
  Activity as ActivityIcon,
  Sparkles,
  FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fadeUp, staggerKids } from '@/lib/shell/motion';
import { UNDERLINE_TAB_LIST } from '@/components/admin/step-tab-classes';
import { StepMark } from '@/components/ui/step-track';

const PHASE1_PANEL_IDS = [
  'pre-2',
  'pre-3',
  'pre-4',
  'pre-5',
  'pre-7',
  'pre-8',
  'pre-9',
  'pre-10',
  'pre-11',
  'pre-12',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StepDetailContentView(props: any) {
  const {
    item,
    engagementId,
    responses,
    onDone,
    contentReady,
    hideDocumentsTab,
    hideDeadline,
    isClientViewer,
    clientNothingYet,
    nothingYetIntro,
    hideStatus,
    hideWorkspaceRail,
    progress,
    tab,
    setTab,
    justCompleted,
    isLight,
    scopeId,
    hasClientFields,
    showLegacyChecklist,
    stepActivity,
    totals,
    engagement,
    itemState,
    status,
    tone,
    statusCls,
    preIncPhaseStep,
    toggleForm,
    toggleDoc,
    markAll,
    rowBtn,
    tabTrigger,
    emptyCopy,
    bodyText,
    stepGate,
    formReadOnly,
    theme,
  } = props;

  const showDeadline = Boolean(item.deadline) && !hideDeadline;

  const justCompletedBanner = (
    <AnimatePresence>
      {justCompleted && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={cn(
            'flex items-center gap-2 border px-3 py-2 rounded-md',
            isLight
              ? 'mb-3 border-brand/30 bg-brand-soft text-ink'
              : 'mt-4 border-brand/40 bg-brand/5 rounded-sm',
          )}
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-strong" />
          <span className={cn('text-[12px]', isLight ? 'text-ink' : 'text-ink')}>
            All requirements met — step marked complete.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const phase1Panel =
    PHASE1_PANEL_IDS.includes(item.id) && engagement ? (
      <Phase1StepPanel
        item={item}
        engagement={engagement}
        responses={responses}
        variant={isClientViewer ? 'client' : 'admin'}
        className={isLight ? undefined : 'mb-6'}
      />
    ) : item.id === 'post-1' && engagement && !isClientViewer ? (
      // Board meetings: the first meeting runs on its own page; this links or creates it.
      <FirstMeetingStepPanel engagementId={engagement.id} companyName={engagement.companyName} />
    ) : null;

  /**
   * Admin / manager reading a lead's step: the form is locked, the lead's own
   * Save / Request controls stay off, and the decision pair (Accept / Reject,
   * Approve-and-send / Decline) sits above the filled fields.
   */
  const staffReview = Boolean(formReadOnly) && !isClientViewer;

  const staffReviewPanel =
    staffReview && engagementId ? (
      <div className="space-y-3 empty:hidden">
        <ChecklistReviewActions
          engagementId={engagementId}
          itemId={item.id}
          itemState={itemState}
          theme={theme}
        />
        <RequestClientFill engagementId={engagementId} itemId={item.id} itemState={itemState} />
      </div>
    ) : null;

  const internActionBar = hideWorkspaceRail && !isClientViewer && !staffReview ? (
    <InternStepActionBar
      engagementId={engagementId}
      item={item}
      itemState={itemState}
      showLegacyChecklist={showLegacyChecklist}
      totalsPct={totals.pct}
      onMarkAll={showLegacyChecklist ? markAll : undefined}
    />
  ) : null;

  // `BoardResolutionStepLink` is an intern-only CTA into the BR editor and it
  // states the draft's status. It must never reach a client.
  const internBoardResolutionAction =
    hideWorkspaceRail && !isClientViewer && !staffReview && item.id === 'pre-2' && engagement ? (
      <BoardResolutionStepLink engagement={engagement} />
    ) : null;

  const internFooterFallback =
    hideWorkspaceRail && internActionBar && !hasClientFields;

  const responseForm =
    hasClientFields && scopeId ? (
      <MilestoneResponseForm
        key={`${item.id}-${engagementId}`}
        item={item}
        clientId={scopeId}
        engagementId={engagementId}
        responses={responses}
        variant={isClientViewer ? 'client' : 'admin'}
        showFieldUnlock={!hideWorkspaceRail && !isClientViewer}
        open={contentReady}
        readOnly={formReadOnly ?? !stepGate?.canEdit}
        compactChrome={isLight}
        extraFooterActions={hideWorkspaceRail ? internActionBar : undefined}
        aboveFooterActions={internBoardResolutionAction ?? undefined}
        sectionTabs={hideWorkspaceRail}
      />
    ) : null;

  const legacyChecklist = showLegacyChecklist ? (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className={UNDERLINE_TAB_LIST}>
          {[
            { v: 'forms' as const, icon: FileCheck, label: 'Forms', n: item.forms.length },
            ...(!hideDocumentsTab
              ? [{ v: 'docs' as const, icon: FileText, label: 'Documents', n: item.infoRequired.length }]
              : []),
            { v: 'activity' as const, icon: ActivityIcon, label: 'Activity', n: stepActivity.length },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.v} value={t.v} className={tabTrigger}>
                <span className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                  {t.label}
                  <span className="rounded-sm bg-surface-sunken px-1.5 text-[12px] font-medium tabular-nums text-ink-2">
                    {t.n}
                  </span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="forms" className="focus-visible:ring-0">
          {item.forms.length === 0 ? (
            <p className={cn('text-[12.5px] py-6', emptyCopy)}>No statutory forms for this step.</p>
          ) : (
            <motion.ul
              variants={staggerKids(0.04)}
              initial="hidden"
              animate="show"
              className="space-y-2"
            >
              {item.forms.map((f: string) => {
                const done = progress.forms.includes(f);
                return (
                  <motion.li key={f} variants={fadeUp}>
                    <button type="button" onClick={() => toggleForm(f)} className={rowBtn(done)}>
                      <StepMark state={done ? 'done' : 'next'} size={20} label={done ? 'Filed' : 'To file'} />
                      <Mono
                        className={cn(
                          'text-[12px] tracking-[0.06em] flex-1',
                          'text-ink',
                        )}
                      >
                        {f}
                      </Mono>
                      <span
                        className={cn(
                          'text-[12px] font-medium',
                          done ? 'text-positive' : 'text-ink-muted',
                        )}
                      >
                        {done ? 'Filed' : 'To file'}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </TabsContent>

        {!hideDocumentsTab && (
          <TabsContent value="docs" className="focus-visible:ring-0">
            {item.infoRequired.length === 0 ? (
              <p className={cn('text-[12.5px] py-6', emptyCopy)}>
                No evidence required for this step.
              </p>
            ) : (
              <motion.ul
                variants={staggerKids(0.03)}
                initial="hidden"
                animate="show"
                className="space-y-1.5"
              >
                {item.infoRequired.map((d: string) => {
                  const done = progress.docs.includes(d);
                  return (
                    <motion.li key={d} variants={fadeUp}>
                      <button type="button" onClick={() => toggleDoc(d)} className={cn(rowBtn(done), 'group items-start')}>
                        {done ? (
                          <StepMark state="done" size={20} label="On file" className="mt-0.5" />
                        ) : (
                          <Upload
                            className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-brand-text"
                            strokeWidth={1.6}
                            aria-hidden
                          />
                        )}
                        <span className={cn('text-[14px] flex-1 leading-relaxed', bodyText(done))}>
                          {d}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 text-[12px] font-medium',
                            done ? 'text-positive' : 'text-ink-muted',
                          )}
                        >
                          {done ? 'On file' : 'Outstanding'}
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </TabsContent>
        )}

        <TabsContent value="activity" className="focus-visible:ring-0">
          {stepActivity.length === 0 ? (
            <p className={cn('text-[12.5px] py-6', emptyCopy)}>
              No activity logged for this step yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {stepActivity.map((a: { id: string; actor: string; verb: string; target?: string; at: string }) => (
                <li
                  key={a.id}
                  className={cn(
                    'text-[12.5px] leading-relaxed border-l pl-3',
                    isLight ? 'border-line' : 'border-line',
                  )}
                >
                  <span className={isLight ? 'text-ink' : 'text-ink'}>{a.actor}</span>{' '}
                  <span className={isLight ? 'text-ink-muted' : 'text-ink-muted'}>
                    {a.verb}
                  </span>{' '}
                  {a.target && (
                    <span className="text-brand-text">{a.target}</span>
                  )}
                  <div
                    className={cn(
                      'text-[10px] mono tracking-[0.14em] mt-1',
                      isLight ? 'text-ink-faint' : 'text-ink-subtle',
                    )}
                  >
                    {a.at}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {showDeadline ? (
        <div className="mt-6">
          <GoldDivider className="mb-3" />
          <Mono
            className={cn(
              'text-[10px] tracking-[0.18em] block',
              isLight ? 'text-ink-faint' : 'text-ink-subtle',
            )}
          >
            Deadline · {item.deadline.kind.replace(/-/g, ' ')}
            {'days' in item.deadline && ` · ${item.deadline.days}d`}
            {'weeks' in item.deadline &&
              ` · ${Array.isArray(item.deadline.weeks) ? item.deadline.weeks.join('–') : item.deadline.weeks}w`}
          </Mono>
          {showDeadline && (
            <Mono
              className={cn(
                'text-[10px] tracking-[0.18em] mt-2 block',
                isLight ? 'text-ink-faint' : 'text-ink-subtle',
              )}
            >
              Deadline · {item.deadline.kind.replace(/-/g, ' ')}
              {'days' in item.deadline && ` · ${item.deadline.days}d`}
              {'weeks' in item.deadline &&
                ` · ${Array.isArray(item.deadline.weeks) ? item.deadline.weeks.join('–') : item.deadline.weeks}w`}
            </Mono>
          )}
        </div>
      ) : null}
    </>
  ) : null;

  if (isLight) {
    const internPageFooter = internFooterFallback ? (
      <div className="sticky bottom-0 z-20 mt-4 border-t border-line/70 bg-surface-raised/95 px-4 py-3 supports-[backdrop-filter]:bg-surface-raised/80">
        <div className="flex flex-wrap items-center gap-2">{internActionBar}</div>
      </div>
    ) : null;

    return (
      <div className="flex min-h-0 flex-col">
        {justCompletedBanner}
        {hideWorkspaceRail ? (
          clientNothingYet ? (
            /* Readable, not locked. Rather than one "nothing here" line, show
               what the step will capture so the reader can see what is coming —
               values only where they are entitled to them. A manager keeps the
               decision pair above it: a pending "ask the client to fill" request
               is theirs to approve even while the lead is still drafting. */
            <div className="min-w-0 space-y-4">
              {staffReviewPanel}
              <ClientStepFieldPreview
                item={item}
                responses={responses}
                itemState={itemState}
                intro={nothingYetIntro}
                ownershipType={engagement?.ownershipType}
              />
            </div>
          ) : (
            <div className="min-w-0 space-y-4">
              {staffReviewPanel}
              {item.id !== 'pre-7' ? phase1Panel : null}
              {responseForm}
              {item.id === 'pre-7' ? phase1Panel : null}
              {legacyChecklist}
              {internPageFooter}
            </div>
          )
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,18.5rem)] lg:items-start lg:gap-5">
            <div className="min-w-0 space-y-3">
              {phase1Panel}
              {responseForm}
              {isClientViewer ? null : (
                <div className="lg:hidden empty:hidden">
                  <RequestManagerApproval
                    engagementId={engagementId}
                    itemId={item.id}
                    itemState={itemState}
                    emphasis="primary"
                  />
                  <RequestClientFill
                    engagementId={engagementId}
                    itemId={item.id}
                    itemState={itemState}
                    emphasis="primary"
                    className="mt-2"
                  />
                </div>
              )}
              {legacyChecklist}
            </div>
            <StepWorkspaceRail
              item={item}
              status={status}
              statusCls={statusCls}
              engagementId={engagementId}
              itemState={itemState}
              responses={responses}
              activity={stepActivity}
              stepGate={stepGate}
              theme={theme}
              showLegacyChecklist={showLegacyChecklist}
              hideStatus={hideStatus}
              totalsPct={totals.pct}
              onMarkAll={showLegacyChecklist ? markAll : undefined}
              className="mt-4 lg:sticky lg:top-[var(--shell-sticky-top)] lg:mt-0"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-3 px-6 pt-6 pb-4 text-left border-b border-line">
        <div className="flex items-center justify-between">
          <Eyebrow>Step · {item.bucket.replace('-', ' ')}</Eyebrow>
          <Mono className="text-[10px] tracking-[0.18em] text-ink-subtle">
            {String(preIncPhaseStep?.stepNumber ?? item.order).padStart(2, '0')} / {item.id}
          </Mono>
        </div>
        <h1 className="serif leading-tight font-normal text-ink text-[22px]">{item.title}</h1>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ResponsibleRoleBadge role={item.responsibleRole} />
        </div>
        <div className="flex items-center gap-3 pt-1">
          {!hideStatus && (
            <>
              <StatusDot tone={tone.dot} size={8} pulse={status === 'in-progress'} />
              <span className={cn('text-[10.5px] mono tracking-[0.18em]', statusCls)}>
                {STATUS_LABEL[status]}
              </span>
            </>
          )}
          {showLegacyChecklist && (
            <>
              <span className="text-ink-subtle">·</span>
              <Mono className="text-[10.5px] tracking-[0.18em] text-ink-muted">
                {totals.done}/{totals.total} items
              </Mono>
            </>
          )}
        </div>
        {showLegacyChecklist && (
          <div className="relative h-[3px] overflow-hidden rounded-full mt-2 bg-surface-sunken">
            <motion.div
              className="absolute inset-y-0 left-0 bg-brand"
              initial={false}
              animate={{ width: `${totals.pct}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}
      </header>

      {justCompletedBanner}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {phase1Panel}
        {hasClientFields && scopeId && (
          <div className="mb-6 space-y-4">
            {isClientViewer ? null : (
              <>
                <ChecklistReviewActions
                  engagementId={engagementId}
                  itemId={item.id}
                  itemState={itemState}
                  theme={theme}
                />
                <RequestManagerApproval
                  engagementId={engagementId}
                  itemId={item.id}
                  itemState={itemState}
                />
                <RequestClientFill
                  engagementId={engagementId}
                  itemId={item.id}
                  itemState={itemState}
                />
              </>
            )}
            {stepGate?.kind === 'waiting' && stepGate.message && (
              <div className="rounded-md border-1.5 border-warning-mid bg-warning-soft px-3 py-2.5 text-[13.5px] text-warning">
                {stepGate.message}
              </div>
            )}
            {responseForm}
          </div>
        )}
        {legacyChecklist}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4 bg-surface-raised">
        <Mono className="text-[10.5px] tracking-[0.18em] text-ink-muted">
          {showLegacyChecklist ? `${totals.pct}% of requirements met` : ''}
        </Mono>
        <div className="flex items-center gap-2">
          <AccentButton variant="ghost" size="sm" onClick={onDone}>
            Done
          </AccentButton>
          {showLegacyChecklist && (
            <AccentButton size="sm" onClick={markAll} disabled={totals.pct === 100}>
              Mark all complete
            </AccentButton>
          )}
        </div>
      </footer>
    </div>
  );
}
