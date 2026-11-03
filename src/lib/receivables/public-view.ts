import type { SnapshotRow } from './model';
import { isOpen, monthsOf, receivedThisWeek, sheetTotals, type SheetTotals } from './summary';

/**
 * RECEIVABLES PUBLIC VIEW — what the client page shows for one partner (or all): the open
 * invoices by month, oldest due first, the receipts of the last seven days, and the totals. Built
 * only from a published snapshot.
 */

export type PublicView = {
  months: Array<{ month: string; rows: SnapshotRow[] }>;
  received: SnapshotRow[];
  totals: SheetTotals;
};

/** Rows of one partner; an unknown slug shows nothing rather than everything. */
export function rowsForPartner(rows: SnapshotRow[], partnerSlug: string | null): SnapshotRow[] {
  return partnerSlug ? rows.filter((r) => r.partnerSlug === partnerSlug) : rows;
}

export function publicView(rows: SnapshotRow[], partnerSlug: string | null, today: string): PublicView {
  const mine = rowsForPartner(rows, partnerSlug);
  const open = mine.filter(isOpen);
  return {
    months: monthsOf(open)
      .map((month) => ({ month, rows: open.filter((r) => r.invoiceMonth === month).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }))
      .filter((m) => m.rows.length),
    received: mine.filter((r) => receivedThisWeek(r, today)).sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? '')),
    totals: sheetTotals(mine, today),
  };
}

/** `?partner=` is honoured only when it names a partner in the snapshot. */
export function validPartner(slug: string | null | undefined, partners: Array<{ slug: string }>): string | null {
  return slug && partners.some((p) => p.slug === slug) ? slug : null;
}
