import type { DocPackItem, DocStatus } from '@/lib/doc-pack/types';

/** UI strings and tones for pack status — shared by the page, the rail card and the strip. */

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  ready: 'Ready',
  'needs-inputs': 'Needs inputs',
  'waiting-release': 'Waiting for release',
};

export function docPackRowName(item: Pick<DocPackItem, 'label' | 'directorName'>): string {
  return item.directorName ? `${item.label} · ${item.directorName}` : item.label;
}
