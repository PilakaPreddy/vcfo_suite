import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/shell/page-metadata';

/** The client page is never indexed and never sends its key on in a Referer header. */
export const publicReceivablesMetadata: Metadata = {
  ...pageMetadata('Receivables', 'The live receivables summary from SBC'),
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
