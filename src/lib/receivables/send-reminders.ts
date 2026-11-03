import 'server-only';
import { systemDueReminders, systemRecordReminder, type DueReminder } from '@/db/repositories/receivables';
import { systemSendMailAs } from '@/db/repositories/outlook-connections';
import { wrapComposeBodyHtml } from '@/lib/email/compose-branding';
import { sendEmailNoLog } from '@/lib/email/send-email';
import { formatReplyTo } from '@/lib/email/send-email-shared';
import { siteUrl } from '@/lib/site-url';
import { publicPageUrl } from './links';
import { hitFromRow, reminderDraft } from './reminder-rule';

/**
 * RECEIVABLES REMINDER SENDER (Phase 5, docs/specs/receivables/PLAN.md). Sends each queued
 * reminder of `today` to the invoice's client partner, from the sheet manager's own Outlook. When
 * Outlook cannot send (no link, expired link, Graph error) it falls back to the firm's email
 * (SES or Resend) with Reply-To set to the manager, so the reminder still goes and replies still
 * reach the manager. Each outcome is recorded at once, so a retry never sends twice; the
 * fallback uses `sendEmailNoLog` so the email outbox does not retry behind the job's back.
 *
 * `hourIst` (the job) sends only for sheets whose send hour has come; the manager's Send now
 * passes no hour.
 */
export type SendOutcome = { sent: number; failed: number; viaOutlook: number; viaEmail: number };

export function reminderMessage(r: DueReminder, site: string) {
  const hit = hitFromRow(r.reminder);
  const liveUrl = publicPageUrl(site, { publicKey: r.publicKey, requireKey: r.requireKey }, r.partnerSlug);
  const draft = reminderDraft(
    { clientName: r.invoice.clientName, invoiceNo: r.invoice.invoiceNo, amountInr: Number(r.invoice.amountInr) || 0, dueDate: String(r.invoice.dueDate) },
    hit,
    { name: r.partnerName ?? '' },
    { liveUrl, signerName: r.managerName || 'SBC' },
  );
  const subject = r.reminder.subjectOverride || draft.subject;
  const text = r.reminder.bodyOverride || draft.text;
  return { subject, text, html: wrapComposeBodyHtml(text, 'sbc', subject) };
}

export async function sendDueReminders(today: string, opts: { hourIst?: number; sheetId?: string } = {}): Promise<SendOutcome> {
  // Reminders switched off after queueing stay queued and unsent.
  const due = (await systemDueReminders(today, { sheetId: opts.sheetId })).filter((r) => r.rules.enabled && (opts.hourIst === undefined || opts.hourIst >= r.rules.sendHourIst));
  const out: SendOutcome = { sent: 0, failed: 0, viaOutlook: 0, viaEmail: 0 };
  const site = siteUrl();
  for (const r of due) {
    const to = r.partnerEmail?.trim();
    if (!to) {
      await systemRecordReminder([r.reminder.id], { status: 'failed', channel: null, toEmail: null, error: 'no_partner_email' });
      out.failed++;
      continue;
    }
    const msg = reminderMessage(r, site);
    const viaOutlook = r.managerUserId ? await systemSendMailAs(r.managerUserId, { to: [to], subject: msg.subject, html: msg.html, text: msg.text }) : null;
    if (viaOutlook) {
      await systemRecordReminder([r.reminder.id], { status: 'sent', channel: 'outlook', toEmail: to });
      out.sent++;
      out.viaOutlook++;
      continue;
    }
    const res = await sendEmailNoLog({ to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: formatReplyTo({ name: r.managerName, email: r.managerEmail }), purpose: 'receivables.reminder' });
    if (res.ok && !res.skipped) {
      await systemRecordReminder([r.reminder.id], { status: 'sent', channel: 'email', toEmail: to });
      out.sent++;
      out.viaEmail++;
    } else {
      await systemRecordReminder([r.reminder.id], { status: 'failed', channel: 'email', toEmail: to, error: (res.error || (res.skipped ? 'email_not_configured' : 'send_failed')).slice(0, 200) });
      out.failed++;
    }
  }
  return out;
}
