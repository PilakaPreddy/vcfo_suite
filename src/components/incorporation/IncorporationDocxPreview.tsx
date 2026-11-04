'use client';

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import {
  attachFullDocumentEditing,
  extractPreviewDocumentContent,
  getPreviewFormatSelectionState,
  setPreviewParagraphAlignment,
  togglePreviewBold,
  type PreviewFormatSelectionState,
  type PreviewTextAlignment,
} from '@/lib/board-resolution/board-resolution-preview-editable';
import {
  buildIncorpDocPreviewError,
  type IncorpDocPreviewError,
} from '@/lib/incorporation-docs/preview-errors';
import { cn } from '@/lib/utils';
import { IncorporationPreviewErrorPanel } from '@/components/incorporation/IncorporationPreviewErrorPanel';
import { INCORP_DOCX_PREVIEW_BODY_CLASSES } from '@/components/incorporation/incorporation-doc-preview-classes';

export type IncorporationDocxPreviewHandle = {
  getDocumentContent: () => string;
  toggleBold: () => boolean;
  setParagraphAlignment: (alignment: PreviewTextAlignment) => boolean;
  getFormatSelectionState: () => PreviewFormatSelectionState;
  isReady: () => boolean;
};

export type IncorporationDocxPreviewProps = {
  downloadUrl: string;
  previewLabel?: string;
  refreshKey?: string | number | null;
  className?: string;
  editable?: boolean;
  onDocumentChange?: (content: string) => void;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
  onRecoverCorruptFile?: (() => Promise<void>) | (() => void);
};

export function IncorporationDocxPreview(
  props: IncorporationDocxPreviewProps & { ref?: Ref<IncorporationDocxPreviewHandle> },
) {
  const loadKey = `${props.downloadUrl}:${String(props.refreshKey ?? '')}`;
  return <IncorporationDocxPreviewInner key={loadKey} {...props} />;
}

function IncorporationDocxPreviewInner({
  ref,
  downloadUrl,
  previewLabel = 'Incorporation draft',
  refreshKey,
  className,
  editable = false,
  onDocumentChange,
  onStatusChange,
  onRecoverCorruptFile,
}: IncorporationDocxPreviewProps & { ref?: Ref<IncorporationDocxPreviewHandle> }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const [renderPhase, setRenderPhase] = useState<'loading' | 'ready'>('loading');
  const [renderError, setRenderError] = useState<IncorpDocPreviewError | null>(null);
  const [recovering, setRecovering] = useState(false);

  onDocumentChangeRef.current = onDocumentChange;
  onStatusChangeRef.current = onStatusChange;

  const docQuery = useQuery({
    queryKey: ['incorp-docx-preview', downloadUrl, refreshKey],
    queryFn: async ({ signal }) => {
      const res = await fetch(downloadUrl, {
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
    enabled: Boolean(downloadUrl),
    retry: false,
  });

  const queryError = docQuery.isError
    ? buildIncorpDocPreviewError(
        docQuery.error instanceof Error ? docQuery.error.message : 'Preview failed.',
        {
          httpStatus:
            docQuery.error instanceof Error && 'httpStatus' in docQuery.error
              ? (docQuery.error as Error & { httpStatus?: number }).httpStatus
              : undefined,
        },
      )
    : null;

  const status: 'loading' | 'ready' | 'error' =
    docQuery.isFetching || (!docQuery.data && !docQuery.isError)
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

  useImperativeHandle(ref, () => ({
    getDocumentContent() {
      const bodyEl = bodyRef.current;
      return bodyEl ? extractPreviewDocumentContent(bodyEl) : '';
    },
    toggleBold() {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return false;
      const applied = togglePreviewBold(bodyEl);
      if (applied) onDocumentChangeRef.current?.(extractPreviewDocumentContent(bodyEl));
      return applied;
    },
    setParagraphAlignment(alignment) {
      const bodyEl = bodyRef.current;
      if (!bodyEl) return false;
      const applied = setPreviewParagraphAlignment(bodyEl, alignment);
      if (applied) onDocumentChangeRef.current?.(extractPreviewDocumentContent(bodyEl));
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
    isReady() {
      return status === 'ready';
    },
  }));

  const handleRecover = async () => {
    if (!onRecoverCorruptFile) return;
    setRecovering(true);
    try {
      await onRecoverCorruptFile();
      setRenderPhase('loading');
      setRenderError(null);
    } finally {
      setRecovering(false);
    }
  };

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
          renderHeaders: true,
          renderFooters: true,
        });
        if (!cancelled) setRenderPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setRenderPhase('loading');
        setRenderError(
          buildIncorpDocPreviewError(err instanceof Error ? err.message : 'Preview failed.'),
        );
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
    if (status !== 'ready' || !editable || !bodyEl || !onDocumentChangeRef.current) return;
    return attachFullDocumentEditing(bodyEl, {
      onDocumentChange: (content) => onDocumentChangeRef.current?.(content),
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
            className="absolute inset-0 z-10 flex min-h-[280px] items-center justify-center bg-surface-raised text-ink-muted"
            aria-hidden={status !== 'loading'}
          >
            <HexgridLoader size="sm" message="Rendering document…" />
          </div>
        )}
        {status === 'error' && previewError && (
          <IncorporationPreviewErrorPanel
            error={previewError}
            previewLabel={previewLabel}
            downloadUrl={downloadUrl}
            onRecover={onRecoverCorruptFile ? handleRecover : undefined}
            recovering={recovering}
          />
        )}
        <div ref={styleRef} aria-hidden />
        <div
          ref={bodyRef}
          className={cn(INCORP_DOCX_PREVIEW_BODY_CLASSES, status === 'error' && 'hidden')}
          aria-busy={status === 'loading'}
          aria-hidden={status === 'error'}
        />
      </div>
    </div>
  );
}
