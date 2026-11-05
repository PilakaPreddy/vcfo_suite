import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { sheetDate } from './dates';
import type { SnapshotRow } from './model';

/**
 * RECEIVABLES PUBLISH ALERTS (Phase 8). After an Update, each client partner who asked for it
 * gets a short email listing their invoices that changed between the previous published version
 * and the new one. This file is pure: the diff and the email text. The sending is in
 * `src/db/repositories/receivables/versions.ts`, after the publish, and never blocks it.
 */

export type ChangedField = 'amount' | 'status' | 'dueDate';

export type PartnerInvoiceChange = {
  invoiceId: string;
  clientName: string;
  invoiceNo: string | null;
  /** added: new on the partner's list; removed: gone from it; changed: amount, status or due date moved. */
  kind: 'added' | 'removed' | 'changed';
  fields: ChangedField[];
  amountInr: number;
  dueDate: string;
  status: SnapshotRow['status'];
};

type Row = Pick<SnapshotRow, 'id' | 'partnerId' | 'clientName' | 'invoiceNo' | 'amountInr' | 'status' | 'dueDate'>;

function change(row: Row, kind: PartnerInvoiceChange['kind'], fields: ChangedField[] = []): PartnerInvoiceChange {
  return { invoiceId: row.id, clientName: row.clientName, invoiceNo: row.invoiceNo, kind, fields, amountInr: row.amountInr, dueDate: row.dueDate, status: row.status };
}

/** Amounts are compared to the paisa, so a rounding difference in `numeric` is not a change. */
const sameAmount = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

/**
 * The changed invoices of each partner, keyed by partner id. An invoice moved from one partner to
 * another counts as removed for the first and added for the second. Rows with no partner are
 * skipped. A partner with no change has no entry.
 */
export function diffPublishForPartners(previous: readonly Row[], next: readonly Row[]): Map<string, PartnerInvoiceChange[]> {
  const out = new Map<string, PartnerInvoiceChange[]>();
  const push = (partnerId: string | null, c: PartnerInvoiceChange) => {
    if (!partnerId) return;
    const list = out.get(partnerId) ?? [];
    list.push(c);
    out.set(partnerId, list);
  };
  const before = new Map(previous.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const row of next) {
    seen.add(row.id);
    const old = before.get(row.id);
    if (!old) {
      push(row.partnerId, change(row, 'added'));
      continue;
    }
    if (old.partnerId !== row.partnerId) {
      push(old.partnerId, change(old, 'removed'));
      push(row.partnerId, change(row, 'added'));
      continue;
    }
    const fields: ChangedField[] = [];
    if (!sameAmount(old.amountInr, row.amountInr)) fields.push('amount');
    if (old.status !== row.status) fields.push('status');
    if (old.dueDate !== row.dueDate) fields.push('dueDate');
    if (fields.length) push(row.partnerId, change(row, 'changed', fields));
  }
  for (const old of previous) if (!seen.has(old.id)) push(old.partnerId, change(old, 'removed'));
  return out;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** One line per invoice: "Duravant SC/09/03 · ₹64,56,984 · due 16-Oct-26 · marked received". */
export function describeChange(c: PartnerInvoiceChange): string {
  const label = c.invoiceNo ? `${c.clientName} ${c.invoiceNo}` : c.clientName;
  const what =
    c.kind === 'added'
      ? 'added'
      : c.kind === 'removed'
        ? 'removed from your list'
        : c.fields
            .map((f) => (f === 'status' ? (c.status === 'received' ? 'marked received' : 'reopened') : f === 'amount' ? 'amount changed' : 'due date changed'))
            .join(', ');
  return `${label} · ₹${inr.format(Math.round(c.amountInr))} · due ${sheetDate(c.dueDate)} · ${what}`;
}

export type PublishAlertEmail = { subject: string; html: string; text: string };

export function publishAlertEmail(input: { partnerName: string; clientOrgName: string; changes: PartnerInvoiceChange[]; url: string }): PublishAlertEmail {
  const n = input.changes.length;
  const subject = `Receivables updated: ${n === 1 ? 'one' : n} of your invoices changed`;
  const lines = input.changes.map(describeChange);
  const first = input.partnerName.split(' ')[0] || input.partnerName;
  const html = renderEmailDocument({
    brand: 'sbc',
    eyebrow: input.clientOrgName,
    title: 'Your receivables were updated',
    bodyHtml:
      emailParagraph(`Dear ${escapeHtml(first)},`) +
      emailParagraph(`SBC published an update to the ${escapeHtml(input.clientOrgName)} receivables. These invoices of yours changed:`) +
      `<ul style="margin:0 0 14px;padding-left:20px;">${lines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join('')}</ul>`,
    cta: { label: 'Open your receivables', href: input.url },
    footerNote: 'You get this email when SBC publishes a change to your invoices.',
  });
  const text = [`Dear ${first},`, '', `SBC published an update to the ${input.clientOrgName} receivables. These invoices of yours changed:`, '', ...lines.map((l) => `- ${l}`), '', `Open your receivables: ${input.url}`].join('\n');
  return { subject, html, text };
}
