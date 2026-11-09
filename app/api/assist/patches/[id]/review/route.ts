import { recordAuditEvent } from '@/db/repositories/audit-events';
import { reviewPatch } from '@/db/repositories/assist-patches';
import { parseJsonBody } from '@/lib/api/parse-body';
import { reviewPatchSchema } from '@/lib/assist-agents/api-schemas';
import { assistErrorResponse, assistStaffGuard, guardFailure, isRowId, json } from '@/lib/assist-agents/http';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/assist/patches/[id]/review — approve or reject a proposed patch. Super admin, admin
 * and manager only (a lead gets 403). Approval records the decision; the recipe file itself is
 * changed by a person, with a version bump, in the next deploy.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const body = await parseJsonBody(request, reviewPatchSchema);
  if (body.ok === false) return json({ ok: false, error: body.error }, body.status);
  const { id } = await context.params;
  if (!isRowId(id)) return json({ ok: false, error: 'not_found' }, 404);
  try {
    const patch = await reviewPatch(guard.ctx, id, body.data.decision);
    await recordAuditEvent(guard.ctx, {
      action: `assist.patch_${body.data.decision}`,
      summary: `${body.data.decision === 'approved' ? 'Approved' : 'Rejected'} a VCFO Assist recipe fix for ${patch.recipeId} ${patch.fieldKey}`,
      metadata: { patchId: patch.id, recipeId: patch.recipeId, recipeVersion: patch.recipeVersion, fieldKey: patch.fieldKey },
    });
    return json({ ok: true, patch });
  } catch (error) {
    return assistErrorResponse(error, 'review patch');
  }
}
