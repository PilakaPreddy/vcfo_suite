import { assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';
import { getRecipe } from '@/lib/assist-agents/registry';
import { signRecipe } from '@/lib/assist-agents/signing';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/assist/recipes/[id] — `{ recipe, sig }`, the HMAC over the recipe's canonical JSON. Staff only. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const { id } = await context.params;
  const recipe = getRecipe(id);
  if (!recipe) return json({ ok: false, error: 'not_found' }, 404);
  return json({ ok: true, recipe, sig: signRecipe(recipe), alg: 'HMAC-SHA256' });
}
