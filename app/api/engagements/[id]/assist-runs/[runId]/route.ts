import { getAgentRun, updateAgentRun } from '@/db/repositories/assist-agent-runs';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { parseJsonBody } from '@/lib/api/parse-body';
import { updateAgentRunSchema } from '@/lib/assist-agents/api-schemas';
import { assistErrorResponse, assistStaffGuard, guardFailure, isRowId, json } from '@/lib/assist-agents/http';
import { recordRunSrn } from '@/lib/assist-agents/record-srn';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';

type RouteContext = { params: Promise<{ id: string; runId: string }> };

/** GET /api/engagements/[id]/assist-runs/[runId] — one run, for a resume after a reload. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const { id, runId } = await context.params;
  if (!isRowId(runId)) return json({ ok: false, error: 'not_found' }, 404);
  try {
    const run = await getAgentRun(guard.ctx, runId);
    // Compare uuids: the URL may name the engagement by uuid, legacy id or slug.
    const access = run ? await assertEngagementAccess(guard.ctx, id) : null;
    if (!run || !access?.ok || engagementDbId(run.engagementId) !== access.dbId) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, run });
  } catch (error) {
    return assistErrorResponse(error, 'get run');
  }
}

/**
 * PATCH /api/engagements/[id]/assist-runs/[runId] — progress, the SRN and the finish. When the run
 * finishes `done` with an SRN, the SRN is appended to the step's filing note where the catalog
 * names one (`srnWriteBack` says what happened); otherwise it stays on the run.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await assistStaffGuard();
  if (guard.ok === false) return guardFailure(guard);
  const body = await parseJsonBody(request, updateAgentRunSchema);
  if (body.ok === false) return json({ ok: false, error: body.error }, body.status);
  const { id, runId } = await context.params;
  if (!isRowId(runId)) return json({ ok: false, error: 'not_found' }, 404);
  try {
    const { run, finished, engagementDbId: dbId } = await updateAgentRun(guard.ctx, id, runId, body.data);
    // The resolved uuid, not `id`: the URL may name the engagement by its slug.
    const srnWriteBack = finished && run.status === 'done' && run.srn ? await recordRunSrn(guard.ctx, dbId, run.subAgent, run.srn) : undefined;
    return json({ ok: true, run, ...(srnWriteBack ? { srnWriteBack } : {}) });
  } catch (error) {
    return assistErrorResponse(error, 'update run');
  }
}
