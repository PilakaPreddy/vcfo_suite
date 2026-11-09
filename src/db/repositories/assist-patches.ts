import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { assistAgentRuns, assistRecipePatches } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager } from '@/lib/auth';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { AssistAgentAccessError, assertAssistAgentStaff } from '@/db/repositories/assist-agent-runs';
import type {
  AssistPatchEvidence,
  AssistPatchProposal,
  AssistPatchStatus,
  AssistPatchTier,
  AssistPatchView,
} from '@/lib/assist-agents/types';

/**
 * ASSIST RECIPE PATCHES REPOSITORY — the review queue for field fixes the heal ladder found
 * (docs/specs/vcfo-assist-agents/PLAN.md §3, "fleet learning").
 *
 * A patch holds a recipe id, a field key, a proposed SOM path, selector or label, and label-only
 * evidence; no client value and no engagement data. A recipe is shared by every client, so:
 *   propose — any staff member, on a run they can reach (`assertEngagementAccess` on the run's
 *             engagement); the row records who proposed it;
 *   list    — super admin, admin and manager see the whole queue; a project lead sees only the
 *             patches they proposed;
 *   review  — super admin, admin and manager only, and only while the patch is `proposed`
 *             (two reviewers racing get one winner and one `already_decided`).
 * Clients and developers get nothing, before any query.
 */

type Row = typeof assistRecipePatches.$inferSelect;

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function toView(row: Row): AssistPatchView {
  return {
    id: row.id,
    recipeId: row.recipeId,
    recipeVersion: row.recipeVersion,
    fieldKey: row.fieldKey,
    proposed: row.proposed ?? {},
    evidence: row.evidence ?? {},
    sourceTier: row.sourceTier as AssistPatchTier,
    runId: row.runId,
    proposedBy: row.proposedBy,
    status: row.status as AssistPatchStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: iso(row.reviewedAt),
    createdAt: iso(row.createdAt)!,
  };
}

export interface ProposePatchInput {
  recipeId: string;
  recipeVersion: string;
  fieldKey: string;
  proposed: AssistPatchProposal;
  evidence: AssistPatchEvidence;
  sourceTier: AssistPatchTier;
  runId?: string | null;
}

/** Files a proposal. Throws `not_found` when the run named is out of the caller's reach. */
export async function proposePatch(ctx: AuthContext, input: ProposePatchInput): Promise<AssistPatchView> {
  assertAssistAgentStaff(ctx);
  if (input.runId) {
    const [run] = await db
      .select({ id: assistAgentRuns.id, engagementId: assistAgentRuns.engagementId })
      .from(assistAgentRuns)
      .where(eq(assistAgentRuns.id, input.runId))
      .limit(1);
    if (!run) throw new AssistAgentAccessError('not_found', 404);
    const access = await assertEngagementAccess(ctx, run.engagementId);
    if (access.ok === false) throw new AssistAgentAccessError('not_found', 404);
  }
  const [row] = await db
    .insert(assistRecipePatches)
    .values({
      recipeId: input.recipeId,
      recipeVersion: input.recipeVersion,
      fieldKey: input.fieldKey,
      proposed: input.proposed,
      evidence: input.evidence,
      sourceTier: input.sourceTier,
      runId: input.runId ?? null,
      proposedBy: ctx.userId,
      status: 'proposed',
    })
    .returning();
  return toView(row!);
}

export async function listPatches(
  ctx: AuthContext,
  filter: { status?: AssistPatchStatus; recipeId?: string; limit?: number } = {},
): Promise<AssistPatchView[]> {
  assertAssistAgentStaff(ctx);
  const where = [];
  if (!isAdminOrManager(ctx.role)) where.push(eq(assistRecipePatches.proposedBy, ctx.userId));
  if (filter.status) where.push(eq(assistRecipePatches.status, filter.status));
  if (filter.recipeId) where.push(eq(assistRecipePatches.recipeId, filter.recipeId));
  const rows = await db
    .select()
    .from(assistRecipePatches)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(assistRecipePatches.createdAt))
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 200));
  return rows.map(toView);
}

/** Approve or reject a proposed patch. Throws 403 for a lead, 404 when absent, 409 when already decided. */
export async function reviewPatch(
  ctx: AuthContext,
  patchId: string,
  decision: 'approved' | 'rejected',
): Promise<AssistPatchView> {
  assertAssistAgentStaff(ctx);
  if (!isAdminOrManager(ctx.role)) throw new AssistAgentAccessError('forbidden', 403);
  const [saved] = await db
    .update(assistRecipePatches)
    .set({ status: decision, reviewedBy: ctx.userId, reviewedAt: new Date() })
    .where(and(eq(assistRecipePatches.id, patchId), eq(assistRecipePatches.status, 'proposed')))
    .returning();
  if (saved) return toView(saved);
  const [exists] = await db.select({ id: assistRecipePatches.id }).from(assistRecipePatches).where(eq(assistRecipePatches.id, patchId)).limit(1);
  throw exists ? new AssistAgentAccessError('already_decided', 409) : new AssistAgentAccessError('not_found', 404);
}
