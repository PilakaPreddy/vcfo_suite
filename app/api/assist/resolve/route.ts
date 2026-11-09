import { addAgentRunAiUsage, canSpendOnAgentRun } from '@/db/repositories/assist-agent-runs';
import { parseJsonBody } from '@/lib/api/parse-body';
import { assistErrorResponse, assistStaffGuard, guardFailure, json } from '@/lib/assist-agents/http';
import { resolveField, resolveInputSchema } from '@/lib/assist-agents/resolve';

/**
 * POST /api/assist/resolve — the T3 heal: pick one of up to 40 candidate labels for a field.
 * Labels only; a payload that looks like personal data is refused (422). A run that has spent its
 * model calls, or is closed, gets the deterministic label match (tier T1). Staff only.
 */
export async function POST(request: Request) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const body = await parseJsonBody(request, resolveInputSchema);
  if (body.ok === false) return json({ ok: false, error: body.error }, body.status);
  try {
    const runId = body.data.runId;
    const allowModel = runId ? await canSpendOnAgentRun(guard.ctx, runId) : true;
    const result = await resolveField(body.data, { allowModel });
    if (runId && result.aiCalls > 0) await addAgentRunAiUsage(guard.ctx, runId, { calls: result.aiCalls, tokens: result.tokens });
    return json({ ok: true, ...result });
  } catch (error) {
    return assistErrorResponse(error, 'resolve');
  }
}
