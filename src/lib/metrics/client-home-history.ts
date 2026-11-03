import { buildIncorporationModel, type PortalIncorporationModel } from '@/lib/client-portal/step-model';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { isReviewRejected } from '@/lib/checklist/checklist-item-review';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';
import {
  clientDueSoonAsOf,
  daysBetweenYmd,
  filedAsOf,
  fyStartOfYmd,
  type FilingHistoryRow,
  type FilingReopen,
  type TrendPeriod,
} from '@/lib/metrics/home-trends';

/**
 * CLIENT HOME TILE HISTORY (owner item B2, 2026-10-30) — the pure part.
 *
 * The client home card has five fixed tiles. Their trend lines come from records the app
 * already keeps, so a line shows real history from the first day:
 *
 *   steps      `engagement_step_events` (every status change, with the review state after
 *              it). The checklist state at a past day end is the current state with every
 *              later change undone: a step whose first later event moved it from status X
 *              had status X at that day end (`rewindChecklistState`). The incorporation
 *              model is then built from that state and that day, exactly as the live tile
 *              builds it.
 *   requests   `document_requests`. A request closed at `closed_at` (migration 0027) or, when
 *              that is empty, at its first uploaded file (`document_request_files`).
 *   filings    `compliance_instances` due and filed dates, and the reopen audit events.
 *
 * Limits, stated so nobody reads more into a line than it holds. Fields other than the step
 * status and the review state (answers, client fill requests, approvals) are read as they are
 * now. A request that is closed now but has no close time and no file (cancelled before
 * migration 0027) makes every day it existed on unknown. An unknown day ends the line
 * (`trailingKnown`), as everywhere else. A day before the engagement existed is unknown.
 * Nothing is estimated or filled in.
 */

type State = Record<string, ChecklistItemStateSlice | undefined>;

/** One stored step event, as the history reads it. */
export interface StepStatusHistoryEvent {
  stepId: string;
  fromStatus: string | null;
  toStatus: string;
  reviewStatus: string | null;
  at: Date;
}

/** One document request with the facts the history needs. */
export interface ClientRequestHistoryRow {
  id: string;
  status: string;
  createdAt: Date;
  closedAt: Date | null;
  /** The first file uploaded against the request, if any. */
  firstUploadAt: Date | null;
  /** `client_need_meta.kind`: upload, fill, correct or sign. */
  kind: string | null;
  dueDate: string | null;
  stepId: string | null;
  complianceInstanceId: string | null;
}

/** The five tile values at one past day end. `null` marks a value that cannot be known. */
export interface ClientTilesAsOf {
  waiting: number | null;
  /** Needs and steps only; the screen adds `filingsOverdue` after the COI. */
  overdue: number | null;
  filingsOverdue: number | null;
  withSbc: number | null;
  docsIn: number | null;
  stepsDone: number | null;
  regs: number | null;
  dueSoon: number | null;
}

const ANSWERED: ReadonlySet<string> = new Set(['fulfilled', 'approved']);

/**
 * When a request stopped being open: `undefined` while it is open now, the close time when it
 * is known, `null` when it is closed but nothing stored says when.
 */
export function requestClosedAt(r: Pick<ClientRequestHistoryRow, 'status' | 'closedAt' | 'firstUploadAt'>): Date | null | undefined {
  if (r.status === 'pending') return undefined;
  return r.closedAt ?? r.firstUploadAt ?? null;
}

/**
 * The checklist state at `end`: the current state with every step change at or after `end`
 * undone. A step with no later event keeps its current slice. The review state is the one
 * the last earlier event recorded, or none when no earlier event exists.
 */
export function rewindChecklistState(state: Record<string, unknown> | null | undefined, events: StepStatusHistoryEvent[], end: Date): State {
  const out: State = { ...((state ?? {}) as State) };
  const byStep = new Map<string, StepStatusHistoryEvent[]>();
  for (const e of events) {
    const list = byStep.get(e.stepId) ?? [];
    list.push(e);
    byStep.set(e.stepId, list);
  }
  const t = end.getTime();
  for (const [stepId, list] of byStep) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    const firstLater = list.find((e) => e.at.getTime() >= t);
    if (!firstLater) continue;
    const prior = [...list].reverse().find((e) => e.at.getTime() < t);
    const slice: Record<string, unknown> = { ...((out[stepId] ?? {}) as Record<string, unknown>) };
    slice.status = firstLater.fromStatus ?? prior?.toStatus ?? 'not-started';
    if (prior?.reviewStatus) slice.reviewStatus = prior.reviewStatus;
    else delete slice.reviewStatus;
    out[stepId] = slice as unknown as ChecklistItemStateSlice;
  }
  return out;
}

