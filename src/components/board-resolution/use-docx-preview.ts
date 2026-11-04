'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  attachFullDocumentEditing,
  extractPreviewDocumentContent,
  getPreviewFormatSelectionState,
  setPreviewParagraphAlignment,
  togglePreviewBold,
  type PreviewFormatSelectionState,
  type PreviewTextAlignment,
} from '@/lib/board-resolution/board-resolution-preview-editable';

export type DocxPreviewStatus = 'loading' | 'ready' | 'error';

/** The editing methods both Word previews expose through their imperative handles. */
export type DocxPreviewBaseHandle = {
  getDocumentContent: () => string;
  toggleBold: () => boolean;
  setParagraphAlignment: (alignment: PreviewTextAlignment) => boolean;
  getFormatSelectionState: () => PreviewFormatSelectionState;
  isReady: () => boolean;
};

type UseDocxPreviewOptions<E> = {
  queryKeyPrefix: string;
  url: string;
  refreshKey?: string | number | null;
  editable: boolean;
  renderHeadersAndFooters: boolean;
  buildError: (raw: string, options?: { httpStatus?: number }) => E;
  onDocumentChange?: (content: string) => void;
  onStatusChange?: (status: DocxPreviewStatus) => void;
  /** Runs after docx-preview has rendered the body and before the preview is marked ready. */
  onRendered?: (bodyEl: HTMLDivElement) => void;
  /** Runs when rendering fails; return true when the failure was handled and no error should show. */
  onRenderError?: (error: E, isCancelled: () => boolean) => Promise<boolean>;
};

/**
 * Fetches a .docx as a blob, renders it with docx-preview into `bodyRef`, and tracks the
 * loading, ready and error states that the board resolution and incorporation previews share.
 */
export function useDocxPreview<E>({
  queryKeyPrefix,
  url,
  refreshKey,
  editable,
  renderHeadersAndFooters,
  buildError,
  onDocumentChange,
  onStatusChange,
  onRendered,
  onRenderError,
}: UseDocxPreviewOptions<E>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const onRenderedRef = useRef(onRendered);
  const onRenderErrorRef = useRef(onRenderError);
  const [renderPhase, setRenderPhase] = useState<'loading' | 'ready'>('loading');
  const [renderError, setRenderError] = useState<E | null>(null);

  onDocumentChangeRef.current = onDocumentChange;
  onStatusChangeRef.current = onStatusChange;
  onRenderedRef.current = onRendered;
  onRenderErrorRef.current = onRenderError;

  const docQuery = useQuery({
    queryKey: [queryKeyPrefix, url, refreshKey],
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
    ? buildError(
        docQuery.error instanceof Error ? docQuery.error.message : 'Preview failed.',
        {
          httpStatus:
            docQuery.error instanceof Error && 'httpStatus' in docQuery.error
              ? (docQuery.error as Error & { httpStatus?: number }).httpStatus
              : undefined,
        },
      )
    : null;

  const status: DocxPreviewStatus =
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

  const baseHandle: DocxPreviewBaseHandle = {
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
          renderHeaders: renderHeadersAndFooters,
          renderFooters: renderHeadersAndFooters,
        });

        if (cancelled) return;
        onRenderedRef.current?.(bodyEl);
        setRenderPhase('ready');
        setRenderError(null);
      } catch (err) {
        if (cancelled) return;
        const built = buildError(err instanceof Error ? err.message : 'Preview failed.');
        const handled = await onRenderErrorRef.current?.(built, () => cancelled);
        if (handled) return;
        setRenderPhase('loading');
        setRenderError(built);
      }
    })();

    return () => {
      cancelled = true;
      bodyEl.innerHTML = '';
      styleEl.innerHTML = '';
    };
    // The render reruns only for a new blob; options are read through refs or are fixed per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docQuery.data]);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (status !== 'ready' || !editable || !bodyEl || !onDocumentChangeRef.current) return;
    return attachFullDocumentEditing(bodyEl, {
      onDocumentChange: (content) => onDocumentChangeRef.current?.(content),
    });
  }, [status, editable]);

  return {
    bodyRef,
    styleRef,
    status,
    queryError,
    previewError,
    baseHandle,
    onDocumentChangeRef,
    setRenderPhase,
    setRenderError,
  };
}
