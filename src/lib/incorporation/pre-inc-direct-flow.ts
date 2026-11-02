import { isAwaitingReview } from '@/lib/checklist/checklist-item-review';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';

/**
 * Pre-incorporation direct flow — the one place that says which steps skip
 * approval and which fields only the project lead may fill.
 *
 * On these steps the client and the project lead fill the same form and either
 * one submits it; the submit completes the step. Nobody approves it. The only
 * pre-incorporation approval left is the board resolution (`pre-2`), which the
 * manager approves before it reaches the client.
 *
 * Kept pure (no `src/db`, no `src/views`) so the server routes, the gate, the
 * visibility policy and the form all read one answer. Do not write a step id
 * list for this rule anywhere else.
 */

/** Steps that the client and the project lead fill and submit with no approval. */
export const DIRECT_FLOW_STEP_IDS: ReadonlySet<string> = new Set([
  'pre-1',
  'pre-3',
  'pre-4',
  'pre-5',
  'pre-13',
  'pre-14',
  'pre-15',
  'pre-16',
  'pre-7',
  'pre-9',
  'pre-10',
  'pre-11',
  'pre-12',
]);

/** The only pre-incorporation step that keeps lead -> manager approval. */
export const MANAGER_APPROVAL_STEP_ID = 'pre-2';

/** Fields that only the project lead can edit. The client reads them. */
const LEAD_ONLY_FIELD_IDS: Readonly<Record<string, readonly string[]>> = {
  'pre-1': ['nicCode', 'nicBusinessType', 'additionalNicCodes'],
};

/**
 * Steps whose answers belong to the client, except the lead-only fields and
 * the shared remarks (owner decision 2026-11-02 for Part A). The project lead
 * reads what the client entered and types only the NIC codes.
 */
const CLIENT_OWNED_STEP_IDS: ReadonlySet<string> = new Set(['pre-1']);
const SHARED_FIELD_IDS: ReadonlySet<string> = new Set(['stepRemarks']);

/** Whole steps that only the project lead can edit. Empty by owner decision. */
export const LEAD_ONLY_STEP_IDS: ReadonlySet<string> = new Set();

/** Helper copy under a lead-only field on the client's form. */
export const LEAD_ONLY_FIELD_HELPER = 'Your project lead fills this.';

export type DirectFlowRoleLabel = 'Client' | 'Project Lead';

export function isDirectFlowStep(itemId: string): boolean {
  return DIRECT_FLOW_STEP_IDS.has(itemId);
}

/**
 * True for a lead-only field id, including the concrete ids of a lead-only
 * repeat group (`additionalNicCodes.<entry>.<field>`), so an entry can never be
 * written around the rule.
 */
export function isLeadOnlyField(itemId: string, fieldId: string): boolean {
  if (LEAD_ONLY_STEP_IDS.has(itemId)) return true;
  const ids = LEAD_ONLY_FIELD_IDS[itemId];
  if (!ids?.length) return false;
  const root = fieldId.split('.')[0] ?? fieldId;
  return ids.includes(fieldId) || ids.includes(root);
}

/** True for a field the client fills and the project lead only reads (Part A except the NIC codes). */
export function isClientOnlyField(itemId: string, fieldId: string): boolean {
  if (!CLIENT_OWNED_STEP_IDS.has(itemId)) return false;
  const root = fieldId.split('.')[0] ?? fieldId;
  return !isLeadOnlyField(itemId, fieldId) && !SHARED_FIELD_IDS.has(root);
}

function isFirmRole(role: string): boolean {
  return role === 'manager' || role === 'admin' || role === 'super_admin';
}

/**
 * Who may write one field of one step.
 *
 * - Project lead: every field of every step, except the client's own answers
 *   on a client-owned step (Part A: the lead fills only the NIC codes).
 * - Client: every field of a direct-flow step except the lead-only ones; never
 *   a field of any other step.
 * - Manager / admin: reads a direct-flow step (reopen is a separate action);
 *   other steps keep their current staff rules.
 */
export function canRoleEditField(role: string, itemId: string, fieldId: string): boolean {
  if (role === 'intern') return !isClientOnlyField(itemId, fieldId);
  if (role === 'client') return isDirectFlowStep(itemId) && !isLeadOnlyField(itemId, fieldId);
  if (isFirmRole(role)) return !isDirectFlowStep(itemId);
  return false;
}

/** A client's responses minus every lead-only key (the server applies this before a merge). */
export function stripLeadOnlyResponses(
  itemId: string,
  responses: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(responses)) {
    if (!isLeadOnlyField(itemId, key)) out[key] = value;
  }
  return out;
}

/** A project lead's responses minus the client's own answers (the server applies this before a merge). */
export function stripClientOnlyResponses(
  itemId: string,
  responses: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(responses)) {
    if (!isClientOnlyField(itemId, key)) out[key] = value;
  }
  return out;
}

export function directFlowRoleLabel(role: string | null | undefined): DirectFlowRoleLabel {
  return role === 'client' ? 'Client' : 'Project Lead';
}

