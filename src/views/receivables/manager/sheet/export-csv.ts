import { monthLong, sheetDate } from '@/lib/receivables/dates';
import type { Partner, SheetInvoice } from '@/lib/receivables/model';
import { statusText } from '../../format';

/**
 * Export selected (Phase 10): the picked rows of the draft as a CSV that Excel opens (UTF-8 with
 * a byte-order mark, dates as `02-Nov-26`, amounts as plain numbers).
 */

const HEAD = ['Client', 'Invoice no.', 'Client partner', 'Invoice month', 'Due date', 'Currency', 'Foreign amount', 'Booked rate', 'Amount INR', 'Status', 'Paid on', 'Paid INR'];

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function invoicesCsv(rows: SheetInvoice[], partners: Pick<Partner, 'id' | 'name'>[], today: string): string {
  const names = new Map(partners.map((p) => [p.id, p.name]));
  const lines = rows.map((r) =>
    [
      r.clientName,
      r.invoiceNo,
      r.partnerId ? (names.get(r.partnerId) ?? '') : '',
      monthLong(r.invoiceMonth),
      sheetDate(r.dueDate),
      r.currency ?? 'INR',
      r.fcAmount ?? '',
      r.fxRate ?? '',
      r.amountInr,
      statusText(r, today).text,
      sheetDate(r.paidOn),
      r.paidAmount ?? '',
    ]
      .map(cell)
      .join(','),
  );
  return [HEAD.join(','), ...lines].join('\r\n');
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(name: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
