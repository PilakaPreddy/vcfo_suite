import 'server-only';

import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { askMessages, askUsageDaily } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { AskForbiddenError, assertAskRole } from '@/lib/ask/access';
import { askBudgets, askFlags } from '@/lib/ask/config';
import { NO_LLM_USAGE, type LlmUsage } from '@/lib/ask/provider';
import type { ModelSpend } from '@/lib/ask/provider/meter';
import { estimateCostUsd } from '@/lib/ask/provider/pricing';
import type { AskPath } from '@/lib/ask/paths';

/**
 * ASK VCFO USAGE — tokens per day (IST), path and model across Answer, Do and Watch.
 *
 * `system*` skip AuthContext on purpose: every path writes here after a model call, jobs included,
 * and the numbers hold no person, client or text. The report is for a super admin only.
 */

function istDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(at);
}

export async function systemRecordAskUsage(path: AskPath, spend: readonly ModelSpend[], at: Date = new Date()): Promise<void> {
  if (spend.length === 0) return;
  const day = istDay(at);
  await db
    .insert(askUsageDaily)
    .values(
      spend.map((s) => ({
        day,
        path,
        model: s.model,
        calls: s.calls,
        inputTokens: s.usage.inputTokens,
        outputTokens: s.usage.outputTokens,
        cacheReadTokens: s.usage.cacheReadTokens,
        cacheWriteTokens: s.usage.cacheWriteTokens,
      })),
    )
    .onConflictDoUpdate({
      target: [askUsageDaily.day, askUsageDaily.path, askUsageDaily.model],
      set: {
        calls: sql`${askUsageDaily.calls} + excluded.calls`,
        inputTokens: sql`${askUsageDaily.inputTokens} + excluded.input_tokens`,
        outputTokens: sql`${askUsageDaily.outputTokens} + excluded.output_tokens`,
        cacheReadTokens: sql`${askUsageDaily.cacheReadTokens} + excluded.cache_read_tokens`,
        cacheWriteTokens: sql`${askUsageDaily.cacheWriteTokens} + excluded.cache_write_tokens`,
      },
    });
}

/** Today's spend against the daily budget. Cache reads do not count; a cache write is full spend. */
export async function systemTodayTokenTotal(at: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${askUsageDaily.inputTokens} + ${askUsageDaily.outputTokens} + ${askUsageDaily.cacheWriteTokens}), 0)`,
    })
    .from(askUsageDaily)
    .where(eq(askUsageDaily.day, istDay(at)));
  return Number(row?.total ?? 0);
}

export const UNRECORDED_PATH = 'unrecorded';

export interface AskUsageRow extends LlmUsage {
  /** An AskPath, or `unrecorded` for answers stored before the path was logged. */
  path: string;
  messages: number;
  calls: number;
  costUsd: number;
}

export interface AskUsageReport {
  days: number;
  rows: AskUsageRow[];
  todayTokens: number;
  dailyBudget: number;
  killedPaths: string[];
}

/**
 * Tokens per path over the last `days` days, costliest first. Spend comes from the daily roll-up.
 * Answers from before the roll-up have no path, so they appear as one row from their own usage
 * columns, which hold one model per message and so overstate a cost that was split with the router.
 */
export async function askUsageReport(ctx: AuthContext, input: { days: number; now?: Date }): Promise<AskUsageReport> {
  assertAskRole(ctx);
  if (ctx.role !== 'super_admin') throw new AskForbiddenError('Only a super admin sees token use');
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.days * 86_400_000);

  const [spend, counts, unrecorded, todayTokens] = await Promise.all([
    db
      .select({
        path: askUsageDaily.path,
        model: askUsageDaily.model,
        calls: sql<string>`sum(${askUsageDaily.calls})`,
        inputTokens: sql<string>`sum(${askUsageDaily.inputTokens})`,
        outputTokens: sql<string>`sum(${askUsageDaily.outputTokens})`,
        cacheReadTokens: sql<string>`sum(${askUsageDaily.cacheReadTokens})`,
        cacheWriteTokens: sql<string>`sum(${askUsageDaily.cacheWriteTokens})`,
      })
      .from(askUsageDaily)
      .where(gte(askUsageDaily.day, istDay(since)))
      .groupBy(askUsageDaily.path, askUsageDaily.model),
    db
      .select({ path: askMessages.path, messages: sql<string>`count(*)` })
      .from(askMessages)
      .where(and(eq(askMessages.sender, 'assistant'), isNotNull(askMessages.path), gte(askMessages.createdAt, since)))
      .groupBy(askMessages.path),
    db
      .select({
        model: askMessages.model,
        messages: sql<string>`count(*)`,
        inputTokens: sql<string>`coalesce(sum(${askMessages.inputTokens}), 0)`,
        outputTokens: sql<string>`coalesce(sum(${askMessages.outputTokens}), 0)`,
        cacheReadTokens: sql<string>`coalesce(sum(${askMessages.cacheReadTokens}), 0)`,
      })
      .from(askMessages)
      .where(and(eq(askMessages.sender, 'assistant'), isNull(askMessages.path), isNotNull(askMessages.model), gte(askMessages.createdAt, since)))
      .groupBy(askMessages.model),
    systemTodayTokenTotal(now),
  ]);

  const rows = new Map<string, AskUsageRow>();
  const rowFor = (path: string): AskUsageRow => {
    const seen = rows.get(path);
    if (seen) return seen;
    const fresh: AskUsageRow = { path, messages: 0, calls: 0, costUsd: 0, ...NO_LLM_USAGE };
    rows.set(path, fresh);
    return fresh;
  };
  const addSpend = (row: AskUsageRow, model: string, usage: LlmUsage) => {
    row.inputTokens += usage.inputTokens;
    row.outputTokens += usage.outputTokens;
    row.cacheReadTokens += usage.cacheReadTokens;
    row.cacheWriteTokens += usage.cacheWriteTokens;
    row.costUsd += estimateCostUsd(model, usage);
  };

  for (const s of spend) {
    const row = rowFor(s.path);
    row.calls += Number(s.calls);
    addSpend(row, s.model, {
      inputTokens: Number(s.inputTokens),
      outputTokens: Number(s.outputTokens),
      cacheReadTokens: Number(s.cacheReadTokens),
      cacheWriteTokens: Number(s.cacheWriteTokens),
    });
  }
  for (const c of counts) if (c.path) rowFor(c.path).messages = Number(c.messages);
  for (const u of unrecorded) {
    const row = rowFor(UNRECORDED_PATH);
    row.messages += Number(u.messages);
    addSpend(row, u.model ?? '', {
      inputTokens: Number(u.inputTokens),
      outputTokens: Number(u.outputTokens),
      cacheReadTokens: Number(u.cacheReadTokens),
      cacheWriteTokens: 0,
    });
  }

  return {
    days: input.days,
    rows: [...rows.values()].sort((a, b) => b.costUsd - a.costUsd || b.messages - a.messages),
    todayTokens,
    dailyBudget: askBudgets().dailyTokens,
    killedPaths: [...askFlags().killedPaths],
  };
}
