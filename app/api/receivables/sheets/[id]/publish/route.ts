import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { publishSheet } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/** POST /api/receivables/sheets/:id/publish — Update: the draft becomes what the client page shows. */
const schema = z.object({ note: z.string().max(500).optional() });

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ version: await publishSheet(guard.ctx, id, body.data.note) });
  } catch (e) {
    return receivablesError(e);
  }
}
