import 'server-only';
import type { AuthContext } from '@/auth/guards';
import {
  type ChecklistItemStateSlice,
  type ClientFillRequest,
  normalizeEngagementChecklistState,
} from '@/lib/checklist/checklist-state-key';
import {
  buildClientFillRequest,
  canRequestClientFill,
  decideClientFillRequest as applyClientFillDecision,
  fulfillClientFillRequest,
  isClientFillPending,
  type ClientFillDecision,
} from '@/lib/checklist/checklist-client-fill';
import { buildManagerApproval } from '@/lib/checklist/checklist-step-approval';
import { responseFieldIdsForItem } from '@/lib/checklist/checklist-responses';
import {
  canRoleEditField,
  directReopenPatch,
  directSubmitPatch,
  isDirectFlowStep,
  isDirectFlowStepComplete,
  isWaitingOnLead,
  lastEditedPatch,
  stripClientOnlyResponses,
  stripLeadOnlyResponses,
  waitingOnLeadPatch,
} from '@/lib/incorporation/pre-inc-direct-flow';
import { validateStepAgainstState } from '@/lib/checklist/checklist-step-validation';
import { LEGACY_ENGAGEMENT_IDS, engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { auditChecklistItemPatch } from '@/db/repositories/audit-events';
import { isFirmWideAdmin } from '@/lib/auth';
import { sequentialLockMessage } from '@/lib/checklist/checklist-step-gate';
import type { EngagementChecklistState } from './scope';
import { getEngagementById, toAppEngagement, assertEngagementAccess, checklistStateFromRow } from './read';
import { updateChecklistState, updateEngagement } from './write';

/** Checklist item writes: save, client submit, direct-flow submit, review, client fill requests, unlocks. */

/**
 * Merge one checklist item into checklist_state and persist.
 *
 * The base is always the persisted row, never a copy the browser sends back:
 * a viewer's copy is redacted for their role (see `checklistStateForViewer`),
 * and a stale copy would overwrite whatever another party wrote meanwhile.
 */
export async function patchChecklistItem(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  patch: Partial<ChecklistItemStateSlice>,
): Promise<EngagementChecklistState> {
  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  if (!existing) throw new Error('Engagement not found or not permitted');

  const persisted = checklistStateFromRow(existing);
  if (ctx.role === 'client') {
    const lockMessage = sequentialLockMessage(itemId, persisted);
    if (lockMessage) {
      throw new Error(lockMessage);
    }
  }

  // The merge runs inside updateChecklistState's row lock, on the state as
  // stored at that moment, so a save that finished meanwhile is kept.
  let base: EngagementChecklistState = persisted;
  let normalized: EngagementChecklistState = persisted;
  await updateChecklistState(ctx, existing.id, (current) => {
    base = current && !Array.isArray(current) ? normalizeEngagementChecklistState(current) : {};
    normalized = normalizeEngagementChecklistState(mergeChecklistItemPatch(base, itemId, patch));
    return normalized;
  });
  auditChecklistItemPatch(ctx, LEGACY_ENGAGEMENT_IDS[existing.id] ?? existing.id, itemId, patch, base);
  return normalized;
}

/** One step's patch merged over the stored state; its answers merge field by field. */
export function mergeChecklistItemPatch(
  base: EngagementChecklistState,
  itemId: string,
  patch: Partial<ChecklistItemStateSlice>,
): EngagementChecklistState {
  return {
    ...base,
    [itemId]: {
      status: 'not-started',
      ...base[itemId],
      ...patch,
      ...(patch.responses
        ? { responses: { ...(base[itemId]?.responses ?? {}), ...patch.responses } }
        : {}),
    },
  };
}

/** Client submit: lock responses and mark awaiting manager/lead review. */
export async function submitChecklistItem(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  responses: Record<string, string>,
): Promise<EngagementChecklistState> {
  const access = await assertEngagementAccess(ctx, appEngagementId);
  if (!access.ok) {
    throw new Error('Engagement not found or not permitted');
  }
  if (ctx.role !== 'client') {
    throw new Error('Only clients may submit checklist items');
  }
  const now = new Date().toISOString();
  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  const openRequest = existing
    ? checklistStateFromRow(existing)[itemId]?.clientFillRequest
    : undefined;
  const fulfilled = fulfillClientFillRequest(openRequest, now);
  return patchChecklistItem(ctx, appEngagementId, itemId, {
    responses,
    clientSubmittedAt: now,
    locked: true,
    reviewStatus: 'reviewing',
    reviewSource: 'client_submission',
    unlockedFields: [],
    rejectionNote: undefined,
    reviewedAt: undefined,
    reviewedBy: undefined,
    ...(fulfilled ? { clientFillRequest: fulfilled } : {}),
  });
}

export type DirectSubmitOutcome =
  | { outcome: 'submitted'; checklistState: EngagementChecklistState }
  | { outcome: 'waiting_on_lead'; checklistState: EngagementChecklistState }
  | {
      outcome: 'invalid';
      checklistState: EngagementChecklistState;
      fieldErrors: Record<string, string>;
    };

/**
 * Pre-incorporation direct flow: the client or the project lead submits a step
 * and the submit completes it — no approval (see `pre-inc-direct-flow.ts`).
 *
 * 1. The sent answers merge onto the persisted row (a client's lead-only keys
 *    are dropped first).
 * 2. The merged answers run through the same validator the form uses.
 * 3. An error on a field the caller may edit refuses the submit; only the
 *    answers are saved.
 * 4. A client whose only gaps are lead-only fields (the NIC codes) leaves the
 *    step waiting on the lead.
 * 5. Otherwise the step is complete.
 */
export async function submitDirectFlowStep(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  responses: Record<string, string>,
): Promise<DirectSubmitOutcome> {
  if (!isDirectFlowStep(itemId)) throw new Error('step_not_direct_flow');
  if (ctx.role !== 'client' && ctx.role !== 'intern') {
    throw new Error('Only the client or the project lead may submit this step');
  }
  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  if (!existing) throw new Error('Engagement not found or not permitted');

  const persisted = checklistStateFromRow(existing);
  const slice = persisted[itemId];
  if (ctx.role === 'client') {
    if (isDirectFlowStepComplete(itemId, slice)) throw new Error('step_already_submitted');
    if (isWaitingOnLead(itemId, slice)) throw new Error('step_waiting_on_lead');
  }

  const sent =
    ctx.role === 'client' ? stripLeadOnlyResponses(itemId, responses) : stripClientOnlyResponses(itemId, responses);
  const merged: Record<string, string> = { ...(slice?.responses ?? {}) };
  for (const [key, value] of Object.entries(sent)) merged[key] = value;

  const validation = validateStepAgainstState({
    itemId,
    responses: merged,
    state: persisted,
    engagement: toAppEngagement(existing),
  });
  const blocking: Record<string, string> = {};
  for (const [key, message] of Object.entries(validation.errors)) {
    if (canRoleEditField(ctx.role, itemId, key)) blocking[key] = message;
  }

  const now = new Date().toISOString();
  const answers = {
    ...(Object.keys(sent).length ? { responses: sent } : {}),
    ...lastEditedPatch({ actorName: ctx.name, actorRole: ctx.role, now }),
  };

  // A project lead cannot finish a step while the client's own answers (Part A)
  // are still missing: those errors come back so the form can say so.
  if (ctx.role === 'intern' && Object.keys(blocking).length === 0 && Object.keys(validation.errors).length > 0) {
    Object.assign(blocking, validation.errors);
  }

  if (Object.keys(blocking).length > 0) {
    const checklistState = Object.keys(sent).length
      ? await patchChecklistItem(ctx, appEngagementId, itemId, answers)
      : persisted;
    return { outcome: 'invalid', checklistState, fieldErrors: blocking };
  }

  if (Object.keys(validation.errors).length > 0) {
    const checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, {
      ...answers,
      ...waitingOnLeadPatch({ actorId: ctx.userId, actorName: ctx.name, now }),
    });
    return { outcome: 'waiting_on_lead', checklistState };
  }

  const checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, {
    ...answers,
    ...directSubmitPatch({ actorId: ctx.userId, actorName: ctx.name, actorRole: ctx.role, now }),
  });
  // Moved here from the manager's Accept: the certificate step carries the
  // date of incorporation onto the engagement.
  const incorporationDate = checklistState[itemId]?.responses?.dateOfIncorporation?.trim();
  if (itemId === 'pre-12' && incorporationDate && existing.incorporationDate !== incorporationDate) {
    await updateEngagement(ctx, existing.id, { incorporationDate });
  }
  return { outcome: 'submitted', checklistState };
}

