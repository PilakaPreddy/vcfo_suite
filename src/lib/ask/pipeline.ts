import 'server-only';

import { z } from 'zod';
import type { AuthContext } from '@/auth/guards';
import {
  ANSWER_DEPTHS,
  ASK_SHELLS,
  type AnswerEnvelope,
  type AskShell,
  type ProjectSnapshot,
} from '@/data/ask/schema';
import {
  createAskConversation,
  getAskConversationWithMessages,
} from '@/db/repositories/ask-conversations';
import { appendAskMessage } from '@/db/repositories/ask-messages';
import { firmDisplayName } from '@/lib/shell/brand';
import { assertAskRole, AskForbiddenError, shellAllowedForRole } from '@/lib/ask/access';
import { askConfig, askFeatures } from '@/lib/ask/config';
import { contextAnswer } from '@/lib/ask/context-answer';
import { sanitizeLinks, type DestinationScope } from '@/lib/ask/destinations';
import { gateActiveCatalog } from '@/lib/checklist/checklist-step-gate';
import { generateAnswer } from '@/lib/ask/generate';
import { runGuard, type GuardResult } from '@/lib/ask/guard';
import { addLlmUsage, getAskProvider, NO_LLM_USAGE, type LlmUsage } from '@/lib/ask/provider';
import { checkAskRateLimit } from '@/lib/ask/rate-limit';
import {
  greetingAnswer,
  offTopicAnswer,
  REFUSAL_COPY,
  uncertainAnswer,
  unavailableAnswer,
} from '@/lib/ask/refusals';
import { retrieveSources } from '@/lib/ask/retrieve';
import { loadProjectSnapshot } from '@/lib/ask/snapshot';
import { getSuggestion, resolveSuggestion } from '@/lib/ask/suggestions';
import { CLIENT_TOOLS, type ClientToolContext } from '@/lib/ask/tools/client';
import { loadStaffData } from '@/lib/ask/tools/staff-data';
import { STAFF_TOOLS, type StaffData } from '@/lib/ask/tools/staff';
import {
  applicabilityFromSnapshot,
  isReviewed,
  listTopics,
  resolveTopicForViewer,
  topicToAnswer,
} from '@/lib/ask/topics';
import { validateAnswer, withoutVisual } from '@/lib/ask/validate';

