import { listRecentAgentRuns } from '@/db/repositories/assist-agent-runs';
import { assistErrorResponse, assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';

/** GET /api/assist/agent-runs?limit= — recent agent runs on every engagement in the caller's scope (the staff page). */
export async function GET(request: Request) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50);
  try {
    return json({ ok: true, runs: await listRecentAgentRuns(guard.ctx, Number.isFinite(limit) ? limit : 50) });
  } catch (error) {
    return assistErrorResponse(error, 'list recent runs');
  }
}
