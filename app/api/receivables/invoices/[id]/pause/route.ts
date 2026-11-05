import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setReminderPause } from '@/db/repositories/receivables';
import { denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../../_respond';

/** PUT /api/receivables/invoices/:id/pause — no reminders until a date (null resumes them). */
const schema = z.object({ until: isoDate.nullable(), reason: z.string().max(200).nullable().optional() });

export async function PUT(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ invoice: await setReminderPause(guard.ctx, id, body.data as Parameters<typeof setReminderPause>[2]) });
  } catch (e) {
    return receivablesError(e);
  }
}
