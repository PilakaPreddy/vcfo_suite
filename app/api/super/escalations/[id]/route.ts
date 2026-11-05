import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { EscalationForbiddenError, resolveEscalation } from '@/db/repositories/escalations';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.literal('resolved'),
  note: z.string().trim().min(1, 'Add a note').max(2000),
});

/** PATCH /api/super/escalations/:id — admin or super admin resolves with a note. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const escalation = await resolveEscalation(guard.ctx, id, body.data.note);
    if (!escalation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ escalation });
  } catch (err) {
    if (err instanceof EscalationForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = publicErrorMessage(err, 'resolve_failed');
    return NextResponse.json({ error: message }, { status: message === 'already_resolved' ? 409 : 500 });
  }
}
