import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { previewRecordEvent, recordEvent } from '@/lib/actions/filing/record-event';
import type { ActionContext } from '@/lib/actions/types';
import { complianceEventError, STAFF } from '../_respond';


/**
 * The screen's review of `filing.recordEvent`, the same action the Ask chat proposes.
 *
 * POST /api/compliance-events/review { input } — the review card: the form, the due date and what
 *      will be created, with any check that holds it. Reads only.
 * POST /api/compliance-events/review { input, confirm: true } — the person's approval click. The
 *      action's checks run again as that person, and only then does it execute.
 */
function actionContext(auth: ActionContext['auth'], engagementId: string): ActionContext {
  return { auth, engagementId, conversationId: null, runId: null, now: new Date(), via: 'route' };
}

const body = z.object({ input: z.unknown(), confirm: z.literal(true).optional() });

export async function POST(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const parsedBody = await parseJsonBody(request, body);
  if (parsedBody.ok === false) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  const parsed = recordEvent.input.safeParse(parsedBody.data.input);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the event details' }, { status: 400 });
  const actx = actionContext(guard.ctx, parsed.data.engagementId);
  try {
    if (!parsedBody.data.confirm) {
      const draft = await previewRecordEvent(actx, parsed.data);
      const row = draft.rows[0]!;
      return NextResponse.json({
        review: { title: draft.title, tier: draft.tier, summary: row.displayNew, checks: row.checks, heldReason: row.heldReason ?? null },
      });
    }
    const result = await recordEvent.execute(actx, parsed.data);
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (e) {
    return complianceEventError(e);
  }
}
