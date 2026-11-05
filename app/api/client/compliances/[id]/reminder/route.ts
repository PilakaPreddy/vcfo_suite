import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  clearFilingReminder,
  complianceErrorStatus,
  setFilingReminder,
} from '@/db/repositories/client-compliances';

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ channels: z.array(z.enum(['email', 'whatsapp'])).optional() });

function fail(e: unknown) {
  const status = complianceErrorStatus(e);
  if (status == null) throw e;
  return NextResponse.json({ error: publicErrorMessage(e, 'request_failed') }, { status });
}

/** POST /api/client/compliances/:id/reminder — "Remind me" (the caller's own reminder). */
export async function POST(request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await ctx.params;
  const parsed = request.headers.get('content-length') === '0' ? { ok: true as const, data: {} } : await parseJsonBody(request, body);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  try {
    return NextResponse.json(await setFilingReminder(guard.ctx, id, parsed.data.channels));
  } catch (e) {
    return fail(e);
  }
}

/** DELETE — Undo / turn the reminder off. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await ctx.params;
  try {
    await clearFilingReminder(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
