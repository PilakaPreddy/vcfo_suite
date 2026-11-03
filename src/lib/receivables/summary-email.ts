import { escapeHtml } from '@/lib/email/email-layout';
import { daysLeft, monthBlockTitle, monthLong, monthShort, sheetDate } from './dates';
import type { SnapshotRow } from './model';
import { isOpen, monthsOf, receivedThisWeek, sumInr } from './summary';

/**
 * RECEIVABLES SUMMARY EMAIL — the body of "RE: Receivables update", in the format SBC's finance
 * team already sends: the payments received, then one black-header table per invoice month with
 * Client, Due Date, Invoice Amount INR, No of Days Over Due and Remarks, received rows shaded green
 * with "Received", a month total of what is still open, and the total receivables. Built from a
 * published version only, so the email never shows draft edits. Inline styles, for Outlook.
 */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (n: number) => inr.format(Math.round(n));

const CELL = 'border:1px solid #333;padding:3px 8px;font-size:12px;font-family:Calibri,Arial,sans-serif;';
const HEAD = `${CELL}background:#000;color:#fff;font-weight:bold;text-align:center;`;
const TABLE = 'border-collapse:collapse;margin:10px 0;min-width:560px;';
const PAID_BG = 'background:#d9ead3;';

export type SummaryEmailInput = {
  rows: SnapshotRow[];
  today: string;
  liveUrl: string;
  signerName: string;
  /** Optional: only this partner's rows (a per-partner email). */
  partnerSlug?: string | null;
};

export function summaryEmailSubject(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  return `Receivables update - ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}

export function summaryEmailHtml(input: SummaryEmailInput): string {
  const rows = input.partnerSlug ? input.rows.filter((r) => r.partnerSlug === input.partnerSlug) : input.rows;
  const received = rows.filter((r) => receivedThisWeek(r, input.today));
  const paidItems = [...new Set(received.map((r) => `${r.clientName} - ${monthLong(r.invoiceMonth)}`))];
  const paidBlock = paidItems.length
    ? `<p>We have received the following payments:</p><ul>${paidItems
        .map((line) => {
          const [client, ...rest] = line.split(' - ');
          return `<li><b>${escapeHtml(client)}</b> - ${escapeHtml(rest.join(' - '))}</li>`;
        })
        .join('')}</ul>`
    : '<p>No new payments have been received since the last update.</p>';

  const tables = monthsOf(rows)
    .map((m) => {
      const list = rows
        .filter((r) => r.invoiceMonth === m && (isOpen(r) || receivedThisWeek(r, input.today)))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (!list.length) return '';
      const body = list
        .map((r) => {
          const bg = isOpen(r) ? '' : PAID_BG;
          const dl = daysLeft(r.dueDate, input.today);
          const overdue = isOpen(r) && dl < 0 ? String(-dl) : isOpen(r) ? '-' : '';
          return `<tr><td style="${CELL}${bg}">${escapeHtml(r.clientName)}</td><td style="${CELL}${bg}text-align:center">${sheetDate(r.dueDate)}</td><td style="${CELL}${bg}text-align:right">${money(isOpen(r) ? r.amountInr : r.paidAmount ?? r.amountInr)}</td><td style="${CELL}${bg}text-align:center">${overdue}</td><td style="${CELL}${bg}">${isOpen(r) ? '' : 'Received'}</td></tr>`;
        })
        .join('');
      const title = monthBlockTitle(m).replace(' Receivables', ' -Receivables');
      return `<table style="${TABLE}"><tr><td colspan="5" style="${HEAD}">${escapeHtml(title)}</td></tr><tr>${['Client', 'Due Date', 'Invoice Amount INR', 'No of Days Over Due', 'Remarks']
        .map((h) => `<td style="${CELL}font-weight:bold;text-align:center">${h}</td>`)
        .join('')}</tr>${body}<tr><td style="${CELL}font-weight:bold;text-align:center">${escapeHtml(monthShort(m))}- Receivables</td><td style="${CELL}"></td><td style="${CELL}font-weight:bold;text-align:right">${money(sumInr(list.filter(isOpen)))}</td><td style="${CELL}"></td><td style="${CELL}"></td></tr></table>`;
    })
    .join('');

  const total = sumInr(rows.filter(isOpen));
  return [
    '<p>Hi Team,</p>',
    paidBlock,
    '<p>Please find the receivable summary as of today:</p>',
    tables,
    `<table style="${TABLE}margin-top:0"><tr><td style="${CELL}font-weight:bold;text-align:center;width:40%">Total Receivables</td><td style="${CELL}font-weight:bold;text-align:right">${money(total)}</td></tr></table>`,
    `<p>Live view, always current: <a href="${escapeHtml(input.liveUrl)}">${escapeHtml(input.liveUrl.replace(/^https?:\/\//, ''))}</a></p>`,
    `<p>Regards,<br>${escapeHtml(input.signerName)}<br>SBC</p>`,
  ].join('');
}
