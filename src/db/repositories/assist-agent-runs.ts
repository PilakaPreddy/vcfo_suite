import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { assistAgentRuns, engagements, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import {
  ASSIST_AGENT_RUN_CLOSED,
  type AssistHeal,
  type AssistRefusal,
  type AssistAgentRunStatus,
  type AssistAgentRunView,
} from '@/lib/assist-agents/types';

/**
 * ASSIST AGENT RUNS REPOSITORY — the VCFO Assist agents' run log (docs/specs/vcfo-assist-agents/PLAN.md),
 * table `assist_agent_runs`. Not `assist-runs.ts`, which serves the older "Start filing" table.
 *
 * Access (staff only; clients and developers get nothing, before any query):
 *   super admin and admin — every run;
 *   manager — runs on engagements they manage (the engagement scope);
 *   project lead (intern) — runs on engagements they lead.
 * One run is reached through its engagement (`assertEngagementAccess`). Only the person who
 * started a run, or an admin or manager in scope, may change it. A closed run (done, failed,
 * cancelled) takes no more changes. The AI counters are metered on the server by the resolver
 * (`addAgentRunAiUsage`), never written from the extension's PATCH.
 */

export class AssistAgentAccessError extends Error {
  constructor(
    message: 'forbidden' | 'not_found' | 'run_closed' | 'already_decided',
    readonly status: 403 | 404 | 409 | 400,
  ) {
    super(message);
    this.name = 'AssistAccessError';
  }
}

const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);

export function assertAssistAgentStaff(ctx: AuthContext): void {
  if (!STAFF.has(ctx.role)) throw new AssistAgentAccessError('forbidden', 403);
}

type Row = typeof assistAgentRuns.$inferSelect;

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function toView(row: Row, extra: { companyName?: string | null; userName?: string | null } = {}): AssistAgentRunView {
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    companyName: extra.companyName ?? null,
    userId: row.userId,
    userName: extra.userName ?? null,
    agent: row.agent,
    subAgent: row.subAgent,
    recipeId: row.recipeId,
    recipeVersion: row.recipeVersion,
    status: row.status as AssistAgentRunStatus,
    state: row.state,
    fieldsTotal: row.fieldsTotal,
    fieldsFilled: row.fieldsFilled,
    heals: row.heals ?? [],
    refusals: row.refusals ?? [],
    aiCalls: row.aiCalls,
    aiTokens: row.aiTokens,
    srn: row.srn,
    error: row.error,
    startedAt: iso(row.startedAt)!,
    finishedAt: iso(row.finishedAt),
    updatedAt: iso(row.updatedAt)!,
  };
}

export interface CreateAgentRunInput {
  agent: string;
  subAgent: string;
  recipeId: string;
  recipeVersion: string;
  fieldsTotal?: number;
  state?: string;
}

/** Starts a run on an engagement the caller can reach. Returns null when it cannot. */
export async function createAgentRun(ctx: AuthContext, engagementParam: string, input: CreateAgentRunInput): Promise<AssistAgentRunView | null> {
  assertAssistAgentStaff(ctx);
  const access = await assertEngagementAccess(ctx, engagementParam);
  if (access.ok === false) return null;
  const [row] = await db
    .insert(assistAgentRuns)
    .values({
      engagementId: access.dbId,
      userId: ctx.userId,
      agent: input.agent,
      subAgent: input.subAgent,
      recipeId: input.recipeId,
      recipeVersion: input.recipeVersion,
      status: 'running',
      state: input.state ?? 'READY',
      fieldsTotal: input.fieldsTotal ?? 0,
    })
    .returning();
  return row ? toView(row, { companyName: access.row.companyName, userName: ctx.name }) : null;
}

/** The raw row of one run the caller can reach, with the engagement access result. */
async function loadRun(ctx: AuthContext, runId: string): Promise<Row | null> {
  assertAssistAgentStaff(ctx);
  const [row] = await db.select().from(assistAgentRuns).where(eq(assistAgentRuns.id, runId)).limit(1);
  if (!row) return null;
  const access = await assertEngagementAccess(ctx, row.engagementId);
  return access.ok ? row : null;
}

export async function getAgentRun(ctx: AuthContext, runId: string): Promise<AssistAgentRunView | null> {
  const row = await loadRun(ctx, runId);
  return row ? toView(row) : null;
}

