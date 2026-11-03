import { emailCallout, emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { addDaysIso, daysLeft, sheetDate } from './dates';
import type { SheetInvoice } from './model';

/**
 * RECEIVABLES MONDAY DIGEST (Phase 10, docs/specs/receivables/PLAN.md): one email per sheet to
 * its manager on Monday morning. Pure: the job (src/jobs/receivables-digest.ts) loads the live
 * draft and the reminder log and sends what this file builds.
 *
 * Sections: collected last week (the seven days before today), overdue now (the five largest),
 * promises falling due this week, invoices falling due this week, reminders that failed in the
 * last seven days, and the changes waiting for an Update. A sheet with none of these and no open
 * invoice gets no email.
 */

export type DigestInvoice = Pick<SheetInvoice, 'id' | 'clientName' | 'invoiceNo' | 'dueDate' | 'amountInr' | 'status' | 'paidOn' | 'paidAmount'> & {
  promisedOn: string | null;
  partnerName: string | null;
  /** True while a dispute is open; the overdue list says so. */
  disputed?: boolean;
};

export type DigestFailedReminder = { clientName: string; invoiceNo: string | null; forDate: string; toEmail: string | null; error: string | null };

export type DigestInput = {
  sheetName: string;
  clientOrgName: string;
  managerName: string;
  /** The Monday the digest goes out, `YYYY-MM-DD` in India time. */
  today: string;
  invoices: DigestInvoice[];
  failedReminders: DigestFailedReminder[];
  unpublishedChanges: number;
  /** When the last Update went out; null when nothing is published. */
  lastPublishedAt: string | null;
  /** The manager page of this sheet. */
  url: string;
};

type Line = { label: string; amountInr: number; note: string };

export type ReceivablesDigest = {
  weekFrom: string;
  weekTo: string;
  collected: { count: number; inr: number; lines: Line[] };
  overdue: { count: number; inr: number; top: Line[] };
  promises: Line[];
  dueThisWeek: { count: number; inr: number; lines: Line[] };
  failedReminders: DigestFailedReminder[];
  unpublishedChanges: number;
  openInr: number;
  /** True when there is nothing to tell the manager. */
  empty: boolean;
};

export const DIGEST_TOP_OVERDUE = 5;

const label = (r: Pick<DigestInvoice, 'clientName' | 'invoiceNo'>) => (r.invoiceNo ? `${r.clientName} ${r.invoiceNo}` : r.clientName);
const sum = (list: Array<{ amountInr: number }>) => list.reduce((s, r) => s + (Number(r.amountInr) || 0), 0);
const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const digestInr = (n: number) => `₹${fmt.format(Math.round(n))}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function buildReceivablesDigest(input: DigestInput): ReceivablesDigest {
  const { today } = input;
  const weekFrom = addDaysIso(today, -7);
  const weekTo = addDaysIso(today, -1);
  const weekEnd = addDaysIso(today, 6);
  const open = input.invoices.filter((r) => r.status === 'open');

  const paid = input.invoices
    .filter((r) => r.status === 'received' && r.paidOn && r.paidOn >= weekFrom && r.paidOn <= weekTo)
    .sort((a, b) => (a.paidOn ?? '').localeCompare(b.paidOn ?? ''));
  const collectedLines = paid.map((r) => ({ label: label(r), amountInr: r.paidAmount ?? r.amountInr, note: `on ${sheetDate(r.paidOn)}` }));

  const overdue = open.filter((r) => daysLeft(r.dueDate, today) < 0).sort((a, b) => b.amountInr - a.amountInr || a.dueDate.localeCompare(b.dueDate));
  const top = overdue.slice(0, DIGEST_TOP_OVERDUE).map((r) => ({
    label: label(r),
    amountInr: r.amountInr,
    note: `${plural(-daysLeft(r.dueDate, today), 'day')} overdue${r.promisedOn ? ` · promised ${sheetDate(r.promisedOn)}` : ''}${r.disputed ? ' · disputed' : ''}`,
  }));

  const promises = open
    .filter((r) => r.promisedOn && r.promisedOn >= today && r.promisedOn <= weekEnd)
    .sort((a, b) => (a.promisedOn ?? '').localeCompare(b.promisedOn ?? ''))
    .map((r) => ({ label: label(r), amountInr: r.amountInr, note: `promised ${sheetDate(r.promisedOn)}${r.partnerName ? ` by ${r.partnerName}` : ''}` }));

  const due = open.filter((r) => r.dueDate >= today && r.dueDate <= weekEnd).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueLines = due.map((r) => ({ label: label(r), amountInr: r.amountInr, note: `due ${sheetDate(r.dueDate)}` }));

  const empty = !open.length && !paid.length && !input.failedReminders.length && input.unpublishedChanges === 0;
  return {
    weekFrom,
    weekTo,
    collected: { count: paid.length, inr: sum(collectedLines), lines: collectedLines },
    overdue: { count: overdue.length, inr: sum(overdue), top },
    promises,
    dueThisWeek: { count: due.length, inr: sum(due), lines: dueLines },
    failedReminders: input.failedReminders,
    unpublishedChanges: input.unpublishedChanges,
    openInr: sum(open),
    empty,
  };
}

export type DigestEmail = { subject: string; html: string; text: string };

const H = 'margin:22px 0 8px;font-size:13px;font-weight:600;color:#0F172A;';
const TABLE = 'width:100%;border-collapse:collapse;margin:0 0 6px;font-size:13px;';
const TD = 'padding:7px 10px;border-top:1px solid #E2E8F0;vertical-align:top;';

function tableHtml(lines: Line[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="${TABLE}">${lines
    .map(
      (l) =>
        `<tr><td style="${TD}color:#0F172A;">${escapeHtml(l.label)}<div style="font-size:12px;color:#64748B;">${escapeHtml(l.note)}</div></td><td style="${TD}text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;">${escapeHtml(digestInr(l.amountInr))}</td></tr>`,
    )
    .join('')}</table>`;
}

