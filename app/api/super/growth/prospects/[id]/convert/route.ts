import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { convertProspect } from '@/db/repositories/prospects';
import { prospectConvertSchema } from '@/lib/growth/prospect-schema';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * POST /api/super/growth/prospects/:id/convert — "Convert to client" (G-21).
 *
 * Links a won prospect to an existing engagement the super admin picked, `{ engagementId }`.
 * It never creates an engagement. Super admin only.
 */
type RouteContext = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireSuperAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const body = await parseJsonBody(request, prospectConvertSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error, issues: body.issues }, { status: 400 });
  }
  try {
    const prospect = await convertProspect(guard.ctx, id, body.data.engagementId);
    if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    return NextResponse.json({ prospect });
  } catch (err) {
    const message = publicErrorMessage(err, 'convert_failed');
    if (message === 'not_won') return NextResponse.json({ error: 'Only a won prospect can be converted' }, { status: 400 });
    if (message === 'engagement_not_found') return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
    return NextResponse.json({ error: message }, { status: message.includes('super admin') ? 403 : 500 });
  }
}
