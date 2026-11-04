import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { fcLabel } from './currencies';
import { sheetDate } from './dates';

/**
 * RECEIVABLES RATE ALERT EMAIL (Phase 10). When the day's reference rate crosses a level the
 * manager set on the FX tab, the rates job sends this short note: the rate, the level, and what
 * the sheet's open invoices in that currency are worth at the new rate. Pure: the sending is in
 * src/jobs/receivables-fx-rates.ts and never fails the job.
 */

export type RateAlertEmailInput = {
  managerName: string;
  clientOrgName: string;
  currency: string;
  direction: 'above' | 'below';
  threshold: number;
  rate: number;
  rateDate: string;
  source: string;
  /** The open foreign amount in the currency and its INR at the booked rates. */
  exposureFc: number;
  exposureBookedInr: number;
  url: string;
};

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const SOURCE: Record<string, string> = { fbil: 'FBIL', ecb: 'ECB', manual: 'set by hand' };

export function rateAlertEmail(input: RateAlertEmailInput): { subject: string; html: string; text: string } {
  const rate = input.rate.toFixed(4);
  const level = input.threshold.toFixed(4);
  const word = input.direction === 'above' ? 'above' : 'below';
  const subject = `${input.currency} at ₹${rate}, ${word} your ₹${level} level · ${input.clientOrgName}`;
  const inrNow = Math.round(input.exposureFc * input.rate);
  const change = inrNow - Math.round(input.exposureBookedInr);
  const exposure =
    input.exposureFc > 0
      ? `Open ${input.currency} invoices on the sheet: ${fcLabel(input.exposureFc, input.currency)}, worth ₹${INR.format(inrNow)} at this rate (${change >= 0 ? '+' : '−'}₹${INR.format(Math.abs(change))} against the booked rates).`
      : `There are no open ${input.currency} invoices on the sheet today.`;
  const lines = [
    `The ${input.currency} reference rate for ${sheetDate(input.rateDate)} is ₹${rate} (${SOURCE[input.source] ?? input.source}), ${word} the ₹${level} level you set.`,
    exposure,
  ];
  const first = input.managerName.split(' ')[0] || input.managerName;
  const html = renderEmailDocument({
    eyebrow: input.clientOrgName,
    title: `${input.currency} crossed ₹${level}`,
    bodyHtml: emailParagraph(`Hi ${escapeHtml(first)},`) + lines.map((l) => emailParagraph(escapeHtml(l))).join(''),
    cta: { label: 'Open the FX tab', href: input.url },
    footerNote: 'You get this email once a day while the rate stays beyond the level. Turn the alert off on the FX tab.',
  });
  const text = [`Hi ${first},`, '', ...lines, '', `Open the FX tab: ${input.url}`].join('\n');
  return { subject, html, text };
}
