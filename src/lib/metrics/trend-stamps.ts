/**
 * TREND STAMPS — the "when did it close" columns behind the staff home trend lines (R-18).
 *
 * Migration 0027 added three history columns. The repositories write them through these pure
 * helpers, so every write path stamps them the same way:
 *
 *   tasks.completed_at              set when a task moves to done, cleared when it reopens
 *   document_requests.closed_at     set when a request is fulfilled or cancelled, cleared
 *                                   when it opens again
 *   engagement_step_events.review_status
 *                                   the step's review state after each recorded change
 *
 * A patch is returned only when the state crosses the open/closed line, so a second "done"
 * on a task that is already done keeps the first completion time.
 */

/** The stored task status that means done. */
const TASK_DONE_STATUS = 'done';

/**
 * The `completed_at` part of a task write. `previous` is the stored status before the write
 * (null for a new row); `next` is the stored status after it (undefined when the write does
 * not touch the status).
 */
export function taskCompletionPatch(
  previous: string | null,
  next: string | undefined,
  now: Date = new Date(),
): { completedAt?: Date | null } {
  if (next === undefined) return {};
  const wasDone = previous === TASK_DONE_STATUS;
  const isDone = next === TASK_DONE_STATUS;
  if (isDone && !wasDone) return { completedAt: now };
  if (!isDone && wasDone) return { completedAt: null };
  return {};
}

/**
 * Stored document request statuses that close the request: fulfilled (uploaded), cancelled
 * (rejected or withdrawn), and approved, which is stored as-is after a fulfilled upload.
 */
const REQUEST_CLOSED_STATUSES: ReadonlySet<string> = new Set(['fulfilled', 'cancelled', 'approved']);

/** The `closed_at` part of a document request write, on the same rules as `taskCompletionPatch`. */
export function requestClosedPatch(
  previous: string | null,
  next: string | undefined,
  now: Date = new Date(),
): { closedAt?: Date | null } {
  if (next === undefined) return {};
  const wasClosed = previous !== null && REQUEST_CLOSED_STATUSES.has(previous);
  const isClosed = REQUEST_CLOSED_STATUSES.has(next);
  if (isClosed && !wasClosed) return { closedAt: now };
  if (!isClosed && wasClosed) return { closedAt: null };
  return {};
}

/**
 * The `assigned_by` part of a task write (migration 0028): the caller is stamped when the task
 * goes to someone else; a task assigned to the caller themself, or to nobody, keeps none.
 * `previous` is the stored assignee before the write (undefined for a new row); `next` is the
 * assignee after it (undefined when the write does not touch the assignee).
 */
export function taskAssignmentPatch(
  actorId: string,
  previous: string | null | undefined,
  next: string | null | undefined,
  isNew = false,
): { assignedBy?: string | null } {
  if (next === undefined) return {};
  if (!isNew && (previous ?? null) === (next ?? null)) return {};
  if (!next || next === actorId) return { assignedBy: null };
  return { assignedBy: actorId };
}

/**
 * `assigned_by` for a task a flow creates on someone's behalf (Ask VCFO hand-off, client change
 * requests): the acting person when they are staff and the task goes to someone else, else null
 * (a client raising it is not "assigning").
 */
export function staffAssignedBy(role: string, actorId: string, assignedTo: string | null | undefined): string | null {
  if (role === 'client' || !assignedTo || assignedTo === actorId) return null;
  return actorId;
}
