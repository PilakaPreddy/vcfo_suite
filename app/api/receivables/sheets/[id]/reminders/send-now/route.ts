import { after, NextResponse } from 'next/server';
import { addDaysIso, todayIst } from '@/lib/receivables/dates';
import { sendDueReminders } from '@/lib/receivables/send-reminders';
import { getReminderDesk } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../../_respond';

/**
 * POST /api/receivables/sheets/:id/reminders/send-now — sends today's queued reminders of this
 * sheet at once instead of waiting for the send hour. Skipped ones stay skipped.
 *
 * The scope check and today's queue happen before the answer; the sending runs after the
 * response (`after` from next/server) and answers 202 { ok, queued, pending }. Each reminder
 * records its own `sent` or `failed` with the reason, and one the work never reached stays
 * queued for the hourly job, so nothing is lost if the process stops.
 */
// shortcut: guards double clicks inside one instance only; a second App Runner instance or the hourly job can still overlap, as before this change.
const sending = new Set<string>();

export async function POST(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const today = todayIst();
    // Scope check, and today's queue in place before sending.
    const desk = await getReminderDesk(guard.ctx, id, today, addDaysIso(today, -1));
    const sheetId = desk.sheet.id;
    const pending = desk.queue.filter((r) => r.reminder.status === 'queued' && r.invoiceStatus === 'open').length;
    if (!sending.has(sheetId)) {
      sending.add(sheetId);
      after(() =>
        sendDueReminders(today, { sheetId })
          .catch((e) => console.error('[receivables] send now failed', e instanceof Error ? e.message : e))
          .finally(() => sending.delete(sheetId)),
      );
    }
    return NextResponse.json({ ok: true, queued: true, pending }, { status: 202 });
  } catch (e) {
    return receivablesError(e);
  }
}
