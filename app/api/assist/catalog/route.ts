import { assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';
import { ASSIST_AGENTS, assistLivePortalsEnabled, assistMockHosts } from '@/lib/assist-agents/catalog';
import { getRecipe } from '@/lib/assist-agents/registry';

/** GET /api/assist/catalog — the agents and sub-agents, each with its recipe version. Staff only. */
export async function GET() {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const agents = ASSIST_AGENTS.map((agent) => ({
    ...agent,
    subAgents: agent.subAgents.map((sub) => ({ ...sub, recipeVersion: sub.recipeId ? (getRecipe(sub.recipeId)?.version ?? null) : null })),
  }));
  return json({ ok: true, agents, liveEnabled: assistLivePortalsEnabled(), mockHosts: assistMockHosts() });
}
