/**
 * STEP TIMING — pure helpers over `engagement_step_events` (G-13, G-27).
 *
 * Every time a step's status changes in `checklist_state`, the repository writes one event
 * (from, to, actor, time). Everything here derives from those events and nothing else:
 *
 *   - opened at   — the first event that moves the step out of "not started";
 *   - finished at — the latest move to "completed", cleared again if a later event reopens it;
 *   - days in step — opened to finished, or opened to today while the step is still open;
 *   - stage days  — per phase, from the first step opened to the last step finished.
 *
 * Since migration 0027 every event also carries the step's review state after the change
 * (`review_status`), and a change of review state alone (a submit for approval, an accept, a
 * send back) writes an event whose from and to statuses are the same. Timing ignores those.
 *
 * No React, no `db`, so the numbers are unit-tested in `step-timing.test.ts`.
 */

import { getReviewStatus } from '@/lib/checklist/checklist-item-review';

export const DAY_MS = 86_400_000;

/** One stored status change, as the repository reads it back. */
export interface StepEvent {
  engagementId: string;
  stepId: string;
  fromStatus: string | null;
  toStatus: string;
  /** ISO timestamp. */
  at: string;
}

/** One status change found by comparing two checklist states. */
export interface StepStatusChange {
  stepId: string;
  from: string | null;
  to: string;
  /**
   * The review state after the change (`reviewing`, `accepted`, `rejected`) or null when the
   * step has none. Set by `diffStepChanges`; absent on changes from `diffStepStatuses`.
   */
  reviewStatus?: string | null;
  /**
   * Who holds the step after the change (`client`, `lead`, `manager`, `sbc`, or null when done),
   * from `stepHolders` in `step-holder.ts`. Set by the engagements repository before the write.
   */
  holder?: string | null;
}

export interface StepTiming {
  openedAt: string | null;
  finishedAt: string | null;
  /** Whole days in the step; null until it is opened, and for a step marked not needed. */
  daysInStep: number | null;
  /** The status the last event moved the step to. */
  lastStatus: string;
}

const NOT_STARTED = 'not-started';

/** A status that closes a step. "Not needed" closes it without any work being timed. */
function isFinishedStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'not-applicable';
}

function statusOf(slice: unknown): string | null {
  if (!slice || typeof slice !== 'object' || Array.isArray(slice)) return null;
  const status = (slice as { status?: unknown }).status;
  return typeof status === 'string' && status.trim() ? status : null;
}

/**
 * The steps whose status differs between two `checklist_state` objects. A step that has no
 * slice yet reads as "not started" on the new side, and as null (never recorded) on the old
 * side, so creating a slice with only answers in it is not a status change.
 */
export function diffStepStatuses(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): StepStatusChange[] {
  const before = previous ?? {};
  const after = next ?? {};
  const out: StepStatusChange[] = [];
  for (const stepId of Object.keys(after)) {
    const from = statusOf(before[stepId]);
    const to = statusOf(after[stepId]) ?? NOT_STARTED;
    if ((from ?? NOT_STARTED) === to) continue;
    out.push({ stepId, from, to });
  }
  return out;
}

function reviewOf(slice: unknown): string | null {
  if (!slice || typeof slice !== 'object' || Array.isArray(slice)) return null;
  return getReviewStatus(slice as Parameters<typeof getReviewStatus>[0]);
}

/**
 * The steps whose status or review state differs between two `checklist_state` objects, each
 * with the review state after the change. A review-only change keeps `from` equal to `to`
 * (the unchanged status), so timing can skip it. This is what the engagements repository
 * records; `diffStepStatuses` stays the status-only rule.
 */
export function diffStepChanges(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): StepStatusChange[] {
  const before = previous ?? {};
  const after = next ?? {};
  const out: StepStatusChange[] = [];
  for (const stepId of Object.keys(after)) {
    const from = statusOf(before[stepId]);
    const to = statusOf(after[stepId]) ?? NOT_STARTED;
    const reviewBefore = reviewOf(before[stepId]);
    const reviewAfter = reviewOf(after[stepId]);
    if ((from ?? NOT_STARTED) === to && reviewBefore === reviewAfter) continue;
    out.push({ stepId, from: (from ?? NOT_STARTED) === to ? to : from, to, reviewStatus: reviewAfter });
  }
  return out;
}

/** A recorded event that changed only the review state, not the status. */
function isReviewOnlyEvent(event: Pick<StepEvent, 'fromStatus' | 'toStatus'>): boolean {
  return (event.fromStatus ?? NOT_STARTED) === event.toStatus;
}

