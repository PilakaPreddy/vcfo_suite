import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { setComplianceEventStatus } from '@/db/repositories/compliance-events';
import { parseJsonBody } from '@/lib/api/parse-body';
import { complianceEventError, STAFF } from '../_respond';

type RouteContext = { params: Promise<{ id: string }> };
const UUID = z.string().uuid();

/**
 * PATCH /api/compliance-events/:id { status } — staff mark a tracked event done (the form is filed),
 * dismiss a proposal or a tracked event, or bring a dismissed proposal back. Confirming a proposal
 * is not done here: it goes through the reviewed `filing.recordEvent` action.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await parseJsonBody(request, z.object({ status: z.enum(['done', 'dismissed', 'proposed']) }));
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: 400 });
  try {
    const event = await setComplianceEventStatus(guard.ctx, id, body.data.status);
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ event });
  } catch (e) {
    return complianceEventError(e);
  }
}
