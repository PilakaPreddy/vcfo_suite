'use client';

import { StepMark } from '@/components/ui/step-track';
import type { ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';
import { cn } from '@/lib/utils';

type JourneyNodeProps = {
  kind: ChecklistStepGate['kind'];
  stepNumber?: number;
  selected?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Shared journey node language — blue current, teal-green done, amber clock
 * waiting, outlined slate upcoming.
 *
 * Upcoming steps show their step number, never a padlock: the sequential gate
 * is unchanged, but the UI states it in words ("This opens after X is
 * complete") rather than with a locked-out glyph.
 *
 * VCFO Spectrum (R-22, ST5): the node is now the step square. Done is green with a tick, the
 * active step is a ring with a blurple square and a halo, a waiting step the same ring in teal,
 * and an upcoming step an outlined square. The picked row's own tint marks the selection, so the
 * node only adds a soft ring when it is not already live.
 */
export function JourneyNode({
  kind,
  selected = false,
  size = 'md',
  className,
}: JourneyNodeProps) {
  const px = size === 'sm' ? 20 : 22;
  const state = kind === 'done' ? 'done' : kind === 'active' || kind === 'waiting' ? 'now' : 'next';
  return (
    <StepMark
      state={state}
      tone={kind === 'waiting' ? 'teal' : 'prog'}
      size={px}
      label={kind === 'done' ? 'Done' : kind === 'active' ? 'Current' : kind === 'waiting' ? 'Waiting' : 'Upcoming'}
      className={cn('relative z-[1]', selected && state !== 'now' && 'ring-2 ring-brand-line ring-offset-1 ring-offset-surface-raised', className)}
    />
  );
}
