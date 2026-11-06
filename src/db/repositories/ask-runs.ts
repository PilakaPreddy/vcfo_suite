import 'server-only';

import { and, desc, eq, gt, max } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { askRuns, askRunSteps } from '@/db/schema-ask';
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
  input: { conversationId: string | null; workflow: string; goal: string; budgetTokens: number },
): Promise<AskRunRow> {
  assertAskRole(ctx);
  const [row] = await db
    .insert(askRuns)
    .values({
      profileId: ctx.userId,
      conversationId: input.conversationId,
      kind: 'fixed_workflow',
      workflow: input.workflow,
      status: 'running',
      goal: maskIdentityNumbers(input.goal).slice(0, 2000),
      budgetTokens: input.budgetTokens,
      startedAt: new Date(),
    })
    .returning();
  return row!;
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
  patch: Partial<Pick<AskRunRow, 'status' | 'error' | 'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'finishedAt'>> & { state?: JsonValue },
): Promise<void> {
  const { state, ...rest } = patch;
  await db
    .update(askRuns)
    .set({ ...rest, ...(state !== undefined ? { state: maskJson(state) } : {}) })
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
