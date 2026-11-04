import { diffPublishForPartners, type PartnerInvoiceChange } from '@/lib/receivables/publish-alerts';
import type { PartnerRowDto } from '@/lib/receivables/partner-wire';

/**
 * "What changed since your last visit" on the client partner's page (Phase 10). The page keeps
 * the published version it last showed this partner in the browser's localStorage, one entry
 * per partner email: the publish stamp and a compact copy of each row. When SBC has published
 * since, the rows are compared with the publish alert diff (src/lib/receivables/publish-alerts.ts)
 * and the page lists what moved. It is a per-viewer convenience: another browser or a cleared
 * storage simply starts again, and every read and write is wrapped so a blocked storage never
 * breaks the page.
 */

type SeenRow = Pick<PartnerRowDto, 'id' | 'clientName' | 'invoiceNo' | 'amountInr' | 'status' | 'dueDate'>;
export type SeenState = { publishedAt: string; rows: SeenRow[] };

const KEY = 'vcfo:rcv-partner-seen:';
/** The diff works per partner; every row on this page is the viewer's own. */
const ME = 'me';

export function seenKey(email: string): string {
  return `${KEY}${email.trim().toLowerCase()}`;
}

export function seenFrom(publishedAt: string, rows: readonly PartnerRowDto[]): SeenState {
  return { publishedAt, rows: rows.map((r) => ({ id: r.id, clientName: r.clientName, invoiceNo: r.invoiceNo, amountInr: r.amountInr, status: r.status, dueDate: r.dueDate })) };
}

/** What changed between the stored visit and now; empty when nothing was stored or nothing was published since. */
export function changesSince(before: SeenState | null, publishedAt: string, rows: readonly PartnerRowDto[]): PartnerInvoiceChange[] {
  if (!before || before.publishedAt === publishedAt) return [];
  const tag = (list: readonly SeenRow[]) => list.map((r) => ({ ...r, partnerId: ME }));
  return diffPublishForPartners(tag(before.rows), tag(seenFrom(publishedAt, rows).rows)).get(ME) ?? [];
}

function isSeenState(v: unknown): v is SeenState {
  return Boolean(v) && typeof (v as SeenState).publishedAt === 'string' && Array.isArray((v as SeenState).rows);
}

export function readSeen(email: string): SeenState | null {
  try {
    const raw = window.localStorage.getItem(seenKey(email));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isSeenState(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeSeen(email: string, state: SeenState): void {
  try {
    window.localStorage.setItem(seenKey(email), JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: the highlight just does not carry over.
  }
}

/** "Added", "Received", "Amount changed" and so on: the short word a changed row carries. */
export function changeWord(c: PartnerInvoiceChange): string {
  if (c.kind === 'added') return 'New';
  if (c.kind === 'removed') return 'Removed';
  if (c.fields.includes('status')) return c.status === 'received' ? 'Received' : 'Reopened';
  if (c.fields.includes('amount')) return 'Amount changed';
  return 'Due date moved';
}
