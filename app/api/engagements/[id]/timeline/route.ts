import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { TimelineSaveError, saveEngagementTimeline } from '@/db/repositories/engagement-timeline';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');
const bodySchema = z.object({
  parts: z
    .array(z.object({ id: z.enum(['p1', 'p2', 'mca', 'coi']), from: isoDate, to: isoDate }))
    .min(1)
    .max(4),
});

/**
 * POST /api/engagements/:id/timeline `{ parts: [{ id: 'p1'|'p2'|'mca'|'coi', from, to }] }` — a
 * manager saves the incorporation timeline at once (staff timeline editor, F-259). Managers
 * (own engagements), admins and super admins; everyone else gets 403.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const windows = await saveEngagementTimeline(guard.ctx, id, body.data.parts);
    return NextResponse.json({ windows });
  } catch (err) {
    if (err instanceof TimelineSaveError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = publicErrorMessage(err, 'timeline_failed');
    const status = message.includes('not found') || message.includes('not permitted') ? 404 : message.includes('Only') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
