import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  EscalationForbiddenError,
  listEscalations,
  raiseEscalation,
} from '@/db/repositories/escalations';

const querySchema = z.object({
  status: z.enum(['open', 'resolved', 'all']).optional(),
  engagementId: z.string().trim().min(1).max(80).optional(),
});

const raiseSchema = z.object({
  engagementId: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1, 'Say why').max(2000),
  assignedTo: z.union([z.string().uuid(), z.null()]).optional(),
});

/**
 * GET /api/super/escalations?status=open|resolved|all&engagementId= — staff, scoped like
 * engagements (firm-wide admins see every escalation).
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    status: url.searchParams.get('status') ?? undefined,
    engagementId: url.searchParams.get('engagementId') ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  try {
    const escalations = await listEscalations(guard.ctx, query.data);
    return NextResponse.json({ escalations });
  } catch (err) {
    if (err instanceof EscalationForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
}

/** POST /api/super/escalations — raise an escalation on an engagement the caller can access. */
export async function POST(request: Request) {
  const guard = await requireAnyRole('admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, raiseSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const escalation = await raiseEscalation(guard.ctx, body.data);
    return NextResponse.json({ escalation }, { status: 201 });
  } catch (err) {
    if (err instanceof EscalationForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = publicErrorMessage(err, 'raise_failed');
    const status = message === 'assignee_not_admin' || message === 'reason_required' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
