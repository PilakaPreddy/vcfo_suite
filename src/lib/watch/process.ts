import 'server-only';

import { askBudgets, askConfig } from '@/lib/ask/config';
import { getAskProvider } from '@/lib/ask/provider';
import {
  systemGetPipelineUpdate,
  systemMarkRegUpdateFailed,
  systemNoteRegUpdate,
  systemRecordWatchUsage,
  systemSaveReadText,
  systemSaveSummary,
  systemTodayTokens,
} from '@/db/repositories/reg-updates';
import { WatchBlockedError } from './fetch';
import { readUpdateText, WatchReadError, WatchScanWaitsError } from './read';
import { changeTypeFor, importanceFor } from './recipients';
import { summariseUpdate, WatchSummariseError, type SummariseResult } from './summarise';
import { WATCH_PROCESS_EVENT, type RegArea } from './types';
import { verifyRegSummary } from './verify';

/**
 * Steps 4 to 7 of the pipeline, one function per Inngest step so a retry repeats only what failed.
 * The merge sits straight after the read: the same text never pays for a second summary. A document
 * that cannot be read or summarised becomes `failed` with a reason a reviewer can act on.
 */
export type StepResult = 'next' | 'stop';

const BUDGET_NOTE = "Today's token budget is spent; this waits for the next check.";
const NO_MODEL_NOTE = 'No model is configured; this waits for the next check.';

const budgetSpent = async (): Promise<boolean> => (await systemTodayTokens()) >= askBudgets().dailyTokens;

export async function readStep(id: string): Promise<StepResult> {
  const row = await systemGetPipelineUpdate(id);
  if (!row || row.update.status !== 'queued') return row?.update.status === 'read' ? 'next' : 'stop';
  const overBudget = await budgetSpent();
  try {
    const provider = overBudget ? null : await getAskProvider();
    const model = askConfig().models.watch;
    const { text, usage } = await readUpdateText(
      { url: row.update.sourceUrl, s3Key: row.update.s3Key, listingText: row.update.sourceText },
      provider,
      model,
    );
    if (usage) await systemRecordWatchUsage(usage.model, usage);
    const { mergedInto } = await systemSaveReadText(id, text);
    return mergedInto ? 'stop' : 'next';
  } catch (err) {
    if (err instanceof WatchScanWaitsError) {
      await systemNoteRegUpdate(id, overBudget ? BUDGET_NOTE : NO_MODEL_NOTE);
      return 'stop';
    }
    if (err instanceof WatchBlockedError) {
      await systemMarkRegUpdateFailed(id, `The site refused automated reading of this document (${err.message}). Upload the PDF instead.`);
      return 'stop';
    }
    if (err instanceof WatchReadError) {
      await systemMarkRegUpdateFailed(id, err.message);
      return 'stop';
    }
    // A network failure is left to the job's retries, then to the hourly sweep, and the queue says so.
    await systemNoteRegUpdate(id, 'The document could not be reached; it will be tried again.');
    throw err;
  }
}

/** Returns the model's output for the verify step; null stops the run without a model call. */
export async function summariseStep(id: string): Promise<SummariseResult | null> {
  const row = await systemGetPipelineUpdate(id);
  if (!row || row.update.status !== 'read' || !row.update.sourceText) return null;
  if (await budgetSpent()) {
    await systemNoteRegUpdate(id, BUDGET_NOTE);
    return null;
  }
  const provider = await getAskProvider();
  if (!provider) {
    await systemNoteRegUpdate(id, NO_MODEL_NOTE);
    return null;
  }
  try {
    const result = await summariseUpdate(provider, askConfig().models.watch, {
      title: row.update.title,
      sourceName: row.sourceName,
      text: row.update.sourceText,
    });
    await systemRecordWatchUsage(result.model, result.usage);
    return result;
  } catch (err) {
    if (err instanceof WatchSummariseError) {
      await systemMarkRegUpdateFailed(id, err.message);
      return null;
    }
    throw err;
  }
}

export async function verifyStep(id: string, result: SummariseResult): Promise<'unreviewed' | 'needs_attention' | 'stop'> {
  const row = await systemGetPipelineUpdate(id);
  if (!row?.update.sourceText) return 'stop';
  // The source knows its own area when the model can only say "general".
  const area = result.summary.area === 'general' && row.sourceArea ? (row.sourceArea as RegArea) : result.summary.area;
  const changeType = changeTypeFor(result.summary.changeType, row.update.title);
  const problems = verifyRegSummary(result.summary, row.update.sourceText);
  // Code corrects the label, but the wording may still say a draft is in force, so a person reads it.
  if (changeType !== result.summary.changeType && importanceFor(result.summary.changeType, null) === 'important') {
    problems.push({ field: 'changeType', value: result.summary.changeType, message: 'The title says this is a draft or proposal, but it was summarised as made. Check the wording.' });
  }
  await systemSaveSummary(id, {
    // A date on a draft is the last day for comments; no filing has moved.
    summary: { ...result.summary, area, changeType, ...(changeType === 'consultation' ? { oldDueDate: null, newDueDate: null } : {}) },
    importance: importanceFor(changeType, row.sourceAudience),
    problems,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    sourceName: row.sourceName,
  });
  return problems.length === 0 ? 'unreviewed' : 'needs_attention';
}

/** The whole run, in the steps' order, for when no Inngest is reachable. */
export async function runWatchProcess(id: string): Promise<string> {
  if ((await readStep(id)) === 'stop') return 'stopped';
  const summary = await summariseStep(id);
  return summary ? verifyStep(id, summary) : 'stopped';
}

/**
 * Sends updates to the job, keyed by host so one host gets one request at a time. When no Inngest is
 * reachable (local dev, or keys not yet set) they run in this process, in turn, as ask-ingest does.
 */
export async function queueWatchProcess(items: ReadonlyArray<{ id: string; host: string }>): Promise<void> {
  if (items.length === 0) return;
  try {
    const { inngest } = await import('@/jobs/client');
    await inngest.send(items.map((item) => ({ name: WATCH_PROCESS_EVENT, data: { updateId: item.id, host: item.host } })));
  } catch (error) {
    console.warn('[watch] inngest unavailable; processing inline', error);
    void (async () => {
      for (const item of items) await runWatchProcess(item.id).catch((err) => console.error('[watch] process failed', item.id, err));
    })();
  }
}

export function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).hostname : 'upload';
  } catch {
    return 'upload';
  }
}
