'use client';

import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import type { ChecklistItem } from '@/data/checklist';
import type { StatusCode } from '@/data/checklist';
import { ChecklistStatusBadge } from '@/components/incorporation/ChecklistStatusBadge';
import { JourneyNode } from '@/components/incorporation/JourneyNode';
import { StepLink } from '@/components/ui/step-track';
import { RESPONSIBLE_ROLE_LABEL } from '@/lib/checklist/checklist-field-access';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { StepAttachmentRequirement } from '@/lib/checklist/checklist-step-attachments';
import type { ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';
import { gateDisplayStatus } from '@/lib/checklist/checklist-step-gate';
import { toastInfo } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Clock, MoreVertical, User } from 'lucide-react';
import { LayoutGroup, useReducedMotion } from 'framer-motion';
import { MotionActivePill } from '@/components/shell/MotionActivePill';

export function notifyChecklistStepLocked(message: string | null) {
  toastInfo(message ?? 'This opens after the previous step is complete.');
}

function ChecklistLockedHint({
  message,
  children,
}: {
  message: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex gap-2.5">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <p className="text-sm leading-relaxed text-ink">{message}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface JourneyRailItem {
  item: ChecklistItem;
  gate: ChecklistStepGate;
  status: StatusCode;
  stepNumber: number;
  phaseId?: string;
  attachments?: StepAttachmentRequirement[];
  /** Manager-set window (`formatWindow`), shown as quiet mono metadata. */
  windowLabel?: string;
  /** The staff rail's mono code ("Step 13", "Reg-3"); "Step n" from `stepNumber` when absent. */
  stepCode?: string;
}

interface ChecklistJourneyRailProps {
  items: JourneyRailItem[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
  /** Intern/lead: every row opens; no lock glyphs, muted rows, or “opens after”. */
  allowLockedOpen?: boolean;
  /** Intern/lead: no expected-timeline / working-days SLA. */
  /** Intern/lead: no StatusBadge / StatusPill (Completed, In progress, etc.). */
  hideStatus?: boolean;
  /** Kebab → Attachments required (intern step rail). */
  showAttachmentMenu?: boolean;
  /** Staff step rail (prototype `StepView`): one compact row with the mark, "Step n" in a 50px mono column, the title and the holder icon. */
  showStepCode?: boolean;
  className?: string;
}

/**
 * Who holds the step (prototype rail): a 14px person icon, faint for a client step and ink-2
 * for a firm step. The role name is the icon's label.
 */
function HolderIcon({ role }: { role: ChecklistItem['responsibleRole'] }) {
  if (!role) return null;
  return (
    <User
      size={14}
      strokeWidth={1.6}
      className={cn('shrink-0', role === 'client' ? 'text-ink-faint' : 'text-ink-2')}
      role="img"
      aria-label={RESPONSIBLE_ROLE_LABEL[role]}
    />
  );
}

function JourneyRailAttachmentMenu({ attachments }: { attachments: StepAttachmentRequirement[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
          aria-label="Step actions"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Attachments required</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-1.5">
            {attachments.length === 0 ? (
              <p className="px-1.5 py-1 text-[12px] text-ink-muted">None</p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((file) => (
                  <li key={file.fieldId} className="flex items-start gap-2 px-1.5 py-1 text-[12px]">
                    {file.uploaded ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                    )}
                    <span className="min-w-0 leading-snug">
                      <span className="block text-ink">{file.label}</span>
                      {file.uploaded && file.fileName ? (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                          {file.fileName}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sticky vertical stepper: a green connector through done steps, a grey one through the rest (R-58: centred on the nodes). */
export function ChecklistJourneyRail({
  items,
  selectedId,
  onSelect,
  allowLockedOpen = false,
  hideStatus = false,
  showAttachmentMenu = false,
  showStepCode = false,
  className,
}: ChecklistJourneyRailProps) {
  const reduceMotion = useReducedMotion();
  const animateSelected = allowLockedOpen;

  return (
    <nav aria-label="Checklist steps" className={cn('relative', className)}>
      <LayoutGroup id="intern-journey-rail">
      <ol className="list-none space-y-0">
        {items.map((row, index) => {
          const { item, gate, status, stepNumber, attachments = [], windowLabel, stepCode } = row;
          const selected = selectedId === item.id;
          const next = items[index + 1];
          const isLast = index === items.length - 1;
          const connectorSolid = gate.kind === 'done' && next?.gate.kind !== 'locked';
          const displayStatus = gateDisplayStatus(status, gate);
          const visuallyLocked = gate.kind === 'locked' && !allowLockedOpen;
          const canSelect = allowLockedOpen || gate.canOpen;

          const prev = items[index - 1];
          const prevSolid = prev ? prev.gate.kind === 'done' && gate.kind !== 'locked' : false;
          /* R-58: half-lines join the 20px node centres (8px row padding + 10px). */
          const compactConnector = (
            <StepLink
              x={18}
              y={18}
              up={prev && (prevSolid ? 'done' : 'todo')}
              down={!isLast && (connectorSolid ? 'done' : 'todo')}
            />
          );

          const node = (
            <JourneyNode
              kind={gate.kind}
              stepNumber={stepNumber}
              selected={selected}
              size="sm"
            />
          );

          const labelBlock = (
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start gap-1.5">
                <p
                  className={cn(
                    'min-w-0 text-[13.5px] leading-snug',
                    visuallyLocked ? 'text-ink-muted' : gate.kind === 'locked' ? 'text-ink-2' : 'text-ink',
                    (selected || gate.kind === 'active') && 'font-medium text-ink',
                  )}
                >
                  {item.title}
                </p>
                <span className="mt-[3px] shrink-0">
                  <HolderIcon role={item.responsibleRole} />
                </span>
              </div>
              {!visuallyLocked && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
                  <ChecklistStatusBadge
                    status={displayStatus}
                    hideStatus={hideStatus}
                  />
                </div>
              )}
              {gate.kind === 'waiting' && gate.message && (
                <p className="mt-1 text-[12px] text-waiting">{gate.message}</p>
              )}
              {windowLabel ? (
                <p className="mt-0.5 text-[12px] tabular-nums text-ink-muted">
                  {windowLabel}
                </p>
              ) : null}
            </div>
          );

          const rowShell = cn(
            'relative flex w-full items-start text-left transition-colors',
            'gap-2 rounded-md py-2 pl-2 pr-1',
            selected && canSelect && !animateSelected && 'bg-surface-sunken',
            visuallyLocked && 'opacity-70',
            canSelect && 'hover:bg-surface-sunken/60',
            gate.kind === 'active' && 'journey-unlock',
          );

          const selectedPill =
            animateSelected && selected ? (
              <MotionActivePill
                layoutId="intern-journey-selected"
                reduced={reduceMotion}
                className="absolute inset-0 rounded-md bg-surface-sunken"
              />
            ) : null;

          const attachmentSlot = showAttachmentMenu ? (
            <div className="relative z-[2] shrink-0">
              <JourneyRailAttachmentMenu attachments={attachments} />
            </div>
          ) : null;

          const stepCopy = (
            <>
              <div className="relative z-[1] shrink-0">{node}</div>
              {showStepCode ? (
                <span className="w-[50px] flex-none pt-[3px] font-mono text-[12px] text-ink-muted">Step {stepNumber}</span>
              ) : null}
              {labelBlock}
            </>
          );

          if (showStepCode) {
            return (
              <li
                key={item.id}
                data-ask-focus={item.id}
                className={cn('relative -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5', !animateSelected && selected && 'bg-surface-sunken')}
              >
                {selectedPill}
                <StepLink x={18} up={prev && (prevSolid ? 'done' : 'todo')} down={!isLast && (connectorSolid ? 'done' : 'todo')} />
                <span className="relative z-[1] flex-none">{node}</span>
                <span className="relative z-[1] w-[50px] flex-none font-mono text-[12px] text-ink-muted">{stepCode ?? `Step ${stepNumber}`}</span>
                <button
                  type="button"
                  aria-current={selected ? 'step' : undefined}
                  onClick={() => (canSelect ? onSelect(item.id) : notifyChecklistStepLocked(gate.message))}
                  className={cn(
                    'relative min-w-0 flex-1 truncate text-left text-[13.5px] after:absolute after:inset-0 hover:underline',
                    selected ? 'font-medium text-ink' : 'text-ink-2',
                  )}
                  title={item.title}
                >
                  {item.title}
                </button>
                <span className="relative z-[1] flex-none">
                  <HolderIcon role={item.responsibleRole} />
                </span>
              </li>
            );
          }

          if (!canSelect) {
            return (
              <li key={item.id} className="flex items-center" data-ask-focus={item.id}>
                <div className="min-w-0 flex-1">
                  <ChecklistLockedHint message={gate.message ?? lockedFallback}>
                    <button type="button" className={cn(rowShell, 'gap-3')}>
                      {compactConnector}
                      {stepCopy}
                    </button>
                  </ChecklistLockedHint>
                </div>
                {/* Locked steps too: Ask VCFO explains the step and what unlocks it. */}
                <WhatsThisButton compact kind="step" refId={item.id} label={item.title} />
              </li>
            );
          }

          return (
            <li key={item.id} data-ask-focus={item.id}>
              <div className={rowShell}>
                {selectedPill}
                {compactConnector}
                <button
                  type="button"
                  className="relative z-[1] flex min-w-0 flex-1 items-start gap-3 text-left"
                  onClick={() => onSelect(item.id)}
                >
                  {stepCopy}
                </button>
                {attachmentSlot}
                <WhatsThisButton compact kind="step" refId={item.id} label={item.title} className="relative z-[1]" />
              </div>
            </li>
          );
        })}
      </ol>
      </LayoutGroup>
    </nav>
  );
}

const lockedFallback = 'This opens after the previous step is complete.';
