import { listPatches, proposePatch } from '@/db/repositories/assist-patches';
import { parseJsonBody } from '@/lib/api/parse-body';
import { proposePatchSchema } from '@/lib/assist-agents/api-schemas';
import { assistErrorResponse, assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';
import { findRecipeField } from '@/lib/assist-agents/recipe';
import { getRecipe } from '@/lib/assist-agents/registry';
import { ASSIST_PATCH_STATUSES, type AssistPatchStatus } from '@/lib/assist-agents/types';

/** GET /api/assist/patches?status=&recipeId= — the review queue (a lead sees only their own proposals). */
export async function GET(request: Request) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const params = new URL(request.url).searchParams;
  const rawStatus = params.get('status');
  const status = ASSIST_PATCH_STATUSES.includes(rawStatus as AssistPatchStatus) ? (rawStatus as AssistPatchStatus) : undefined;
  try {
    return json({ ok: true, patches: await listPatches(guard.ctx, { status, recipeId: params.get('recipeId') ?? undefined }) });
  } catch (error) {
    return assistErrorResponse(error, 'list patches');
  }
}

/** POST /api/assist/patches — propose a recipe fix found by a T1, T3 or T4 heal. Labels only. */
export async function POST(request: Request) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const body = await parseJsonBody(request, proposePatchSchema);
  if (body.ok === false) return json({ ok: false, error: body.error }, body.status);
  const recipe = getRecipe(body.data.recipeId);
  if (!recipe) return json({ ok: false, error: 'unknown_recipe' }, 400);
  // A repeating field is proposed under its concrete key (`directors[1].din`), which names its template.
  if (!findRecipeField(recipe, body.data.fieldKey)) return json({ ok: false, error: 'unknown_field' }, 400);
  try {
    return json({ ok: true, patch: await proposePatch(guard.ctx, body.data) }, 201);
  } catch (error) {
    return assistErrorResponse(error, 'propose patch');
  }
}
