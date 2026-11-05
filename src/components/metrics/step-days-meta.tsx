'use client';

import { todayKey } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import { useStepTiming } from '@/components/metrics/use-metrics';
import { cn } from '@/lib/utils';

/**
 * "Opened 3 Oct · 12 days in step · due 14 Oct" for the staff step page header (G-13).
 *
 * The days come from `engagement_step_events` through `/api/engagements/:id/step-timings`;
 * the due date is the end of the manager-set window for the step, passed in by the page.
 * Renders nothing until the step has been opened, so an untouched step shows no number.
 */
export function StepDaysMeta({
  engagementId,
  stepId,
  dueOn,
  className,
}: {
  engagementId: string;
  stepId: string;
  /** YYYY-MM-DD end of the step's window, when one is set. */
  dueOn?: string | null;
  className?: string;
}) {
  const query = useStepTiming(engagementId, stepId);
  const timing = query.data;
  if (!timing?.openedAt || timing.daysInStep === null) return null;
  const late = !timing.finishedAt && dueOn ? dueOn < todayKey() : false;
  const daysWord = `${timing.daysInStep} ${timing.daysInStep === 1 ? 'day' : 'days'}`;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2', className)}>
      <span aria-hidden>·</span>
      <span>Opened {plainDay(timing.openedAt)}</span>
      <span aria-hidden>·</span>
      <span className={cn('tabular-nums', late && 'font-medium text-danger')}>
        {timing.finishedAt ? `Done in ${daysWord}` : `${daysWord} in step`}
      </span>
      {dueOn && !timing.finishedAt ? (
        <>
          <span aria-hidden>·</span>
          <span className={cn(late && 'font-medium text-danger')}>Due {plainDay(dueOn)}</span>
        </>
      ) : null}
    </span>
  );
}
