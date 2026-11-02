import { useCallback, useMemo, useState } from 'react';
import type { ChecklistItem } from '@/data/checklist';
import {
  INTERN_DELIVERY_STEP_IDS,
  type ChecklistItemResponses,
} from '@/lib/checklist/checklist-responses';
import { isMilestoneFormReadOnly } from '@/lib/checklist/checklist-field-access';
import {
  filterResponsesToEditableFields,
  isClientSubmissionLocked,
} from '@/lib/checklist/checklist-item-lock';
import {
  canClientResubmit,
  getClientReviewBanner,
  isReviewAccepted,
} from '@/lib/checklist/checklist-item-review';
import {
  isDirectFlowStep,
  stripClientOnlyResponses,
  stripLeadOnlyResponses,
} from '@/lib/incorporation/pre-inc-direct-flow';
import type { MilestoneSources } from './use-milestone-sources';

interface MilestoneAccessParams {
  item: ChecklistItem;
  variant: 'admin' | 'client';
  readOnly: boolean;
  itemState: MilestoneSources['itemState'];
}

/** Who may change what: client locks, the direct flow, review state and staff field unlocks. */
export function useMilestoneAccess({ item, variant, readOnly, itemState }: MilestoneAccessParams) {
  const isClient = variant === 'client';
  /**
   * Pre-incorporation direct flow: the client and the lead fill one form and
   * either submits it. The client's per-field submit lock does not apply —
   * the gate opens or closes the whole step.
   */
  const directFlow = isDirectFlowStep(item.id);
  const enforceClientLock = isClient && !directFlow;
  /** What this viewer may send: a client never sends a lead-only field. */
  const writableForViewer = useCallback(
    (partial: ChecklistItemResponses): ChecklistItemResponses =>
      filterResponsesToEditableFields(
        itemState,
        directFlow
          ? isClient
            ? stripLeadOnlyResponses(item.id, partial)
            : stripClientOnlyResponses(item.id, partial)
          : partial,
        enforceClientLock,
      ),
    [itemState, isClient, directFlow, item.id, enforceClientLock],
  );
  const submissionLocked = isClientSubmissionLocked(itemState);
  const reviewBanner = isClient ? getClientReviewBanner(itemState) : null;
  const clientResubmit = canClientResubmit(itemState);
  const reviewAccepted = isReviewAccepted(itemState);
  const unlockedFields = itemState?.unlockedFields ?? [];
  /**
   * Steps the lead used to push to the client with a "Deliver to client"
   * button. That path is gone: the lead submits for approval like any other
   * step and the manager's Accept is what delivers. Only the stricter
   * required-field check that button ran survives, on Submit.
   */
  const isInternDeliveryStep = INTERN_DELIVERY_STEP_IDS.has(item.id);
  const formReadOnly = isMilestoneFormReadOnly({
    readOnly,
    variant,
    itemId: item.id,
    itemState,
  });

  const unlockedFieldsKey = unlockedFields.join('|');
  const unlockedFieldsSet = useMemo(
    () => new Set(unlockedFieldsKey ? unlockedFieldsKey.split('|').filter(Boolean) : []),
    [unlockedFieldsKey],
  );

  const [optimisticUnlock, setOptimisticUnlock] = useState<Record<string, boolean>>({});
  const displayOptimisticUnlock = useMemo(() => {
    if (Object.keys(optimisticUnlock).length === 0) return optimisticUnlock;
    const serverSet = new Set(unlockedFieldsKey ? unlockedFieldsKey.split('|').filter(Boolean) : []);
    const next: Record<string, boolean> = {};
    for (const [fieldId, value] of Object.entries(optimisticUnlock)) {
      if (serverSet.has(fieldId) !== value) {
        next[fieldId] = value;
      }
    }
    return next;
  }, [optimisticUnlock, unlockedFieldsKey]);

  const isFieldUnlockedForAdmin = useCallback(
    (fieldId: string) => {
      if (fieldId in displayOptimisticUnlock) return displayOptimisticUnlock[fieldId];
      return unlockedFieldsSet.has(fieldId);
    },
    [displayOptimisticUnlock, unlockedFieldsSet],
  );

  return {
    isClient,
    directFlow,
    enforceClientLock,
    writableForViewer,
    submissionLocked,
    reviewBanner,
    clientResubmit,
    reviewAccepted,
    unlockedFields,
    isInternDeliveryStep,
    formReadOnly,
    optimisticUnlock,
    setOptimisticUnlock,
    isFieldUnlockedForAdmin,
  };
}

export type MilestoneAccess = ReturnType<typeof useMilestoneAccess>;
