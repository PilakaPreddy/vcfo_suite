import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { addPartner } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** POST /api/receivables/sheets/:id/partners — add a client partner (no login; filter and reminders). */
const schema = z.object({ name: z.string().min(1, 'name').max(120, 'name'), email: z.string().email('email').max(200, 'email') });

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ partner: await addPartner(guard.ctx, id, body.data) }, { status: 201 });
  } catch (e) {
    return receivablesError(e);
  }
}
