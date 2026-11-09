import 'server-only';

import { and, desc, eq, gt, inArray, isNull, max, sql } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { profiles } from '@/db/schema';
import { askRuns, askRunSteps } from '@/db/schema-ask';
import { isValidDbRole } from '@/lib/auth';
import { AskForbiddenError, assertAskRole } from '@/lib/ask/access';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { maskIdentityNumbers } from '@/lib/ask/mask';

/**
 * Traces of fixed workflows and, later, agent runs. Every run acts as the person who started it, and
 * only that person reads it: `profile_id = ctx.userId` is in every query. The goal and every step
 * pass through the mask, so a stored trace holds no identity number.
 */
export type AskRunRow = typeof askRuns.$inferSelect;

function maskJson(value: JsonValue | undefined): JsonValue | undefined {
  return value === undefined ? undefined : (JSON.parse(maskIdentityNumbers(JSON.stringify(value))) as JsonValue);
}

export async function createAskRun(
  ctx: AuthContext,
  input: { conversationId: string | null; workflow: string; goal: string; budgetTokens: number; status?: 'running' | 'queued'; state?: JsonValue },
): Promise<AskRunRow> {
  assertAskRole(ctx);
  // A queued run (a drop) has not started: `started_at` is set when the person presses start.
  const queued = input.status === 'queued';
  const [row] = await db
    .insert(askRuns)
    .values({
      profileId: ctx.userId,
      conversationId: input.conversationId,
      kind: 'fixed_workflow',
      workflow: input.workflow,
      status: queued ? 'queued' : 'running',
      goal: maskIdentityNumbers(input.goal).slice(0, 2000),
      budgetTokens: input.budgetTokens,
      ...(input.state !== undefined ? { state: maskJson(input.state) } : {}),
      startedAt: queued ? null : new Date(),
    })
    .returning();
  return row!;
}

