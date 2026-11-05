'use client';

'use client';

'use client';



import {

  AlertTriangle,

  Download,

  FileText,


  Sparkles,

} from 'lucide-react';




import { BoardResolutionDocPreview, type BoardResolutionDocPreviewHandle } from '@/components/board-resolution/BoardResolutionDocPreview';
import { DocxPreviewFormatToolbarContainer } from '@/components/docx-preview/DocxPreviewFormatToolbarContainer';

import { HexgridLoader } from '@/components/common/HexgridLoader';

import { AccentButton } from '@/components/noir';

import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';







import { type BoardResolutionDoc, type BoardResolutionMergeFields } from '@/lib/board-resolution/board-resolution';







import { internBoardResolutionPath } from '@/lib/projects/project-step-path';






import { toastError } from '@/lib/toast-errors';
import {
  type BoardResolutionApiErrorBody,
  type BoardResolutionErrorDisplay,
} from '@/lib/api/board-resolution-errors';
import type { BoardResolutionPreviewError } from '@/lib/board-resolution/board-resolution-preview-errors';
import type { Engagement } from '@/data/engagements';
import type { DocPackShell } from '@/lib/doc-pack/paths';

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type FormatToolbarProps = {
  disabled: boolean;
  previewRef: React.RefObject<BoardResolutionDocPreviewHandle | null>;
  onFormatChange: () => void;
};

function FormatToolbar({ disabled, previewRef, onFormatChange }: FormatToolbarProps) {
  return (
    <DocxPreviewFormatToolbarContainer
      disabled={disabled}
      previewRef={previewRef}
      className="mb-3"
      onFormatChange={onFormatChange}
    />
  );
}



/**
 * Full props bag produced by `useBoardResolutionEditorState` and threaded through
 * `BoardResolutionEditorView` → `BoardResolutionEditorDocPanel`. Both components read a
 * subset of these fields; the parent guards `eng` before rendering, so `eng` is non-null here.
 */
export interface BoardResolutionEditorProps {
  BOARD_RESOLUTION_DOCX_FILENAME: string;
  applyLatestTemplate: () => Promise<void>;
  busy: 'finalize' | 'generate' | 'apply-template' | 'upload-signed' | null;
  doc: BoardResolutionDoc | null;
  downloadHref: string;
  eng: Engagement;
  finalizeOpen: boolean;
  generateError: BoardResolutionApiErrorBody | null;
  generateErrorDisplay: BoardResolutionErrorDisplay | null;
  handleCorruptionAutoRepair: () => Promise<boolean>;
  handleDocumentChange: (content: string) => void;
  handleFinalize: () => Promise<void>;
  handleGenerate: () => Promise<void>;
  handleManualSave: () => Promise<void>;
  hasDocx: boolean;
  hasPre1Data: boolean;
  internBoardResolutionPath: typeof internBoardResolutionPath;
  isFinalized: boolean;
  /** Sent to the manager and not decided yet — the draft is locked for the lead. */
  withManager: boolean;
  /** True on the lead's editor; false for the manager, admin and super admin (S-556, S-557, P-112). */
  isLead: boolean;
  /** The draft is with the manager and the viewer is the lead, so editing is locked. */
  lockedForViewer: boolean;
  /** Which shell's step links the editor builds. */
  staffShell: DocPackShell;
  /** Manager / admin / super admin: approve and release to the client. */
  handleApprove: () => Promise<void>;
  /** Manager / admin / super admin: send the draft back to the lead with a note. */
  handleSendBack: (note: string) => Promise<boolean>;
  /** Staff upload of the signed copy (S-574). */
  handleUploadSigned: (file: File) => Promise<void>;
  /** The manager's note when they sent the draft back. */
  sentBackNote: string | null;
  loading: boolean;
  mergeFields: BoardResolutionMergeFields;
  pre1StepHref: string;
  previewDownloadHref: string;
  previewReady: boolean;
  previewRef: React.RefObject<BoardResolutionDocPreviewHandle | null>;
  previewRefreshKey: number;
  previewStorageCorrupt: boolean;
  repairActionsDisabled: boolean;
  saveStatus: SaveStatus;
  saveStatusText: string | null;
  setFinalizeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewError: React.Dispatch<React.SetStateAction<BoardResolutionPreviewError | null>>;
  setPreviewReady: React.Dispatch<React.SetStateAction<boolean>>;
  signedDownloadHref: string;
}

