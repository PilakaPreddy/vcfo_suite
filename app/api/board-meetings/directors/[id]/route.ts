import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { ceaseDirector, updateDirector } from '@/db/repositories/board-meetings';
import { isoDate, meetingError, type RouteContext } from '../../_respond';

/**
 * PATCH /api/board-meetings/directors/:id — edit contact details, or `{ cease: { ceasedOn, reason } }`
 * to mark the director as left (records a DIR-12 event; history is kept). Staff.
 */
const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  din: z.string().max(20).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  designation: z.string().max(80).nullable().optional(),
  appointedOn: isoDate.nullable().optional(),
  cease: z.object({ ceasedOn: isoDate, reason: z.enum(['resigned', 'removed', 'disqualified', 'other']) }).optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const { cease, ...rest } = body.data;
    const director = cease ? await ceaseDirector(guard.ctx, id, cease) : await updateDirector(guard.ctx, id, rest);
    return NextResponse.json({ director });
  } catch (e) {
    return meetingError(e);
  }
}
