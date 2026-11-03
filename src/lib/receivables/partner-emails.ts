import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';

/**
 * RECEIVABLES PARTNER EMAILS (Phase 8): the login invite, the password reset link, the access
 * notice for a partner who already has a login, and "SBC replied on invoice X". Pure: the routes
 * build the links with `siteUrl()` and send through `sendEmail`.
 */

const origin = (site: string) => site.replace(/\/$/, '');

/** `/receivables/set-password?token=…`, the page where a partner chooses a password. */
export function partnerSetPasswordUrl(site: string, token: string): string {
  return `${origin(site)}/receivables/set-password?token=${encodeURIComponent(token)}`;
}

/** `/receivables?invoice=<id>`, the partner's page opened on one invoice. */
export function partnerInvoiceUrl(site: string, invoiceId: string): string {
  return `${origin(site)}/receivables?invoice=${encodeURIComponent(invoiceId)}`;
}

export function partnerHomeUrl(site: string): string {
  return `${origin(site)}/receivables`;
}

export function partnerLoginUrl(site: string, email?: string): string {
  return `${origin(site)}/receivables/login${email ? `?email=${encodeURIComponent(email)}` : ''}`;
}

export type PartnerEmail = { subject: string; html: string; text: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function partnerLoginEmail(input: { kind: 'invite' | 'reset' | 'access_added'; name: string; clientOrgName: string; url: string }): PartnerEmail {
  const org = input.clientOrgName;
  const copy = {
    invite: {
      subject: `Your ${org} receivables login`,
      title: 'Set your password',
      lead: `SBC has given you a login to see your ${org} invoices, mark the dates clients promised to pay, and leave notes for SBC.`,
      action: 'Choose a password with the button below. The link works once, for seven days.',
      cta: 'Set your password',
    },
    reset: {
      subject: `Reset your ${org} receivables password`,
      title: 'Choose a new password',
      lead: `SBC sent you a link to choose a new password for your ${org} receivables login.`,
      action: 'The link works once, for seven days. Your old password works until you choose a new one.',
      cta: 'Choose a new password',
    },
    access_added: {
      subject: `Your ${org} receivables are now in your login`,
      title: 'New receivables in your login',
      lead: `SBC added your ${org} invoices to your existing receivables login.`,
      action: 'Sign in with your usual email and password.',
      cta: 'Sign in',
    },
  }[input.kind];
  const html = renderEmailDocument({
    brand: 'sbc',
    eyebrow: org,
    title: copy.title,
    bodyHtml: emailParagraph(`Dear ${escapeHtml(firstName(input.name))},`) + emailParagraph(escapeHtml(copy.lead)) + emailParagraph(escapeHtml(copy.action)),
    cta: { label: copy.cta, href: input.url },
  });
  const text = [`Dear ${firstName(input.name)},`, '', copy.lead, copy.action, '', `${copy.cta}: ${input.url}`].join('\n');
  return { subject: copy.subject, html, text };
}

export function sbcReplyEmail(input: { partnerName: string; invoiceLabel: string; authorName: string; text: string; url: string }): PartnerEmail {
  const subject = `SBC replied on invoice ${input.invoiceLabel}`;
  const quote = input.text.length > 600 ? `${input.text.slice(0, 600)}…` : input.text;
  const html = renderEmailDocument({
    brand: 'sbc',
    title: subject,
    bodyHtml:
      emailParagraph(`Dear ${escapeHtml(firstName(input.partnerName))},`) +
      emailParagraph(`${escapeHtml(input.authorName)} replied on ${escapeHtml(input.invoiceLabel)}:`) +
      `<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #CBD5E1;background:#F8FAFC;white-space:pre-wrap;">${escapeHtml(quote)}</blockquote>`,
    cta: { label: 'Open the invoice', href: input.url },
  });
  const text = [`Dear ${firstName(input.partnerName)},`, '', `${input.authorName} replied on ${input.invoiceLabel}:`, '', quote, '', `Open the invoice: ${input.url}`].join('\n');
  return { subject, html, text };
}
