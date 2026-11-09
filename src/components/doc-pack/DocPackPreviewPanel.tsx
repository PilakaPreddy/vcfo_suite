'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Maximize2 } from 'lucide-react';

import { DocStatusChip } from '@/components/doc-pack/DocStatusChip';
import { IncorporationDocxPreview } from '@/components/incorporation/IncorporationDocxPreview';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tip';
import { getItem } from '@/data/checklist';
import { docPackRowName } from '@/lib/doc-pack/labels';
import type { DocPackItem } from '@/lib/doc-pack/types';
import { missingInputLabel } from '@/lib/doc-pack/unblock';
import { toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';

/**
 * Scales a full-size Word page down to the panel's width (the docx render is A4 wide), so the
 * preview shows the real file as a small page. The height follows the scaled content.
 */
function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ scale: number; height: number | undefined }>({ scale: 0.36, height: undefined });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const width = i.scrollWidth || 1;
      const scale = Math.min(1, o.clientWidth / width);
      setBox({ scale, height: Math.ceil(i.scrollHeight * scale) });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="w-full overflow-hidden" style={{ height: box.height }}>
      <div ref={inner} className="w-max origin-top-left" style={{ transform: `scale(${box.scale})` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * The always-open preview card of the document pack (prototype `DocumentPackScreen` Preview, 380px
 * from xl, under the list below xl). A ready document renders from the same route that downloads
 * it; a document that is not ready shows what it waits for, because the route serves only ready
 * files. "Download as Word" and "Open step" (the document's first source step) sit under the page.
 */
export function DocPackPreviewPanel({
  item,
  previewUrl,
  downloadUrl,
  stepHref,
  onExpand,
  className,
}: {
  item: DocPackItem | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  stepHref: string | null;
  /** Opens the large preview dialog. */
  onExpand?: () => void;
  className?: string;
}) {
  const ready = item?.status === 'ready';
  const name = item ? docPackRowName(item) : null;
  const waitsOn = item?.blockedBy ? getItem(item.blockedBy.stepId)?.title ?? item.blockedBy.stepId : null;

  return (
    <section
      className={cn('grid min-w-0 gap-3 rounded-md border-1.5 border-line bg-surface-raised p-4', className)}
      aria-label="Preview"
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-[15px] font-medium text-ink">Preview</h2>
        {item ? <DocStatusChip status={item.status} /> : null}
        <span className="ml-auto min-w-0 truncate text-[12.5px] text-ink-muted">{name ?? ''}</span>
        {ready && onExpand ? (
          <Tip label="Open large">
            <Button type="button" variant="ghost" size="iconSm" className="h-7 w-7 flex-none" aria-label="Open large preview" onClick={onExpand}>
              <Maximize2 strokeWidth={1.6} aria-hidden />
            </Button>
          </Tip>
        ) : null}
      </div>

      <div className="max-h-[440px] overflow-y-auto rounded-md bg-surface-sunken p-4">
        {item && ready && previewUrl ? (
          <FitToWidth>
            <IncorporationDocxPreview downloadUrl={previewUrl} previewLabel={name ?? 'Document'} refreshKey={item.key} className="rounded-sm shadow-none" />
          </FitToWidth>
        ) : (
          <div className="mx-auto grid aspect-[3/4] w-full max-w-[300px] content-center gap-2 rounded-sm border-fine bg-surface-raised p-5 text-center text-[13px] text-ink-muted">
            {!item ? (
              <span>No document picked</span>
            ) : item.missing.length > 0 ? (
              <>
                <b className="font-medium text-ink">
                  {item.missing.length} {item.missing.length === 1 ? 'field' : 'fields'} missing
                </b>
                <ul className="grid gap-0.5 text-[12.5px]">
                  {item.missing.slice(0, 6).map((input) => (
                    <li key={input.key} className="truncate">
                      {missingInputLabel(input)}
                    </li>
                  ))}
                  {item.missing.length > 6 ? <li>and {item.missing.length - 6} more</li> : null}
                </ul>
              </>
            ) : waitsOn ? (
              <>
                <b className="font-medium text-ink">Waiting for release</b>
                <span className="text-[12.5px]">{waitsOn}</span>
              </>
            ) : (
              <span>{name}</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ready && downloadUrl ? (
          <Button variant="secondary" asChild>
            <a href={downloadUrl} download onClick={() => toastSuccess(`Downloading ${name} as Word`)}>
              Download as Word
            </a>
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled>
            Download as Word
          </Button>
        )}
        {stepHref ? (
          <Button variant="secondary" asChild>
            <Link href={stepHref}>Open step</Link>
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled>
            Open step
          </Button>
        )}
      </div>
    </section>
  );
}
