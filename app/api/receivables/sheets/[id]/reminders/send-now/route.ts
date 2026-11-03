import { NextResponse } from 'next/server';
import { todayIst } from '@/lib/receivables/dates';
import { sendDueReminders } from '@/lib/receivables/send-reminders';
import { getReminderDesk } from '@/db/repositories/receivables';
import { addDaysIso } from '@/lib/receivables/dates';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../../_respond';

/**
 * POST /api/receivables/sheets/:id/reminders/send-now — sends today's queued reminders of this
 * sheet at once instead of waiting for the send hour. Skipped ones stay skipped.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const today = todayIst();
    // Scope check, and today's queue in place before sending.
    const { sheet } = await getReminderDesk(guard.ctx, id, today, addDaysIso(today, -1));
    return NextResponse.json(await sendDueReminders(today, { sheetId: sheet.id }));
  } catch (e) {
    return receivablesError(e);
  }
}
