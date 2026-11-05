import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { checklistStateForViewer, unlockChecklistFields } from '@/db/repositories/engagements';
import { isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  itemId: z.string().trim().min(1),
  unlockedFields: z.array(z.string()).default([]),
});

/** POST /api/engagements/:id/checklist/unlock — staff reopen client fields. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const checklistState = await unlockChecklistFields(
      guard.ctx,
      id,
      body.data.itemId,
      body.data.unlockedFields,
    );
    // Direct flow: "Reopen step" tells every party; other steps keep the
    // field-unlock notice to the client.
    const reopened = isDirectFlowStep(body.data.itemId);
    const email = await notifyEngagementEventSoon({
      engagementId: id,
      itemId: body.data.itemId,
      event: reopened ? 'step_reopened' : 'unlocked',
      actorUserId: guard.ctx.userId,
      actorName: guard.ctx.name,
      actorRole: guard.ctx.role,
    });
    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unlock_failed';
    const status =
      message.includes('may not unlock') ? 403
      : message.includes('not found') || message.includes('not permitted') ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
