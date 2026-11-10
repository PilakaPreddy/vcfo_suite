import { assistErrorResponse, assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';
import { getRecipe } from '@/lib/assist-agents/registry';
import { signRecipe } from '@/lib/assist-agents/signing';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/assist/recipes/[id] — `{ recipe, sig, alg: 'ed25519', keyId }`, an Ed25519 signature
 * over the recipe's canonical JSON. `keyId: 'dev'` when ASSIST_RECIPE_PRIVATE_KEY is not set.
 * Staff only.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const { id } = await context.params;
  const recipe = getRecipe(id);
  if (!recipe) return json({ ok: false, error: 'not_found' }, 404);
  try {
    return json({ ok: true, ...signRecipe(recipe) });
  } catch (error) {
    // A malformed ASSIST_RECIPE_PRIVATE_KEY: say so in the log, never serve an unsigned recipe.
    return assistErrorResponse(error, 'sign recipe');
  }
}