/** Manager/admin accept/reject a client (or lead) submission. Leads may not approve. */
export async function reviewChecklistItem(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  action: 'accept' | 'reject',
  note?: string | null,
): Promise<EngagementChecklistState> {
  if (ctx.role === 'client') {
    throw new Error('Clients may not review checklist items');
  }
  if (ctx.role === 'intern') {
    throw new Error('Only the project manager or admin may approve KYC / milestone reviews');
  }
  if (!isFirmWideAdmin(ctx.role) && ctx.role !== 'manager') {
    throw new Error('Only the project manager or admin may approve KYC / milestone reviews');
  }
  if (isDirectFlowStep(itemId)) {
    throw new Error('step_has_no_approval');
  }
  const now = new Date().toISOString();
  if (action === 'accept') {
    // Accepting is also the hand-off to the client: the step becomes theirs to
    // approve. Reject is deliberately untouched — it stays on the reject/unlock
    // path that already reopens this step and re-locks the ones after it.
    const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
    const previousSlice = existing ? checklistStateFromRow(existing)[itemId] : undefined;
    const previous = previousSlice?.approval;
    // A lead's request is delivered BY this accept — there is no separate
    // "Deliver to client" any more — so the delivery stamp lands here, and
    // pre-12's date of incorporation reaches the engagement the same way.
    const leadRequest = previousSlice?.reviewSource === 'lead_manager_request';
    const next = await patchChecklistItem(ctx, appEngagementId, itemId, {
      reviewStatus: 'accepted',
      reviewedAt: now,
      reviewedBy: ctx.userId,
      rejectionNote: undefined,
      status: 'completed',
      completedOn: now.slice(0, 10),
      locked: true,
      ...(leadRequest ? { deliveredToClientAt: now } : {}),
      approval: buildManagerApproval({
        approvedBy: ctx.userId,
        approvedByName: ctx.name,
        now,
        previous,
      }),
    });
    const incorporationDate = next[itemId]?.responses?.dateOfIncorporation?.trim();
    if (
      itemId === 'pre-12' &&
      existing &&
      incorporationDate &&
      existing.incorporationDate !== incorporationDate
    ) {
      await updateEngagement(ctx, existing.id, { incorporationDate });
    }
    return next;
  }
  return patchChecklistItem(ctx, appEngagementId, itemId, {
    reviewStatus: 'rejected',
    reviewedAt: now,
    reviewedBy: ctx.userId,
    rejectionNote: note?.trim() || undefined,
    locked: true,
    // Auto-reopen all response fields so the client can fix and resubmit.
    unlockedFields: responseFieldIdsForItem(itemId),
  });
}

