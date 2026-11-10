import {
  computeMcaNameApprovalExpiryDate,
  validateInternDelivery,
} from '@/lib/checklist/checklist-responses';
import { showClientSubmittedNotice } from '@/lib/client-portal/submitted-notice';
import { internLeadManagerRequestPatch } from '@/lib/checklist/checklist-item-review';
import { toastError, toastSuccess, errorMessage } from '@/lib/toast-errors';
import { getChangedPartial } from '@/views/incorporation/milestone-response-form-utils';
import { internFormNextTarget } from '@/lib/intern/intern-overview-progress';
import { clientIncorporationPath, clientIncorporationStepPath } from '@/lib/projects/project-step-path';
import { canRoleEditField, stripLeadOnlyResponses } from '@/lib/incorporation/pre-inc-direct-flow';
import { errorKeyInFields } from './helpers';
import type { MilestoneFormCtx } from './types';

/**
 * Save and submit: Save now (autosave or staff save), the client's review
 * submit, the lead's submit for approval, and the direct-flow submit.
 */
export function createSubmitActions(ctx: MilestoneFormCtx) {
  const {
    item,
    updateItem,
    submitChecklistItem,
    submitDirectStep,
    user,
    fields,
    itemState,
    saved,
    draft,
    pre1Draft,
    setDraft,
    setSaving,
    setStaffSaveStatus,
    setFieldErrors,
    setFieldWarnings,
    setSubmitting,
    setPeakEndMoment,
    isClient,
    directFlow,
    writableForViewer,
    clientResubmit,
    isInternDeliveryStep,
    autoSaveStatus,
    draftRef,
    savedRef,
    staffSavedStatusTimerRef,
    saveInFlightRef,
    pendingAfterFlightRef,
    mountedRef,
    internWorkspace,
    autoSaveEnabled,
    scopeId,
    clearDebounce,
    performSave,
    isPre1,
    validateStep,
    internSectionGroups,
    internSectionNav,
    router,
    navigateInternAfterLastTab,
    setSubmitAttempted,
    setSelectedSectionIndex,
    uploadingField,
  } = ctx;

  /**
   * A file is still uploading: Submit waits for it, or the server would check the
   * step without that file and refuse it (UAT T-09, 10 Nov 2026). The button is
   * disabled meanwhile too; this covers a click that lands as the upload starts.
   */
  const uploadStillRunning = () => {
    if (!uploadingField) return false;
    toastError('A file is still uploading', 'Submit again when the upload has finished.');
    return true;
  };

  const waitForSaveIdle = async () => {
    if (!saveInFlightRef.current) return;
    await new Promise<void>((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (!saveInFlightRef.current || Date.now() - started > 8000) {
          resolve();
          return;
        }
        window.setTimeout(tick, 40);
      };
      window.setTimeout(tick, 40);
    });
  };

  const handleSaveNow = async () => {
    clearDebounce();

    if (internWorkspace && autoSaveEnabled) {
      const responsesToSave = isPre1 ? pre1Draft : draft;
      const partial = getChangedPartial(fields, responsesToSave, saved);
      const editablePartial = writableForViewer(partial);
      if (Object.keys(editablePartial).length === 0 && autoSaveStatus !== 'error') return;
      setSaving(true);
      try {
        await performSave(
          Object.keys(editablePartial).length > 0
            ? editablePartial
            : getChangedPartial(fields, draftRef.current, savedRef.current),
          { explicit: true },
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const { ok, errors, warnings } = validateStep(isPre1 ? pre1Draft : draft);
    setFieldErrors(errors);
    setFieldWarnings(warnings);
    if (!ok) {
      toastError(
        'Please fix the highlighted fields',
        'Complete required fields and upload all documents before saving.',
      );
      return;
    }

    const responsesToSave = isPre1 ? pre1Draft : draft;
    const partial = getChangedPartial(fields, responsesToSave, saved);
    const editablePartial = writableForViewer(partial);
    if (Object.keys(editablePartial).length === 0) return;

    setSaving(true);
    if (!autoSaveEnabled) setStaffSaveStatus('idle');
    try {
      if (autoSaveEnabled) {
        await performSave(editablePartial, { explicit: true });
      } else {
        await updateItem(
          scopeId,
          item.id,
          { responses: responsesToSave },
          { clientResponsesOnly: true },
        );
        setStaffSaveStatus('saved');
        if (staffSavedStatusTimerRef.current) clearTimeout(staffSavedStatusTimerRef.current);
        staffSavedStatusTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setStaffSaveStatus('idle');
        }, 2000);
        toastSuccess('Saved', `Answers for "${item.title}" were saved.`);
      }
    } catch (err) {
      if (!autoSaveEnabled) {
        setStaffSaveStatus('error');
        toastError(
          "Couldn't save answers",
          errorMessage(err, 'Your answers could not be saved. Try again.'),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /** Client portal / lead after a direct submit: the next step, else the phase overview. */
  const navigateAfterDirectSubmit = () => {
    if (!isClient) {
      navigateInternAfterLastTab();
      return;
    }
    const target = internFormNextTarget(item.id, 0, 0);
    router.push(target.kind === 'step' ? clientIncorporationStepPath(target.item) : clientIncorporationPath());
  };

  /**
   * Direct-flow Submit, client and lead alike. The form checks first so a
   * field the user can fix is marked at once; the server runs the same check
   * and its 422 lands in the same display. A client whose only gaps are the
   * lead-only NIC codes still submits — the step then waits on the lead.
   */
  const handleDirectSubmit = async () => {
    if (uploadStillRunning()) return;
    clearDebounce();
    pendingAfterFlightRef.current = null;
    await waitForSaveIdle();

    const submitDraft = isPre1 ? pre1Draft : { ...draft };
    if (item.id === 'pre-5' && submitDraft.nameApprovalDate?.trim()) {
      submitDraft.nameApprovalExpiryDate =
        submitDraft.nameApprovalExpiryDate?.trim() ||
        computeMcaNameApprovalExpiryDate(submitDraft.nameApprovalDate);
    }
    const role = user?.role ?? (isClient ? 'client' : 'intern');
    const validation = validateStep(submitDraft);
    const blocking: Record<string, string> = {};
    for (const [key, message] of Object.entries(validation.errors)) {
      if (canRoleEditField(role, item.id, key)) blocking[key] = message;
    }
    setFieldWarnings(validation.warnings);

    const showErrors = (errors: Record<string, string>) => {
      setFieldErrors(errors);
      setSubmitAttempted(true);
      toastError('Please complete required fields', 'Fix the highlighted items before submitting.');
      if (internSectionNav) {
        const errorIndex = internSectionGroups.findIndex((group) =>
          Object.keys(errors).some((key) => errorKeyInFields(key, group.fields)),
        );
        if (errorIndex >= 0) setSelectedSectionIndex(errorIndex);
      }
    };

    if (Object.keys(blocking).length > 0) {
      showErrors(blocking);
      return;
    }
    // Part A: the lead cannot finish the step while the client's own answers
    // are missing. Nothing for the lead to fix, so no field errors — just say so.
    const clientGaps = Object.keys(validation.errors).length;
    if (!isClient && clientGaps > 0) {
      toastError(
        'Waiting on the client',
        `The client still has ${clientGaps} answer${clientGaps === 1 ? '' : 's'} to fill on this step. Your NIC codes are saved.`,
      );
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const sent = isClient ? stripLeadOnlyResponses(item.id, submitDraft) : submitDraft;
      const result = await submitDirectStep(scopeId, item.id, sent);
      if (result.outcome === 'invalid') {
        showErrors(result.fieldErrors ?? {});
        return;
      }
      if (submitDraft !== draft) setDraft(submitDraft);
      if (result.outcome === 'waiting_on_lead') {
        if (isClient) {
          showClientSubmittedNotice({ stepTitle: item.title, waitingOnLead: true });
          return;
        }
        toastSuccess(
          'Submitted',
          'Your project lead adds the NIC codes, then this step is complete.',
          { id: `direct-submit:${scopeId}:${item.id}` },
        );
        return;
      }
      if (isClient) showClientSubmittedNotice({ stepTitle: item.title });
      else {
        toastSuccess('Step submitted', `${item.title} is complete.`, {
          id: `direct-submit:${scopeId}:${item.id}`,
        });
      }
      navigateAfterDirectSubmit();
    } catch (err) {
      toastError('Could not submit', errorMessage(err, 'Try again. Your answers are saved.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleInternSubmit = async () => {
    if (directFlow) {
      await handleDirectSubmit();
      return;
    }
    if (uploadStillRunning()) return;
    if (!internWorkspace) return;
    clearDebounce();
    pendingAfterFlightRef.current = null;
    await waitForSaveIdle();

    const submitDraft = isPre1 ? pre1Draft : { ...draft };
    if (item.id === 'pre-5' && submitDraft.nameApprovalDate?.trim()) {
      submitDraft.nameApprovalExpiryDate =
        submitDraft.nameApprovalExpiryDate?.trim() ||
        computeMcaNameApprovalExpiryDate(submitDraft.nameApprovalDate);
    }
    const stepValidation = validateStep(isPre1 ? pre1Draft : submitDraft);
    const delivery = isInternDeliveryStep
      ? validateInternDelivery(item.id, submitDraft)
      : { ok: true, errors: {} };
    const ok = stepValidation.ok && delivery.ok;
    const errors = { ...stepValidation.errors, ...delivery.errors };
    const { warnings } = stepValidation;
    setFieldErrors(errors);
    setFieldWarnings(warnings);
    if (!ok) {
      setSubmitAttempted(true);
      toastError(
        'Please complete required fields',
        'Fix the highlighted items before submitting.',
      );
      if (internSectionNav) {
        const errorIndex = internSectionGroups.findIndex((group) =>
          Object.keys(errors).some((key) => errorKeyInFields(key, group.fields)),
        );
        if (errorIndex >= 0) setSelectedSectionIndex(errorIndex);
      }
      return;
    }

    setSubmitting(true);
    try {
      await updateItem(scopeId, item.id, {
        responses: submitDraft,
        ...internLeadManagerRequestPatch(itemState),
      });
      if (submitDraft !== draft) setDraft(submitDraft);
      toastSuccess(
        'Submitted for approval',
        'Your manager reviews it in Approvals; the client sees this step once they accept.',
        { id: `intern-submit:${scopeId}:${item.id}` },
      );
      navigateInternAfterLastTab();
    } catch (err) {
      toastError('Could not submit', errorMessage(err, 'Try again or use Save to keep a draft.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (uploadStillRunning()) return;
    clearDebounce();

    const { ok, errors, warnings } = validateStep(isPre1 ? pre1Draft : draft);
    setFieldErrors(errors);
    setFieldWarnings(warnings);
    if (!ok) {
      setSubmitAttempted(true);
      toastError(
        'Please complete required fields',
        'Fix the highlighted items before submitting for review.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const submitDraft = isPre1 ? pre1Draft : draft;
      const partial = getChangedPartial(fields, submitDraft, saved);
      if (Object.keys(partial).length > 0) {
        await updateItem(scopeId, item.id, { responses: partial }, { clientResponsesOnly: true });
      }
      await submitChecklistItem(scopeId, item.id, submitDraft);
      setPeakEndMoment('submit');
      if (isClient) showClientSubmittedNotice({ stepTitle: item.title, forReview: true });
      else {
        toastSuccess(
          clientResubmit ? 'Resubmitted for review' : 'Submitted for review',
          'Your engagement team will review your answers shortly.',
        );
      }
    } catch (err) {
      toastError('Could not submit', errorMessage(err, 'Try again or contact your project lead.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryAutoSave = () => {
    clearDebounce();
    void performSave(getChangedPartial(fields, draftRef.current, savedRef.current));
  };

  return {
    handleSaveNow,
    handleInternSubmit,
    handleSubmit,
    handleRetryAutoSave,
  };
}
