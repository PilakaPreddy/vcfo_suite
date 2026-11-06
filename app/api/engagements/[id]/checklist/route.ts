import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  checklistStateForViewer,
  checklistStateFromRow,
  getEngagementById,
} from '@/db/repositories/engagements';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { applyChecklistPatch, ChecklistPatchRefused } from '@/lib/incorporation/apply-checklist-patch';

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  itemId: z.string().trim().min(1),
  patch: z.record(z.string(), z.unknown()),
  // Older bundles still send their copy of the state; the server merges onto
  // the persisted row only, so it is accepted and ignored.
  current: z.record(z.string(), z.unknown()).optional(),
});

/** GET /api/engagements/:id/checklist — load checklist_state for one engagement. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const row = await getEngagementById(guard.ctx, engagementDbId(id));
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    checklistState: checklistStateForViewer(guard.ctx, checklistStateFromRow(row)),
  });
}

/**
 * POST /api/engagements/:id/checklist — merge one checklist item patch.
 * Used by staff autosave / lead request-approval / general updateItem.
 * The rules of the save live in `applyChecklistPatch`, which Ask VCFO also calls.
 */

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, patchBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const { checklistState, email } = await applyChecklistPatch(guard.ctx, id, body.data.itemId, body.data.patch);

    return NextResponse.json({
      checklistState: checklistStateForViewer(guard.ctx, checklistState),
      email,
    });
  } catch (err) {
    if (err instanceof ChecklistPatchRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = publicErrorMessage(err, 'save_failed');
    const status = message.includes('not found') || message.includes('not permitted') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
