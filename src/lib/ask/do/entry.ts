import 'server-only';

import { randomUUID } from 'node:crypto';
import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope, AskShell } from '@/data/ask/schema';
import { getOwnAskAttachments, createAskAttachment, updateOwnAskAttachment, type AskAttachmentRow } from '@/db/repositories/ask-attachments';
import { createAskChangeset } from '@/db/repositories/ask-changesets';
import { listManagerIdsForEngagement } from '@/db/repositories/engagement-managers-membership';
import { checklistStateFromRow, getEngagementBySlug, getEngagementById, listEngagements } from '@/db/repositories/engagements';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { appendAskRunStep, createAskRun, findWaitingAskRun, lockAskRun, updateAskRun } from '@/db/repositories/ask-runs';
import { systemTodayTokenTotal } from '@/db/repositories/ask-usage';
import { checklist } from '@/data/checklist';
import { changesetHash } from '@/lib/ask/changeset/hash';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { askBudgets, askConfig, askFlags } from '@/lib/ask/config';
import { catalogSynonyms } from '@/lib/ask/data-router/candidates';
import { companiesNamed, documentMatches, lockEngagement } from '@/lib/ask/data-router/lock';
import { placeValues, type SourceRead } from '@/lib/ask/data-router/place';
import { planRows } from '@/lib/ask/data-router/plan';
import { instructionOf, looksLikeData, readFile, readPaste, ReadRefused } from '@/lib/ask/data-router/read';
import type { ReadResult } from '@/lib/ask/data-router/types';
import { normalizeLabel } from '@/lib/ask/field-catalog/rules';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { addLlmUsage, getAskProvider, NO_LLM_USAGE } from '@/lib/ask/provider';
import { meterProvider, type MeteredProvider } from '@/lib/ask/provider/meter';
import { checkAskRateLimit } from '@/lib/ask/rate-limit';
import { limitAnswer, REFUSAL_COPY } from '@/lib/ask/refusals';
import { getObjectBuffer, putObject } from '@/storage/s3';

/**
 * The Do engine's way in. Phase 4 has one fixed workflow, the data router: read a file or a paste,
 * find the place for each value, run the screen's rules, and put a review card in the chat. It is
 * not an agent loop. Each step is code except the two small-model calls, which return strict schemas
 * and can touch nothing. A question the workflow cannot settle is asked in the chat and held in a
 * run row, so the next message can finish it.
 */

export type DoEvent = { type: 'progress'; runId: string; label: string } | { type: 'run'; runId: string; status: string };

export interface DoWorkResult {
  answer: AnswerEnvelope;
  metered: MeteredProvider | null;
}

export interface DoWorkRequest {
  shell: AskShell;
  attachmentIds?: string[];
  page?: { path: string; engagementId?: string };
}

type EngagementOption = { id: string; slug: string | null; companyName: string };

interface PendingState {
  attachmentIds: string[];
  instruction: string;
  options: EngagementOption[];
  /** The project a document seems not to belong to, waiting for a yes. */
  mismatch: { engagementId: string; company: string } | null;
}

const CARD_DAYS = 7;
const MIN_SYNONYM_LENGTH = 4;
export const STORED_USER_TEXT_MAX = 1_000;

const line = (text: string, extra: Partial<AnswerEnvelope> = {}): AnswerEnvelope => ({
  line: text.slice(0, 1200),
  citations: [],
  actions: [],
  origin: 'work',
  depth: 'normal',
  ...extra,
});

/** A message worth a look by the router: a labelled line, or a long paste. */
export function isDataMessage(message: string): boolean {
  return message.length > 2000 || looksLikeData(message);
}

/** A message the router sent as work, which still has to name a fact or a number to be data. */
function mayHoldValues(message: string): boolean {
  if (/\d/.test(message)) return true;
  const text = ` ${normalizeLabel(message)} `;
  for (const synonym of catalogSynonyms()) {
    if (synonym.length >= MIN_SYNONYM_LENGTH && text.includes(` ${synonym} `)) return true;
  }
  return false;
}