function none(text: string): string {
  return `<p style="margin:0 0 6px;font-size:13px;color:#64748B;">${escapeHtml(text)}</p>`;
}

/** The Monday email. Returns null when the digest is empty (nothing to send). */
export function receivablesDigestEmail(input: DigestInput, d: ReceivablesDigest = buildReceivablesDigest(input)): DigestEmail | null {
  if (d.empty) return null;
  const first = input.managerName.trim().split(/\s+/)[0] || input.managerName;
  const subject = `Receivables this week · ${input.clientOrgName}: ${digestInr(d.overdue.inr)} overdue, ${digestInr(d.collected.inr)} collected`;
  const week = `${sheetDate(d.weekFrom)} to ${sheetDate(d.weekTo)}`;

  const sections: Array<{ title: string; html: string; text: string[] }> = [
    {
      title: `Collected last week · ${digestInr(d.collected.inr)}`,
      html: d.collected.lines.length ? tableHtml(d.collected.lines) : none(`Nothing was marked received from ${week}.`),
      text: d.collected.lines.length ? d.collected.lines.map((l) => `- ${l.label}: ${digestInr(l.amountInr)} ${l.note}`) : [`Nothing was marked received from ${week}.`],
    },
    {
      title: `Overdue now · ${digestInr(d.overdue.inr)} on ${plural(d.overdue.count, 'invoice')}`,
      html: d.overdue.top.length
        ? tableHtml(d.overdue.top) + (d.overdue.count > d.overdue.top.length ? none(`The ${d.overdue.top.length} largest are shown.`) : '')
        : none('Nothing is overdue.'),
      text: d.overdue.top.length ? d.overdue.top.map((l) => `- ${l.label}: ${digestInr(l.amountInr)}, ${l.note}`) : ['Nothing is overdue.'],
    },
    {
      title: 'Promises due this week',
      html: d.promises.length ? tableHtml(d.promises) : none('No client promised a payment date this week.'),
      text: d.promises.length ? d.promises.map((l) => `- ${l.label}: ${digestInr(l.amountInr)}, ${l.note}`) : ['None.'],
    },
    {
      title: `Due this week · ${digestInr(d.dueThisWeek.inr)}`,
      html: d.dueThisWeek.lines.length ? tableHtml(d.dueThisWeek.lines) : none('No invoice falls due this week.'),
      text: d.dueThisWeek.lines.length ? d.dueThisWeek.lines.map((l) => `- ${l.label}: ${digestInr(l.amountInr)}, ${l.note}`) : ['None.'],
    },
  ];
  if (d.failedReminders.length) {
    const lines = d.failedReminders.map((f) => ({
      label: f.invoiceNo ? `${f.clientName} ${f.invoiceNo}` : f.clientName,
      note: `${sheetDate(f.forDate)} · ${f.toEmail ?? 'no email'}${f.error ? ` · ${f.error}` : ''}`,
    }));
    sections.push({
      title: `Reminders that failed · ${d.failedReminders.length}`,
      html: `<table role="presentation" cellpadding="0" cellspacing="0" style="${TABLE}">${lines
        .map((l) => `<tr><td style="${TD}">${escapeHtml(l.label)}<div style="font-size:12px;color:#B91C1C;">${escapeHtml(l.note)}</div></td></tr>`)
        .join('')}</table>`,
      text: lines.map((l) => `- ${l.label}: ${l.note}`),
    });
  }

  const waiting = d.unpublishedChanges
    ? `${plural(d.unpublishedChanges, 'change')} ${d.unpublishedChanges === 1 ? 'is' : 'are'} waiting for an Update, so client partners do not see ${d.unpublishedChanges === 1 ? 'it' : 'them'} yet.`
    : null;
  const html = renderEmailDocument({
    brand: 'sbc',
    eyebrow: input.clientOrgName,
    title: 'Your receivables this week',
    bodyHtml:
      emailParagraph(`Good morning ${escapeHtml(first)},`) +
      emailParagraph(`Here is ${escapeHtml(input.sheetName)} for the week. ${escapeHtml(digestInr(d.openInr))} is open in total.`) +
      (waiting ? emailCallout(escapeHtml(waiting)) : '') +
      sections.map((s) => `<h3 style="${H}">${escapeHtml(s.title)}</h3>${s.html}`).join(''),
    cta: { label: 'Open the sheet', href: input.url },
    footerNote: 'You get this every Monday for each sheet you manage. Turn it off in the sheet’s Reminders tab.',
  });
  const text = [
    `Good morning ${first},`,
    '',
    `Here is ${input.sheetName} for the week. ${digestInr(d.openInr)} is open in total.`,
    ...(waiting ? ['', waiting] : []),
    ...sections.flatMap((s) => ['', s.title, ...s.text]),
    '',
    `Open the sheet: ${input.url}`,
  ].join('\n');
  return { subject, html, text };
}
