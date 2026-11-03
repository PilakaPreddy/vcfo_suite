import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { siteUrl } from '@/lib/site-url';

/**
 * The daily compliance reminder email (COMPLIANCE-MODEL 3.4): one email per person per day that
 * lists the reminders the bell received that morning. Email is the system of record (rule 6);
 * the bell rows carry the same lines.
 */

export interface ReminderLine {
  /** 'GSTR-3B Filing · Sep 2026'. */
  title: string;
  companyName: string;
  /** 'Due today', 'Overdue, daily', … */
  label: string;
  dueDate: string;
  href: string;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

function reminderLineText(l: ReminderLine): string {
  return `${l.label}: ${l.title} for ${l.companyName}, due ${dayMonth(l.dueDate)}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

export function buildComplianceReminderEmail(input: { recipientName: string; lines: ReminderLine[] }): { subject: string; html: string; text: string } {
  const n = input.lines.length;
  const subject = n === 1 ? `${input.lines[0]!.label}: ${input.lines[0]!.title}` : `${n} compliance reminders`;
  const href = `${siteUrl()}${input.lines[0]?.href ?? '/app'}`;
  const items = input.lines.map(reminderLineText);
  return {
    subject,
    html: renderEmailDocument({
      eyebrow: 'Compliance reminder',
      title: n === 1 ? input.lines[0]!.label : `${n} reminders today`,
      bodyHtml:
        emailParagraph(`Hi ${escapeHtml(firstName(input.recipientName))},`) +
        items.map((line) => emailParagraph(escapeHtml(line))).join(''),
      cta: { label: 'Open VCFO Suite', href },
    }),
    text: [`Hi ${firstName(input.recipientName)},`, ...items, `Open VCFO Suite: ${href}`].join('\n\n'),
  };
}
