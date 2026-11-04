import { toastError, toastSuccess } from '@/lib/toast-errors';
import type { ShareLinkDto } from '@/lib/receivables/share-wire';

/** The WhatsApp text of a shared view; used by the share dialog's last step. */
export function shareMessage(link: Pick<ShareLinkDto, 'name' | 'url'>): string {
  return `${link.name}: receivables from SBC. ${link.url}`;
}

/** Copies a link and says so; the Links tab and the dialog use it. */
export async function copyShareLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toastSuccess('Link copied', url);
  } catch {
    toastError('Could not copy', url);
  }
}
