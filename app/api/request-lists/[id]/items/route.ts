import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { addRequestListItem, answerRequestListItem, removeRequestListItem, reviewRequestListItem } from '@/db/repositories/request-lists';
import { itemKind, requestListError, STAFF, STAFF_AND_CLIENT } from '../../_respond';

type RouteContext = { params: Promise<{ id: string }> };
const UUID = z.string().uuid();

const addSchema = z.object({ kind: itemKind, label: z.string().trim().min(1).max(300), help: z.string().max(500).nullable().optional() });

/** POST /api/request-lists/:id/items — staff add an item. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await parseJsonBody(request, addSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: 400 });
  try {
    return NextResponse.json({ list: await addRequestListItem(guard.ctx, id, body.data) });
  } catch (e) {
    return requestListError(e);
  }
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), itemId: z.string().uuid(), answerText: z.string().max(4000).nullable().optional(), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal('review'), itemId: z.string().uuid(), decision: z.enum(['accepted', 'rejected']) }),
]);

/**
 * PATCH /api/request-lists/:id/items — `answer`: the client answers or confirms an item (staff may
 * record an answer given by phone); `review`: staff accept or reject an answer.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF_AND_CLIENT);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.data;
  try {
    const list =
      b.action === 'answer'
        ? await answerRequestListItem(guard.ctx, id, b.itemId, { answerText: b.answerText, confirmed: b.confirmed })
        : await reviewRequestListItem(guard.ctx, id, b.itemId, b.decision);
    return NextResponse.json({ list });
  } catch (e) {
    return requestListError(e);
  }
}

/** DELETE /api/request-lists/:id/items?itemId= — staff remove an item from a draft. */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const itemId = new URL(request.url).searchParams.get('itemId') ?? '';
  if (!UUID.safeParse(id).success || !UUID.safeParse(itemId).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    return NextResponse.json({ list: await removeRequestListItem(guard.ctx, id, itemId) });
  } catch (e) {
    return requestListError(e);
  }
}
