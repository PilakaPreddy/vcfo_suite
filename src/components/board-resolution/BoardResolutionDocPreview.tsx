'use client';

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import {
  applyMergeFieldHighlights,
  extractPreviewDocumentText,
  getPreviewFormatState,
  scrollPreviewToMergeField,
  setActiveMergeFieldHighlight,
  type PreviewFormatSelectionState,
  type PreviewTextAlignment,
} from '@/lib/board-resolution/board-resolution-preview-editable';
import type { BoardResolutionMergeFields } from '@/lib/board-resolution/board-resolution';
import {
  buildBoardResolutionPreviewError,
  type BoardResolutionPreviewError,
} from '@/lib/board-resolution/board-resolution-preview-errors';
import { cn } from '@/lib/utils';
import {
  BoardResolutionPreviewErrorPanel,
  type BoardResolutionDocPreviewMeta,
} from '@/components/board-resolution/BoardResolutionDocPreviewPanels';
import { BR_DOCX_PREVIEW_BODY_CLASSES } from '@/components/board-resolution/board-resolution-doc-preview-classes';
import { useDocxPreview } from '@/components/board-resolution/use-docx-preview';

export type BoardResolutionDocPreviewHandle = {
  getDocumentText: () => string;
  getDocumentContent: () => string;
  scrollToMergeField: (fieldKey: keyof BoardResolutionMergeFields) => void;
  toggleBold: () => boolean;
  setParagraphAlignment: (alignment: PreviewTextAlignment) => boolean;
  /** @deprecated Use setParagraphAlignment */
  setAlignment: (alignment: PreviewTextAlignment) => boolean;
  getFormatSelectionState: () => PreviewFormatSelectionState;
  /** @deprecated Use getFormatSelectionState */
  getFormatState: () => { bold: boolean; alignment: PreviewTextAlignment };
  isReady: () => boolean;
};

export type BoardResolutionDocPreviewProps = {
  engagementId: string;
  downloadUrl?: string;
  refreshKey?: string | number | null;
  className?: string;
  editable?: boolean;
  onDocumentChange?: (content: string) => void;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
  onPreviewError?: (error: BoardResolutionPreviewError) => void;
  onPreviewErrorClear?: () => void;
  onCorruptionAutoRepair?: () => Promise<boolean>;
  mergeFields?: BoardResolutionMergeFields;
  activeMergeFieldKey?: keyof BoardResolutionMergeFields | null;
  previewLabel?: string;
  docMeta?: BoardResolutionDocPreviewMeta;
};

export function BoardResolutionDocPreview({
  ref,
  engagementId,
  downloadUrl,
  refreshKey,
  className,
  editable = false,
  onDocumentChange,
  onStatusChange,
  onPreviewError,
  onPreviewErrorClear,
  onCorruptionAutoRepair,
  mergeFields,
  activeMergeFieldKey = null,
  previewLabel = 'Draft Word document',
  docMeta,
}: BoardResolutionDocPreviewProps & { ref?: Ref<BoardResolutionDocPreviewHandle> }) {
  const url = downloadUrl ?? `/api/engagements/${engagementId}/board-resolution/download`;
  const loadKey = `${url}:${String(refreshKey ?? '')}:${engagementId}`;
  return (
    <BoardResolutionDocPreviewInner
      key={loadKey}
      ref={ref}
      engagementId={engagementId}
      downloadUrl={downloadUrl}
      refreshKey={refreshKey}
      className={className}
      editable={editable}
      onDocumentChange={onDocumentChange}
      onStatusChange={onStatusChange}
      onPreviewError={onPreviewError}
      onPreviewErrorClear={onPreviewErrorClear}
      onCorruptionAutoRepair={onCorruptionAutoRepair}
      mergeFields={mergeFields}
      activeMergeFieldKey={activeMergeFieldKey}
      previewLabel={previewLabel}
      docMeta={docMeta}
      fetchUrl={url}
    />
  );
}

