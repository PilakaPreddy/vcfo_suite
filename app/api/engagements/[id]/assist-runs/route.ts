import { createAgentRun, listAgentRuns } from '@/db/repositories/assist-agent-runs';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createAgentRunSchema } from '@/lib/assist-agents/api-schemas';
import { assistHostAllowed, findSubAgent } from '@/lib/assist-agents/catalog';
import { assistErrorResponse, assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';
import { getRecipe } from '@/lib/assist-agents/registry';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/engagements/[id]/assist-runs — this engagement's agent runs, newest first. Staff in scope. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const { id } = await context.params;
  try {
    const runs = await listAgentRuns(guard.ctx, id);
    if (!runs) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, runs });
  } catch (error) {
    return assistErrorResponse(error, 'list runs');
  }
}

/**
 * POST /api/engagements/[id]/assist-runs — start a run of one sub-agent. The agent, recipe id and
 * recipe version come from the server's catalog, not the body. A live portal host is refused
 * until `ASSIST_LIVE_PORTALS=true` (the CS opinion gate); the mock host always works.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const body = await parseJsonBody(request, createAgentRunSchema);
  if (body.ok === false) return json({ ok: false, error: body.error }, body.status);
  const sub = findSubAgent(body.data.subAgent);
  if (!sub) return json({ ok: false, error: 'unknown_sub_agent' }, 400);
  const recipe = sub.recipeId ? getRecipe(sub.recipeId) : null;
  if (!recipe) return json({ ok: false, error: 'no_recipe' }, 400);
  if (body.data.recipeVersion && body.data.recipeVersion !== recipe.version) {
    return json({ ok: false, error: 'recipe_outdated', recipeVersion: recipe.version }, 409);
  }
  if (!assistHostAllowed(body.data.portalHost)) return json({ ok: false, error: 'live_portals_disabled' }, 403);
  const { id } = await context.params;
  try {
    const run = await createAgentRun(guard.ctx, id, {
      agent: sub.agent,
      subAgent: sub.id,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      fieldsTotal: body.data.fieldsTotal ?? recipe.fields.length,
      state: body.data.state,
    });
    if (!run) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, run }, 201);
  } catch (error) {
    return assistErrorResponse(error, 'create run');
  }
}
