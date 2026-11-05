import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { MAX_CAPACITY, setPersonCapacity } from '@/db/repositories/metrics';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  /** Open items the person can carry; null clears it. */
  capacity: z.number().int().min(1).max(MAX_CAPACITY).nullable(),
});

/**
 * PATCH /api/people/:id/capacity — set or clear a manager's or project lead's capacity (G-14).
 * Admin and super admin only; the repository checks the role again and writes the audit event.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const result = await setPersonCapacity(guard.ctx, params.data.id, body.data.capacity);
    return NextResponse.json(result);
  } catch (err) {
    const message = publicErrorMessage(err, 'capacity_failed');
    const status = message.includes('Only an admin') ? 403 : message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
