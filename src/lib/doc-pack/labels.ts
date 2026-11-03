import type { DocPackItem, DocStatus } from '@/lib/doc-pack/types';

/** UI strings and tones for pack status — shared by the page, the rail card and the strip. */

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  ready: 'Ready',
  'needs-inputs': 'Needs inputs',
  'waiting-release': 'Waiting for release',
};

/** Colour lives on chips and dots only, never on rows or page fill. Teal = ready, coral = needs inputs, slate = waiting. */
const DOC_STATUS_CHIP_TONE: Record<DocStatus, string> = {
  ready: 'bg-success-light text-success-text',
  'needs-inputs': 'bg-warning-light text-warning-text',
  'waiting-release': 'bg-muted text-muted-foreground',
};

const DOC_STATUS_DOT_TONE: Record<DocStatus, string> = {
  ready: 'bg-success',
  'needs-inputs': 'bg-warning',
  'waiting-release': 'bg-muted-foreground',
};

export function docPackRowName(item: Pick<DocPackItem, 'label' | 'directorName'>): string {
  return item.directorName ? `${item.label} · ${item.directorName}` : item.label;
}
