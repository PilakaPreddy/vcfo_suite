import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { clientSaveStepDraft, FileRequestError } from '@/db/repositories/client-incorporation';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ stepId: string }> };

const FRIENDLY: Record<string, string> = {
  step_closed: 'This step is submitted. Ask for a change to edit it.',
  not_a_client_step: 'SBC fills this step.',
  no_editable_answers: 'There is nothing to save on this step.',
};

/**
 * POST /api/client/steps/:stepId/draft — the client saves a draft of the answers on a step it
 * fills itself (C-218). Body: { engagementId, responses: { fieldId: value } }.
 *
 * The draft does not submit. The repository (`clientSaveStepDraft`) checks the role, the
 * engagement and the step, and keeps only the text answers the client may fill.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { stepId } = await context.params;
  let body: { engagementId?: string; responses?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const engagementId = body.engagementId?.trim();
  const responses = body.responses;
  if (!engagementId || !stepId?.trim() || !responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    const out = await clientSaveStepDraft(guard.ctx, engagementId, stepId.trim(), responses);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof FileRequestError) {
      return NextResponse.json({ error: FRIENDLY[err.message] ?? err.message }, { status: err.status });
    }
    const message = publicErrorMessage(err, 'draft_failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
