import type { SnapshotRow } from './model';
import { diffPublishForPartners, type PartnerInvoiceChange } from './publish-alerts';

/**
 * RECEIVABLES VERSION COMPARE (Phase 10): what changed on the whole sheet between two published
 * versions, for "Compare with previous" on the Versions tab. It reuses the publish alert diff
 * (amount, status and due date, added and removed), run over the whole sheet rather than per
 * partner, and adds a partner change, which the per-partner diff reports as removed and added.
 */

export type VersionChange = Omit<PartnerInvoiceChange, 'fields'> & {
  fields: Array<PartnerInvoiceChange['fields'][number] | 'partner'>;
  partnerName: string | null;
  /** The value before, for a changed amount, due date or partner. */
  before: { amountInr: number; dueDate: string; partnerName: string | null } | null;
};

type Row = Pick<SnapshotRow, 'id' | 'partnerId' | 'partnerName' | 'clientName' | 'invoiceNo' | 'amountInr' | 'status' | 'dueDate'>;

const SHEET = 'sheet';

export function diffVersions(previous: readonly Row[], next: readonly Row[]): VersionChange[] {
  const before = new Map(previous.map((r) => [r.id, r]));
  const after = new Map(next.map((r) => [r.id, r]));
  const whole = (list: readonly Row[]) => list.map((r) => ({ ...r, partnerId: SHEET }));
  const base = diffPublishForPartners(whole(previous), whole(next)).get(SHEET) ?? [];
  const out: VersionChange[] = base.map((c) => {
    const old = before.get(c.invoiceId) ?? null;
    const now = after.get(c.invoiceId) ?? old;
    return {
      ...c,
      partnerName: now?.partnerName ?? null,
      before: c.kind === 'changed' && old ? { amountInr: old.amountInr, dueDate: old.dueDate, partnerName: old.partnerName } : null,
    };
  });
  // A partner change on an otherwise unchanged row, or on top of another change.
  for (const row of next) {
    const old = before.get(row.id);
    if (!old || (old.partnerId ?? null) === (row.partnerId ?? null)) continue;
    const hit = out.find((c) => c.invoiceId === row.id && c.kind === 'changed');
    if (hit) hit.fields.push('partner');
    else
      out.push({
        invoiceId: row.id,
        clientName: row.clientName,
        invoiceNo: row.invoiceNo,
        kind: 'changed',
        fields: ['partner'],
        amountInr: row.amountInr,
        dueDate: row.dueDate,
        status: row.status,
        partnerName: row.partnerName,
        before: { amountInr: old.amountInr, dueDate: old.dueDate, partnerName: old.partnerName },
      });
  }
  const order = { added: 0, changed: 1, removed: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.clientName.localeCompare(b.clientName));
}

/** "Marked received", "Amount ₹1,000 → ₹900", "Partner Priya → Rahul". */
export function describeVersionChange(c: VersionChange, money: (n: number) => string, date: (iso: string) => string): string[] {
  if (c.kind === 'added') return ['Added'];
  if (c.kind === 'removed') return ['Removed'];
  return c.fields.map((f) => {
    if (f === 'status') return c.status === 'received' ? 'Marked received' : 'Reopened';
    if (f === 'amount') return `Amount ${money(c.before?.amountInr ?? 0)} → ${money(c.amountInr)}`;
    if (f === 'dueDate') return `Due ${date(c.before?.dueDate ?? '')} → ${date(c.dueDate)}`;
    return `Partner ${c.before?.partnerName ?? 'none'} → ${c.partnerName ?? 'none'}`;
  });
}
