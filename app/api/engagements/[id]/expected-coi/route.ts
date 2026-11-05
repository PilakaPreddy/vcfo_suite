import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setExpectedCoi } from '@/db/repositories/schedule';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** YYYY-MM-DD sets the date; null clears it. */
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date').nullable(),
});

/**
 * PUT /api/engagements/:id/expected-coi — set or clear the expected certificate date (G-13).
 * Manager (own project), admin, super admin; the repository refuses everyone else as well.
 */
export async function PUT(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const result = await setExpectedCoi(guard.ctx, id, body.data.on);
    return NextResponse.json(result);
  } catch (err) {
    const message = publicErrorMessage(err, 'expected_coi_failed');
    const status =
      message.includes('Only a project manager') ? 403
      : message.includes('not found') || message.includes('not permitted') ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
