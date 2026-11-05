import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { updateProspect } from '@/db/repositories/prospects';
import { prospectPatchSchema } from '@/lib/growth/prospect-schema';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * PATCH /api/super/growth/prospects/:id — edit a prospect or move its stage (G-21).
 * Super admin only. Moving to won or lost stamps `closed_at`, which the win rate reads.
 */
type RouteContext = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireSuperAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const body = await parseJsonBody(request, prospectPatchSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error, issues: body.issues }, { status: 400 });
  }
  try {
    const prospect = await updateProspect(guard.ctx, id, body.data);
    if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    return NextResponse.json({ prospect });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    const status = message === 'invalid_owner' ? 400 : message.includes('super admin') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
