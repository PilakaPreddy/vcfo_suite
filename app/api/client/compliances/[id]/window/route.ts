import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setClientComplianceWindow } from '@/db/repositories/schedule';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

const bodySchema = z
  .object({
    from: isoDate.nullable().optional(),
    to: isoDate.nullable().optional(),
  })
  .refine((d) => Boolean(d.from) === Boolean(d.to), {
    message: 'window_needs_both_dates',
    path: ['to'],
  });

/**
 * POST /api/client/compliances/:id/window — a client moves / resizes the
 * planning window of one of their own filings (Timeline view drag). Due dates
 * are never written. Ownership, the filed lock and the clear rule are enforced
 * in the repository (schedule.ts setClientComplianceWindow).
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireRole('client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const { from, to } = body.data;
  try {
    const row = await setClientComplianceWindow(guard.ctx, id, from && to ? { from, to } : null);
    return NextResponse.json({ row });
  } catch (err) {
    const message = publicErrorMessage(err, 'window_failed');
    const status = message.includes('not found') ? 404 : message === 'filed_locked' || message === 'clear_not_permitted' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
