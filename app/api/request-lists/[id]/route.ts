import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getRequestList, updateRequestList } from '@/db/repositories/request-lists';
import { isoDay, requestListError, STAFF, STAFF_AND_CLIENT } from '../_respond';

type RouteContext = { params: Promise<{ id: string }> };
const UUID = z.string().uuid();

/** GET /api/request-lists/:id — one list with its items (reconciled with the uploads as it is read). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF_AND_CLIENT);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const list = await getRequestList(guard.ctx, id);
    return list ? NextResponse.json({ list }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return requestListError(e);
  }
}

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  periodLabel: z.string().trim().max(60).nullable().optional(),
  dueOn: isoDay.nullable().optional(),
  cadenceDays: z.number().int().min(1).max(30).optional(),
  cancel: z.boolean().optional(),
});

/** PATCH /api/request-lists/:id — staff edit the title, period, due date or cadence, or cancel. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: 400 });
  try {
    return NextResponse.json({ list: await updateRequestList(guard.ctx, id, body.data) });
  } catch (e) {
    return requestListError(e);
  }
}