/**
 * Ask VCFO request pipeline (§2, §6). Cheapest path first:
 *   suggestion → deterministic · context → reviewed content · free text →
 *   guard → (refusal | reviewed topic | retrieval + tools + generation).
 * Every answer is persisted with usage; the model never sees data outside
 * the caller's scope because every tool reads through scoped repositories.
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

type Usage = LlmUsage & { model: string | null };

const NO_USAGE: Usage = { model: null, ...NO_LLM_USAGE };

function addUsage(a: Usage, model: string, u: LlmUsage): Usage {
  return { model, ...addLlmUsage(a, u) };
}

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
  const userText =
    request.message ?? suggestion?.label ?? (request.context ? `What's this: ${request.context.label}?` : null);
  if (!userText) {
    emit({ type: 'error', code: 'unavailable', message: 'Ask a question or pick a suggestion.' });
    return;
  }
  await appendAskMessage(ctx, conversationId, { sender: 'user', text: userText });

  let staffData: StaffData | null = null;
  const loadStaff = async () => (staffData ??= await loadStaffData(ctx, now));

  const linkScope = async (): Promise<DestinationScope> => {
    if (shell === 'client') {
      const gates = gateActiveCatalog(clientTools?.state ?? {}, 'client');
      const locked = new Set(Object.entries(gates).filter(([, g]) => g.kind === 'locked').map(([id]) => id));
      return { shell, lockedStepIds: locked };
    }
    const data = await loadStaff();
    return {
      shell,
      engagementKeys: new Set(data.engagements.flatMap((e) => [e.engagement.slug || e.engagement.id, e.engagement.id])),
    };
  };

  const finish = async (
    answer: AnswerEnvelope,
    extra: {
      guard?: GuardResult | null;
      usage?: Usage;
      retrievedChunkIds?: string[];
      toolCalls?: Array<{ name: string; args: unknown }>;
      startedAt?: number;
    } = {},
  ) => {
    let final = actionsForShell(answer, shell, preview);
    // Every link, templated or model-written, is scope-checked here (§7.7).
    if (final.links && final.links.length > 0) {
      const links = sanitizeLinks(final.links, await linkScope());
      final = links.length > 0 ? { ...final, links } : { ...final, links: undefined };
    }
    const usage = extra.usage ?? NO_USAGE;
    const row = await appendAskMessage(ctx, conversationId!, {
      sender: 'assistant',
      text: final.line,
      answer: final,
      origin: final.origin,
      guard: extra.guard ?? null,
      retrievedChunkIds: (extra.retrievedChunkIds ?? []).filter((id) => UUID_RE.test(id)),
      toolCalls: extra.toolCalls ?? [],
      model: usage.model,
      inputTokens: usage.model ? usage.inputTokens : null,
      outputTokens: usage.model ? usage.outputTokens : null,
      cacheReadTokens: usage.model ? usage.cacheReadTokens : null,
      latencyMs: extra.startedAt ? Date.now() - extra.startedAt : null,
    });
    emit({ type: 'answer', conversationId: conversationId!, messageId: row?.id ?? '', answer: final });
  };

  // ---- 1. Suggestion click: deterministic, no model (T1) ----
  if (request.suggestionId && !request.message) {
    const answer = await resolveSuggestion(request.suggestionId, {
      shell,
      snapshot,
      depth: request.depth,
      loadStaff,
      clientState: clientTools?.state,
    });
    await finish(answer ?? unavailableAnswer(shell));
    return;
  }

  // ---- 2. "What's this?" on reviewed content (F1) ----
  if (request.context && !request.message) {
    if (request.context.kind === 'document' && !(shell === 'client' && askFeatures().C2)) {
      await finish(unavailableAnswer(shell));
      return;
    }
    const answer = contextAnswer(request.context, { snapshot, clientTools, features: askFeatures() });
    if (answer) {
      await finish(answer);
      return;
    }
  }

  // ---- 3. Free text: guard → topic or generation ----
  const message = request.message ?? `What is ${request.context?.label ?? 'this'}?`;
  const limit = await checkAskRateLimit(ctx, config.rateLimit, now);
  if (!limit.ok) {
    emit({ type: 'error', code: 'rate_limited', message: REFUSAL_COPY.rateLimited });
    return;
  }

  const provider = await getAskProvider();
  if (!provider) {
    await finish(unavailableAnswer(shell));
    return;
  }

  const startedAt = Date.now();
  const audience = personaFor(shell);
  const applicability = applicabilityFromSnapshot(snapshot);
  let usage: Usage = NO_USAGE;
  let guard: GuardResult;
  try {
    const topics = listTopics()
      .filter((t) => t.audience === 'both' || t.audience === audience)
      .map((t) => ({ slug: t.slug, question: t.question }));
    const run = await runGuard(provider, {
      model: config.models.guard,
      shell,
      message,
      history,
      topics,
    });
    guard = run.result;
    usage = addUsage(usage, run.model, run.usage);
  } catch (error) {
    console.error('[ask-vcfo] guard failed', error);
    await finish(unavailableAnswer(shell));
    return;
  }

  if (guard.intent === 'off_topic' || guard.intent === 'unsafe') {
    await finish(offTopicAnswer(shell), { guard, usage, startedAt });
    return;
  }
  if (guard.intent === 'greeting') {
    await finish(greetingAnswer(shell), { guard, usage, startedAt });
    return;
  }

  const decision = guard.intent === 'decision_request';
  const topic = guard.topicSlug ? resolveTopicForViewer(guard.topicSlug, applicability, audience) : null;
  if (topic && isReviewed(topic)) {
    let answer = topicToAnswer(topic, { depth: request.depth, shell, snapshot });
    if (decision) {
      answer = ensureAskLead(
        { ...answer, line: `${shell === 'client' ? REFUSAL_COPY.decision : REFUSAL_COPY.decisionStaff} ${answer.line}` },
        shell,
      );
    }
    // Topic served after a guard call: record the guard usage, reviewed origin.
    await finish(answer, { guard, usage, startedAt });
    return;
  }

  emit({ type: 'status', label: STATUS_LABELS.sources });
  const sources = await retrieveSources(ctx, {
    query: guard.rewrittenQuery,
    persona: audience,
    topK: config.retrievalTopK,
    applicability,
  });

  const tools =
    shell === 'client'
      ? Object.values(CLIENT_TOOLS).map((t) => ({
          definition: t.definition,
          run: (input: Record<string, unknown>) => t.run(clientTools!, input),
        }))
      : Object.values(STAFF_TOOLS).map((t) => ({
          definition: t.definition,
          run: async (input: Record<string, unknown>) => t.run(await loadStaff(), input),
        }));

  const allowedCitationIds = new Set<string>([
    ...sources.map((s) => s.id),
    ...sources
      .filter((s) => s.kind === 'topic')
      .flatMap((s) => resolveTopicForViewer(s.id, applicability, audience)?.citations.map((c) => c.id) ?? []),
    ...tools.map((t) => t.definition.name),
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
      model: config.models.answer,
      effort: config.answerEffort,
      shell,
      firmName: firmDisplayName(),
      snapshot,
      sources,
      history,
      message,
      language: request.language ?? guard.language,
      depth,
      decision,
      tools,
      validate: (raw, toolResultTexts) => {
        const vctx = { shell, allowedCitationIds, toolResultTexts };
        const full = validateAnswer(enrich(raw), vctx);
        if (full.ok === true) return full;
        // An invalid visual alone renders as text only (§3.3), without a retry.
        const textOnly = validateAnswer(withoutVisual(enrich(raw)), vctx);
        return textOnly.ok === true ? textOnly : full;
      },
    });
  } catch (error) {
    console.error('[ask-vcfo] generation failed', error);
    await finish(unavailableAnswer(shell), { guard, usage, startedAt });
    return;
  }
  usage = addUsage(usage, output.model, output.usage);

  let answer: AnswerEnvelope;
  const result = output.result;
  if (result.ok === true) {
    answer = result.answer;
  } else if ('textOnly' in result && result.textOnly) {
    // T3: no render_answer call — the text becomes a plain answer, still checked.
    const fallback = validateAnswer(
      { line: result.textOnly.slice(0, 1200), citations: [], actions: [], origin: 'generated', depth },
      { shell, allowedCitationIds, toolResultTexts: output.toolResultTexts },
    );
    answer = fallback.ok === true ? fallback.answer : uncertainAnswer();
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
  await finish(answer, {
    guard,
    usage,
    startedAt,
    retrievedChunkIds: sources.filter((s) => s.kind === 'chunk').map((s) => s.id),
    toolCalls: output.toolCalls,
  });
}
