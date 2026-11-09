import 'server-only';

import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';
import { updateAskRun, type AskRunRow } from '@/db/repositories/ask-runs';
import { systemRecordAskUsage, systemTodayTokenTotal } from '@/db/repositories/ask-usage';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { askBudgets, askConfig, askFlags } from '@/lib/ask/config';
import { ReadRefused } from '@/lib/ask/data-router/read';
import { addLlmUsage, getAskProvider, NO_LLM_USAGE, type LlmProvider, type LlmUsage } from '@/lib/ask/provider';
import { meterProvider, type MeteredProvider } from '@/lib/ask/provider/meter';
import { checkAskRateLimit } from '@/lib/ask/rate-limit';
import { REFUSAL_COPY } from '@/lib/ask/refusals';

/**
 * What one Do run needs around its model calls: a metered provider that checks every budget before
 * each call, and the close that writes the run's spend and status. The chat's data router and the
 * drop job share it, so a budget is enforced the same way on both paths.
 *
 * The run's own budget (`ask_runs.budget_tokens`) counts input plus output tokens across every
 * invocation of the run: the tokens already stored on the row are the starting point, so a run that
 * resumes after a question, or a drop whose job runs in several steps, cannot spend its budget twice.
 * When the next call would start past the budget, the call is refused with `RunOverBudget`, the run is
 * marked over budget, and whatever the run prepared before stays.
 */

export type DoEvent = { type: 'progress'; runId: string; label: string } | { type: 'run'; runId: string; status: string };

export interface DoWorkResult {
  answer: AnswerEnvelope;
  metered: MeteredProvider | null;
}

export const RUN_OVER_BUDGET_COPY = 'This has used up its reading budget, so I stopped here. What I prepared so far is kept.';

/** Thrown before a model call that the run's token budget no longer covers. A ReadRefused, so readers report it like any refusal. */
export class RunOverBudget extends ReadRefused {
  constructor() {
    super(RUN_OVER_BUDGET_COPY);
    this.name = 'RunOverBudget';
  }
}

const UNAVAILABLE = 'Reading this needs the Ask VCFO model, which is not available right now. Please type the details as "Label: value" lines.';

/** Statuses that leave the run open: it is waiting for the person. */
const OPEN_STATUSES = new Set(['queued', 'running', 'waiting_reply', 'waiting_approval']);

/**
 * A run that went over budget is stored as `over_budget`, even when it prepared a card: the card and
 * its rows stay, and the status tells the person that some of the work was not done. Only a run still
 * waiting for the person's reply keeps its status, because that reply is how it resumes.
 */
function finalStatus(status: string, overBudget: boolean): string {
  if (!overBudget || status === 'waiting_reply' || status === 'queued' || status === 'running') return status;
  return 'over_budget';
}

export interface RunContext {
  ctx: AuthContext;
  runId: string;
  /** The provider every reader and chooser uses. Each call is metered and checked against every budget first. */
  provider: () => Promise<LlmProvider>;
  deps: { provider: () => Promise<LlmProvider>; model: string; idDocReading: boolean };
  /** The metered provider, once a call has needed one. */
  metered: () => MeteredProvider | null;
  /** What this invocation spent. */
  usage: () => LlmUsage;
  /** Input plus output tokens for the whole run, this invocation included. */
  spentTokens: () => number;
  /** True once a call was refused for the run's budget. */
  overBudget: () => boolean;
  progress: (label: string) => void;
  /** Writes the spend and the status. A run that went over budget is stored as `over_budget` unless it waits for a reply. Returns the status written. */
  close: (status: string, opts?: { state?: JsonValue; error?: string }) => Promise<string>;
  /** Closes the run and returns the answer stamped with the run id, for the chat. */
  finish: (answer: AnswerEnvelope, status?: string, opts?: { state?: JsonValue; error?: string }) => Promise<DoWorkResult>;
  /** Writes this invocation's spend to the daily usage table. The chat records its own, so only a job calls this. */
  recordUsage: () => Promise<void>;
}