export function BoardResolutionEditorDocPanel(p: BoardResolutionEditorProps) {
  const {
    BOARD_RESOLUTION_DOCX_FILENAME,
    applyLatestTemplate,
    busy,
    doc,
    downloadHref,
    eng,
    handleCorruptionAutoRepair,
    handleDocumentChange,
    handleGenerate,
    handleManualSave,
    hasDocx,
    isFinalized,
    isLead,
    lockedForViewer,
    loading,
    mergeFields,
    previewDownloadHref,
    previewReady,
    previewRef,
    previewRefreshKey,
    previewStorageCorrupt,
    repairActionsDisabled,
    saveStatus,
    saveStatusText,
    setFinalizeOpen,
    setPreviewError,
    setPreviewReady,
  } = p;
  return (
    <>
        {loading ? (

          <div className="flex items-center gap-2 text-[12px] text-ink-faint py-12">

            <HexgridLoader size="sm" />

            Loading board resolution…

          </div>

        ) : (

          <>

            {hasDocx ? (

              <>

                <div className="mb-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[15px] font-medium text-ink">
                      Document preview
                    </p>
                    {!isFinalized && saveStatusText && (
                      <p
                        className="text-[11px] text-ink-faint"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {saveStatusText}
                      </p>
                    )}
                  </div>

                  {!isFinalized && !lockedForViewer && (
                    <FormatToolbar
                      disabled={!previewReady || isFinalized || !hasDocx || saveStatus === 'saving'}
                      previewRef={previewRef}
                      onFormatChange={() => {
                        const content = previewRef.current?.getDocumentContent();
                        if (content) handleDocumentChange(content);
                      }}
                    />
                  )}

                  <div className="flex items-start justify-center overflow-x-auto">
                    <BoardResolutionDocPreview
                      ref={previewRef}
                      engagementId={eng.id}
                      downloadUrl={previewDownloadHref}
                      refreshKey={previewRefreshKey}
                      editable={!isFinalized && !lockedForViewer}
                      mergeFields={mergeFields}
                      previewLabel="Draft Word document"
                      docMeta={{
                        storagePath: doc?.storagePath,
                        templateFingerprint: doc?.templateFingerprint,
                        updatedAt: doc?.updatedAt,
                        status: doc?.status,
                      }}
                      onDocumentChange={handleDocumentChange}
                      onStatusChange={(status) => setPreviewReady(status === 'ready')}
                      onPreviewErrorClear={() => setPreviewError(null)}
                      onPreviewError={(error) => {
                        setPreviewError(error);
                        if (error.kind === 'corrupt_xml') {
                          toastError(
                            'Automatic repair did not fix the preview',
                            isFinalized
                              ? 'Use Apply latest template or Re-generate from Pre-1 to rebuild the stored file.'
                              : 'Click Apply latest template or Re-generate from Pre-1.',
                          );
                        }
                      }}
                      onCorruptionAutoRepair={handleCorruptionAutoRepair}
                    />
                  </div>
                </div>

                <div className="mb-6 rounded-md border-1.5 border-line bg-surface-raised p-5">

                  <p className="mb-3 text-[15px] font-medium text-ink">Word document ready</p>

                  {/* R-06: no helper sentence; only the repair case keeps one line. */}
                  {previewStorageCorrupt && isFinalized ? (
                    <p className="mb-4 max-w-lg text-[13px] text-ink-muted">The stored file could not be previewed. Re-generate to rebuild it.</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">

                    <a

                      href={downloadHref}

                      download={BOARD_RESOLUTION_DOCX_FILENAME}

                      className={buttonVariants({ variant: 'default' })}

                    >

                      <Download className="w-4 h-4" />

                      Download Word document

                    </a>

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      disabled={repairActionsDisabled}

                      onClick={() => void handleGenerate()}

                      className="gap-1.5"

                    >

                      <Sparkles className="w-3.5 h-3.5" />

                      {busy === 'generate' ? 'Generating…' : 'Re-generate from Pre-1'}

                    </Button>

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      disabled={repairActionsDisabled}

                      onClick={() => void applyLatestTemplate()}

                      className="gap-1.5"

                    >

                      <FileText className="w-3.5 h-3.5" />

                      {busy === 'apply-template' ? 'Applying…' : 'Apply latest template'}

                    </Button>

                  </div>

                </div>

              </>

            ) : (

              <div className="mb-6 rounded-md border-1.5 border-line bg-surface-raised px-4 py-4 text-[13px] text-ink-2">

                <p className="flex items-start gap-2 font-medium text-ink mb-2">

                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />

                  Generate the Word document first

                </p>

                <p className="mb-4 pl-6 text-ink-muted">

                  Inline editing and client release require a `.docx` from the board resolution

                  template.

                </p>

                <AccentButton

                  type="button"

                  disabled={isFinalized || lockedForViewer || busy !== null}

                  onClick={() => void handleGenerate()}

                  className="gap-2 ml-6"

                >

                  <Sparkles className="w-4 h-4" />

                  {busy === 'generate' ? 'Generating…' : 'Generate Word document from Pre-1'}

                </AccentButton>

              </div>

            )}

            <div className="flex flex-wrap gap-2 mt-5">

              {!isFinalized && !lockedForViewer && hasDocx && (
                <AccentButton
                  type="button"
                  size="sm"
                  disabled={!previewReady || busy !== null || saveStatus === 'saving'}
                  onClick={() => void handleManualSave()}
                >
                  {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
                </AccentButton>
              )}

              {/* The lead sends the draft to the manager; the manager approves it
                  and releases it to the client. No lead release button. */}
              {!isFinalized && isLead ? (
                <Button
                  type="button"
                  variant="default"
                  disabled={
                    lockedForViewer ||
                    busy !== null ||
                    saveStatus === 'saving' ||
                    saveStatus === 'pending'
                  }
                  onClick={() => setFinalizeOpen(true)}
                >
                  {lockedForViewer ? 'Sent for manager approval' : 'Send for manager approval'}
                </Button>
              ) : null}

            </div>

            {doc?.finalizedAt && (

              <p className="text-[11.5px] text-ink-faint mt-4">

                Finalized{' '}

                {new Date(doc.finalizedAt).toLocaleString('en-IN', {

                  dateStyle: 'medium',

                  timeStyle: 'short',

                })}

              </p>

            )}

          </>

        )}
    </>
  );
}