/** Whole days between two instants (floored, never negative). */
function wholeDays(fromIso: string, to: Date | string): number {
  const end = typeof to === 'string' ? Date.parse(to) : to.getTime();
  const start = Date.parse(fromIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

function byTime(a: StepEvent, b: StepEvent): number {
  return a.at.localeCompare(b.at);
}

/** Opened, finished and days in step for one step, from its own events. */
export function timingOf(events: StepEvent[], now: Date): StepTiming {
  const sorted = [...events].sort(byTime);
  let openedAt: string | null = null;
  let finishedAt: string | null = null;
  let lastStatus = NOT_STARTED;
  for (const event of sorted) {
    if (isReviewOnlyEvent(event)) continue;
    lastStatus = event.toStatus;
    if (!openedAt && event.toStatus !== NOT_STARTED && event.toStatus !== 'not-applicable') {
      openedAt = event.at;
    }
    if (event.toStatus === 'completed') finishedAt = event.at;
    else if (!isFinishedStatus(event.toStatus)) finishedAt = null;
  }
  const daysInStep =
    openedAt && lastStatus !== 'not-applicable' ? wholeDays(openedAt, finishedAt ?? now) : null;
  return { openedAt, finishedAt, daysInStep, lastStatus };
}

/** engagementId → stepId → events, oldest first. */
export function groupEvents(events: StepEvent[]): Map<string, Map<string, StepEvent[]>> {
  const out = new Map<string, Map<string, StepEvent[]>>();
  for (const event of events) {
    const steps = out.get(event.engagementId) ?? new Map<string, StepEvent[]>();
    const list = steps.get(event.stepId) ?? [];
    list.push(event);
    steps.set(event.stepId, list);
    out.set(event.engagementId, steps);
  }
  return out;
}

/** stepId → timing, for one engagement's events. */
export function timingsByStep(events: StepEvent[], now: Date): Record<string, StepTiming> {
  const steps = new Map<string, StepEvent[]>();
  for (const event of events) {
    const list = steps.get(event.stepId) ?? [];
    list.push(event);
    steps.set(event.stepId, list);
  }
  const out: Record<string, StepTiming> = {};
  for (const [stepId, list] of steps) out[stepId] = timingOf(list, now);
  return out;
}

export interface StagePhase {
  id: string;
  label: string;
  stepIds: string[];
}

export interface StageAverage {
  phaseId: string;
  label: string;
  /** Average days from the first step opened to the last step finished; null without any. */
  avgDays: number | null;
  /** Engagements that finished the stage inside the window. */
  finished: number;
  /** The open stage that has run longest, measured to today. */
  slowest: { engagementId: string; days: number } | null;
}

/**
 * Days per stage, across engagements.
 *
 * A stage counts as finished for an engagement when every one of its steps is finished (a
 * step with no events at all reads as not finished, so a stage is never closed by silence).
 * Only stages finished on or after `since` enter the average. A stage that has started and
 * not finished is "open", and the longest-running open one is the slowest now.
 */
export function stageAverages(params: {
  phases: StagePhase[];
  /** engagementId → stepId → timing. */
  timings: Map<string, Record<string, StepTiming>>;
  /** engagementId → stepIds the engagement does not need (stored as not applicable). */
  notNeeded?: Map<string, Set<string>>;
  since: Date;
  now: Date;
}): StageAverage[] {
  const { phases, timings, notNeeded, since, now } = params;
  const sinceMs = since.getTime();
  return phases.map((phase) => {
    const durations: number[] = [];
    let slowest: StageAverage['slowest'] = null;
    for (const [engagementId, steps] of timings) {
      const skip = notNeeded?.get(engagementId);
      const relevant = phase.stepIds.filter((id) => !skip?.has(id));
      if (relevant.length === 0) continue;
      const opened = relevant
        .map((id) => steps[id]?.openedAt)
        .filter((v): v is string => Boolean(v))
        .sort();
      if (opened.length === 0) continue;
      const first = opened[0]!;
      const allDone = relevant.every((id) => {
        const timing = steps[id];
        return timing?.lastStatus === 'not-applicable' || Boolean(timing?.finishedAt);
      });
      if (allDone) {
        const finishes = relevant
          .map((id) => steps[id]?.finishedAt)
          .filter((v): v is string => Boolean(v))
          .sort();
        const last = finishes.at(-1);
        if (last && Date.parse(last) >= sinceMs) durations.push(wholeDays(first, last));
        continue;
      }
      const days = wholeDays(first, now);
      if (!slowest || days > slowest.days) slowest = { engagementId, days };
    }
    return {
      phaseId: phase.id,
      label: phase.label,
      avgDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      finished: durations.length,
      slowest,
    };
  });
}

/** Median of whole numbers; null for an empty list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export interface StepTimeRow {
  stepId: string;
  /** Median days over the steps finished inside the window; null without any. */
  medianDays: number | null;
  finished: number;
  /** The longest wait on this step now, among open steps. */
  longest: { engagementId: string; days: number } | null;
}

/** Time in step per step id (Analytics "Time in step"): median finished, longest open now. */
export function stepTimeRows(params: {
  stepIds: string[];
  timings: Map<string, Record<string, StepTiming>>;
  since: Date;
}): StepTimeRow[] {
  const { stepIds, timings, since } = params;
  const sinceMs = since.getTime();
  const rows: StepTimeRow[] = [];
  for (const stepId of stepIds) {
    const finished: number[] = [];
    let longest: StepTimeRow['longest'] = null;
    for (const [engagementId, steps] of timings) {
      const timing = steps[stepId];
      if (!timing || timing.daysInStep === null) continue;
      if (timing.finishedAt) {
        if (Date.parse(timing.finishedAt) >= sinceMs) finished.push(timing.daysInStep);
      } else if (!longest || timing.daysInStep > longest.days) {
        longest = { engagementId, days: timing.daysInStep };
      }
    }
    if (finished.length === 0 && !longest) continue;
    rows.push({ stepId, medianDays: median(finished), finished: finished.length, longest });
  }
  return rows;
}
