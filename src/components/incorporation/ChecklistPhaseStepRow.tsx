'use client';

import type { ChecklistItem } from '@/data/checklist';
import { getChecklistStepTimelineLabel } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import type { ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';
import type { PortalStep } from '@/lib/client-portal/step-model';
import { StepLink, StepMark, type StepTone } from '@/components/ui/step-track';
import { Chip } from '@/components/ui/spectrum-chip';
import { UserFace } from '@/components/common/UserFace';
import { initialsOf } from '@/components/ui/avatar-stack';
import { stepMarkForGate } from '@/components/incorporation/step-mark-for-gate';
import { BoardResolutionStepLink } from '@/components/incorporation/BoardResolutionStepLink';
import { shortDate, daysBetween } from '@/components/timeline/timeline-model';
import { cn } from '@/lib/utils';

/**
 * One step row inside a phase (prototype `StepList` row, R-22 ST5).
 *
 * Done: a green square with a tick, "Done 14 Oct" and a green chip. Live: a ring with a soft halo,
 * the row tinted inside the card padding, who holds it and since when ("With SBC · 3 days" in
 * teal), the lead's face from 768px and the 104px status chip; a sent-back step is red. Upcoming:
 * a dashed square, the typical time and an empty 104px slot. A 1.5px line joins the marks, green
 * under done steps. "What's this?" (from 640px) opens the step's Ask VCFO panel.
 *
 * The dates and the holder come from the incorporation step model (`facts`, the same model the
 * client portal reads); without it the row falls back to the gate message and the typical time.
 * Every row opens: the gate governs what the viewer may do on the step, not whether they may
 * read it.
 */
export function ChecklistPhaseStepRow({
  item,
  gate,
  engagement,
  onOpen,
  showBoardResolutionLink = true,
  stepNumber,
  stepLabel,
  facts,
  leadName,
  onAbout,
  connector = false,
  connectorAbove,
  today = new Date().toISOString().slice(0, 10),
}: {
  item: ChecklistItem;
  gate: ChecklistStepGate;
  engagement: Engagement;
  onOpen: (item: ChecklistItem) => void;
  /** pre-2 carries a link into the board-resolution editor on the lead side. */
  showBoardResolutionLink?: boolean;
  /** Step number, shown as a mono "Step n" before the title. */
  stepNumber?: number;
  /** The mono code before the title when it is not "Step n" ("Reg-3"). */
  stepLabel?: string;
  /** The step's dates and holder from `buildIncorporationModel`. */
  facts?: PortalStep;
  /** The project lead's name, shown with a face on the live row. */
  leadName?: string | null;
  /** Opens the "What's this?" panel for the step. */
  onAbout?: (item: ChecklistItem) => void;
  /** Draw the line down to the next row's mark. */
  connector?: boolean;
  /** R-58: draw the line up to the mark of the row above; 'done' when that step is done. */
  connectorAbove?: 'done' | 'todo';
  today?: string;
}) {
  const base = stepMarkForGate(gate);
  const sentBack = facts?.slice?.reviewStatus === 'rejected' && gate.kind !== 'done';
  const state = base.state;
  const live = state === 'now';
  const waiting = gate.kind === 'waiting';
  const late = Boolean(facts?.late) && live;
  const tone: StepTone = sentBack ? 'bad' : base.tone;

  const holder =
    facts?.owner === 'client' ? shortCompany(engagement.companyName) : facts?.owner === 'mca' ? 'MCA' : 'SBC';
  const days = facts?.since ? Math.max(0, daysBetween(facts.since, today)) : null;
  const typical = getChecklistStepTimelineLabel(item);

  let sub: string | null;
  let subTone = 'text-ink-muted';
  if (state === 'done') {
    sub = facts?.doneOn ? `Done ${shortDate(facts.doneOn)}` : 'Done';
  } else if (live && sentBack) {
    sub = 'Sent back for a correction';
    subTone = 'text-danger';
  } else if (live && waiting) {
    sub = days !== null ? `With ${holder} · ${days} ${days === 1 ? 'day' : 'days'}` : gate.message ?? `With ${holder}`;
    subTone = 'text-waiting';
  } else if (live) {
    sub = facts?.due ? `Due ${shortDate(facts.due)}` : typical || null;
    if (late) subTone = 'text-danger';
  } else {
    sub = typical || null;
  }

  const chipWord = state === 'done' ? 'Done' : sentBack ? 'Sent back' : late ? 'Overdue' : waiting ? 'Waiting' : 'In progress';

  // With the board resolution box under the title, the mark and chip line up with the title, not the block.
  const withDoc = !!showBoardResolutionLink && item.id === 'pre-2';

  return (
    <div
      className={cn(
        'group relative -mx-2.5 flex gap-3 rounded-md px-2.5 py-2 transition-colors',
        withDoc ? 'items-start' : 'items-center',
        live ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60',
      )}
      data-ask-focus={item.id}
    >
      <StepLink x={21} y={withDoc ? 19 : undefined} up={connectorAbove} down={connector && (state === 'done' ? 'done' : 'todo')} />
      <StepMark state={state} tone={tone} label={sentBack ? 'Sent back' : base.label} className="relative z-[1]" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          {stepLabel || stepNumber !== undefined ? (
            <span className="flex-none font-mono text-[12px] text-ink-muted">{stepLabel ?? `Step ${stepNumber}`}</span>
          ) : null}
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              'min-w-0 truncate text-left text-[14px] outline-none after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring',
              live ? 'font-medium text-ink' : state === 'done' ? 'text-ink' : 'text-ink-2',
            )}
          >
            {item.title}
          </button>
          {onAbout ? (
            <button
              type="button"
              onClick={() => onAbout(item)}
              className="relative z-[1] hidden flex-none whitespace-nowrap text-[12px] font-medium text-brand-text hover:underline sm:inline"
            >
              What&apos;s this?
            </button>
          ) : null}
        </span>
        {sub ? <span className={cn('truncate text-[12.5px]', subTone)}>{sub}</span> : null}
        {withDoc ? (
          <span className="relative z-[1] mt-1.5 block">
            <BoardResolutionStepLink engagement={engagement} />
          </span>
        ) : null}
      </span>
      <span className="flex flex-none items-center gap-3">
        {live && leadName ? (
          <span className="hidden items-center gap-1.5 text-[12.5px] text-ink-muted md:inline-flex">
            <UserFace initials={initialsOf(leadName)} className="h-6 w-6 bg-brand-soft text-[10px] font-medium text-brand-text" />
            {leadName}
          </span>
        ) : null}
        {state === 'next' ? (
          <span className="hidden w-[104px] sm:block" aria-hidden />
        ) : (
          <Chip fixed>{chipWord}</Chip>
        )}
      </span>
    </div>
  );
}

/** "Larkspur" from "Larkspur Analytics Private Limited": the holder word on a waiting row. */
function shortCompany(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || 'the client';
}
