import 'server-only';
import type { AuthContext } from '@/auth/guards';
import {
  approvalStateOf,
  buildClientApproval,
  changeRequestReopenPatch,
  phaseCompletedByApproval,
  type ChecklistPhaseRef,
} from '@/lib/checklist/checklist-step-approval';
import {
  directReopenPatch,
  isDirectFlowStep,
  isDirectFlowStepComplete,
} from '@/lib/incorporation/pre-inc-direct-flow';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import type { EngagementChecklistState } from './scope';
import { getEngagementById, checklistStateFromRow } from './read';
import { patchChecklistItem } from './checklist-workflow';

/* ------------------------------------------------------------------ *
 * Three-party step approval: lead → manager → client.
 *
 * Role scoping lives HERE, not in the routes, so every caller inherits it:
 *   - only a manager or firm admin with access may hand a step to the client
 *     (that runs through `reviewChecklistItem`'s accept branch)
 *   - only the client on the engagement may approve or ask for a change
 * `getEngagementById` is the tenant boundary in all three: a caller who cannot
 * see the engagement gets "not found", never a row from someone else's file.
 * ------------------------------------------------------------------ */

export type StepApprovalOutcome = {
  checklistState: EngagementChecklistState;
  /** Set only when THIS approval completed the phase and nothing has announced it yet. */
  phaseCompleted: ChecklistPhaseRef | null;
  /** The step was already approved: nothing changed, so nobody is told again. */
  alreadyApproved: boolean;
};

/**
 * Client signs off a step the manager has handed them.
 *
 * When this closes the last outstanding step in its phase, the phase is
 * returned so the caller can send the single phase-approved email, and the
 * completing step is stamped so a double-click or a refresh cannot send it
 * twice.
 */
export async function clientApproveStep(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
): Promise<StepApprovalOutcome> {
  if (ctx.role !== 'client') {
    throw new Error('Only the client may approve a step');
  }
  if (isDirectFlowStep(itemId)) {
    throw new Error('step_has_no_approval');
  }
  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  if (!existing) throw new Error('Engagement not found or not permitted');

  const persisted = checklistStateFromRow(existing);
  const previous = persisted[itemId]?.approval;
  const state = approvalStateOf(persisted[itemId]);
  if (state === 'client_approved') {
    // Idempotent: a second click is a no-op, not an error and not a re-send.
    return { checklistState: persisted, phaseCompleted: null, alreadyApproved: true };
  }
  if (state !== 'pending_client') {
    throw new Error('step_not_awaiting_client_approval');
  }

  const now = new Date().toISOString();
  const approval = buildClientApproval({
    approvedBy: ctx.userId,
    approvedByName: ctx.name,
    now,
    previous,
  });

  let checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, { approval });

  const phaseCompleted = phaseCompletedByApproval(itemId, checklistState);
  if (phaseCompleted) {
    // Stamp before the caller sends. A crash after this point loses an email;
    // a stamp after the send could send twice on a retry.
    checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, {
      approval: { ...approval, phaseCompletionNotifiedAt: now },
    });
  }

  return { checklistState, phaseCompleted, alreadyApproved: false };
}

/**
 * Client asks for a change on a step they were handed.
 *
 * Reopening reuses the existing reject/unlock mechanics rather than inventing
 * gating: `reviewStatus: 'rejected'` plus reopened fields is exactly what
 * `isChecklistStepSequentiallyComplete` reads, so every step after this one
 * re-locks the same way a manager rejection re-locks them.
 */
export async function clientRequestStepChange(
  ctx: AuthContext,
  appEngagementId: string,
  itemId: string,
  note: string,
): Promise<{ checklistState: EngagementChecklistState; note: string }> {
  if (ctx.role !== 'client') {
    throw new Error('Only the client may ask for a change');
  }
  const trimmed = note.trim();
  if (!trimmed) throw new Error('A change request needs a note');

  const existing = await getEngagementById(ctx, engagementDbId(appEngagementId));
  if (!existing) throw new Error('Engagement not found or not permitted');

  const persisted = checklistStateFromRow(existing);
  const now = new Date().toISOString();

  if (isDirectFlowStep(itemId)) {
    // Direct flow: asking for a change reopens a submitted step for both parties.
    if (!isDirectFlowStepComplete(itemId, persisted[itemId])) {
      throw new Error('step_not_with_client');
    }
    const checklistState = await patchChecklistItem(ctx, appEngagementId, itemId, {
      ...directReopenPatch(),
      rejectionNote: trimmed,
    });
    return { checklistState, note: trimmed };
  }

  const state = approvalStateOf(persisted[itemId]);
  if (state !== 'pending_client' && state !== 'client_approved') {
    throw new Error('step_not_with_client');
  }

  const checklistState = await patchChecklistItem(
    ctx,
    appEngagementId,
    itemId,
    changeRequestReopenPatch({
      itemId,
      note: trimmed,
      requestedBy: ctx.userId,
      requestedByName: ctx.name,
      now,
      previous: persisted[itemId]?.approval,
    }),
  );

  return { checklistState, note: trimmed };
}
