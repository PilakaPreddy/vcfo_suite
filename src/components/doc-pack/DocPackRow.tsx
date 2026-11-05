'use client';

import { sep } from '@/lib/date-format';
import { Download, Eye } from 'lucide-react';

import { getItem } from '@/data/checklist';
import { DocStatusChip } from '@/components/doc-pack/DocStatusChip';
import { Button } from '@/components/ui/button';
import { FileBadge, fileType, type FileType } from '@/components/ui/file-badge';
import { Tip } from '@/components/ui/tip';
import { docPackRowName } from '@/lib/doc-pack/labels';
import type { DocPackItem } from '@/lib/doc-pack/types';
import { toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';

export type DocPackRowProps = {
  item: DocPackItem;
  downloadUrl: string;
  onPreview: (item: DocPackItem) => void;
  /** The row shown in the preview panel gets a soft blurple fill. */
  picked?: boolean;
};

function stepTitle(stepId: string): string {
  return getItem(stepId)?.title ?? stepId;
}

/** The short step code the prototype writes in the sub line: `pre-8` reads "Pre-8". */
function docPackStepCode(stepId: string): string {
  return stepId.charAt(0).toUpperCase() + stepId.slice(1);
}

function formatAttachedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return sep(date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
}

/** The file type of a pack document: an attached file keeps its own type, a generated one is Word. */
function docPackFileType(item: Pick<DocPackItem, 'source' | 'storagePath'>): FileType {
  if (item.source === 'attached' && item.storagePath?.includes('.')) return fileType(item.storagePath);
  return 'DOCX';
}

/** "Generated now", "Finalized 9 Oct" or "Attached to Pre-7 · 9 Oct"; nothing until the file is ready. */
function docPackProvenance(item: DocPackItem): string | null {
  if (item.status !== 'ready') return null;
  if (item.source !== 'attached') return 'Generated now';
  const when = item.attachedAt ? formatAttachedAt(item.attachedAt) : null;
  if (item.docId === 'board-resolution') return when ? `Finalized ${when}` : 'Finalized';
  return when ? `Attached to Pre-7 · ${when}` : 'Attached to Pre-7';
}

/** The sub line: one source step code, then the count of missing fields, what releases it, or its source steps. */
function subLine(item: DocPackItem): string {
  const stepId = item.missing[0]?.stepId ?? item.blockedBy?.stepId ?? item.sourceStepIds[0];
  const code = stepId ? docPackStepCode(stepId) : '';
  const note =
    item.missing.length > 0
      ? `${item.missing.length} ${item.missing.length === 1 ? 'field' : 'fields'} missing`
      : item.blockedBy
        ? `released after ${stepTitle(item.blockedBy.stepId)}`
        : item.sourceStepIds.map(stepTitle).join(' · ');
  return code ? `${code} · ${note}` : note;
}

/**
 * One document of the pack (prototype `DocumentPackScreen` row): file badge, name and sub line,
 * the provenance, the status chip, and two icon buttons. What a document waits for is in the
 * preview card, whose "Open step" goes to the first missing input.
 */
export function DocPackRow({ item, downloadUrl, onPreview, picked = false }: DocPackRowProps) {
  const ready = item.status === 'ready';
  const name = docPackRowName(item);
  const provenance = docPackProvenance(item);

  return (
    <li
      className={cn(
        'grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-4 py-2.5 md:grid-cols-[44px_minmax(0,1fr)_120px_150px_68px] md:px-5',
        picked && 'bg-brand-soft',
      )}
      aria-current={picked ? 'true' : undefined}
    >
      <FileBadge type={docPackFileType(item)} />
      <div className="min-w-0">
        <p className={cn('truncate text-[14px] font-medium', ready ? 'text-ink' : 'text-ink-2')}>{name}</p>
        <span className="block truncate text-[12.5px] text-ink-muted" title={`from ${item.sourceStepIds.map(stepTitle).join(' · ')}`}>
          {subLine(item)}
        </span>
        <span className="mt-1 block md:hidden">
          <DocStatusChip status={item.status} />
        </span>
      </div>

      <span className="hidden truncate text-[13px] text-ink-muted md:block">{provenance ?? '-'}</span>
      <span className="hidden md:block">
        <DocStatusChip status={item.status} />
      </span>

      <div className="flex gap-1 self-start md:self-center">
        <Tip label="Preview">
          <Button
            type="button"
            variant="outline"
            size="iconSm"
            className="h-7 w-7"
            aria-pressed={picked}
            onClick={() => onPreview(item)}
            aria-label={`Preview ${name}`}
          >
            <Eye strokeWidth={1.6} aria-hidden />
          </Button>
        </Tip>
        {ready ? (
          <Tip label="Download as Word">
            <Button variant="outline" size="iconSm" className="h-7 w-7" asChild>
              <a
                href={downloadUrl}
                download
                aria-label={`Download ${name} as Word`}
                onClick={() => toastSuccess(`Downloading ${name} as Word`)}
              >
                <Download strokeWidth={1.6} aria-hidden />
              </a>
            </Button>
          </Tip>
        ) : (
          <Button type="button" variant="outline" size="iconSm" className="h-7 w-7" disabled aria-label={`Download ${name} as Word`}>
            <Download strokeWidth={1.6} aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}