/** Registrations granted: phase 4 steps that are done and not marked not needed. */
function registrationsDone(model: PortalIncorporationModel): number {
  const phase = model.phases[3];
  if (!phase) return 0;
  return phase.steps.filter((s) => (s.slice?.status as string | undefined) !== 'not-applicable' && s.kind === 'done').length;
}

/** Filings of the day's financial year that were past due and not filed at the day end. */
function filingsOverdueAsOf(rows: FilingHistoryRow[], reopens: FilingReopen[], period: TrendPeriod): number | null {
  const fy = fyStartOfYmd(period.ymd);
  const from = `${fy}-04-01`;
  const to = `${fy + 1}-03-31`;
  let n = 0;
  for (const row of rows) {
    if (row.createdAt.getTime() >= period.end.getTime()) continue;
    const due = row.dueDate.slice(0, 10);
    if (due < from || due > to || due >= period.ymd) continue;
    const filed = filedAsOf(row, reopens, period);
    if (filed === null) return null;
    if (!filed) n += 1;
  }
  return n;
}

/** Every client home tile value at the end of one past day. */
export function clientTilesAsOf(input: {
  state: Record<string, unknown> | null | undefined;
  schedule: EngagementSchedule | null | undefined;
  engagementCreatedAt: Date | null | undefined;
  events: StepStatusHistoryEvent[];
  requests: ClientRequestHistoryRow[];
  filings: FilingHistoryRow[];
  reopens: FilingReopen[];
  period: TrendPeriod;
}): ClientTilesAsOf {
  const { period, requests, filings, reopens } = input;
  const end = period.end.getTime();
  const dueSoon = clientDueSoonAsOf(filings, reopens, period);
  if (input.engagementCreatedAt && input.engagementCreatedAt.getTime() >= end) {
    return { waiting: null, overdue: null, filingsOverdue: null, withSbc: null, docsIn: null, stepsDone: null, regs: null, dueSoon };
  }

  const model = buildIncorporationModel(rewindChecklistState(input.state, input.events, period.end), input.schedule ?? null, period.ymd);

  // Requests open at the day end; `known` turns false when a closed request has no close time.
  let known = true;
  let answered = 0;
  const open: ClientRequestHistoryRow[] = [];
  for (const r of requests) {
    if (r.createdAt.getTime() >= end) continue;
    const closed = requestClosedAt(r);
    if (closed === null) {
      known = false;
      continue;
    }
    if (closed === undefined || closed.getTime() >= end) open.push(r);
    else if (ANSWERED.has(r.status)) answered += 1;
  }

  const stepNeeds = model.steps.filter((s) => s.kind === 'you' || s.kind === 'prog');
  const filingDue = new Map(filings.map((f) => [f.id, f.dueDate.slice(0, 10)]));
  const late = new Set<string>();
  for (const r of open) {
    const step = r.stepId ? model.byId[r.stepId] : undefined;
    const due = r.dueDate ?? (r.complianceInstanceId ? filingDue.get(r.complianceInstanceId) : undefined) ?? step?.due;
    if (r.kind === 'correct' || (due && daysBetweenYmd(period.ymd, due) < 0)) late.add(step?.id ?? `req:${r.id}`);
  }
  for (const s of stepNeeds) if (isReviewRejected(s.slice) || (s.due && s.due < period.ymd)) late.add(s.id);
  for (const s of model.steps) if (s.late && s.kind !== 'done') late.add(s.id);

  return {
    waiting: known ? open.length + stepNeeds.length : null,
    overdue: known ? late.size : null,
    filingsOverdue: filingsOverdueAsOf(filings, reopens, period),
    withSbc: model.counts.with,
    docsIn: known ? answered : null,
    stepsDone: model.spice.done,
    regs: registrationsDone(model),
    dueSoon,
  };
}
