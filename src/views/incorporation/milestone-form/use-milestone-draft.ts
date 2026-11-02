import { useCallback, useMemo, useState } from 'react';
import type { ChecklistField, ChecklistItem } from '@/data/checklist';
import {
  appendStepRemarksToVisible,
  type ChecklistItemResponses,
} from '@/lib/checklist/checklist-responses';
import { applyShowWhen, resolveFieldLabels } from '@/lib/checklist/checklist-repeat';
import {
  applyPre1EngagementDefaults,
  getPre1VisibleFields,
} from '@/lib/checklist/checklist-pre1-validation';
import {
  getPre6DirectorSlotsFromPre1,
  getPre6VisibleFields,
} from '@/lib/checklist/checklist-pre6-validation';
import { fieldsForDirectorAudiences } from '@/lib/incorporation/incorp-director-slots';
import {
  computeMilestoneDraftFromSaved,
  overlayTouchedFields,
} from '@/views/incorporation/milestone-response-form-utils';
import { NO_FIELDS, type DraftEdits } from './helpers';
import type { MilestoneSources } from './use-milestone-sources';

type MilestoneDraftParams = { item: ChecklistItem } & Pick<
  MilestoneSources,
  | 'saved'
  | 'user'
  | 'engagement'
  | 'pre1Responses'
  | 'pre8Responses'
  | 'fields'
  | 'pre1SubmittedForPre6'
  | 'directorSlots'
>;

/** The working draft (saved answers plus this session's edits) and the fields it shows. */
export function useMilestoneDraft({
  item,
  saved,
  user,
  engagement,
  pre1Responses,
  pre8Responses,
  fields,
  pre1SubmittedForPre6,
  directorSlots,
}: MilestoneDraftParams) {
  /**
   * The draft is the saved answers with the user's edits laid over them —
   * only the fields they actually touched. The step page renders before the
   * full checklist has loaded (the slim index carries no answers), so a
   * snapshot taken then would show, and on the next autosave send back,
   * empty strings for every field the server already holds. Untouched
   * fields therefore always follow `saved`; touched ones stick until saved.
   */
  const [draftEdits, setDraftEdits] = useState<DraftEdits | null>(null);
  /**
   * Part A's starting values (share capital 10,00,000 / 1,00,000 / 10, two
   * directors) are a suggestion to the client, who owns those answers. Staff
   * read what the client actually saved, never a default dressed as an answer.
   */
  const partADefaults = item.id !== 'pre-1' || user?.role === 'client';
  const baselineDraft = useMemo(
    () =>
      partADefaults
        ? computeMilestoneDraftFromSaved(item.id, saved, engagement, pre1Responses, pre8Responses)
        : { ...saved },
    [partADefaults, item.id, saved, engagement, pre1Responses, pre8Responses],
  );
  const draft = useMemo(
    () => overlayTouchedFields(baselineDraft, draftEdits?.values ?? null, draftEdits?.touched ?? NO_FIELDS),
    [draftEdits, baselineDraft],
  );

  const pre1Draft = useMemo(
    () => (item.id === 'pre-1' && partADefaults ? applyPre1EngagementDefaults(draft, engagement) : draft),
    [item.id, partADefaults, draft, engagement],
  );
  const visibleFields = useMemo(() => {
    let visible: ChecklistField[];
    if (item.id === 'pre-1') visible = getPre1VisibleFields(fields, pre1Draft);
    else if (item.id === 'pre-6') {
      if (!pre1SubmittedForPre6) visible = [];
      else visible = getPre6VisibleFields(fields, draft, pre1Responses);
    } else visible = resolveFieldLabels(applyShowWhen(fields, draft), draft);
    if (directorSlots) visible = fieldsForDirectorAudiences(visible, directorSlots);
    return appendStepRemarksToVisible(visible, fields);
  }, [item.id, fields, pre1Draft, draft, pre1Responses, pre1SubmittedForPre6, directorSlots]);
  const pre6DirectorSlots = useMemo(
    () => (item.id === 'pre-6' ? getPre6DirectorSlotsFromPre1(pre1Responses) : []),
    [item.id, pre1Responses],
  );

  const setDraft = useCallback((updater: ChecklistItemResponses | ((prev: ChecklistItemResponses) => ChecklistItemResponses)) => {
    setDraftEdits((prev) => {
      // Update from the effective draft (saved ⊕ touched), not the raw
      // snapshot, so cascades that read sibling fields see current values.
      const touched = new Set(prev?.touched ?? NO_FIELDS);
      const current = overlayTouchedFields(baselineDraft, prev?.values ?? null, touched);
      const next = typeof updater === 'function' ? updater(current) : updater;
      for (const key of Object.keys(next)) {
        if ((next[key] ?? '') !== (current[key] ?? '')) touched.add(key);
      }
      return { values: next, touched };
    });
  }, [baselineDraft]);

  return {
    draft,
    pre1Draft,
    visibleFields,
    pre6DirectorSlots,
    setDraft,
  };
}

export type MilestoneDraft = ReturnType<typeof useMilestoneDraft>;
