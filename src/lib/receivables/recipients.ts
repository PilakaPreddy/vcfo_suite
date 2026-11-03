import { isEmailAddress } from '@/lib/email/recipient-input';
import type { EmailRecipient, Partner, SnapshotRow } from './model';
import { isOverdue } from './summary';

/**
 * RECEIVABLES RECIPIENTS — the ready-made lists the summary email offers (the previous send,
 * every client partner, the partners with something overdue), and the clean-up before sending:
 * valid addresses only, and nobody twice (To wins over Cc, Cc over Bcc).
 */

export type RecipientSet = { to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[] };
export type RecipientList = RecipientSet & { key: 'last' | 'partners' | 'overdue' | 'empty'; label: string };

const asRecipient = (p: Pick<Partner, 'name' | 'email'>): EmailRecipient => ({ name: p.name, email: p.email });

export function recipientLists(input: { partners: Partner[]; rows: SnapshotRow[]; today: string; lastSend: RecipientSet | null }): RecipientList[] {
  const active = input.partners.filter((p) => p.active);
  const overdueSlugs = new Set(input.rows.filter((r) => isOverdue(r, input.today)).map((r) => r.partnerSlug));
  const lists: RecipientList[] = [];
  if (input.lastSend && input.lastSend.to.length) lists.push({ key: 'last', label: 'Same as last time', ...input.lastSend });
  lists.push({ key: 'partners', label: 'All client partners', to: active.map(asRecipient), cc: [], bcc: [] });
  lists.push({ key: 'overdue', label: 'Partners with overdue invoices', to: active.filter((p) => overdueSlugs.has(p.slug)).map(asRecipient), cc: [], bcc: [] });
  lists.push({ key: 'empty', label: 'Start empty', to: [], cc: [], bcc: [] });
  return lists;
}

/** Valid, lower-cased for comparison, each address once across To, Cc and Bcc. */
export function cleanRecipients(set: RecipientSet): RecipientSet & { invalid: string[] } {
  const seen = new Set<string>();
  const invalid: string[] = [];
  const pass = (list: EmailRecipient[]) =>
    list.flatMap((r) => {
      const email = r.email.trim();
      if (!isEmailAddress(email)) {
        invalid.push(email);
        return [];
      }
      const k = email.toLowerCase();
      if (seen.has(k)) return [];
      seen.add(k);
      return [{ name: r.name.trim().slice(0, 120), email }];
    });
  const to = pass(set.to);
  const cc = pass(set.cc);
  const bcc = pass(set.bcc);
  return { to, cc, bcc, invalid };
}

/** Everyone the compose box can suggest: the partners, then anyone on a previous send. */
export function contactSuggestions(partners: Partner[], lastSend: RecipientSet | null): EmailRecipient[] {
  const out = new Map<string, EmailRecipient>();
  for (const p of partners) if (p.active) out.set(p.email.toLowerCase(), asRecipient(p));
  for (const r of [...(lastSend?.to ?? []), ...(lastSend?.cc ?? []), ...(lastSend?.bcc ?? [])]) if (!out.has(r.email.toLowerCase())) out.set(r.email.toLowerCase(), r);
  return [...out.values()];
}

/** Strips what an email body never needs (scripts, event handlers), before it goes to Outlook. */
export function tidyEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}
