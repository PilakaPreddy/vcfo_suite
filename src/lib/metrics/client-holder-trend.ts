import { buildIncorporationModel } from '@/lib/client-portal/step-model';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { stepHolders, type StepHolder } from '@/lib/metrics/step-holder';
import { diffStepChanges, type StepStatusChange } from '@/lib/metrics/step-timing';
import type { DocRequestHistoryRow } from '@/lib/metrics/client-docs-trend';
import type { TrendPeriod } from '@/lib/metrics/home-trends';

/**
 * CLIENT HOME "WAITING ON" AND "WITH SBC" TRENDS (R-18, C-023) — the pure part.
 *
 * Both tiles count the steps of the incorporation model by who holds them
 * (`engagement_step_events.holder`, migration 0028, words from `step-holder.ts`):
 *   Waiting on <company>  open document requests + steps held by `client`
 *   With SBC              steps held by `lead` or `manager` (the model's kind `with`). `sbc`
 *                         means the step is not open yet (kind `up`), which the tile does not
 *                         count, so it is left out here too.
 *
 * WRITE SIDE. A step's holder can change without a status or review change of its own: when
 * the step before it finishes, a gated step opens. `holderChanges` therefore compares the
 * holders of every model step before and after a save and adds a holder-only row (from and to
 * status equal, so step timing skips it; the review state only when it is "reviewing") for
 * each step whose holder moved. The first save of an
 * engagement after this rule shipped writes a baseline row for every model step, so the
 * history has a known starting point (`since`).
 *
 * READ SIDE. The holder of a step at a day end is the holder of its last row before then, on or
 * after `since`. A day that ends before `since`, or a step with no row in that window, makes
 * the day unknown, and `trailingKnown` drops it and every earlier day. Nothing is estimated.
 */

type State = Record<string, ChecklistItemStateSlice | undefined>;

/** One recorded holder row, as the trend reads it. */
export interface HolderHistoryEvent {
  stepId: string;
  holder: string | null;
  at: Date;
}

/** The step ids of the incorporation model (the steps the client home counts). */
export function modelStepIds(state: Record<string, unknown> | null | undefined): string[] {
  return buildIncorporationModel((state ?? {}) as State).steps.map((s) => s.id);
}

/**
 * Holder-only changes for one save: every model step whose holder moved and that the status
 * diff does not already carry, or every model step when `baseline` (no holder history yet).
 * `holders` is filled in for all of them.
 */
export function holderChanges(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  already: ReadonlySet<string>,
  baseline: boolean,
): StepStatusChange[] {
  const ids = [...new Set([...modelStepIds(previous), ...modelStepIds(next)])];
  const before = stepHolders(previous, ids);
  const after = stepHolders(next, ids);
  const nextState = (next ?? {}) as Record<string, unknown>;
  const out: StepStatusChange[] = [];
  for (const id of ids) {
    if (already.has(id)) continue;
    if (!baseline && (before[id] ?? null) === (after[id] ?? null)) continue;
    // The step's current status, read the same way the status diff reads it. The review state
    // is kept only while it is "reviewing" (the approvals trend reads it); an "accepted" copy
    // would count as a second approval in the super admin overview.
    const now = diffStepChanges({}, { [id]: nextState[id] })[0];
    const to = now?.to ?? 'not-started';
    const review = now?.reviewStatus === 'reviewing' ? 'reviewing' : null;
    out.push({ stepId: id, from: to, to, reviewStatus: review, holder: after[id] ?? null });
  }
  return out;
}

/** The holder of one step at the end of `period`; `undefined` when it cannot be known. */
function holderAsOf(events: HolderHistoryEvent[] | undefined, period: TrendPeriod, since: Date): StepHolder | null | undefined {
  const end = period.end.getTime();
  let last: HolderHistoryEvent | undefined;
  for (const e of events ?? []) {
    const t = e.at.getTime();
    if (t >= end) break;
    if (t >= since.getTime()) last = e;
  }
  return last ? ((last.holder as StepHolder | null) ?? null) : undefined;
}

/** Holder rows grouped by step, oldest first. */
export function indexHolderEvents(events: HolderHistoryEvent[]): Map<string, HolderHistoryEvent[]> {
  const out = new Map<string, HolderHistoryEvent[]>();
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const list = out.get(e.stepId) ?? [];
    list.push(e);
    out.set(e.stepId, list);
  }
  return out;
}

/** Steps held by the client and by SBC at the end of `period`, or `null` when unknown. */
export function holderCountsAsOf(input: {
  stepIds: string[];
  events: Map<string, HolderHistoryEvent[]>;
  since: Date | null;
  period: TrendPeriod;
}): { client: number; withSbc: number } | null {
  const { stepIds, events, since, period } = input;
  if (!since || since.getTime() >= period.end.getTime()) return null;
  let client = 0;
  let withSbc = 0;
  for (const id of stepIds) {
    const h = holderAsOf(events.get(id), period, since);
    if (h === undefined) return null;
    if (h === 'client') client += 1;
    else if (h === 'lead' || h === 'manager') withSbc += 1;
  }
  return { client, withSbc };
}

/**
 * Document requests open at the end of `period`, or `null` when unknown: a request closed now
 * with no `closed_at` (closed before migration 0027) and made before the day end.
 */
export function openRequestsAsOf(rows: DocRequestHistoryRow[], period: TrendPeriod): number | null {
  let n = 0;
  for (const r of rows) {
    if (r.createdAt >= period.end) continue;
    if (r.status === 'pending') {
      n += 1;
      continue;
    }
    if (!r.closedAt) return null;
    if (r.closedAt >= period.end) n += 1;
  }
  return n;
}
