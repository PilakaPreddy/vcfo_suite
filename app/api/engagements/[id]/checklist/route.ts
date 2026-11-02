import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  checklistStateForViewer,
  checklistStateFromRow,
  getEngagementById,
  patchChecklistItem,
} from '@/db/repositories/engagements';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { notifyEngagementEvent } from '@/lib/email/notify-engagement-event';
import { emptyEmailDispatch } from '@/lib/email/email-dispatch';
import { leadManagerRequestNotifyPlan } from '@/lib/email/lead-manager-request-notify';
import { leadWritablePatch } from '@/lib/checklist/checklist-item-review';
import {
  isDirectFlowStep,
  isDirectFlowStepComplete,
  isWaitingOnLead,
  lastEditedPatch,
  MANAGER_APPROVAL_STEP_ID,
  stripClientOnlyResponses,
  stripLeadOnlyResponses,
} from '@/lib/incorporation/pre-inc-direct-flow';

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  itemId: z.string().trim().min(1),
  patch: z.record(z.string(), z.unknown()),
  // Older bundles still send their copy of the state; the server merges onto
  // the persisted row only, so it is accepted and ignored.
  current: z.record(z.string(), z.unknown()).optional(),
});

/** GET /api/engagements/:id/checklist — load checklist_state for one engagement. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const row = await getEngagementById(guard.ctx, engagementDbId(id));
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    checklistState: checklistStateForViewer(guard.ctx, checklistStateFromRow(row)),
  });
}

/**
 * POST /api/engagements/:id/checklist — merge one checklist item patch.
 * Used by staff autosave / lead request-approval / general updateItem.
 * Clients may only patch responses / notes / status — not review or lock fields.
 * A lead may draft and ask for approval, but never release: the fields that
 * accept, complete or deliver a step are the manager's (`reviewChecklistItem`).
 */

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, patchBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const before = await getEngagementById(guard.ctx, engagementDbId(id));
    const prevSlice = before
      ? checklistStateFromRow(before)[body.data.itemId]
      : undefined;

    const { resendManagerEmail, ...patchFields } = body.data.patch as {
      resendManagerEmail?: unknown;
    } & Partial<ChecklistItemStateSlice>;
    const retryManagerEmail = resendManagerEmail === true;
    let patch = patchFields;
    const itemId = body.data.itemId;
    const directFlow = isDirectFlowStep(itemId);
    if (guard.ctx.role === 'client' && directFlow) {
      // Direct flow: the client writes answers only, never a lead-only field,
      // and only while the step is open to them.
      if (isDirectFlowStepComplete(itemId, prevSlice) || isWaitingOnLead(itemId, prevSlice)) {
        return NextResponse.json(
          { error: 'This step is submitted. Ask for a change to edit it.' },
          { status: 409 },
        );
      }
      patch = { responses: stripLeadOnlyResponses(itemId, patchFields.responses ?? {}) };
    } else if (guard.ctx.role === 'intern' && directFlow && patchFields.responses) {
      // Direct flow: the project lead never overwrites the client's own answers (Part A).
      patch = { ...patchFields, responses: stripClientOnlyResponses(itemId, patchFields.responses) };
    } else if (guard.ctx.role === 'client') {
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
    if (guard.ctx.role === 'intern') {
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
      patch = {
        ...patch,
        ...lastEditedPatch({
          actorName: guard.ctx.name,
          actorRole: guard.ctx.role,
          now: new Date().toISOString(),
        }),
      };
    }

    const checklistState = await patchChecklistItem(guard.ctx, id, body.data.itemId, patch);

    const nextSlice = checklistState[body.data.itemId];
    // Autosave is responses-only and must not fan out. Request / Submit /
    // Email manager again send reviewSource or resendManagerEmail.
    const leadNotify = leadManagerRequestNotifyPlan({
      role: guard.ctx.role,
      prevSlice,
      nextSlice,
      patch: { resendManagerEmail: retryManagerEmail, ...patch },
    });

    const email = leadNotify.notify
      ? await notifyEngagementEvent({
          engagementId: id,
          itemId: body.data.itemId,
          event: 'lead_requested_review',
          actorUserId: guard.ctx.userId,
          skipInAppNotifications: leadNotify.skipInAppNotifications,
          outlookCtx: guard.ctx,
        })
      : emptyEmailDispatch();

    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'save_failed';
    const status = message.includes('not found') || message.includes('not permitted') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