/**
 * The patch a submit writes when it completes a direct-flow step. The review
 * keys are written as "accepted" on purpose: every progress board, the
 * sequential gate and `isPre1SubmittedForBoardResolution` already read those,
 * so they turn green with no reader learning a new rule.
 */
export function directSubmitPatch(input: {
  actorId: string;
  actorName?: string;
  actorRole: string;
  now: string;
}): Partial<ChecklistItemStateSlice> {
  const { actorId, actorName, actorRole, now } = input;
  return {
    status: 'completed',
    completedOn: now.slice(0, 10),
    locked: true,
    unlockedFields: [],
    clientSubmittedAt: now,
    deliveredToClientAt: now,
    reviewStatus: 'accepted',
    reviewSource: undefined,
    reviewedAt: now,
    reviewedBy: actorId,
    rejectionNote: undefined,
    submittedByName: actorName?.trim() || undefined,
    submittedByRole: actorRole,
    waitingOnLeadAt: undefined,
    waitingOnLeadByName: undefined,
  };
}

/**
 * The client submitted and only lead-only fields are still empty. The step is
 * not complete: it waits for the lead, and the client's form turns read-only.
 * `clientSubmittedAt` is not written — it would read as complete to the gate.
 */
export function waitingOnLeadPatch(input: {
  actorId: string;
  actorName?: string;
  now: string;
}): Partial<ChecklistItemStateSlice> {
  return {
    status: 'in-progress',
    unlockedFields: [],
    reviewStatus: undefined,
    reviewSource: undefined,
    rejectionNote: undefined,
    waitingOnLeadAt: input.now,
    waitingOnLeadByName: input.actorName?.trim() || undefined,
  };
}

/**
 * Reopen a submitted direct-flow step: every field opens again and the step
 * reads as in progress, so the steps after it re-lock through the gate.
 *
 * The submit stamps are cleared rather than "unlocking" field by field: a
 * per-field unlock list cannot name the concrete ids of repeat entries
 * (`directors.<entry>.name`), so it would leave those locked for the client.
 */
export function directReopenPatch(): Partial<ChecklistItemStateSlice> {
  return {
    status: 'in-progress',
    completedOn: undefined,
    locked: false,
    unlockedFields: [],
    clientSubmittedAt: undefined,
    deliveredToClientAt: undefined,
    reviewStatus: undefined,
    reviewSource: undefined,
    reviewedAt: undefined,
    reviewedBy: undefined,
    waitingOnLeadAt: undefined,
    waitingOnLeadByName: undefined,
  };
}

/** Stamp for "Last edited by {name} ({role}), {time}" — written on every save. */
export function lastEditedPatch(input: {
  actorName?: string;
  actorRole: string;
  now: string;
}): Partial<ChecklistItemStateSlice> {
  return {
    lastEditedAt: input.now,
    lastEditedByName: input.actorName?.trim() || undefined,
    lastEditedByRole: input.actorRole,
  };
}

/** True while a client submit waits on lead-only fields. */
export function isWaitingOnLead(itemId: string, slice?: ChecklistItemStateSlice | null): boolean {
  if (!isDirectFlowStep(itemId) || !slice?.waitingOnLeadAt?.trim()) return false;
  return !isDirectFlowStepComplete(itemId, slice);
}

/** True when a direct-flow step was reopened for edit (a reopen or an old rejection). */
function isReopened(slice: ChecklistItemStateSlice): boolean {
  if (slice.reviewStatus === 'rejected') return true;
  return (slice.unlockedFields?.length ?? 0) > 0;
}

/**
 * Read-time completion for a direct-flow step (section 3.12). Old data from the
 * approval era is read, never migrated:
 *
 * | stored state                                   | reads as        |
 * |------------------------------------------------|-----------------|
 * | accepted or completed                          | complete        |
 * | lead request pending (reviewing + lead)        | complete        |
 * | client submit pending (reviewing + client)     | complete        |
 * | rejected, or reopened fields                   | open for edit   |
 * | `approval` / `clientFillRequest`, any state    | ignored         |
 */
export function isDirectFlowStepComplete(
  _itemId: string,
  slice?: ChecklistItemStateSlice | null,
): boolean {
  if (!slice) return false;
  if (slice.status === 'not-applicable') return true;
  if (isReopened(slice)) return false;
  if (slice.reviewStatus === 'accepted' || slice.status === 'completed') return true;
  if (slice.reviewStatus === 'reviewing') return true;
  if (slice.deliveredToClientAt?.trim()) return true;
  if (slice.locked === true && slice.clientSubmittedAt?.trim()) return true;
  return false;
}

/**
 * Is this step waiting on a manager's decision? Never for a direct-flow step —
 * old pending requests on those read as complete. Every reader of "pending
 * manager decision" goes through here.
 */
export function isAwaitingManagerDecision(
  itemId: string,
  slice?: ChecklistItemStateSlice | null,
): boolean {
  if (isDirectFlowStep(itemId)) return false;
  return isAwaitingReview(slice);
}