/** The person's own run, or null for anyone else's. */
export async function getOwnAskRun(ctx: AuthContext, runId: string): Promise<AskRunRow | null> {
  assertAskRole(ctx);
  const [row] = await db
    .select()
    .from(askRuns)
    .where(and(eq(askRuns.id, runId), eq(askRuns.profileId, ctx.userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Marks a queued run as started, once: only a run that is still queued and was never started moves,
 * so a second press of "start" or a replayed request does nothing. Returns false when it did not move.
 */
export async function startQueuedAskRun(ctx: AuthContext, runId: string, patch: { goal: string; state: JsonValue }): Promise<boolean> {
  assertAskRole(ctx);
  const rows = await db
    .update(askRuns)
    .set({ goal: maskIdentityNumbers(patch.goal).slice(0, 2000), state: maskJson(patch.state), startedAt: new Date() })
    .where(and(eq(askRuns.id, runId), eq(askRuns.profileId, ctx.userId), eq(askRuns.status, 'queued'), isNull(askRuns.startedAt)))
    .returning({ id: askRuns.id });
  return rows.length > 0;
}

/**
 * Rebuilds the AuthContext of the person who owns a run, for a background job. The profile is read
 * again, so a person who was disabled or changed role since does not keep their old reach: an
 * inactive profile, an unknown role or a lead without an intern id gets null, as the request guard
 * would give. System-level on purpose: the job has no session, and the run id is all it carries.
 */
export async function askRunActor(runId: string): Promise<{ ctx: AuthContext; run: AskRunRow } | null> {
  const [found] = await db
    .select({
      run: askRuns,
      person: {
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        internId: profiles.internId,
        clientId: profiles.clientId,
        status: profiles.status,
      },
    })
    .from(askRuns)
    .innerJoin(profiles, eq(profiles.id, askRuns.profileId))
    .where(eq(askRuns.id, runId))
    .limit(1);
  if (!found) return null;
  const { run, person } = found;
  if (person.status !== 'active' || !isValidDbRole(person.role)) return null;
  if (person.role === 'developer' || person.role === 'partner') return null;
  if (person.role === 'intern' && !person.internId?.trim()) return null;
  const ctx: AuthContext = {
    userId: person.id,
    email: person.email ?? '',
    name: person.name?.trim() || person.email?.split('@')[0] || 'User',
    role: person.role,
    internId: person.internId ?? undefined,
    clientId: person.clientId ?? undefined,
  };
  return { ctx, run };
}

/** How long a queued or running drop counts as active; an older one is treated as stuck. */
const ACTIVE_HOURS = 6;

/** The drop still working in this conversation, so a reopened panel picks the progress poll back up. */
export async function findActiveAskRun(ctx: AuthContext, conversationId: string, now: Date): Promise<AskRunRow | null> {
  assertAskRole(ctx);
  const [row] = await db
    .select()
    .from(askRuns)
    .where(
      and(
        eq(askRuns.profileId, ctx.userId),
        eq(askRuns.conversationId, conversationId),
        // Only a drop runs in the background; a chat run left 'running' by a dropped stream must not
        // make the panel poll it. The literal matches DROP_WORKFLOW in src/lib/ask/drop/types.ts.
        eq(askRuns.workflow, 'drop'),
        inArray(askRuns.status, ['queued', 'running']),
        gt(askRuns.createdAt, new Date(now.getTime() - ACTIVE_HOURS * 3_600_000)),
      ),
    )
    .orderBy(desc(askRuns.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Adds what one step of a background run spent to the run's totals. Each Inngest step meters its own
 * calls, so the totals are added, never overwritten, and the budget check sees every step.
 */
export async function addAskRunUsage(
  ctx: AuthContext,
  runId: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; model?: string | null },
): Promise<void> {
  await db
    .update(askRuns)
    .set({
      inputTokens: sql`${askRuns.inputTokens} + ${usage.inputTokens}`,
      outputTokens: sql`${askRuns.outputTokens} + ${usage.outputTokens}`,
      cacheReadTokens: sql`${askRuns.cacheReadTokens} + ${usage.cacheReadTokens}`,
      cacheWriteTokens: sql`${askRuns.cacheWriteTokens} + ${usage.cacheWriteTokens}`,
      ...(usage.model ? { model: usage.model } : {}),
    })
    .where(and(eq(askRuns.id, runId), eq(askRuns.profileId, ctx.userId)));
}

/** Locks a run to one engagement, after a repository call confirms the person can reach it. */
export async function lockAskRun(ctx: AuthContext, runId: string, engagementId: string): Promise<boolean> {
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new AskForbiddenError('That project is not available.');
  const rows = await db
    .update(askRuns)
    .set({ engagementId: access.dbId })
    .where(and(eq(askRuns.id, runId), eq(askRuns.profileId, ctx.userId)))
    .returning({ id: askRuns.id });
  return rows.length > 0;
}

export async function updateAskRun(
  ctx: AuthContext,
  runId: string,
  patch: Partial<Pick<AskRunRow, 'status' | 'error' | 'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'finishedAt' | 'startedAt'>> & { state?: JsonValue },
): Promise<void> {
  const { state, error, ...rest } = patch;
  await db
    .update(askRuns)
    .set({
      ...rest,
      ...(error !== undefined ? { error: error === null ? null : maskIdentityNumbers(error).slice(0, 2000) } : {}),
      ...(state !== undefined ? { state: maskJson(state) } : {}),
    })
    .where(and(eq(askRuns.id, runId), eq(askRuns.profileId, ctx.userId)));
}

const WAITING_HOURS = 24;

/** A question the chat asked this person in this conversation, still open. */
export async function findWaitingAskRun(ctx: AuthContext, conversationId: string, now: Date): Promise<AskRunRow | null> {
  assertAskRole(ctx);
  const [row] = await db
    .select()
    .from(askRuns)
    .where(
      and(
        eq(askRuns.profileId, ctx.userId),
        eq(askRuns.conversationId, conversationId),
        eq(askRuns.status, 'waiting_reply'),
        gt(askRuns.createdAt, new Date(now.getTime() - WAITING_HOURS * 3_600_000)),
      ),
    )
    .orderBy(desc(askRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function appendAskRunStep(
  ctx: AuthContext,
  runId: string,
  step: { kind: 'model' | 'tool' | 'check' | 'approval'; name: string; label?: string; status?: string; input?: JsonValue; output?: JsonValue; changesetId?: string },
): Promise<void> {
  const [own] = await db
    .select({ id: askRuns.id, last: max(askRunSteps.ordinal) })
    .from(askRuns)
    .leftJoin(askRunSteps, eq(askRunSteps.runId, askRuns.id))
    .where(and(eq(askRuns.id, runId), eq(askRuns.profileId, ctx.userId)))
    .groupBy(askRuns.id);
  if (!own) return;
  await db.insert(askRunSteps).values({
    runId,
    ordinal: (own.last ?? -1) + 1,
    kind: step.kind,
    name: step.name,
    label: step.label,
    status: step.status ?? 'done',
    input: maskJson(step.input),
    output: maskJson(step.output),
    changesetId: step.changesetId,
  });
}
