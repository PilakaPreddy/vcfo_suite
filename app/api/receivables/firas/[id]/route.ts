import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { updateFira } from '@/db/repositories/receivables';
import { denied, guardReceivables, isoDate, receivablesError, type RouteContext } from '../../_respond';

/** PATCH /api/receivables/firas/:id — mark a FIRA received with the bank's number and date, or set it back to awaited. */
const note = z.string().max(300, 'note').nullable().optional();
const schema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('received'), firaNo: z.string().trim().min(1, 'fira_no').max(60, 'fira_no'), issuedOn: isoDate, note }),
  z.object({ status: z.literal('awaited'), note }),
]);

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ fira: await updateFira(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}
