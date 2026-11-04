/**
 * STAFF HOME TREND LINES — the pure part for the lead, manager and admin homes (R-18).
 *
 * The rules of `home-trends.ts` hold here too: a past value is drawn only when the stored rows
 * say what the tile showed at the end of that day, and a day whose value cannot be known ends
 * the series (`trailingKnown`). Two series can be rebuilt:
 *
 *   Awaiting approval (manager "Needs your approval", admin "Awaiting approval")
 *     Steps whose review state was "reviewing" at the end of the day. The review state of a
 *     step at a past moment is the `review_status` of its last recorded event before then, or
 *     its current state when nothing was recorded since. Review history starts with the first
 *     event that carries a review state (`reviewSince`); before that day nothing is known.
 *
 *   Done today (lead)
 *     Steps that moved to completed during the day and were still completed at its end, from
 *     the status events; tasks whose `completed_at` falls in the day; and filings due that day
 *     that were filed by its end (the live tile counts filed filings by their due day). Status
 *     history starts with the first recorded step event (`statusSince`).
 *
 * Scope is the caller's engagements today: who led or managed a client on a past day is not
 * stored, so a client that changed hands is counted under its current team.
 */

import {
  filedAsOf,
  type FilingHistoryRow,
  type FilingReopen,
  type TrendPeriod,
} from '@/lib/metrics/home-trends';

const DAY_MS = 86_400_000;

/** One recorded step event, as the staff trends read it. */
export interface StepHistoryEvent {
  engagementId: string;
  stepId: string;
  fromStatus: string | null;
  toStatus: string;
  reviewStatus: string | null;
  at: Date;
}

/** One step counted by the approvals tile: its engagement, its id and its review state now. */
export interface ReviewStepNow {
  engagementId: string;
  stepId: string;
  /** `getReviewStatus` of the stored slice today. */
  reviewNow: string | null;
}

const keyOf = (engagementId: string, stepId: string) => `${engagementId}:${stepId}`;

/** Events grouped by engagement and step, oldest first. */
export function indexStepEvents(events: StepHistoryEvent[]): Map<string, StepHistoryEvent[]> {
  const out = new Map<string, StepHistoryEvent[]>();
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const k = keyOf(e.engagementId, e.stepId);
    const list = out.get(k) ?? [];
    list.push(e);
    out.set(k, list);
  }
  return out;
}

/**
 * The review state of one step at the end of the period: `undefined` when it cannot be known
 * (the step changed after the moment and nothing recorded says what it was before).
 */
function reviewAsOf(
  step: ReviewStepNow,
  events: StepHistoryEvent[] | undefined,
  period: TrendPeriod,
  reviewSince: Date,
): string | null | undefined {
  const end = period.end.getTime();
  const list = events ?? [];
  const later = list.some((e) => e.at.getTime() >= end);
  if (!later) return step.reviewNow;
  let last: StepHistoryEvent | null = null;
  for (const e of list) {
    const t = e.at.getTime();
    if (t >= end) break;
    if (t >= reviewSince.getTime()) last = e;
  }
  return last ? last.reviewStatus : undefined;
}

/**
 * Steps awaiting a manager decision at the end of the period, or null when any step's state
 * then cannot be known. `createdAt` drops engagements that did not exist yet.
 */
export function awaitingApprovalAsOf(input: {
  steps: ReviewStepNow[];
  events: Map<string, StepHistoryEvent[]>;
  engagementCreatedAt: Map<string, Date>;
  period: TrendPeriod;
  reviewSince: Date | null;
}): number | null {
  const { steps, events, engagementCreatedAt, period, reviewSince } = input;
  if (!reviewSince || reviewSince.getTime() >= period.end.getTime()) return null;
  let n = 0;
  for (const step of steps) {
    const created = engagementCreatedAt.get(step.engagementId);
    if (!created || created.getTime() >= period.end.getTime()) continue;
    const review = reviewAsOf(step, events.get(keyOf(step.engagementId, step.stepId)), period, reviewSince);
    if (review === undefined) return null;
    if (review === 'reviewing') n += 1;
  }
  return n;
}

/** A task as the lead's "Done today" reads it. */
export interface TaskHistoryRow {
  status: string;
  completedAt: Date | null;
  updatedAt: Date;
}

/** A status event changed the status (review-only events keep from and to equal). */
function changesStatus(e: StepHistoryEvent): boolean {
  return (e.fromStatus ?? 'not-started') !== e.toStatus;
}

/**
 * Lead "Done today" for one past day, or null when the day cannot be rebuilt: the day starts
 * before the step history does, or a task was done before `completed_at` was kept and last
 * changed on or after that day (its completion day is unknown).
 */
export function doneOnDayAsOf(input: {
  period: TrendPeriod;
  stepEvents: Map<string, StepHistoryEvent[]>;
  statusSince: Date | null;
  tasks: TaskHistoryRow[];
  filings: FilingHistoryRow[];
  reopens: FilingReopen[];
}): number | null {
  const { period, stepEvents, statusSince, tasks, filings, reopens } = input;
  const end = period.end.getTime();
  const start = end - DAY_MS;
  if (!statusSince || statusSince.getTime() > start) return null;

  let steps = 0;
  for (const list of stepEvents.values()) {
    let last: StepHistoryEvent | null = null;
    for (const e of list) {
      if (e.at.getTime() >= end) break;
      if (changesStatus(e)) last = e;
    }
    if (last && last.toStatus === 'completed' && last.at.getTime() >= start) steps += 1;
  }

  let done = 0;
  for (const t of tasks) {
    if (t.completedAt) {
      const at = t.completedAt.getTime();
      if (at >= start && at < end) done += 1;
      continue;
    }
    if (t.status === 'done' && t.updatedAt.getTime() >= start) return null;
  }

  let filed = 0;
  for (const f of filings) {
    if (f.dueDate.slice(0, 10) !== period.ymd) continue;
    if (f.createdAt.getTime() >= end) continue;
    const was = filedAsOf(f, reopens, period);
    if (was === null) return null;
    if (was) filed += 1;
  }
  return steps + done + filed;
}
