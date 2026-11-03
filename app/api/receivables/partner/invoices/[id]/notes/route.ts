import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePartner } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { PARTNER_NOTE_MAX, addPartnerNote } from '@/db/repositories/receivables';
import { denied, receivablesError, type RouteContext } from '../../../../_respond';

/** POST /api/receivables/partner/invoices/:id/notes — { text }: a note to SBC on one of the partner's invoices. */
const schema = z.object({ text: z.string().trim().min(1, 'text').max(PARTNER_NOTE_MAX, 'text') });

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePartner();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    await addPartnerNote(guard.ctx, id, body.data.text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return receivablesError(e);
  }
}
