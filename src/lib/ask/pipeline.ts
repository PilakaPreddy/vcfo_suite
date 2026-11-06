import 'server-only';

import { z } from 'zod';
import type { AuthContext } from '@/auth/guards';
import {
  ANSWER_DEPTHS,
  ASK_SHELLS,
  type AnswerEnvelope,
  type AnswerLink,
  type AskShell,
  type ProjectSnapshot,
  type Visual,
} from '@/data/ask/schema';
import {
  createAskConversation,
  getAskConversationWithMessages,
} from '@/db/repositories/ask-conversations';
import { appendAskMessage } from '@/db/repositories/ask-messages';
import { findSavedAnswer, saveAnswer, type SavedAnswerKey } from '@/db/repositories/ask-saved-answers';
import { systemRecordAskUsage, systemTodayTokenTotal } from '@/db/repositories/ask-usage';
import { firmDisplayName } from '@/lib/shell/brand';
import { assertAskRole, AskForbiddenError, shellAllowedForRole } from '@/lib/ask/access';
import { askBudgets, askConfig, askFeatures, askFlags } from '@/lib/ask/config';
import { contextAnswer } from '@/lib/ask/context-answer';
import { sanitizeLinks, type DestinationScope } from '@/lib/ask/destinations';
import { gateActiveCatalog } from '@/lib/checklist/checklist-step-gate';
import { generateAnswer, SNAPSHOT_SOURCE_ID } from '@/lib/ask/generate';
import { currentKnowledgeVersion } from '@/lib/ask/knowledge-version';
import { expectsData, runGuard, type GuardResult } from '@/lib/ask/guard';
import { localMatch, metricByName } from '@/lib/ask/local-match';
import { metricsForRole } from '@/lib/ask/metrics/match';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import type { AskPath } from '@/lib/ask/paths';
import { addLlmUsage, getAskProvider, NO_LLM_USAGE } from '@/lib/ask/provider';
import { meterProvider, type MeteredProvider } from '@/lib/ask/provider/meter';
import { isStandingQuestion, questionKey } from '@/lib/ask/question-key';
import { checkAskRateLimit } from '@/lib/ask/rate-limit';
import {
  greetingAnswer,
  limitAnswer,
  offTopicAnswer,
  REFUSAL_COPY,
  uncertainAnswer,
  unavailableAnswer,
} from '@/lib/ask/refusals';
import { retrieveSources } from '@/lib/ask/retrieve';
import { maySaveAnswer } from '@/lib/ask/saved-answer';
import { loadProjectSnapshot } from '@/lib/ask/snapshot';
import { getSuggestion, resolveSuggestion, staffToolCard } from '@/lib/ask/suggestions';
import { shortlistTopics } from '@/lib/ask/topic-match';
import { CLIENT_TOOLS, type ClientToolContext } from '@/lib/ask/tools/client';
import { loadStaffData } from '@/lib/ask/tools/staff-data';
import { STAFF_TOOLS, type StaffData } from '@/lib/ask/tools/staff';
import {
  applicabilityFromSnapshot,
  isReviewed,
  resolveTopicForViewer,
  topicToAnswer,
} from '@/lib/ask/topics';
import { validateAnswer, withoutVisual } from '@/lib/ask/validate';

/**
 * Ask VCFO request pipeline (§2, §6). Cheapest path first:
 *   suggestion → deterministic · context → reviewed content · free text →
 *   saved answer → kill switch and budget → router → (refusal | reviewed topic | retrieval +
 *   tools + generation). Every answer is persisted with its path and usage; the
 *   model never sees data outside the caller's scope because every tool reads
 *   through scoped repositories.
 */

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  shell: z.enum(ASK_SHELLS),
  engagementId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  suggestionId: z.string().trim().min(1).max(80).optional(),
  context: z
    .object({
      kind: z.enum(['step', 'field', 'compliance', 'document']),
      ref: z.string().trim().min(1).max(120),
      label: z.string().trim().min(1).max(200),
    })
    .optional(),
  depth: z.enum(ANSWER_DEPTHS).optional(),
  language: z.string().trim().min(2).max(35).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

const STATUS_LABELS = {
  project: 'Checking your project…',
  sources: 'Finding sources…',
  writing: 'Writing…',
} as const;

export type AskEvent =
  | { type: 'status'; label: (typeof STATUS_LABELS)[keyof typeof STATUS_LABELS] }
  | { type: 'answer'; conversationId: string; messageId: string; answer: AnswerEnvelope }
  | { type: 'error'; code: 'rate_limited' | 'unavailable' | 'forbidden'; message: string };

