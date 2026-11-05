import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { editReminder, setReminderSkipped } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';

/**
 * PATCH /api/receivables/reminders/:id — before it sends: skip or un-skip it, or change today's
 * subject and text (null goes back to the default wording).
 */
const schema = z.object({
  skipped: z.boolean().optional(),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().max(5000).nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    let row;
    if (body.data.subject !== undefined || body.data.body !== undefined) row = await editReminder(guard.ctx, id, { subject: body.data.subject ?? null, body: body.data.body ?? null });
    if (body.data.skipped !== undefined) row = await setReminderSkipped(guard.ctx, id, body.data.skipped);
    return NextResponse.json({ ok: true, status: row?.status });
  } catch (e) {
    return receivablesError(e);
  }
}