/** Runs on one engagement, newest first. Null when the engagement is out of reach. */
export async function listAgentRuns(ctx: AuthContext, engagementParam: string, limit = 50): Promise<AssistAgentRunView[] | null> {
  assertAssistAgentStaff(ctx);
  const access = await assertEngagementAccess(ctx, engagementParam);
  if (access.ok === false) return null;
  const rows = await db
    .select({ run: assistAgentRuns, userName: profiles.name })
    .from(assistAgentRuns)
    .leftJoin(profiles, eq(profiles.id, assistAgentRuns.userId))
    .where(eq(assistAgentRuns.engagementId, access.dbId))
    .orderBy(desc(assistAgentRuns.startedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => toView(r.run, { companyName: access.row.companyName, userName: r.userName }));
}

/** The staff page: recent runs across every engagement in the caller's scope. */
export async function listRecentAgentRuns(ctx: AuthContext, limit = 50): Promise<AssistAgentRunView[]> {
  assertAssistAgentStaff(ctx);
  const scope = isFirmWideAdmin(ctx.role) ? 'all' : await listScopedEngagementIds(ctx);
  if (scope !== 'all' && scope.length === 0) return [];
  const rows = await db
    .select({ run: assistAgentRuns, companyName: engagements.companyName, userName: profiles.name })
    .from(assistAgentRuns)
    .innerJoin(engagements, eq(engagements.id, assistAgentRuns.engagementId))
    .leftJoin(profiles, eq(profiles.id, assistAgentRuns.userId))
    .where(scope === 'all' ? sql`${engagements.deletedAt} is null` : and(inArray(assistAgentRuns.engagementId, scope), sql`${engagements.deletedAt} is null`))
    .orderBy(desc(assistAgentRuns.startedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => toView(r.run, { companyName: r.companyName, userName: r.userName }));
}

export interface UpdateAgentRunInput {
  status?: AssistAgentRunStatus;
  state?: string;
  fieldsTotal?: number;
  fieldsFilled?: number;
  heals?: AssistHeal[];
  refusals?: AssistRefusal[];
  srn?: string | null;
  error?: string | null;
}

/**
 * Progress, the SRN and the finish. `engagementParam` must be the run's own engagement, so a run
 * id cannot be moved under another engagement's URL. Throws `AssistAgentAccessError` (404 or 409).
 */
export async function updateAgentRun(
  ctx: AuthContext,
  engagementParam: string,
  runId: string,
  patch: UpdateAgentRunInput,
): Promise<{ run: AssistAgentRunView; finished: boolean }> {
  const row = await loadRun(ctx, runId);
  if (!row) throw new AssistAgentAccessError('not_found', 404);
  const access = await assertEngagementAccess(ctx, engagementParam);
  if (access.ok === false || access.dbId !== row.engagementId) throw new AssistAgentAccessError('not_found', 404);
  if (row.userId !== ctx.userId && !isAdminOrManager(ctx.role)) throw new AssistAgentAccessError('forbidden', 403);
  if (ASSIST_AGENT_RUN_CLOSED.has(row.status as AssistAgentRunStatus)) throw new AssistAgentAccessError('run_closed', 409);

  const finished = patch.status !== undefined && ASSIST_AGENT_RUN_CLOSED.has(patch.status);
  const set: Partial<typeof assistAgentRuns.$inferInsert> = { updatedAt: new Date() };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.state !== undefined) set.state = patch.state;
  if (patch.fieldsTotal !== undefined) set.fieldsTotal = patch.fieldsTotal;
  if (patch.fieldsFilled !== undefined) set.fieldsFilled = patch.fieldsFilled;
  if (patch.heals !== undefined) set.heals = patch.heals;
  if (patch.refusals !== undefined) set.refusals = patch.refusals;
  if (patch.srn !== undefined) set.srn = patch.srn;
  if (patch.error !== undefined) set.error = patch.error;
  if (finished) set.finishedAt = new Date();

  const [saved] = await db
    .update(assistAgentRuns)
    .set(set)
    .where(and(eq(assistAgentRuns.id, row.id), eq(assistAgentRuns.engagementId, access.dbId)))
    .returning();
  if (!saved) throw new AssistAgentAccessError('not_found', 404);
  return { run: toView(saved, { companyName: access.row.companyName }), finished };
}

/** Most model calls one run may make; past it the resolver answers with the label match only. */
export const ASSIST_AGENT_RUN_MAX_AI_CALLS = 10;

/**
 * Meters one resolver call on its run. Returns false when the run is out of reach, closed, or has
 * spent its calls; the caller then must not make the model call.
 */
export async function canSpendOnAgentRun(ctx: AuthContext, runId: string): Promise<boolean> {
  const row = await loadRun(ctx, runId);
  if (!row || ASSIST_AGENT_RUN_CLOSED.has(row.status as AssistAgentRunStatus)) return false;
  return row.aiCalls < ASSIST_AGENT_RUN_MAX_AI_CALLS;
}

export async function addAgentRunAiUsage(ctx: AuthContext, runId: string, usage: { calls: number; tokens: number }): Promise<void> {
  if (usage.calls <= 0 && usage.tokens <= 0) return;
  const row = await loadRun(ctx, runId);
  if (!row) return;
  await db
    .update(assistAgentRuns)
    .set({
      aiCalls: sql`${assistAgentRuns.aiCalls} + ${usage.calls}`,
      aiTokens: sql`${assistAgentRuns.aiTokens} + ${usage.tokens}`,
      updatedAt: new Date(),
    })
    .where(eq(assistAgentRuns.id, row.id));
}
