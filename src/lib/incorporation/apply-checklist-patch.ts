import 'server-only';

import type { AuthContext } from '@/auth/guards';
import {
  checklistStateFromRow,
  getEngagementById,
  patchChecklistItem,
  type EngagementChecklistState,
} from '@/db/repositories/engagements';
import { leadWritablePatch } from '@/lib/checklist/checklist-item-review';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { emptyEmailDispatch, type EmailDispatchResult } from '@/lib/email/email-dispatch';
import { leadManagerRequestNotifyPlan } from '@/lib/email/lead-manager-request-notify';
import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import {
  isDirectFlowStep,
  isDirectFlowStepComplete,
  isWaitingOnLead,
  lastEditedPatch,
  MANAGER_APPROVAL_STEP_ID,
  stripClientOnlyResponses,
  stripLeadOnlyResponses,
} from '@/lib/incorporation/pre-inc-direct-flow';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';

/**
 * The rules of one checklist save, in one place: `POST /api/engagements/:id/checklist` and an
 * approved Ask VCFO changeset both come through here, so neither can write what the other refuses.
 *
 * Clients may only patch responses, notes and status, not review or lock fields. A lead may draft
 * and ask for approval but never release: the fields that accept, complete or deliver a step are
 * the manager's (`reviewChecklistItem`).
 */

/** The step cannot take this person's save as it stands. The route answers 409. */
export class ChecklistPatchRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChecklistPatchRefused';
  }
}

export type ChecklistPatchInput = { resendManagerEmail?: unknown } & Partial<ChecklistItemStateSlice>;

/** What this person may write of the patch they sent. Pure; throws when the step is closed to them. */
export function checklistPatchForRole(
  ctx: Pick<AuthContext, 'role' | 'name'>,
  itemId: string,
  patchFields: Partial<ChecklistItemStateSlice>,
  prevSlice: ChecklistItemStateSlice | undefined,
  now: string,
): Partial<ChecklistItemStateSlice> {
  let patch = patchFields;
  const directFlow = isDirectFlowStep(itemId);
  if (ctx.role === 'client' && directFlow) {
    // Direct flow: the client writes answers only, never a lead-only field,
    // and only while the step is open to them.
    if (isDirectFlowStepComplete(itemId, prevSlice) || isWaitingOnLead(itemId, prevSlice)) {
      throw new ChecklistPatchRefused('This step is submitted. Ask for a change to edit it.');
    }
    patch = { responses: stripLeadOnlyResponses(itemId, patchFields.responses ?? {}) };
  } else if (ctx.role === 'intern' && directFlow && patchFields.responses) {
    // Direct flow: the project lead never overwrites the client's own answers (Part A).
    patch = { ...patchFields, responses: stripClientOnlyResponses(itemId, patchFields.responses) };
  } else if (ctx.role === 'client') {
    const {
      reviewStatus: _rs,
      reviewSource: _src,
      reviewedAt: _ra,
      reviewedBy: _rb,
      rejectionNote: _rn,
      locked: _lk,
      unlockedFields: _uf,
      clientSubmittedAt: _cs,
      deliveredToClientAt: _dt,
      sharedIncorpDraftDocs: _sd,
      incorpDraftsSharedAt: _isa,
      workflowStage: _ws,
      completedOn: _co,
      assigneeId: _ai,
      clientFillRequest: _cfr,
      ...safe
    } = patch;
    patch = safe;
  }
  if (ctx.role === 'intern') {
    patch = leadWritablePatch(patch);
    if (directFlow || itemId === MANAGER_APPROVAL_STEP_ID) {
      // No approval on a direct-flow step: a lead completes it through
      // Submit (which validates), never by stamping a review request here.
      // The board resolution goes to the manager only through
      // "Send for manager approval", which checks the draft first.
      const {
        reviewStatus: _rs,
        reviewSource: _src,
        locked: _lk,
        clientSubmittedAt: _cs,
        unlockedFields: _uf,
        clientFillRequest: _cfr,
        ...draftOnly
      } = patch;
      patch = draftOnly;
    }
  }
  if (directFlow && patch.responses && Object.keys(patch.responses).length > 0) {
    patch = { ...patch, ...lastEditedPatch({ actorName: ctx.name, actorRole: ctx.role, now }) };
  }
  return patch;
}

/** Applies the rules, saves the step and sends the notices a save of this kind sends. */
export async function applyChecklistPatch(
  ctx: AuthContext,
  appOrDbEngagementId: string,
  itemId: string,
  rawPatch: ChecklistPatchInput,
): Promise<{ checklistState: EngagementChecklistState; email: EmailDispatchResult }> {
  const before = await getEngagementById(ctx, engagementDbId(appOrDbEngagementId));
  const prevSlice = before ? checklistStateFromRow(before)[itemId] : undefined;

  const { resendManagerEmail, ...patchFields } = rawPatch;
  const patch = checklistPatchForRole(ctx, itemId, patchFields, prevSlice, new Date().toISOString());

  const checklistState = await patchChecklistItem(ctx, appOrDbEngagementId, itemId, patch);

  // Autosave is responses-only and must not fan out. Request / Submit /
  // Email manager again send reviewSource or resendManagerEmail.
  const leadNotify = leadManagerRequestNotifyPlan({
    role: ctx.role,
    prevSlice,
    nextSlice: checklistState[itemId],
    patch: { resendManagerEmail: resendManagerEmail === true, ...patch },
  });

  const email = leadNotify.notify
    ? await notifyEngagementEventSoon({
        engagementId: appOrDbEngagementId,
        itemId,
        event: 'lead_requested_review',
        actorUserId: ctx.userId,
        skipInAppNotifications: leadNotify.skipInAppNotifications,
        outlookCtx: ctx,
      })
    : emptyEmailDispatch();

  return { checklistState, email };
}
