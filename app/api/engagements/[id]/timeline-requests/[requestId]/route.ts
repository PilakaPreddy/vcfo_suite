import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { decideTimelineRequest } from '@/db/repositories/client-change-requests';
import { publicErrorMessage } from '@/lib/api-error';

type Ctx = { params: Promise<{ id: string; requestId: string }> };
const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(2000).optional() });

/** POST /api/engagements/:id/timeline-requests/:requestId { decision, note? } — manager / admin decides. */
export async function POST(request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { requestId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  try {
    const ok = await decideTimelineRequest(guard.ctx, requestId, parsed.data.decision, parsed.data.note);
    if (!ok) return NextResponse.json({ error: 'Request not found or already decided' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: publicErrorMessage(e, 'request_failed') }, { status: 403 });
  }
}
