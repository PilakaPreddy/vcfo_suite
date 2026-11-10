import { emailMetaTable, emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { siteUrl } from '@/lib/site-url';

/**
 * Email copy for request lists: the first send (approved on a review card) and the reminders that
 * follow it. Pure builders; the action and the reminder job send them through `sendEmail`.
 */

export const CLIENT_REQUESTS_PATH = '/app/client/requests';

export interface RequestListEmailInput {
  companyName: string;
  title: string;
  dueOn: string | null;
  /** The items still open, in list order. */
  openItems: ReadonlyArray<{ label: string; kind: string }>;
  totalItems: number;
  /** 0 for the first send, 1 and up for reminders. */
  reminder: number;
  senderName?: string | null;
}

const KIND_WORD: Record<string, string> = { document: 'Upload', answer: 'Answer', confirmation: 'Confirm' };

function absolute(path: string): string {
  return `${siteUrl()}${path}`;
}

export function buildRequestListEmail(input: RequestListEmailInput): { subject: string; html: string; text: string } {
  const href = absolute(CLIENT_REQUESTS_PATH);
  const open = input.openItems.length;
  const subject =
    input.reminder === 0
      ? `${input.companyName}: ${input.title} · ${open} item${open === 1 ? '' : 's'} needed`
      : `${input.companyName}: reminder · ${input.title} · ${open} still open`;
  const intro =
    input.reminder === 0
      ? `We need the items below from <strong>${escapeHtml(input.companyName)}</strong> for <strong>${escapeHtml(input.title)}</strong>.`
      : `A friendly reminder: <strong>${open} of ${input.totalItems}</strong> items for <strong>${escapeHtml(input.title)}</strong> (${escapeHtml(input.companyName)}) are still open.`;
  const shown = input.openItems.slice(0, 15);
  const listHtml = `<ul style="margin:12px 0 0;padding-left:18px;">${shown
    .map((i) => `<li style="margin:4px 0;"><strong>${escapeHtml(KIND_WORD[i.kind] ?? 'Send')}:</strong> ${escapeHtml(i.label)}</li>`)
    .join('')}${open > shown.length ? `<li>and ${open - shown.length} more</li>` : ''}</ul>`;
  const meta = input.dueOn ? emailMetaTable([{ label: 'Due', value: input.dueOn }]) : '';
  const html = renderEmailDocument({
    eyebrow: input.reminder === 0 ? 'Request list' : 'Reminder',
    title: input.title,
    bodyHtml:
      emailParagraph(intro) +
      listHtml +
      meta +
      emailParagraph('Documents upload straight into your portal. Answers and confirmations take a click each.'),
    cta: { label: 'Open your requests', href },
    ...(input.senderName ? { footerNote: `Sent by ${input.senderName}` } : {}),
  });
  const text = [
    input.reminder === 0
      ? `We need the items below from ${input.companyName} for ${input.title}.`
      : `Reminder: ${open} of ${input.totalItems} items for ${input.title} are still open.`,
    '',
    ...shown.map((i) => `- ${KIND_WORD[i.kind] ?? 'Send'}: ${i.label}`),
    open > shown.length ? `- and ${open - shown.length} more` : '',
    input.dueOn ? `\nDue: ${input.dueOn}` : '',
    `\nOpen: ${href}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  return { subject, html, text };
}