const CANCEL = /^\s*(?:no|nope|cancel|stop|leave it|never ?mind|don'?t)\b/i;
const CONFIRM = /^\s*(?:yes|yep|yeah|ok|okay|sure|confirm|go ahead|file it|correct|right)\b/i;

/** The open question this message answers, if it answers one; otherwise the normal chat runs. */
export async function pendingDoRun(ctx: AuthContext, conversationId: string | null, message: string | undefined, now: Date) {
  if (!conversationId || !message) return null;
  const run = await findWaitingAskRun(ctx, conversationId, now);
  if (!run) return null;
  const state = run.state as unknown as PendingState;
  const named = companiesNamed(message, state.options);
  if (CANCEL.test(message) || CONFIRM.test(message) || named.length > 0) return { run, state };
  return null;
}

/** A short line about the record on screen, so "this client" means something to the router. */
export async function pageContextLine(ctx: AuthContext, page: DoWorkRequest['page']): Promise<string | null> {
  const match = page?.path ? /\/(?:projects|engagements|clients)\/([^/?#]+)(?:\/step\/([^/?#]+))?/.exec(page.path) : null;
  if (!match) return null;
  const key = decodeURIComponent(match[1]!);
  const row = (await getEngagementBySlug(ctx, key)) ?? (/^[0-9a-f-]{36}$/i.test(key) ? await getEngagementById(ctx, key) : null);
  if (!row) return null;
  const stepKey = match[2] ? decodeURIComponent(match[2]) : null;
  const step = stepKey ? checklist.find((item) => item.slug === stepKey || item.id === stepKey) : undefined;
  return `The person is looking at ${row.companyName}${step ? `, step "${step.title}"` : ''}.`;
}

export async function handleDoWork(
  ctx: AuthContext,
  request: DoWorkRequest,
  message: string,
  emit: (event: DoEvent) => void,
  context: { conversationId: string | null; now: Date; pending: Awaited<ReturnType<typeof pendingDoRun>> },
): Promise<DoWorkResult | null> {
  const { shell } = request;
  if (shell === 'client') return { answer: limitAnswer(shell, 'doWork'), metered: null };
  const flags = askFlags();
  if (flags.killedPaths.has('fixed_workflow') || flags.killedTiers.has('T2')) return { answer: limitAnswer(shell, 'pathStopped'), metered: null };
  const { conversationId, now, pending } = context;
  const attachmentIds = request.attachmentIds ?? [];

  // Prose the router sent here that names no fact goes back to the plain line, at no cost.
  if (!pending && attachmentIds.length === 0 && !isDataMessage(message) && !mayHoldValues(message)) return null;

  const config = askConfig();
  const budgets = askBudgets();
  let metered: MeteredProvider | null = null;
  const provider = async () => {
    if (metered) return metered;
    if ((await systemTodayTokenTotal(now)) >= budgets.dailyTokens) throw new ReadRefused(REFUSAL_COPY.budgetReached);
    if (!(await checkAskRateLimit(ctx, config.rateLimit, now)).ok) throw new ReadRefused(REFUSAL_COPY.rateLimited);
    const configured = await getAskProvider();
    if (!configured) throw new ReadRefused('Reading this needs the Ask VCFO model, which is not available right now. Please type the details as "Label: value" lines.');
    metered = meterProvider(configured);
    return metered;
  };
  const deps = { provider, model: config.models.extract, idDocReading: flags.idDocReading };

  const run = pending?.run ?? (await createAskRun(ctx, { conversationId, workflow: 'data_router', goal: instructionOf(message) || (attachmentIds.length > 0 ? `${attachmentIds.length} attached file(s)` : 'Pasted details'), budgetTokens: budgets.runMaxTokens }));
  const runId = run.id;
  emit({ type: 'run', runId, status: 'running' });
  const progress = (label: string) => emit({ type: 'progress', runId, label });

  const close = async (status: string, state?: PendingState, error?: string) => {
    const spend = metered?.spend() ?? [];
    const usage = spend.reduce((sum, s) => addLlmUsage(sum, s.usage), NO_LLM_USAGE);
    await updateAskRun(ctx, runId, {
      status,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      model: metered?.lastModel() ?? null,
      ...(state ? { state: state as unknown as JsonValue } : {}),
      ...(error ? { error } : {}),
      ...(status === 'waiting_reply' || status === 'waiting_approval' ? {} : { finishedAt: new Date() }),
    });
    emit({ type: 'run', runId, status });
  };
  const finish = async (answer: AnswerEnvelope, status = 'done', state?: PendingState, error?: string): Promise<DoWorkResult> => {
    await close(status, state, error);
    return { answer: { ...answer, runId }, metered };
  };

  if (pending && CANCEL.test(message)) return finish(line('All right, I have left this as it is. Nothing was saved.'), 'cancelled');

  const engagements: EngagementOption[] = (await listEngagements(ctx)).map((e) => ({ id: e.id, slug: e.slug, companyName: e.companyName }));
  const instruction = pending ? pending.state.instruction : instructionOf(message);

  // The sources: files as given, and a paste kept as a file only if the run has to wait.
  const sourceIds = pending ? pending.state.attachmentIds : attachmentIds;
  const paste = !pending && message.trim() && attachmentIds.length === 0 ? message : null;
  const keepPaste = async (): Promise<string[]> => {
    if (!paste) return sourceIds;
    const s3Key = `ask/attachments/${ctx.userId}/${randomUUID()}/paste.txt`;
    await putObject(s3Key, paste, 'text/plain; charset=utf-8');
    const row = await createAskAttachment(ctx, { kind: 'paste', fileName: 'paste.txt', contentType: 'text/plain', sizeBytes: Buffer.byteLength(paste), s3Key, conversationId });
    return [row.id];
  };
  const askBack = async (text: string, state: Omit<PendingState, 'attachmentIds' | 'instruction'>) =>
    finish(line(text), 'waiting_reply', { attachmentIds: await keepPaste(), instruction, ...state });

  // Which client. A reply to a question names it, or confirms the one asked about.
  const replied = pending
    ? (companiesNamed(message, pending.state.options)[0] ?? (pending.state.mismatch && CONFIRM.test(message) ? engagements.find((e) => e.id === pending.state.mismatch!.engagementId) : undefined))
    : undefined;
  if (pending && !replied) return askBack('Please tell me which project this is for.', pending.state);
  const firstLock = replied
    ? ({ kind: 'locked', engagement: replied } as const)
    : lockEngagement({ message: instruction, pagePath: request.page?.path, engagements });
  if (firstLock.kind === 'choose') {
    const names = firstLock.options.map((o) => o.companyName);
    return askBack(`More than one project matches: ${names.join(' and ')}. Which one is this for?`, { options: firstLock.options, mismatch: null });
  }
  if (firstLock.kind === 'unknown' && firstLock.mentioned) {
    return finish(line(`I cannot find ${maskIdentityNumbers(firstLock.mentioned)} among your projects, so nothing was read.`));
  }

  // Read every source. A refused file is reported; the others still count.
  const rows: AskAttachmentRow[] = await getOwnAskAttachments(ctx, sourceIds);
  if (sourceIds.length > 0 && rows.length !== sourceIds.length) return finish(line('One of those files is not available. Please attach it again.'), 'failed');
  progress(rows.length > 0 || paste ? 'Reading…' : 'Checking…');
  const reads: SourceRead[] = [];
  const refusals: string[] = [];
  const readOne = async (attachment: AskAttachmentRow | null, read: () => Promise<ReadResult>) => {
    try {
      const result = await read();
      reads.push({ result, attachment });
      if (attachment) await updateOwnAskAttachment(ctx, attachment.id, { status: 'read', docType: result.docType, sensitive: result.sensitive, runId });
      await appendAskRunStep(ctx, runId, { kind: result.usedModel ? 'model' : 'tool', name: 'read', label: 'Reading', output: { docType: result.docType, values: result.values.length } });
    } catch (error) {
      const known = error instanceof ReadRefused;
      if (!known) console.error('[ask-vcfo] read failed', error);
      const text = known ? error.message : 'This file could not be read. Please type the details in instead.';
      refusals.push(text);
      if (attachment) await updateOwnAskAttachment(ctx, attachment.id, { status: 'failed', error: text, runId });
    }
  };
  if (paste) await readOne(null, () => readPaste(paste, deps));
  for (const attachment of rows) {
    const bytes = attachment.s3Key ? await getObjectBuffer(attachment.s3Key) : null;
    await readOne(attachment, async () => {
      if (!bytes) throw new ReadRefused('That file is no longer available. Please attach it again.');
      return attachment.kind === 'paste' ? readPaste(bytes.toString('utf8'), deps) : readFile({ fileName: attachment.fileName, data: bytes }, deps);
    });
  }
  if (reads.length === 0) return finish(line(refusals[0] ?? 'I found nothing to read.'), 'failed', undefined, 'read refused');
  if (reads.every((r) => r.result.values.length === 0)) {
    if (paste && !isDataMessage(paste)) {
      await close('done');
      return null;
    }
    return finish(line('I could not find any details to file in this. Nothing was saved.'));
  }

  // With no client yet, the document may name one. A document naming another client is a question.
  const docCompanies = [...new Set(reads.flatMap((r) => (r.result.company ? [r.result.company] : [])))];
  let locked = firstLock.kind === 'locked' ? firstLock.engagement : null;
  if (!locked) {
    const named = [...new Map(docCompanies.flatMap((name) => companiesNamed(name, engagements)).map((e) => [e.id, e])).values()];
    if (named.length === 1) locked = named[0]!;
    else {
      const text = named.length > 1 ? `More than one project matches: ${named.map((o) => o.companyName).join(' and ')}. Which one is this for?` : 'Which project is this for?';
      return askBack(text, { options: named.length > 1 ? named : engagements, mismatch: null });
    }
  }
  await lockAskRun(ctx, runId, locked.id);
  const row = await getEngagementById(ctx, locked.id);
  if (!row) return finish(line('That project is not available.'), 'failed');
  const state = checklistStateFromRow(row);
  const confirmed = Boolean(replied);
  const knownNames = [row.companyName, state['pre-1']?.responses?.proposedName1, state['pre-1']?.responses?.proposedName2, row.parentEntityName].filter((n): n is string => Boolean(n?.trim()));
  const stranger = confirmed ? null : docCompanies.find((name) => !documentMatches(name, knownNames));
  if (stranger) {
    return askBack(`This document names ${maskIdentityNumbers(stranger)}, not ${row.companyName}. Should I file it for ${row.companyName}? Say "Yes, file it for ${row.companyName}", or name the right project.`, {
      options: engagements,
      mismatch: { engagementId: row.id, company: stranger },
    });
  }

  // Find the place for each value: code first, then one small-model call for the rest.
  progress('Finding the right fields…');
  const { placed, questions: placeQuestions, files, chooseCalls } = await placeValues(reads, { instruction, provider, model: config.models.extract });
  if (chooseCalls > 0) await appendAskRunStep(ctx, runId, { kind: 'model', name: 'choose', output: { asked: chooseCalls, chosen: placed.length } });
  const questions = [...new Set(refusals), ...placeQuestions];

  progress('Checking the rules…');
  const plan = planRows({ role: ctx.role, engagementId: row.id, companyName: row.companyName, engagement: row, state, placed, files, instruction });
  questions.push(...plan.questions);
  const askMore = questions.length > 0 ? ` ${[...new Set(questions)].slice(0, 5).join(' ')}` : '';

  if (plan.draft.rows.length === 0) {
    const nothing = placed.length > 0 ? `Everything here is already saved for ${row.companyName}.` : `I found nothing to save for ${row.companyName}.`;
    return finish(line(`${nothing}${askMore}`));
  }
  const contentHash = changesetHash(plan.draft.rows.map((r) => ({ action: r.action, target: r.target, newValue: r.newValue })));
  const changesetId = await createAskChangeset(ctx, {
    draft: plan.draft,
    contentHash,
    conversationId,
    runId,
    expiresAt: new Date(now.getTime() + CARD_DAYS * 86_400_000),
  });
  if (!changesetId) return finish(line('That project is not available.'), 'failed');
  await appendAskRunStep(ctx, runId, { kind: 'approval', name: 'changeset', status: 'waiting', changesetId, output: { rows: plan.draft.rows.length } });

  const managerRows = plan.draft.rows.filter((r) => r.target.needsManager === true);
  if (managerRows.length > 0 && ctx.role !== 'manager' && ctx.role !== 'admin' && ctx.role !== 'super_admin') {
    const managers = await listManagerIdsForEngagement(row.id);
    await createNotificationsForUsers(
      managers.map((userId) => ({
        userId,
        kind: 'checklist.review' as const,
        title: `${row.companyName}: values to approve`,
        body: `${ctx.name} prepared ${managerRows.length} value${managerRows.length === 1 ? '' : 's'} for you to approve.`,
        engagementId: row.id,
        companyName: row.companyName,
        href: `/app/manager/ask?changeset=${changesetId}`,
      })),
    ).catch((error) => console.warn('[ask-vcfo] manager notice failed', error));
  }

  const count = plan.draft.rows.length;
  const held = plan.draft.rows.filter((r) => r.heldReason).length;
  const heldNote = held > 0 ? ` ${held} ${held === 1 ? 'is' : 'are'} held, with the reason on the row.` : '';
  return finish(
    line(`I prepared ${count} value${count === 1 ? '' : 's'} for ${row.companyName}. Nothing is saved until you accept.${heldNote}${askMore}`, { changesetId }),
    'waiting_approval',
  );
}
