import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { siteUrl } from '@/lib/site-url';
import { countMyDay, MY_DAY_LABEL, type RankedMyDayItem } from './rank';

/**
 * The optional "My day" morning email (IDEAS-PLAN section F): the top of the ranked plan, one line
 * per item, with a link to the person's Today page. Internal only; it goes to the staff member.
 */

export const MY_DAY_EMAIL_ROWS = 10;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

function lineText(item: RankedMyDayItem): string {
  const parts = [`${MY_DAY_LABEL[item.kind]}: ${item.title}`, item.companyName];
  if (item.detail) parts.push(item.detail);
  return parts.join(' · ');
}

/** The Today page each role opens; the plan card sits at its top. */
export function myDayHomeHref(role: string): string {
  if (role === 'intern') return '/app/intern/today';
  if (role === 'super_admin') return '/app/super/dashboard';
  return role === 'manager' ? '/app/manager/dashboard' : '/app/admin/dashboard';
}

export function buildMyDayEmail(input: { recipientName: string; role: string; items: RankedMyDayItem[] }): {
  subject: string;
  html: string;
  text: string;
} {
  const counts = countMyDay(input.items);
  const top = input.items.slice(0, MY_DAY_EMAIL_ROWS);
  const n = input.items.length;
  const subject = counts.overdue > 0 ? `Your day: ${n} items, ${counts.overdue} overdue` : `Your day: ${n} item${n === 1 ? '' : 's'}`;
  const href = `${siteUrl()}${myDayHomeHref(input.role)}`;
  const lines = top.map(lineText);
  const more = n > top.length ? `And ${n - top.length} more on your Today page.` : null;
  const intro = `Here is your plan for today, the most urgent first.`;
  return {
    subject,
    html: renderEmailDocument({
      eyebrow: 'My day',
      title: `${n} item${n === 1 ? '' : 's'} for today`,
      bodyHtml:
        emailParagraph(`Hi ${escapeHtml(firstName(input.recipientName))},`) +
        emailParagraph(escapeHtml(intro)) +
        lines.map((l, i) => emailParagraph(`${i + 1}. ${escapeHtml(l)}`)).join('') +
        (more ? emailParagraph(escapeHtml(more)) : ''),
      cta: { label: 'Open Today', href },
    }),
    text: [`Hi ${firstName(input.recipientName)},`, intro, ...lines.map((l, i) => `${i + 1}. ${l}`), ...(more ? [more] : []), `Open Today: ${href}`].join(
      '\n\n',
    ),
  };
}
