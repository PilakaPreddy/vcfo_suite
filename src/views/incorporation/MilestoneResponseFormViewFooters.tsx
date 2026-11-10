'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MilestoneResponseFormViewModel } from '@/views/incorporation/useMilestoneResponseFormState';

export function MilestoneResponseFormViewFooters(p: MilestoneResponseFormViewModel) {
  const {
    autoSaveEnabled,
    autoSaveStatus,
    canEdit,
    clientResubmit,
    cn,
    directFlow,
    formReadOnly,
    handleInternSectionNext,
    handleInternSubmit,
    handleRetryAutoSave,
    handleSaveNow,
    handleSubmit,
    hasChanges,
    internAutoSave,
    internAutoSaveStatusText,
    internFooterAction,
    internSectionNextLabel,
    isClient,
    isPhase2StructuredStep,
    isPre1,
    reviewAccepted,
    saving,
    sectionTabs,
    showInternSave,
    showStaffSaveFooter,
    staffSaveStatus,
    staffSaveStatusText,
    submissionLocked,
    submitting,
    unlockedFields,
    uploading,
  } = p;

  // The sectioned layout's footer exists to save / submit / advance the form.
  // A client writes only on a pre-incorporation direct-flow step, where they
  // get the same Next / Submit footer as the lead; elsewhere they get none. A
  // manager or admin reading the answers (`formReadOnly`) gets none either.
  const internNavFooter = sectionTabs && !formReadOnly && (!isClient || directFlow);
  // The older client footers (Submit for review / Submit again) never apply
  // to a direct-flow step — its footer is the one above.
  const legacyClientFooter = isClient && !directFlow;

  return (
    <>
      {!formReadOnly && canEdit && legacyClientFooter && !submissionLocked && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 border-t border-line/70 pt-4',
            (isPre1 || isPhase2StructuredStep) && 'surface px-4 py-4 sm:px-5',
          )}
        >
          {autoSaveEnabled && (
            <div
              aria-live="polite"
              className="flex min-h-[20px] items-center gap-1.5 text-[12px] text-ink-muted"
            >
              {(autoSaveStatus === 'pending' || autoSaveStatus === 'saving') && (
                <>
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                  <span>Saving…</span>
                </>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <Check className="h-3 w-3 shrink-0 text-positive" aria-hidden />
                  <span>Saved</span>
                </>
              )}
              {autoSaveStatus === 'error' && (
                <button
                  type="button"
                  onClick={handleRetryAutoSave}
                  className="cursor-pointer text-danger hover:underline"
                >
                  Couldn&apos;t save — retry
                </button>
              )}
            </div>
          )}
          {(autoSaveEnabled ? hasChanges || autoSaveStatus === 'error' : hasChanges) && (
            <Button
              type="button"
              size="sm"
              variant={autoSaveEnabled ? 'outline' : 'default'}
              onClick={() => void handleSaveNow()}
              disabled={
                saving || autoSaveStatus === 'saving' || (!autoSaveEnabled && !hasChanges)
              }
              className={cn(
                'cursor-pointer',
              )}
            >
              {saving || autoSaveStatus === 'saving'
                ? 'Saving…'
                : autoSaveEnabled
                  ? 'Save now'
                  : 'Save answers'}
            </Button>
          )}
          {isClient && (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || saving || uploading || autoSaveStatus === 'saving'}
              className="cursor-pointer"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          )}
        </div>
      )}

      {(showStaffSaveFooter || internNavFooter) && (
        <div
          className={cn(
            internNavFooter
              ? 'border-t border-line px-5 py-3'
              : cn(
                  'sticky bottom-0 z-20 -mx-0.5 mt-4 border-t border-line/70 bg-surface-raised/95 supports-[backdrop-filter]:bg-surface-raised/80',
                  (isPre1 || isPhase2StructuredStep) && 'px-4 py-3 sm:px-5',
                  !(isPre1 || isPhase2StructuredStep) && 'px-4 py-3',
                ),
          )}
        >
          {p.aboveFooterActions ? (
            <div className="mb-3">{p.aboveFooterActions}</div>
          ) : null}
          <div
            className={cn(
              'flex flex-wrap items-center gap-3',
              internNavFooter ? 'justify-end' : 'justify-between',
            )}
          >
            {internNavFooter ? (
              <>
                <div className="mr-auto flex min-h-[20px] flex-wrap items-center gap-2">
                  {internAutoSave ? (
                    <div
                      aria-live="polite"
                      className="flex min-h-[20px] items-center gap-1.5 text-[12px] text-ink-muted"
                    >
                      {(autoSaveStatus === 'pending' || autoSaveStatus === 'saving') && (
                        <>
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                          <span>Saving…</span>
                        </>
                      )}
                      {autoSaveStatus === 'saved' && (
                        <>
                          <Check className="h-3 w-3 shrink-0 text-positive" aria-hidden />
                          <span>Saved</span>
                        </>
                      )}
                      {autoSaveStatus === 'error' && (
                        <button
                          type="button"
                          onClick={handleRetryAutoSave}
                          className="cursor-pointer text-danger hover:underline"
                        >
                          Couldn&apos;t save — retry
                        </button>
                      )}
                      {autoSaveStatus === 'idle' && internAutoSaveStatusText ? (
                        <span>{internAutoSaveStatusText}</span>
                      ) : null}
                    </div>
                  ) : showStaffSaveFooter && staffSaveStatusText ? (
                    <span
                      aria-live="polite"
                      className="flex items-center gap-1.5 text-[12px] text-ink-muted"
                    >
                      {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />}
                      {!saving && staffSaveStatus === 'saved' && (
                        <Check className="h-3 w-3 shrink-0 text-positive" aria-hidden />
                      )}
                      {!saving && staffSaveStatus === 'error' && (
                        <AlertCircle className="h-3 w-3 shrink-0 text-danger" aria-hidden />
                      )}
                      <span>{staffSaveStatusText}</span>
                    </span>
                  ) : null}
                  {p.extraFooterActions}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {showStaffSaveFooter && (
                    <>
                      {(!internAutoSave || showInternSave) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleSaveNow()}
                          disabled={
                            internAutoSave
                              ? saving || autoSaveStatus === 'saving'
                              : saving || (!hasChanges && staffSaveStatus !== 'error')
                          }
                          className="cursor-pointer"
                        >
                          {saving || autoSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={
                      internFooterAction === 'submit'
                        ? () => void handleInternSubmit()
                        : handleInternSectionNext
                    }
                    disabled={
                      internFooterAction === 'submit'
                        ? submitting || saving || uploading || autoSaveStatus === 'saving'
                        : submitting
                    }
                    className="cursor-pointer"
                  >
                    {internFooterAction === 'submit' && submitting
                      ? 'Submitting…'
                      : internSectionNextLabel}
                  </Button>
                </div>
              </>
            ) : (
              <>
            <div
              aria-live="polite"
              className="flex min-h-[20px] items-center gap-1.5 text-[12px] text-ink-muted"
            >
              {showStaffSaveFooter && staffSaveStatusText && (
                <>
                  {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />}
                  {!saving && staffSaveStatus === 'saved' && (
                    <Check className="h-3 w-3 shrink-0 text-positive" aria-hidden />
                  )}
                  {!saving && staffSaveStatus === 'error' && (
                    <AlertCircle className="h-3 w-3 shrink-0 text-danger" aria-hidden />
                  )}
                  <span>{staffSaveStatusText}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {p.extraFooterActions}
              {showStaffSaveFooter && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleSaveNow()}
                    disabled={saving || (!hasChanges && staffSaveStatus !== 'error')}
                    className="cursor-pointer"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {!formReadOnly && canEdit && legacyClientFooter && submissionLocked && !reviewAccepted && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 border-t border-line/70 pt-4',
            (isPre1 || isPhase2StructuredStep) && 'surface px-4 py-4 sm:px-5',
          )}
        >
          {autoSaveEnabled && unlockedFields.length > 0 && (
            <div
              aria-live="polite"
              className="flex min-h-[20px] items-center gap-1.5 text-[12px] text-ink-muted"
            >
              {(autoSaveStatus === 'pending' || autoSaveStatus === 'saving') && (
                <>
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                  <span>Saving…</span>
                </>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <Check className="h-3 w-3 shrink-0 text-positive" aria-hidden />
                  <span>Saved</span>
                </>
              )}
              {autoSaveStatus === 'error' && (
                <button
                  type="button"
                  onClick={handleRetryAutoSave}
                  className="cursor-pointer text-danger hover:underline"
                >
                  Couldn&apos;t save — retry
                </button>
              )}
            </div>
          )}
          {unlockedFields.length > 0 && (hasChanges || autoSaveStatus === 'error') && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleSaveNow()}
              disabled={saving || autoSaveStatus === 'saving'}
              className="cursor-pointer"
            >
              {saving || autoSaveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            </Button>
          )}
          {clientResubmit && (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || saving || uploading || autoSaveStatus === 'saving'}
              className="cursor-pointer"
            >
              {submitting ? 'Submitting…' : 'Submit again for review'}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
