import type {
  ChecklistItemStateSlice,
  ChecklistReviewStatus,
} from '@/lib/checklist/checklist-state-key';
import { getSubmissionMeta, isClientSubmissionLocked } from '@/lib/checklist/checklist-item-lock';

export type { ChecklistReviewStatus };

type SliceLike = ChecklistItemStateSlice | null | undefined;

export function getReviewStatus(slice: SliceLike): ChecklistReviewStatus | null {
  if (!slice || typeof slice !== 'object') return null;
  const raw = slice.reviewStatus;
  if (raw === 'reviewing' || raw === 'accepted' || raw === 'rejected') return raw;
  if (isClientSubmissionLocked(slice)) return 'reviewing';
  return null;
}

export function isAwaitingReview(slice: SliceLike): boolean {
  return getReviewStatus(slice) === 'reviewing';
}

export function isReviewAccepted(slice: SliceLike): boolean {
  return getReviewStatus(slice) === 'accepted';
}

export function isReviewRejected(slice: SliceLike): boolean {
  return getReviewStatus(slice) === 'rejected';
}

/** A lead's request for manager approval that nobody has decided on yet. */
export function isLeadRequestPending(slice: SliceLike): boolean {
  return slice?.reviewSource === 'lead_manager_request' && slice.reviewStatus === 'reviewing';
}

export function canClientResubmit(slice: SliceLike): boolean {
  if (!isReviewRejected(slice)) return false;
  const unlocked = getSubmissionMeta(slice).unlockedFields ?? [];
  return unlocked.length > 0;
}

export interface ClientReviewBanner {
  tone: 'reviewing' | 'rejected' | 'accepted';
  title: string;
  body?: string;
}

export function getClientReviewBanner(slice: SliceLike): ClientReviewBanner | null {
  const status = getReviewStatus(slice);
  if (!status) return null;

  const { clientSubmittedAt } = getSubmissionMeta(slice);
  const submittedOn =
    clientSubmittedAt &&
    (() => {
      const date = new Date(clientSubmittedAt);
      return Number.isNaN(date.getTime())
        ? clientSubmittedAt
        : date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
    })();

  if (status === 'reviewing') {
    return {
      tone: 'reviewing',
      title: 'Under review',
      body: submittedOn
        ? `Submitted on ${submittedOn}. Your engagement team is reviewing your answers.`
        : 'Your engagement team is reviewing your answers.',
    };
  }

  if (status === 'accepted') {
    return {
      tone: 'accepted',
      title: 'Approved',
      body: submittedOn
        ? `Accepted after submission on ${submittedOn}.`
        : 'Your submission was approved.',
    };
  }

  const note =
    typeof slice?.rejectionNote === 'string' && slice.rejectionNote.trim()
      ? slice.rejectionNote.trim()
      : undefined;

  return {
    tone: 'rejected',
    title: 'Changes requested',
    body: note
      ? `${note} Update the fields below, then submit again.`
      : 'Your submission needs corrections. Update the fields below, then submit again.',
  };
}

/** Intern Submit / Request manager approval / Email manager again — not autosave. */
export function internLeadManagerRequestPatch(
  itemState?: SliceLike,
): Partial<ChecklistItemStateSlice> {
  const now = new Date().toISOString();
  return {
    reviewStatus: 'reviewing',
    reviewSource: 'lead_manager_request',
    locked: true,
    clientSubmittedAt: now,
    unlockedFields: [],
    rejectionNote: undefined,
    reviewedAt: undefined,
    reviewedBy: undefined,
    status: itemState?.status === 'completed' ? 'completed' : 'in-progress',
  };
}

/**
 * What a lead's patch may carry. A lead drafts and asks for approval; the
 * fields that accept, complete or deliver a step are the manager's
 * (`reviewChecklistItem`) and are dropped here so no client build — old or
 * hand-rolled — can release a step to the client on the lead's say-so.
 */
export function leadWritablePatch(
  patch: Partial<ChecklistItemStateSlice>,
): Partial<ChecklistItemStateSlice> {
  const {
    deliveredToClientAt: _delivered,
    completedOn: _completedOn,
    reviewedAt: _reviewedAt,
    reviewedBy: _reviewedBy,
    approval: _approval,
    reviewStatus,
    status,
    ...safe
  } = patch;
  return {
    ...safe,
    // `reviewing` is the request itself; accepted / rejected are decisions.
    ...(reviewStatus === 'reviewing' ? { reviewStatus } : {}),
    ...(status && status !== 'completed' && status !== 'not-applicable' ? { status } : {}),
  };
}

export function getInternReviewLabel(slice: SliceLike): string | null {
  const status = getReviewStatus(slice);
  if (status === 'reviewing') return 'Awaiting manager / admin approval';
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Rejected — client can resubmit';
  return null;
}

/**
 * The manager's reason, shown to staff on the step page while a rejected step is open again
 * (UAT D-T07-02: the reason was stored but nobody could read it).
 */
export function getSentBackNotice(slice: SliceLike): string | null {
  if (getReviewStatus(slice) !== 'rejected') return null;
  if (slice?.status === 'completed' || slice?.status === 'not-applicable') return null;
  const note = slice?.rejectionNote?.trim();
  return note ? `Sent back by the manager: “${note}”` : 'Sent back by the manager. Check the answers and submit again.';
}