type Emit = (event: AskEvent) => void;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client persona: client role, or super admin previewing one engagement. */
function personaFor(shell: AskShell): 'client' | 'staff' {
  return shell === 'client' ? 'client' : 'staff';
}

function ensureAskLead(answer: AnswerEnvelope, shell: AskShell): AnswerEnvelope {
  if (shell !== 'client' || answer.actions.includes('askLead')) return answer;
  return { ...answer, actions: [...answer.actions, 'askLead'] };
}

/** Client answers never offer staff actions, staff answers never client ones. */
function actionsForShell(answer: AnswerEnvelope, shell: AskShell, preview: boolean): AnswerEnvelope {
  const clientOnly = new Set(['save', 'askLead', 'openStep']);
  const staffOnly = new Set(['openProject', 'draftReminder']);
  const actions = answer.actions.filter((a) =>
    shell === 'client' ? !staffOnly.has(a) && !(preview && (a === 'save' || a === 'askLead')) : !clientOnly.has(a),
  );
  return { ...answer, actions: [...new Set(actions)] };
}

export async function runAskChat(ctx: AuthContext, request: ChatRequest, emit: Emit): Promise<void> {
  assertAskRole(ctx);
  const { shell } = request;
  if (!shellAllowedForRole(ctx.role, shell)) throw new AskForbiddenError('Shell not allowed');
  const preview = shell === 'client' && ctx.role === 'super_admin';
  const config = askConfig();
  const now = new Date();

  // ---- Project snapshot (client persona) ----
  let snapshot: ProjectSnapshot | null = null;
  let clientTools: ClientToolContext | null = null;
  let engagementId: string | null = null;
  if (shell === 'client') {
    if (!request.engagementId) {
      emit({ type: 'error', code: 'forbidden', message: 'Choose a project first.' });
      return;
    }
    emit({ type: 'status', label: STATUS_LABELS.project });
    const loaded = await loadProjectSnapshot(ctx, request.engagementId, now);
    if (!loaded) {
      emit({ type: 'error', code: 'forbidden', message: 'That project is not available.' });
      return;
    }
    snapshot = loaded.snapshot;
    engagementId = loaded.engagementDbId;
    clientTools = { snapshot, state: loaded.state, filings: loaded.filings, now };
  }

  // ---- Conversation (owner-only; a mismatched id starts a new one) ----
  let conversationId: string | null = null;
  let history: Array<{ sender: 'user' | 'assistant'; text: string }> = [];
  if (request.conversationId) {
    const existing = await getAskConversationWithMessages(ctx, request.conversationId);
    if (
      existing &&
      existing.conversation.shell === shell &&
      (existing.conversation.engagementId ?? null) === engagementId
    ) {
      conversationId = existing.conversation.id;
      history = existing.messages.map((m) => ({ sender: m.sender as 'user' | 'assistant', text: m.text }));
    }
  }
  if (!conversationId) {
    const created = await createAskConversation(ctx, { shell, engagementId: engagementId ?? request.engagementId });
    if (!created) {
      emit({ type: 'error', code: 'forbidden', message: 'That project is not available.' });
      return;
    }
    conversationId = created.id;
  }

  const suggestion = request.suggestionId ? getSuggestion(request.suggestionId) : null;
  const typed = request.message ? maskIdentityNumbers(request.message) : undefined;
  const userText = typed ?? suggestion?.label ?? (request.context ? `What's this: ${request.context.label}?` : null);
  if (!userText) {
    emit({ type: 'error', code: 'unavailable', message: 'Ask a question or pick a suggestion.' });
    return;
  }
  await appendAskMessage(ctx, conversationId, { sender: 'user', text: userText });

  let staffData: StaffData | null = null;
  const loadStaff = async () => (staffData ??= await loadStaffData(ctx, now));

  const linkScope = async (links: readonly AnswerLink[]): Promise<DestinationScope> => {
    if (shell === 'client') {
      const gates = gateActiveCatalog(clientTools?.state ?? {}, 'client');
      const locked = new Set(Object.entries(gates).filter(([, g]) => g.kind === 'locked').map(([id]) => id));
      return { shell, lockedStepIds: locked };
    }
    // A list link names no project, so a plain metric answer skips this read.
    if (!links.some((link) => 'engagementId' in link.dest)) return { shell };
    const data = await loadStaff();
    return {
      shell,
      engagementKeys: new Set(data.engagements.flatMap((e) => [e.engagement.slug || e.engagement.id, e.engagement.id])),
    };
  };

  let metered: MeteredProvider | null = null;

  const finish = async (
    answer: AnswerEnvelope,
    extra: {
      path: AskPath | null;
      guard?: GuardResult | null;
      retrievedChunkIds?: string[];
      toolCalls?: Array<{ name: string; args: unknown }>;
      startedAt?: number;
    },
  ) => {
    let final = actionsForShell(answer, shell, preview);
    // Every link, templated or model-written, is scope-checked here (§7.7).
    if (final.links && final.links.length > 0) {
      const links = sanitizeLinks(final.links, await linkScope(final.links));
      final = links.length > 0 ? { ...final, links } : { ...final, links: undefined };
    }
    const spend = metered?.spend() ?? [];
    const usage = spend.reduce((sum, s) => addLlmUsage(sum, s.usage), NO_LLM_USAGE);
    const model = metered?.lastModel() ?? null;
    const row = await appendAskMessage(ctx, conversationId!, {
      sender: 'assistant',
      text: final.line,
      answer: final,
      origin: final.origin,
      guard: extra.guard ?? null,
      retrievedChunkIds: (extra.retrievedChunkIds ?? []).filter((id) => UUID_RE.test(id)),
      toolCalls: extra.toolCalls ?? [],
      model,
      inputTokens: model ? usage.inputTokens : null,
      outputTokens: model ? usage.outputTokens : null,
      cacheReadTokens: model ? usage.cacheReadTokens : null,
      cacheWriteTokens: model ? usage.cacheWriteTokens : null,
      path: extra.path,
      latencyMs: extra.startedAt ? Date.now() - extra.startedAt : null,
    });
    if (extra.path && spend.length > 0) {
      // The roll-up never holds up an answer the person has already paid for.
      await systemRecordAskUsage(extra.path, spend, now).catch((error) => console.error('[ask-vcfo] usage not recorded', error));
    }
    emit({ type: 'answer', conversationId: conversationId!, messageId: row?.id ?? '', answer: final });
    return { messageId: row?.id ?? null, answer: final };
  };

  const flags = askFlags();
  const stopIfKilled = async (path: AskPath, extra: { guard?: GuardResult; startedAt?: number } = {}): Promise<boolean> => {
    if (!flags.killedPaths.has(path)) return false;
    await finish(limitAnswer(shell, 'pathStopped'), { path, ...extra });
    return true;
  };

  // ---- 1. Suggestion click: deterministic, no model (T1) ----
  if (request.suggestionId && !request.message) {
    if (await stopIfKilled('suggestion')) return;
    const answer = await resolveSuggestion(request.suggestionId, {
      shell,
      snapshot,
      depth: request.depth,
      loadStaff,
      clientState: clientTools?.state,
    });
    await finish(answer ?? unavailableAnswer(shell), { path: 'suggestion' });
    return;
  }

  // ---- 2. "What's this?" on reviewed content (F1) ----
  if (request.context && !request.message) {
    if (await stopIfKilled('context')) return;
    if (request.context.kind === 'document' && !(shell === 'client' && askFeatures().C2)) {
      await finish(unavailableAnswer(shell), { path: 'context' });
      return;
    }
    const answer = contextAnswer(request.context, { snapshot, clientTools, features: askFeatures() });
    if (answer) {
      await finish(answer, { path: 'context' });
      return;
    }
  }

  // ---- 3. Free text the code can answer alone: no model, so no budget or rate limit applies ----
  const metricRole = shell === 'client' ? 'client' : ctx.role;
  const metricEnv = { ctx, shell, engagementId, now };
  const topicContext = { depth: request.depth, snapshot };
  if (typed) {
    const local = await localMatch(typed, { env: metricEnv, role: metricRole, ...topicContext });
    if (local) {
      if (await stopIfKilled(local.path)) return;
      await finish(local.answer, { path: local.path });
      return;
    }
  }

  const applicability = applicabilityFromSnapshot(snapshot);
  const audience = personaFor(shell);

  // ---- 4. A standing question asked before, in the same words, on the same knowledge ----
  let savedKey: SavedAnswerKey | null = null;
  if (typed && !request.context && history.length === 0 && isStandingQuestion(typed) && !flags.killedPaths.has('saved_answer')) {
    try {
      // A client's answer can depend on the company's form, so each kind of company has its own.
      const kind = applicability ? `${applicability.legalForm}:${applicability.residency}|` : '';
      savedKey = {
        questionKey: `${kind}${questionKey(typed)}`,
        audience,
        language: request.language ?? 'en',
        depth: request.depth ?? 'normal',
        knowledgeVersion: await currentKnowledgeVersion(now),
      };
      const saved = await findSavedAnswer(ctx, savedKey);
      if (saved) {
        await finish(saved, { path: 'saved_answer' });
        return;
      }
    } catch (error) {
      console.warn('[ask-vcfo] saved answer lookup failed; answering in full', error);
    }
  }

  // ---- 5. Free text: budget → router → metric, topic or generation ----
  const budgets = askBudgets();
  if ((await systemTodayTokenTotal(now)) >= budgets.dailyTokens) {
    await finish(limitAnswer(shell, 'budgetReached'), { path: null });
    return;
  }
  const message = typed ?? `What is ${request.context?.label ?? 'this'}?`;
  const limit = await checkAskRateLimit(ctx, config.rateLimit, now);
  if (!limit.ok) {
    emit({ type: 'error', code: 'rate_limited', message: REFUSAL_COPY.rateLimited });
    return;
  }

  const configured = await getAskProvider();
  if (!configured) {
    await finish(unavailableAnswer(shell), { path: null });
    return;
  }
  const provider = meterProvider(configured);
  metered = provider;

  const startedAt = Date.now();
  let guard: GuardResult;
  try {
    // A follow-up rarely names its subject, so the previous question helps to pick the topics.
    const lastAsked = history.findLast((m) => m.sender === 'user')?.text ?? '';
    const topics = shortlistTopics(`${message} ${lastAsked}`, audience).map((t) => ({ slug: t.slug, question: t.question }));
    const metrics = metricsForRole(metricRole).map((m) => m.name);
    guard = (await runGuard(provider, { model: config.models.guard, shell, message, history, topics, metrics })).result;
  } catch (error) {
    console.error('[ask-vcfo] guard failed', error);
    await finish(unavailableAnswer(shell), { path: null });
    return;
  }

  if (guard.intent === 'off_topic' || guard.intent === 'unsafe') {
    await finish(offTopicAnswer(shell), { path: 'router_refusal', guard, startedAt });
    return;
  }
  if (guard.intent === 'greeting') {
    await finish(greetingAnswer(shell), { path: 'router_refusal', guard, startedAt });
    return;
  }
  if (guard.intent === 'do_work') {
    await finish(limitAnswer(shell, 'doWork'), { path: 'router_refusal', guard, startedAt });
    return;
  }

  if (guard.intent === 'fact' && guard.metric) {
    const answer = await metricByName(guard.metric, guard.company, guard.rewrittenQuery, metricEnv);
    if (answer) {
      if (await stopIfKilled('router_metric', { guard, startedAt })) return;
      await finish(answer, { path: 'router_metric', guard, startedAt });
      return;
    }
  }

  const decision = guard.intent === 'decision_request';
  const topic = guard.topicSlug ? resolveTopicForViewer(guard.topicSlug, applicability, audience) : null;
  if (topic && isReviewed(topic)) {
    if (await stopIfKilled('router_topic', { guard, startedAt })) return;
    let answer = topicToAnswer(topic, { depth: request.depth, shell, snapshot });
    if (decision) {
      answer = ensureAskLead(
        { ...answer, line: `${shell === 'client' ? REFUSAL_COPY.decision : REFUSAL_COPY.decisionStaff} ${answer.line}` },
        shell,
      );
    }
    await finish(answer, { path: 'router_topic', guard, startedAt });
    return;
  }

  const wantsData = expectsData(guard.intent);
  const expectedPath: AskPath = wantsData ? 'tool_answer' : 'document_answer';
  if (await stopIfKilled(expectedPath, { guard, startedAt })) return;

  emit({ type: 'status', label: STATUS_LABELS.sources });
  const sources = await retrieveSources(ctx, {
    query: guard.rewrittenQuery,
    persona: audience,
    topK: config.retrievalTopK,
    applicability,
    includeCards: wantsData,
    engagementId,
  });
  // Dates in a document or a record are checked against that source. A topic's rule is a duration.
  const datedSources = sources.filter((s) => s.kind !== 'topic').map((s) => s.text);

  let toolCard: Visual | undefined;
  const allTools =
    shell === 'client'
      ? Object.values(CLIENT_TOOLS).map((t) => ({
          definition: t.definition,
          run: (input: Record<string, unknown>) => t.run(clientTools!, input),
        }))
      : Object.values(STAFF_TOOLS).map((t) => ({
          definition: t.definition,
          run: async (input: Record<string, unknown>) => {
            const data = await loadStaff();
            toolCard = staffToolCard(t.definition.name, data, input) ?? toolCard;
            return t.run(data, input);
          },
        }));
  const tools = flags.killedPaths.has('tool_answer') ? [] : allTools;

  const allowedCitationIds = new Set<string>([
    ...sources.map((s) => s.id),
    ...sources
      .filter((s) => s.kind === 'topic')
      .flatMap((s) => resolveTopicForViewer(s.id, applicability, audience)?.citations.map((c) => c.id) ?? []),
    ...tools.map((t) => t.definition.name),
    ...(snapshot ? [SNAPSHOT_SOURCE_ID] : []),
  ]);

  emit({ type: 'status', label: STATUS_LABELS.writing });
  const depth = request.depth ?? 'normal';
  const enrich = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return raw;
    const input = raw as Record<string, unknown>;
    return { ...input, origin: 'generated', depth };
  };
  let output: Awaited<ReturnType<typeof generateAnswer>>;
  try {
    output = await generateAnswer({
      provider,
      model: wantsData ? config.models.answer : config.models.document,
      effort: config.answerEffort,
      maxTotalTokens: budgets.answerMaxTokens,
      shell,
      firmName: firmDisplayName(),
      snapshot,
      sources,
      history,
      message: guard.rewrittenQuery,
      language: request.language ?? guard.language,
      depth,
      decision,
      tools,
      validate: (raw, toolResultTexts) => {
        const vctx = { shell, allowedCitationIds, toolResultTexts: [...toolResultTexts, ...datedSources] };
        const full = validateAnswer(enrich(raw), vctx);
        if (full.ok === true) return full;
        // An invalid visual alone renders as text only (§3.3), without a retry.
        const textOnly = validateAnswer(withoutVisual(enrich(raw)), vctx);
        return textOnly.ok === true ? textOnly : full;
      },
    });
  } catch (error) {
    console.error('[ask-vcfo] generation failed', error);
    await finish(unavailableAnswer(shell), { path: expectedPath, guard, startedAt });
    return;
  }

  let answer: AnswerEnvelope;
  const result = output.result;
  if (result.ok === true) {
    answer = toolCard ? { ...result.answer, visual: toolCard } : result.answer;
  } else if ('overBudget' in result) {
    answer = limitAnswer(shell, 'runTooLong');
  } else if ('textOnly' in result && result.textOnly) {
    // T3: no render_answer call — the text becomes a plain answer, still checked.
    const fallback = validateAnswer(
      { line: result.textOnly.slice(0, 1200), citations: [], actions: [], origin: 'generated', depth },
      { shell, allowedCitationIds, toolResultTexts: [...output.toolResultTexts, ...datedSources] },
    );
    answer = fallback.ok === true ? { ...fallback.answer, ...(toolCard ? { visual: toolCard } : {}) } : uncertainAnswer();
  } else {
    // An invalid visual degrades to text; anything else to the safe fallback.
    const errors = 'errors' in result ? result.errors : [];
    console.warn('[ask-vcfo] answer rejected', errors);
    answer = uncertainAnswer();
  }
  if (decision) {
    answer = ensureAskLead(
      { ...answer, line: `${shell === 'client' ? REFUSAL_COPY.decision : REFUSAL_COPY.decisionStaff} ${answer.line}` },
      shell,
    );
  }
  const path: AskPath = output.toolCalls.length > 0 ? 'tool_answer' : 'document_answer';
  const done = await finish(answer, {
    path,
    guard,
    startedAt,
    retrievedChunkIds: sources.filter((s) => s.kind === 'chunk').map((s) => s.id),
    toolCalls: output.toolCalls,
  });
  if (
    savedKey &&
    result.ok === true &&
    !wantsData &&
    !decision &&
    !preview &&
    maySaveAnswer({ answer: done.answer, path, sources, namedCompany: Boolean(guard.company), companyName: snapshot?.companyName ?? null })
  ) {
    await saveAnswer(ctx, savedKey, done.answer, done.messageId).catch((error) => console.warn('[ask-vcfo] answer not saved', error));
  }
}
