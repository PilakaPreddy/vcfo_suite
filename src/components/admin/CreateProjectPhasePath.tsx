'use client';

import { Building2, Check, ClipboardList, KeyRound, User } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SegmentedPicker } from '@/components/admin/SegmentedPicker';
import { PHASE_ORDER } from '@/components/admin/create-project-form-utils';
import { STAGE_LABEL, type Stage } from '@/lib/projects/stage';

export type FormFlowSection = 'entity' | 'team' | 'client' | 'questionnaire';

const FORM_STEPS: Array<{
  id: FormFlowSection;
  label: string;
  icon: typeof Building2;
}> = [
  { id: 'entity', label: 'Entity details', icon: Building2 },
  { id: 'team', label: 'Team', icon: User },
  { id: 'client', label: 'Client portal', icon: KeyRound },
  { id: 'questionnaire', label: 'Questionnaire', icon: ClipboardList },
];

type FormFlowProps = {
  openSections: FormFlowSection[];
  sectionComplete: Record<FormFlowSection, boolean>;
  onSelect: (section: FormFlowSection) => void;
  /** compact = mobile top stepper; rail = fixed vertical desktop sidebar */
  variant?: 'compact' | 'rail';
  className?: string;
};

/** Form progress navigator — Entity → Team → Client (not delivery lifecycle). */
export function CreateProjectFormFlow({
  openSections,
  sectionComplete,
  onSelect,
  variant = 'rail',
  className,
}: FormFlowProps) {
  const readyCount = Object.values(sectionComplete).filter(Boolean).length;

  if (variant === 'compact') {
    return (
      <nav
        aria-label="Details to complete"
        className={cn(
          'rounded-xl border border-line/80 bg-gradient-to-b from-muted/35 to-background p-3',
          className,
        )}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-[11px] mono tracking-[0.16em] text-ink-muted">
            Details to complete
          </p>
          <p className="text-[11px] text-ink-muted">
            {readyCount} of {FORM_STEPS.length}
          </p>
        </div>
        <ol className="flex items-stretch gap-1.5">
          {FORM_STEPS.map((step, i) => {
            const done = sectionComplete[step.id];
            const active = openSections.includes(step.id);
            return (
              <li key={step.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex w-full flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2.5 text-center transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'border-brand/50 bg-brand-soft/80',
                    !active && done && 'border-positive/40 bg-positive-soft/45',
                    !active && !done && 'border-line/70 bg-background hover:bg-surface-sunken/40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
                      done && 'bg-positive text-on-brand',
                      !done && active && 'bg-brand text-on-brand journey-node-pulse',
                      !done && !active && 'bg-surface-sunken text-ink-muted',
                    )}
                  >
                    {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'text-[10.5px] font-medium leading-tight',
                      active ? 'text-brand' : done ? 'text-positive' : 'text-ink-muted',
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <aside
      aria-label="Details to complete"
      className={cn(
        'flex h-full min-h-0 flex-col rounded-2xl border border-line/70',
        'bg-gradient-to-b from-background via-background to-primary-light/40',
        'px-3.5 py-4 shadow-[0_10px_40px_-24px_oklch(var(--shadow-ink)/0.35)]',
        className,
      )}
    >
      <div className="mb-5 shrink-0">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-brand">
          Progress
        </p>
        <p className="mt-2 text-[15px] font-semibold tabular-nums tracking-tight text-ink">
          <motion.span
            key={readyCount}
            initial={{ opacity: 0.35, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block"
          >
            {readyCount}
          </motion.span>
          <span className="font-medium text-ink-muted"> / {FORM_STEPS.length}</span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-soft ring-1 ring-brand/20">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: `${(readyCount / FORM_STEPS.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          />
        </div>
      </div>

      <ol className="flex min-h-0 flex-1 flex-col gap-1">
        {FORM_STEPS.map((step, i) => {
          const done = sectionComplete[step.id];
          const active = openSections.includes(step.id);
          const isLast = i === FORM_STEPS.length - 1;
          const Icon = step.icon;
          return (
            <li key={step.id} className="relative flex min-h-0 flex-1 gap-3">
              <div className="flex w-8 shrink-0 flex-col items-center">
                <motion.button
                  type="button"
                  key={`${step.id}-${done ? 'done' : active ? 'active' : 'idle'}`}
                  onClick={() => onSelect(step.id)}
                  aria-current={active ? 'step' : undefined}
                  initial={active && !done ? { scale: 0.92 } : { scale: 1 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className={cn(
                    'relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50',
                    done && 'border-positive bg-positive text-on-brand shadow-sm',
                    !done &&
                      active &&
                      'border-brand bg-brand text-on-brand shadow-sm journey-node-pulse ring-4 ring-brand/25',
                    !done &&
                      !active &&
                      'border-line/90 bg-background text-ink/70 hover:border-brand/40 hover:text-ink',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.75} /> : i + 1}
                </motion.button>
                {!isLast ? (
                  <div aria-hidden className="relative mt-1 w-[2px] flex-1 overflow-hidden rounded-full bg-border/80">
                    <motion.div
                      className="absolute inset-x-0 top-0 w-full origin-top rounded-full bg-positive"
                      initial={false}
                      animate={{ scaleY: done ? 1 : 0 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      style={{ height: '100%' }}
                    />
                  </div>
                ) : null}
              </div>

              <motion.button
                type="button"
                onClick={() => onSelect(step.id)}
                layout
                initial={false}
                className={cn(
                  'mb-2 flex min-w-0 flex-1 flex-col items-start justify-start rounded-xl border px-2.5 py-2 text-left transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40',
                  isLast && 'mb-0',
                  active && 'border-brand/45 bg-brand-soft/90',
                  !active && done && 'border-positive/35 bg-positive-soft/55',
                  !active && !done && 'border-transparent bg-transparent',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-colors duration-200',
                      active && 'text-brand',
                      done && !active && 'text-positive',
                      !done && !active && 'text-ink/55',
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'text-[13px] font-semibold tracking-tight transition-colors duration-200',
                      active && 'text-ink',
                      done && !active && 'text-positive',
                      !done && !active && 'text-ink/80',
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              </motion.button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

type PhasePickerProps = {
  stage: Stage;
  onChange: (stage: Stage) => void;
};

/** Starting phase — a compact sliding control, no commentary. */
export function CreateProjectStartingPhasePicker({ stage, onChange }: PhasePickerProps) {
  const labelId = 'create-start-phase-label';
  return (
    <div>
      <span id={labelId} className="text-[12px] text-ink-muted">
        Where should work start? <span className="font-normal text-danger">*</span>
      </span>
      <SegmentedPicker
        value={stage}
        options={PHASE_ORDER.map((p) => ({ value: p, label: STAGE_LABEL[p] }))}
        onChange={onChange}
        labelledBy={labelId}
        className="mt-2 max-w-md"
      />
    </div>
  );
}