export type ClientFillRequestOutcome = {
  checklistState: EngagementChecklistState;
  request: ClientFillRequest;
};

/**
 * Project lead asks the client to fill a step. Nothing reaches the client until
 * a project manager (or firm admin) approves — the caller fans out the emails.
 */
export async function requestClientFill(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  note?: string | null,
): Promise<ClientFillRequestOutcome> {
  if (ctx.role !== 'intern') {
    throw new Error('Only the project lead may ask the client to fill a step');
  }
  if (isDirectFlowStep(itemId)) {
    throw new Error('step_has_no_approval');
  }
  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  if (!existing) throw new Error('Engagement not found or not permitted');
  const current = checklistStateFromRow(existing)[itemId]?.clientFillRequest;
  if (!canRequestClientFill(current)) {
    throw new Error(
      current?.status === 'pending_manager'
        ? 'client_fill_already_pending'
        : 'client_fill_already_with_client',
    );
  }

  const request = buildClientFillRequest({
    requestedBy: ctx.userId,
    requestedByName: ctx.name,
    note: note ?? undefined,
    now: new Date().toISOString(),
  });
  const checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, {
    clientFillRequest: request,
  });
  return { checklistState, request };
}

/** Manager / firm admin approves or declines the lead's ask. Leads may not. */
export async function decideClientFillRequest(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  decision: ClientFillDecision,
  note?: string | null,
): Promise<ClientFillRequestOutcome> {
  if (!isFirmWideAdmin(ctx.role) && ctx.role !== 'manager') {
    throw new Error('Only the project manager or admin may decide a client fill request');
  }
  if (isDirectFlowStep(itemId)) {
    throw new Error('step_has_no_approval');
  }
  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  if (!existing) throw new Error('Engagement not found or not permitted');
  const current = checklistStateFromRow(existing)[itemId]?.clientFillRequest;
  if (!isClientFillPending(current) || !current) {
    throw new Error('client_fill_not_pending');
  }

  const request = applyClientFillDecision(current, {
    decision,
    decidedBy: ctx.userId,
    decidedByName: ctx.name,
    note: note ?? undefined,
    now: new Date().toISOString(),
  });
  const checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, {
    clientFillRequest: request,
    ...(decision === 'approve' ? { status: 'awaiting-client' as const } : {}),
  });
  return { checklistState, request };
}

/** Staff reopen specific client fields after submit/reject. */
export async function unlockChecklistFields(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  unlockedFields: string[],
): Promise<EngagementChecklistState> {
  if (ctx.role === 'client') {
    throw new Error('Clients may not unlock checklist fields');
  }
  if (isDirectFlowStep(itemId)) {
    // "Reopen step": the whole step opens again for the client and the lead.
    return patchChecklistItem(ctx, appEngagementId, itemId, directReopenPatch());
  }
  return patchChecklistItem(ctx, appEngagementId, itemId, {
    unlockedFields: unlockedFields.filter((id) => typeof id === 'string' && id.trim()),
  });
}
