'use client';

import { useImperativeHandle, useState, type Ref } from 'react';
import { HexgridLoader } from '@/components/common/HexgridLoader';
import { useDocxPreview, type DocxPreviewBaseHandle } from '@/components/board-resolution/use-docx-preview';
import {
  buildIncorpDocPreviewError,
  type IncorpDocPreviewError,
} from '@/lib/incorporation-docs/preview-errors';
import { cn } from '@/lib/utils';
import { IncorporationPreviewErrorPanel } from '@/components/incorporation/IncorporationPreviewErrorPanel';
import { INCORP_DOCX_PREVIEW_BODY_CLASSES } from '@/components/incorporation/incorporation-doc-preview-classes';

export type IncorporationDocxPreviewHandle = DocxPreviewBaseHandle;

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
  const [recovering, setRecovering] = useState(false);

  const { bodyRef, styleRef, status, previewError, baseHandle, setRenderPhase, setRenderError } =
    useDocxPreview<IncorpDocPreviewError>({
      queryKeyPrefix: 'incorp-docx-preview',
      url: downloadUrl,
      refreshKey,
      editable,
      renderHeadersAndFooters: true,
      buildError: buildIncorpDocPreviewError,
      onDocumentChange,
      onStatusChange,
    });

  useImperativeHandle(ref, () => baseHandle);

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
