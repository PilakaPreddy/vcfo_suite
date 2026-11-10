import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { previewSendList, sendList } from '@/lib/actions/requests/send-list';
import type { ActionContext } from '@/lib/actions/types';
import { requestListError, STAFF } from '../../_respond';

type RouteContext = { params: Promise<{ id: string }> };
const UUID = z.string().uuid();

/**
 * The screen's review of `requests.sendList`, the same action the Ask chat proposes.
 *
 * GET  /api/request-lists/:id/send — the review: what goes out, to whom, and any check that holds
 *      it. Reads only.
 * POST /api/request-lists/:id/send { confirm: true } — the person's approval click. The action's
 *      checks run again as that person, and only then does it execute.
 */
function actionContext(auth: ActionContext['auth']): ActionContext {
  return { auth, engagementId: null, conversationId: null, runId: null, now: new Date(), via: 'route' };
}

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const draft = await previewSendList(actionContext(guard.ctx), { listId: id });
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const row = draft.rows[0]!;
    return NextResponse.json({
      review: {
        title: draft.title,
        tier: draft.tier,
        recipients: draft.recipients ?? [],
        summary: row.displayNew,
        checks: row.checks,
        heldReason: row.heldReason ?? null,
      },
    });
  } catch (e) {
    return requestListError(e);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await parseJsonBody(request, z.object({ confirm: z.literal(true) }));
  if (body.ok === false) return NextResponse.json({ error: 'Confirm the send first' }, { status: 400 });
  try {
    const result = await sendList.execute(actionContext(guard.ctx), { listId: id });
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (e) {
    return requestListError(e);
  }
}
