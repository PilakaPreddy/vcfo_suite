'use client';

/**
 * State for `MilestoneResponseForm`. This file composes the pieces in
 * `./milestone-form/`; each one owns a concern:
 *
 * - `use-milestone-sources.ts`  engagement, fields, saved and upstream answers
 * - `use-milestone-draft.ts`    the working draft and the visible fields
 * - `use-milestone-ui-state.ts` save / submit / upload flags, explicit errors
 * - `use-milestone-access.ts`   client locks, direct flow, review state, unlocks
 * - `use-milestone-autosave.ts` autosave, flush on leave, registered office seed
 * - `use-milestone-sections.ts` sections, validation display, tabs, navigation
 * - `field-edits.ts`, `field-cascade.ts`  per-field edits and derived answers
 * - `submit-actions.ts`         Save now and the three submit paths
 * - `read-only-field.tsx`, `editable-field.tsx`, `field-groups.tsx`  rendering
 */
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import type { ChecklistItem } from '@/data/checklist';
import type { ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import { repeatFieldLabel } from '@/lib/checklist/checklist-repeat';
import { cn } from '@/lib/utils';
import {
  internAutoSaveHint,
  internShowSaveButton,
  staffSaveStatusLabel,
} from '@/views/incorporation/milestone-response-form-utils';
import { useMilestoneSources } from './milestone-form/use-milestone-sources';
import { useMilestoneDraft } from './milestone-form/use-milestone-draft';
import { useMilestoneUiState } from './milestone-form/use-milestone-ui-state';
import { useMilestoneAccess } from './milestone-form/use-milestone-access';
import { useMilestoneAutoSave } from './milestone-form/use-milestone-autosave';
import { useMilestoneSections } from './milestone-form/use-milestone-sections';
import { createFieldEditActions } from './milestone-form/field-edits';
import { createSubmitActions } from './milestone-form/submit-actions';
import { createReadOnlyFieldRenderers } from './milestone-form/read-only-field';
import { createEditableFieldRenderer } from './milestone-form/editable-field';
import { renderMilestoneFieldGroups } from './milestone-form/field-groups';
import type { MilestoneFormCtx } from './milestone-form/types';

export interface MilestoneResponseFormStateProps {
  item: ChecklistItem;
  clientId: string;
  engagementId?: string;
  responses?: ChecklistItemResponses;
  variant?: 'admin' | 'client';
  readOnly?: boolean;
  showFieldUnlock?: boolean;
  open?: boolean;
  className?: string;
  compactChrome?: boolean;
  extraFooterActions?: ReactNode;
  aboveFooterActions?: ReactNode;
  sectionTabs?: boolean;
}

export function useMilestoneResponseFormState(props: MilestoneResponseFormStateProps) {
  const {
    item,
    clientId,
    engagementId,
    responses: responsesOverride,
    variant = 'client',
    readOnly = false,
    showFieldUnlock = false,
    open: contentReady = true,
    className,
    compactChrome = false,
    extraFooterActions,
    aboveFooterActions,
    sectionTabs = false,
  } = props;
  const sources = useMilestoneSources({ item, clientId, engagementId, responsesOverride, variant });
  const draftState = useMilestoneDraft({ item, ...sources });
  const ui = useMilestoneUiState();
  const access = useMilestoneAccess({ item, variant, readOnly, itemState: sources.itemState });
  const autoSave = useMilestoneAutoSave({
    item,
    variant,
    clientId,
    sectionTabs,
    contentReady,
    setFieldErrors: ui.setFieldErrors,
    ...sources,
    ...draftState,
    ...access,
  });
  const sections = useMilestoneSections({
    item,
    sectionTabs,
    readOnly,
    ...sources,
    ...draftState,
    ...ui,
    ...access,
    ...autoSave,
  });
  if (!sources.fields.length || (!autoSave.canEdit && !access.formReadOnly)) return null;

  const ctx: MilestoneFormCtx = {
    item,
    clientId,
    engagementId,
    variant,
    readOnly,
    showFieldUnlock,
    compactChrome,
    sectionTabs,
    ...sources,
    ...draftState,
    ...ui,
    ...access,
    ...autoSave,
    ...sections,
  };
  const fieldEdits = createFieldEditActions(ctx);
  const { handleSaveNow, handleInternSubmit, handleSubmit, handleRetryAutoSave } = createSubmitActions(ctx);
  const readOnlyRenderers = createReadOnlyFieldRenderers({ ...ctx, ...fieldEdits });
  const renderEditableField = createEditableFieldRenderer({ ...ctx, ...fieldEdits, ...readOnlyRenderers });
  const renderedFieldGroups = renderMilestoneFieldGroups({ ...ctx, ...readOnlyRenderers, renderEditableField });

  const {
    provenanceNote,
    autoSaveEnabled,
    autoSaveStatus,
    canEdit,
    clientResubmit,
    completedStructuredSections,
    fieldErrors,
    focusField,
    formReadOnly,
    handleInternSectionNext,
    internFooterAction,
    internSectionNav,
    internSectionNextLabel,
    isClient,
    directFlow,
    isPhase2StructuredStep,
    isPre1,
    isPre6,
    peakEndMoment,
    pre1SubmittedForPre6,
    pre6DirectorSlots,
    reviewAccepted,
    reviewBanner,
    saving,
    sectionCompleteFlags,
    sectionErrorFlags,
    selectedSectionIndex,
    setSelectedSectionIndex,
    staffSaveStatus,
    stepPendingItems,
    structuredSectionLabels,
    submissionLocked,
    submitting,
    summaryErrors,
    unlockedFields,
    visibleFields,
    fields,
    saved,
    draft,
    pre1Draft,
    internWorkspace,
  } = ctx;

  const draftForSave = isPre1 ? pre1Draft : draft;
  const hasChanges = fields.some((f) => (draftForSave[f.id] ?? '') !== (saved[f.id] ?? ''));
  const showStaffSaveFooter = !formReadOnly && canEdit && !isClient;
  const internAutoSave = internWorkspace && autoSaveEnabled;
  const internAutoSaveStatusText = internAutoSave ? internAutoSaveHint(autoSaveStatus) : null;
  const showInternSave = internAutoSave && internShowSaveButton(autoSaveStatus);
  const staffSaveStatusText = staffSaveStatusLabel(staffSaveStatus, hasChanges, saving);

  /** Readable label for an error key, repeat entries included ("NIC code · NIC code 2"). */
  const fieldLabelFor = (fieldId: string): string =>
    repeatFieldLabel(fields, draft, fieldId) ??
    visibleFields.find((field) => field.id === fieldId)?.label ??
    fields.find((field) => field.id === fieldId)?.label ??
    fieldId;

  const reviewBannerIcon =
    reviewBanner?.tone === 'rejected'
      ? AlertCircle
      : reviewBanner?.tone === 'reviewing'
        ? Clock
        : reviewBanner?.tone === 'accepted'
          ? CheckCircle2
          : null;

  return {
    provenanceNote,
    aboveFooterActions,
    autoSaveEnabled,
    autoSaveStatus,
    canEdit,
    className,
    compactChrome,
    clientResubmit,
    cn,
    completedStructuredSections,
    fieldErrors,
    focusField,
    fieldLabelFor,
    formReadOnly,
    extraFooterActions,
    handleInternSectionNext,
    handleInternSubmit,
    handleRetryAutoSave,
    handleSaveNow,
    handleSubmit,
    hasChanges,
    internAutoSave,
    internAutoSaveStatusText,
    internFooterAction,
    internSectionNav,
    internSectionNextLabel,
    isClient,
    directFlow,
    isPhase2StructuredStep,
    isPre1,
    isPre6,
    item,
    peakEndMoment,
    pre1SubmittedForPre6,
    pre6DirectorSlots,
    readOnly,
    renderedFieldGroups,
    reviewAccepted,
    reviewBanner,
    reviewBannerIcon,
    saving,
    sectionCompleteFlags,
    sectionErrorFlags,
    sectionTabs,
    selectedSectionIndex,
    setSelectedSectionIndex,
    showFieldUnlock,
    showInternSave,
    showStaffSaveFooter,
    staffSaveStatus,
    staffSaveStatusText,
    stepPendingItems,
    structuredSectionLabels,
    submissionLocked,
    submitting,
    summaryErrors,
    unlockedFields,
    uploading: Boolean(ctx.uploadingField),
    visibleFields,
  };
}

/**
 * The view-model returned by {@link useMilestoneResponseFormState}, used as the
 * props shape for the presentational view components. Derived from the hook's
 * return value so it can never drift out of sync. The hook may return `null`
 * (when there are no fields / the viewer cannot edit or read); callers guard
 * that before rendering, so the view model excludes `null`.
 */
export type MilestoneResponseFormViewModel = NonNullable<
  ReturnType<typeof useMilestoneResponseFormState>
>;
