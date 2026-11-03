import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePartner } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { PARTNER_NOTE_MAX, setPromise } from '@/db/repositories/receivables';
import { denied, receivablesError, type RouteContext } from '../../../../_respond';

/**
 * POST /api/receivables/partner/invoices/:id/promise — { promisedOn, note? }: the client promised
 * to pay by that date. Reminders pause until then and SBC sees the promise on the sheet.
 */
const schema = z.object({
  promisedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'promised_on'),
  note: z.string().max(PARTNER_NOTE_MAX, 'note').nullable().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePartner();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    await setPromise(guard.ctx, id, body.data.promisedOn, body.data.note ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return receivablesError(e);
  }
}