function BoardResolutionDocPreviewInner({
  ref,
  downloadUrl,
  refreshKey,
  className,
  editable = false,
  onDocumentChange,
  onStatusChange,
  onPreviewError,
  onPreviewErrorClear,
  onCorruptionAutoRepair,
  mergeFields,
  activeMergeFieldKey = null,
  previewLabel = 'Draft Word document',
  docMeta,
  fetchUrl,
}: BoardResolutionDocPreviewProps & { ref?: Ref<BoardResolutionDocPreviewHandle>; fetchUrl: string }) {
  const onCorruptionAutoRepairRef = useRef(onCorruptionAutoRepair);
  const onPreviewErrorRef = useRef(onPreviewError);
  const onPreviewErrorClearRef = useRef(onPreviewErrorClear);
  const mergeFieldsRef = useRef(mergeFields);
  const corruptionRepairAttemptedRef = useRef(false);
  const [repairing, setRepairing] = useState(false);

  onCorruptionAutoRepairRef.current = onCorruptionAutoRepair;
  onPreviewErrorRef.current = onPreviewError;
  onPreviewErrorClearRef.current = onPreviewErrorClear;
  mergeFieldsRef.current = mergeFields;

  const url = fetchUrl;

  const { bodyRef, styleRef, status, queryError, previewError, baseHandle } =
    useDocxPreview<BoardResolutionPreviewError>({
      queryKeyPrefix: 'br-docx-preview',
      url,
      refreshKey,
      editable,
      renderHeadersAndFooters: false,
      buildError: buildBoardResolutionPreviewError,
      onDocumentChange,
      onStatusChange,
      onRendered: (bodyEl) => {
        if (mergeFieldsRef.current) {
          applyMergeFieldHighlights(bodyEl, mergeFieldsRef.current);
        }
        onPreviewErrorClearRef.current?.();
      },
      onRenderError: async (built, isCancelled) => {
        const repairHandler = onCorruptionAutoRepairRef.current;
        if (built.kind === 'corrupt_xml' && repairHandler && !corruptionRepairAttemptedRef.current) {
          corruptionRepairAttemptedRef.current = true;
          setRepairing(true);
          try {
            const repaired = await repairHandler();
            if (repaired && !isCancelled()) return true;
          } catch {
            // Fall through to error UI.
          } finally {
            if (!isCancelled()) setRepairing(false);
          }
        }
        onPreviewErrorRef.current?.(built);
        return false;
      },
    });

  useLayoutEffect(() => {
    if (queryError) onPreviewErrorRef.current?.(queryError);
  }, [queryError]);

  useImperativeHandle(ref, () => ({
    ...baseHandle,
    getDocumentText() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return '';
      return extractPreviewDocumentText(bodyEl);
    },
    scrollToMergeField(fieldKey) {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return;
      scrollPreviewToMergeField(bodyEl, fieldKey);
    },
    /** @deprecated Use setParagraphAlignment */
    setAlignment: baseHandle.setParagraphAlignment,
    getFormatState() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return { bold: false, alignment: 'left' as const };
      const state = getPreviewFormatState(bodyEl);
      return { bold: state.bold, alignment: state.alignment };
    },
  }));

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (status !== 'ready' || !bodyEl) return;
    setActiveMergeFieldHighlight(bodyEl, activeMergeFieldKey);
  }, [bodyRef, status, activeMergeFieldKey]);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (status !== 'ready' || !bodyEl || !mergeFields) return;
    applyMergeFieldHighlights(bodyEl, mergeFields);
  }, [bodyRef, status, mergeFields]);

  return (
    <div
      className={cn(
        'mx-auto w-fit max-w-none self-start overflow-visible rounded-lg border border-line/60 bg-white shadow-md',
        className,
      )}
    >
      <div className={cn('relative w-fit overflow-visible', status === 'loading' && 'min-h-[280px]')}>
        {status === 'loading' && (
          <div
            className="absolute inset-0 z-10 flex min-h-[280px] items-center justify-center bg-white"
            aria-hidden={status !== 'loading'}
          >
            <HexgridLoader
              size="sm"
              message={repairing ? 'Repairing document…' : 'Rendering document…'}
            />
          </div>
        )}

        {status === 'error' && previewError && (
          <BoardResolutionPreviewErrorPanel
            error={previewError}
            previewLabel={previewLabel}
            docMeta={docMeta}
            downloadUrl={downloadUrl ?? url}
          />
        )}

        <div ref={styleRef} aria-hidden />
        <div
          ref={bodyRef}
          className={cn(BR_DOCX_PREVIEW_BODY_CLASSES, status === 'error' && 'hidden')}
          aria-busy={status === 'loading'}
          aria-hidden={status === 'error'}
        />
      </div>
    </div>
  );
}