export function createRunContext(input: {
  ctx: AuthContext;
  run: Pick<AskRunRow, 'id' | 'budgetTokens' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>;
  now: Date;
  emit?: (event: DoEvent) => void;
}): RunContext {
  const { ctx, run, now } = input;
  const emit = input.emit ?? (() => {});
  const config = askConfig();
  const budgets = askBudgets();
  const flags = askFlags();
  const baseline = {
    inputTokens: run.inputTokens ?? 0,
    outputTokens: run.outputTokens ?? 0,
    cacheReadTokens: run.cacheReadTokens ?? 0,
    cacheWriteTokens: run.cacheWriteTokens ?? 0,
  };
  let metered: MeteredProvider | null = null;
  let guarded: LlmProvider | null = null;
  let overBudget = false;

  const usage = (): LlmUsage => (metered?.spend() ?? []).reduce((sum, s) => addLlmUsage(sum, s.usage), NO_LLM_USAGE);
  const spentTokens = () => {
    const now = usage();
    return baseline.inputTokens + baseline.outputTokens + now.inputTokens + now.outputTokens;
  };

  const beforeCall = async () => {
    if (spentTokens() >= run.budgetTokens) {
      overBudget = true;
      throw new RunOverBudget();
    }
    if ((await systemTodayTokenTotal(new Date())) >= budgets.dailyTokens) throw new ReadRefused(REFUSAL_COPY.budgetReached);
    if (!(await checkAskRateLimit(ctx, config.rateLimit, now)).ok) throw new ReadRefused(REFUSAL_COPY.rateLimited);
  };

  const provider = async (): Promise<LlmProvider> => {
    if (guarded) return guarded;
    // The budgets are checked before the provider is built, so an exhausted run fails fast.
    await beforeCall();
    const configured = await getAskProvider();
    if (!configured) throw new ReadRefused(UNAVAILABLE);
    const inner = meterProvider(configured);
    metered = inner;
    let first = true;
    guarded = {
      name: inner.name,
      async complete(req) {
        // The first call was checked a moment ago, when the provider was built.
        if (!first) await beforeCall();
        first = false;
        return inner.complete(req);
      },
    };
    return guarded;
  };

  const runId = run.id;
  const close: RunContext['close'] = async (status, opts = {}) => {
    const final = finalStatus(status, overBudget);
    const spent = usage();
    await updateAskRun(ctx, runId, {
      status: final,
      inputTokens: baseline.inputTokens + spent.inputTokens,
      outputTokens: baseline.outputTokens + spent.outputTokens,
      cacheReadTokens: baseline.cacheReadTokens + spent.cacheReadTokens,
      cacheWriteTokens: baseline.cacheWriteTokens + spent.cacheWriteTokens,
      ...(metered?.lastModel() ? { model: metered.lastModel() } : {}),
      ...(opts.state !== undefined ? { state: opts.state } : {}),
      ...(opts.error ? { error: opts.error } : {}),
      ...(OPEN_STATUSES.has(final) ? {} : { finishedAt: new Date() }),
    });
    emit({ type: 'run', runId, status: final });
    return final;
  };

  return {
    ctx,
    runId,
    provider,
    deps: { provider, model: config.models.extract, idDocReading: flags.idDocReading },
    metered: () => metered,
    usage,
    spentTokens,
    overBudget: () => overBudget,
    progress: (label) => emit({ type: 'progress', runId, label }),
    close,
    finish: async (answer, status = 'done', opts) => {
      await close(status, opts);
      return { answer: { ...answer, runId }, metered };
    },
    recordUsage: async () => {
      const spend = metered?.spend() ?? [];
      if (spend.length > 0) await systemRecordAskUsage('fixed_workflow', spend).catch((error) => console.error('[ask-vcfo] usage not recorded', error));
    },
  };
}
