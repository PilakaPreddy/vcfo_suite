import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site-url';
import { addDaysIso, todayIst } from '@/lib/receivables/dates';
import { partnerInvoiceUrl } from '@/lib/receivables/partner-emails';
import { hitFromRow, reminderDraft } from '@/lib/receivables/reminder-rule';
import { getReminderDesk } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/sheets/:id/reminders — the Reminders tab: today's queue (queued on the
 * spot if the job has not run yet), each with the text it will send, and 14 days of history.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const today = todayIst();
    const { sheet, queue, history } = await getReminderDesk(guard.ctx, id, today, addDaysIso(today, -14));
    const site = siteUrl();
    const toRow = (r: (typeof queue)[number]) => {
      const hit = hitFromRow(r.reminder);
      const draft = reminderDraft(
        { clientName: r.clientName, invoiceNo: r.invoiceNo, amountInr: Number(r.amountInr) || 0, dueDate: String(r.dueDate) },
        hit,
        { name: r.partnerName ?? '' },
        { liveUrl: partnerInvoiceUrl(site, r.reminder.invoiceId), signerName: guard.ctx.name },
      );
      return {
        id: r.reminder.id,
        forDate: String(r.reminder.forDate),
        label: hit.label,
        kind: hit.kind,
        status: r.reminder.status,
        channel: r.reminder.channel,
        error: r.reminder.error,
        sentAt: r.reminder.sentAt,
        clientName: r.clientName,
        invoiceNo: r.invoiceNo,
        amountInr: Number(r.amountInr) || 0,
        dueDate: String(r.dueDate),
        invoiceOpen: r.invoiceStatus === 'open',
        partnerName: r.partnerName,
        partnerEmail: r.partnerEmail,
        subject: r.reminder.subjectOverride ?? draft.subject,
        body: r.reminder.bodyOverride ?? draft.text,
        edited: Boolean(r.reminder.subjectOverride || r.reminder.bodyOverride),
      };
    };
    return NextResponse.json({ today, rules: sheet.reminderRules, queue: queue.map(toRow), history: history.map(toRow) });
  } catch (e) {
    return receivablesError(e);
  }
}
