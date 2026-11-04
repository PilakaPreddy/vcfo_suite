'use client';

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import {
  attachFullDocumentEditing,
  applyMergeFieldHighlights,
  extractPreviewDocumentContent,
  extractPreviewDocumentText,
  getPreviewFormatSelectionState,
  getPreviewFormatState,
  scrollPreviewToMergeField,
  setActiveMergeFieldHighlight,
  setPreviewParagraphAlignment,
  togglePreviewBold,
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onCorruptionAutoRepairRef = useRef(onCorruptionAutoRepair);
  const onPreviewErrorRef = useRef(onPreviewError);
  const onPreviewErrorClearRef = useRef(onPreviewErrorClear);
  const onStatusChangeRef = useRef(onStatusChange);
  const mergeFieldsRef = useRef(mergeFields);
  const corruptionRepairAttemptedRef = useRef(false);
  const [renderPhase, setRenderPhase] = useState<'loading' | 'ready'>('loading');
  const [renderError, setRenderError] = useState<BoardResolutionPreviewError | null>(null);
  const [repairing, setRepairing] = useState(false);

  onDocumentChangeRef.current = onDocumentChange;
  onCorruptionAutoRepairRef.current = onCorruptionAutoRepair;
  onPreviewErrorRef.current = onPreviewError;
  onPreviewErrorClearRef.current = onPreviewErrorClear;
  onStatusChangeRef.current = onStatusChange;
  mergeFieldsRef.current = mergeFields;

  const url = fetchUrl;

  const docQuery = useQuery({
    queryKey: ['br-docx-preview', url, refreshKey],
    queryFn: async ({ signal }) => {
      const res = await fetch(url, {
        credentials: 'include',
        signal,
        cache: 'no-store',
      });

      if (!res.ok) {
        let detail = 'Could not load document preview.';
        if (res.status === 404) detail = 'Word document has not been generated yet.';
        else if (res.status === 403) detail = 'You do not have access to this document.';
        throw Object.assign(new Error(detail), { httpStatus: res.status });
      }

      return res.blob();
    },
    enabled: Boolean(url),
    retry: false,
  });

  const queryError = docQuery.isError
    ? buildBoardResolutionPreviewError(
        docQuery.error instanceof Error ? docQuery.error.message : 'Preview failed.',
        {
          httpStatus:
            docQuery.error instanceof Error && 'httpStatus' in docQuery.error
              ? (docQuery.error as Error & { httpStatus?: number }).httpStatus
              : undefined,
        },
      )
    : null;

  const status: 'loading' | 'ready' | 'error' = docQuery.isFetching || (!docQuery.data && !docQuery.isError)
    ? 'loading'
    : queryError
      ? 'error'
      : renderPhase === 'ready'
        ? 'ready'
        : 'loading';

  const previewError = queryError ?? renderError;

  useLayoutEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  useLayoutEffect(() => {
    if (queryError) onPreviewErrorRef.current?.(queryError);
  }, [queryError]);

  useImperativeHandle(ref, () => ({
    getDocumentText() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return '';
      return extractPreviewDocumentText(bodyEl);
    },
    getDocumentContent() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return '';
      return extractPreviewDocumentContent(bodyEl);
    },
    scrollToMergeField(fieldKey) {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return;
      scrollPreviewToMergeField(bodyEl, fieldKey);
    },
    toggleBold() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return false;
      const applied = togglePreviewBold(bodyEl);
      if (applied) {
        onDocumentChangeRef.current?.(extractPreviewDocumentContent(bodyEl));
      }
      return applied;
    },
    setParagraphAlignment(alignment) {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return false;
      const applied = setPreviewParagraphAlignment(bodyEl, alignment);
      if (applied) {
        onDocumentChangeRef.current?.(extractPreviewDocumentContent(bodyEl));
      }
      return applied;
    },
    setAlignment(alignment) {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return false;
      const applied = setPreviewParagraphAlignment(bodyEl, alignment);
      if (applied) {
        onDocumentChangeRef.current?.(extractPreviewDocumentContent(bodyEl));
      }
      return applied;
    },
    getFormatSelectionState() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) {
        return {
          inPreview: false,
          hasTextSelection: false,
          inParagraph: false,
          paragraphAlignment: null,
          boldActive: false,
        };
      }
      return getPreviewFormatSelectionState(bodyEl);
    },
    getFormatState() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return { bold: false, alignment: 'left' as const };
      const state = getPreviewFormatState(bodyEl);
      return { bold: state.bold, alignment: state.alignment };
    },
    isReady() {
      return status === 'ready';
    },
  }));

  useEffect(() => {
    const blob = docQuery.data;
    const bodyEl = bodyRef.current;
    const styleEl = styleRef.current;
    if (!blob || !bodyEl || !styleEl) return;

    let cancelled = false;
    bodyEl.innerHTML = '';
    styleEl.innerHTML = '';

    void (async () => {
      try {
        // Loaded on demand so the step page bundle does not carry the renderer.
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(blob, bodyEl, styleEl, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          renderHeaders: false,
          renderFooters: false,
        });

        if (cancelled) return;

        if (mergeFieldsRef.current) {
          applyMergeFieldHighlights(bodyEl, mergeFieldsRef.current);
        }

        setRenderPhase('ready');
        setRenderError(null);
        onPreviewErrorClearRef.current?.();
      } catch (err) {
        if (cancelled) return;

        const raw = err instanceof Error ? err.message : 'Preview failed.';
        const built = buildBoardResolutionPreviewError(raw);

        const repairHandler = onCorruptionAutoRepairRef.current;
        if (built.kind === 'corrupt_xml' && repairHandler && !corruptionRepairAttemptedRef.current) {
          corruptionRepairAttemptedRef.current = true;
          setRepairing(true);
          try {
            const repaired = await repairHandler();
            if (repaired && !cancelled) return;
          } catch {
            // Fall through to error UI.
          } finally {
            if (!cancelled) setRepairing(false);
          }
        }

        setRenderPhase('loading');
        setRenderError(built);
        onPreviewErrorRef.current?.(built);
      }
    })();

    return () => {
      cancelled = true;
      bodyEl.innerHTML = '';
      styleEl.innerHTML = '';
    };
  }, [docQuery.data]);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (status !== 'ready' || !bodyEl) return;
    setActiveMergeFieldHighlight(bodyEl, activeMergeFieldKey);
  }, [status, activeMergeFieldKey]);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (status !== 'ready' || !bodyEl || !mergeFields) return;
    applyMergeFieldHighlights(bodyEl, mergeFields);
  }, [status, mergeFields]);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (status !== 'ready' || !editable || !bodyEl || !onDocumentChangeRef.current) return;

    return attachFullDocumentEditing(bodyEl, {
      onDocumentChange: (content) => {
        onDocumentChangeRef.current?.(content);
      },
    });
  }, [status, editable]);

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
