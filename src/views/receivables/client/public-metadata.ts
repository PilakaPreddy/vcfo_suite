import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/shell/page-metadata';

/**
 * The client partner pages (/receivables, /receivables/account) are never indexed and never send
 * their address (which can carry an invoice id) on in a Referer header.
 */
export const publicReceivablesMetadata: Metadata = {
  ...pageMetadata('Receivables', 'The live receivables summary from SBC'),
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
