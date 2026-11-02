import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChecklistItem } from '@/data/checklist';
import type { ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import {
  REGISTERED_OFFICE_FIELD_IDS,
  REGISTERED_OFFICE_STATE_FIELD_ID,
  REGISTERED_OFFICE_SOURCE_FIELD_ID,
  REGISTERED_OFFICE_SOURCE_LABEL,
  resolveRegisteredOfficeResponses,
} from '@/lib/checklist/registered-office-responses';
import { countWords } from '@/lib/checklist/checklist-pre1-validation';
import {
  findEngagementForClientUser,
  engagementScopeIds,
  checklistStateKeyForEngagement,
} from '@/lib/checklist/checklist-state-key';
import { toastError, errorMessage } from '@/lib/toast-errors';
import {
  AUTO_SAVE_DEBOUNCE_MS,
  getChangedPartial,
  type AutoSaveStatus,
} from '@/views/incorporation/milestone-response-form-utils';
import { inferIndianState } from '@/lib/incorporation/countries';
import { seedProposedDirectorsFromPartA } from '@/lib/incorporation/proposed-directors';
import type { MilestoneSources } from './use-milestone-sources';
import type { MilestoneDraft } from './use-milestone-draft';
import type { MilestoneAccess } from './use-milestone-access';
import type { MilestoneUiState } from './use-milestone-ui-state';

type MilestoneAutoSaveParams = {
  item: ChecklistItem;
  variant: 'admin' | 'client';
  clientId: string;
  sectionTabs: boolean;
  /** The full checklist has loaded (the form's `open` prop). */
  contentReady: boolean;
  setFieldErrors: MilestoneUiState['setFieldErrors'];
} & Pick<
  MilestoneSources,
  | 'saved'
  | 'user'
  | 'engagements'
  | 'engagement'
  | 'pre1Responses'
  | 'pre6Responses'
  | 'pre8Responses'
  | 'updateItem'
  | 'fields'
> &
  Pick<MilestoneDraft, 'draft'> &
  Pick<MilestoneAccess, 'formReadOnly' | 'writableForViewer'>;

/**
 * Persistence: who may edit, the debounced autosave with its in-flight queue,
 * the flush on unmount / tab hide / page hide, and the registered office seed.
 */
export function useMilestoneAutoSave({
  item,
  variant,
  clientId,
  sectionTabs,
  contentReady,
  setFieldErrors,
  saved,
  user,
  engagements,
  engagement,
  pre1Responses,
  pre6Responses,
  pre8Responses,
  updateItem,
  fields,
  draft,
  formReadOnly,
  writableForViewer,
}: MilestoneAutoSaveParams) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const draftRef = useRef(draft);
  const savedRef = useRef(saved);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staffSavedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userEditedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingAfterFlightRef = useRef<ChecklistItemResponses | null>(null);
  const mountedRef = useRef(true);

  // Keep the latest draft/saved available to debounced autosave callbacks and
  // timeouts without listing them as dependencies. Synced in a passive
  // post-commit effect — refs must not be written during render (React 19).
  // Runs before the autosave effects declared below, so they read fresh values.
  useEffect(() => {
    draftRef.current = draft;
    savedRef.current = saved;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canEdit =
    user?.role !== 'client' ||
    (() => {
      if (!user) return false;
      const eng = findEngagementForClientUser(engagements, user);
      if (eng) return engagementScopeIds(eng, user.clientId).includes(clientId);
      return user.clientId != null && user.clientId === clientId;
    })();

  const internWorkspace = Boolean(sectionTabs);
  const internActor = user?.role === 'intern';
  const autoSaveEnabled =
    !formReadOnly &&
    canEdit &&
    (variant === 'client' || (internWorkspace && internActor));
  const scopeId = engagement ? checklistStateKeyForEngagement(engagement) : clientId;

  /**
   * Registered office (pre-14) — pre-fill on first open, writing the values
   * into THIS step's responses so a later change upstream never silently
   * rewrites what was confirmed here. Sources, in order: the subsidiary
   * address captured at project setup (Registration / Compliance starts),
   * then the legacy Director KYC step on older engagements. The filler can
   * edit every seeded field; provenance is shown as quiet metadata.
   */
  const registeredOfficeSeededRef = useRef(false);
  useEffect(() => {
    // `contentReady` = the full checklist has loaded; seeding off the slim
    // index copy would overwrite an address the server already holds.
    if (item.id !== 'pre-14' || !contentReady || !autoSaveEnabled || !engagement || registeredOfficeSeededRef.current) return;
    const seed: ChecklistItemResponses = {};
    const fromSetup = (engagement.subsidiaryRegisteredAddress ?? '').trim();
    const savedAddress = savedRef.current.registeredOfficeCompleteAddress?.trim() ?? '';
    if (savedAddress || savedRef.current[REGISTERED_OFFICE_SOURCE_FIELD_ID]) {
      // Address already confirmed: only offer the state when it is unanswered
      // and the address names exactly one — the filler confirms or changes it.
      if (!savedRef.current[REGISTERED_OFFICE_STATE_FIELD_ID]?.trim()) {
        const inferred = inferIndianState(savedAddress || fromSetup);
        if (inferred) seed[REGISTERED_OFFICE_STATE_FIELD_ID] = inferred;
      }
    } else if (fromSetup) {
      seed.registeredOfficeCompleteAddress = fromSetup;
      seed[REGISTERED_OFFICE_SOURCE_FIELD_ID] = 'project-setup';
      const inferred = inferIndianState(fromSetup);
      if (inferred) seed[REGISTERED_OFFICE_STATE_FIELD_ID] = inferred;
    } else {
      const legacy = resolveRegisteredOfficeResponses(pre6Responses, pre8Responses);
      if (legacy.registeredOfficeCompleteAddress?.trim()) {
        for (const id of REGISTERED_OFFICE_FIELD_IDS) if (legacy[id]) seed[id] = legacy[id]!;
        seed[REGISTERED_OFFICE_SOURCE_FIELD_ID] = 'director-kyc';
        const inferred = inferIndianState(legacy.registeredOfficeCompleteAddress);
        if (inferred) seed[REGISTERED_OFFICE_STATE_FIELD_ID] = inferred;
      }
    }
    registeredOfficeSeededRef.current = true;
    if (Object.keys(seed).length === 0) return;
    void updateItem(scopeId, item.id, { responses: seed }, { clientResponsesOnly: true }).catch(() => undefined);
  }, [item.id, contentReady, autoSaveEnabled, engagement, pre6Responses, pre8Responses, scopeId, updateItem]);
  /**
   * Proposed directors (pre-15) — on first open with no entries, start the
   * list from the directors named on Part A (name, gender, residency), so the
   * filler only adds the KYC. Same `contentReady` guard as the office seed.
   */
  const directorsSeededRef = useRef(false);
  useEffect(() => {
    if (item.id !== 'pre-15' || !contentReady || !autoSaveEnabled || directorsSeededRef.current) return;
    directorsSeededRef.current = true;
    const seed = seedProposedDirectorsFromPartA(savedRef.current, pre1Responses);
    if (!seed) return;
    void updateItem(scopeId, item.id, { responses: seed }, { clientResponsesOnly: true }).catch(() => undefined);
  }, [item.id, contentReady, autoSaveEnabled, pre1Responses, scopeId, updateItem]);
  const provenanceNote =
    item.id === 'pre-14'
      ? (REGISTERED_OFFICE_SOURCE_LABEL[saved[REGISTERED_OFFICE_SOURCE_FIELD_ID] ?? ''] ?? null)
      : null;

  const flushPendingAutoSave = useCallback(
    (options?: { keepalive?: boolean }) => {
      // Nothing typed in this form instance → nothing to flush. Without this a
      // remount (the scope key settling on load) posted the pre-1 engagement
      // defaults back as if the lead had answered them.
      if (!userEditedRef.current) return;
      const partial = getChangedPartial(fields, draftRef.current, savedRef.current);
      const editablePartial = writableForViewer(partial);
      if (Object.keys(editablePartial).length === 0) return;
      void updateItem(
        scopeId,
        item.id,
        { responses: editablePartial },
        { clientResponsesOnly: true, keepalive: options?.keepalive },
      ).catch(() => undefined);
    },
    [fields, item.id, scopeId, updateItem, writableForViewer],
  );
  // Latest flush for listeners that must not re-subscribe on every render.
  const flushPendingAutoSaveRef = useRef(flushPendingAutoSave);
  useEffect(() => {
    flushPendingAutoSaveRef.current = flushPendingAutoSave;
  });

  const clearDebounce = useCallback(
    (options?: { flush?: boolean }) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (options?.flush) flushPendingAutoSave();
    },
    [flushPendingAutoSave],
  );

  const validatePartialForAutoSave = useCallback(
    (responses: ChecklistItemResponses, partial: ChecklistItemResponses): boolean => {
      if (item.id !== 'pre-1' || partial.businessDescription === undefined) return true;
      const words = countWords(responses.businessDescription ?? '');
      if (words > 100) {
        setFieldErrors((prev) => ({
          ...prev,
          businessDescription: `Description must be 100 words or fewer (${words} entered).`,
        }));
        return false;
      }
      setFieldErrors((prev) => {
        if (!prev.businessDescription?.includes('100 words')) return prev;
        const next = { ...prev };
        delete next.businessDescription;
        return next;
      });
      return true;
    },
    [item.id, setFieldErrors],
  );

  const performSave = useCallback(
    async (partial: ChecklistItemResponses, options?: { explicit?: boolean }) => {
      const editablePartial = writableForViewer(partial);
      if (!autoSaveEnabled || Object.keys(editablePartial).length === 0) return;

      if (!validatePartialForAutoSave(draftRef.current, editablePartial)) {
        setAutoSaveStatus('idle');
        return;
      }

      if (saveInFlightRef.current) {
        pendingAfterFlightRef.current = {
          ...(pendingAfterFlightRef.current ?? {}),
          ...partial,
        };
        return;
      }

      saveInFlightRef.current = true;
      setAutoSaveStatus('saving');
      try {
        await updateItem(scopeId, item.id, { responses: editablePartial }, { clientResponsesOnly: true });
        setAutoSaveStatus('saved');
        if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current);
        savedStatusTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setAutoSaveStatus('idle');
        }, 2000);
      } catch (err) {
        setAutoSaveStatus('error');
        if (options?.explicit) {
          toastError(
            "Couldn't save answers",
            errorMessage(err, 'Check your connection and tap Save now to retry.'),
          );
        }
      } finally {
        saveInFlightRef.current = false;
        const pending = pendingAfterFlightRef.current;
        pendingAfterFlightRef.current = null;
        if (pending && Object.keys(pending).length > 0) {
          void performSave(pending);
        }
      }
    },
    [autoSaveEnabled, item.id, scopeId, updateItem, validatePartialForAutoSave, writableForViewer],
  );

  const autoSaveStatusRef = useRef(autoSaveStatus);
  // Latest status for scheduleAutoSave (a callback); sync post-commit, not during render.
  useEffect(() => {
    autoSaveStatusRef.current = autoSaveStatus;
  });

  const scheduleAutoSave = useCallback(
    (immediate = false) => {
      if (!autoSaveEnabled || !userEditedRef.current) return;

      clearDebounce();

      const runPersist = () => {
        const nextPartial = writableForViewer(
          getChangedPartial(fields, draftRef.current, savedRef.current),
        );
        if (Object.keys(nextPartial).length === 0) {
          if (autoSaveStatusRef.current !== 'error') setAutoSaveStatus('idle');
          return;
        }
        void performSave(nextPartial);
      };

      if (immediate) {
        runPersist();
        return;
      }

      // Always schedule: draftRef may still be stale until the post-commit effect.
      setAutoSaveStatus('pending');
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        runPersist();
      }, AUTO_SAVE_DEBOUNCE_MS);
    },
    [autoSaveEnabled, clearDebounce, fields, performSave, writableForViewer],
  );

  /**
   * Nothing typed is allowed to die with the page. Keyed on `autoSaveEnabled`
   * only — an earlier version re-ran this on every render (its callback
   * dependencies changed each time), which cleared the debounce timer
   * before it could fire and flushed against not-yet-synced refs, so a
   * single edit followed by a refresh was lost.
   *
   *  - unmount (navigating to another step / page): flush at once
   *  - tab hidden (switching browser tabs): flush at once, page stays alive
   *  - pagehide (refresh / close): flush with `keepalive` so the request
   *    outlives the document
   */
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const dropTimer = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      dropTimer();
      flushPendingAutoSaveRef.current();
    };
    const onPageHide = () => {
      dropTimer();
      flushPendingAutoSaveRef.current({ keepalive: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      dropTimer();
      flushPendingAutoSaveRef.current();
    };
  }, [autoSaveEnabled]);

  return {
    autoSaveStatus,
    draftRef,
    savedRef,
    staffSavedStatusTimerRef,
    userEditedRef,
    saveInFlightRef,
    pendingAfterFlightRef,
    mountedRef,
    canEdit,
    internWorkspace,
    autoSaveEnabled,
    scopeId,
    provenanceNote,
    clearDebounce,
    performSave,
    scheduleAutoSave,
  };
}

export type MilestoneAutoSave = ReturnType<typeof useMilestoneAutoSave>;
