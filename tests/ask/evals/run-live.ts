/**
 * `npm run eval:live [-- --out <path>]` — the golden set against the REAL
 * guard and answer models (costs tokens; run on demand, never in CI). Needs
 * ANTHROPIC_API_KEY in .env.local (or ASK_VCFO_LLM_PROVIDER=bedrock +
 * ASK_VCFO_BEDROCK_REGION). No database: the client tools read fixture data,
 * and the topics matched by code are the retrieval sources, as in the pipeline
 * without ingested documents.
 *
 * Checks, per case with a `live` block: the guard's intent is one of the
 * expected intents; for answerable cases, the generated answer passes code
 * validation (dates, citations, visuals, links), honours `lineExcludes`, and
 * offers "Ask my lead" when required (the pipeline itself adds it to every
 * decision request, so that counts).
 *
 * `--out` writes a markdown report: date, provider, models, each case's
 * result, the intent seen vs expected, validation problems and token totals.
 */
import '../../../scripts/load-env';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getIncorporationPhases } from '@/data/checklist';
import { SNAPSHOTS, GOLDEN, type EvalSnapshot } from './golden';
import { askBudgets, askConfig } from '@/lib/ask/config';
import { generateAnswer, SNAPSHOT_SOURCE_ID } from '@/lib/ask/generate';
import { expectsData, runGuard } from '@/lib/ask/guard';
import { metricsForRole } from '@/lib/ask/metrics/match';
import { addLlmUsage, getAskProvider, NO_LLM_USAGE, type LlmProvider, type LlmUsage } from '@/lib/ask/provider';
import { estimateCostUsd, totalTokens } from '@/lib/ask/provider/pricing';
import { CLIENT_TOOLS, type ClientToolContext } from '@/lib/ask/tools/client';
import { STAFF_TOOLS, type StaffData } from '@/lib/ask/tools/staff';
import { matchTopics, shortlistTopics, topicSource } from '@/lib/ask/topic-match';
import { applicabilityFromSnapshot, isReviewed, resolveTopicForViewer } from '@/lib/ask/topics';
import { validateAnswer } from '@/lib/ask/validate';

interface CaseResult {
  id: string;
  category: string;
  pass: boolean;
  intentSeen: string;
  intentExpected: string;
  problems: string[];
  line: string;
  tools: string[];
  guardTokens: LlmUsage;
  answerTokens: LlmUsage;
  cost: number;
}

/** Checklist state matching each fixture snapshot, so tools and snapshot agree. */
function stateFor(name: EvalSnapshot): ClientToolContext['state'] {
  const current = SNAPSHOTS[name].currentStep?.id;
  const state: Record<string, { status: string; completedOn: string }> = {};
  for (const item of getIncorporationPhases().flatMap((p) => p.items)) {
    if (item.id === current) break;
    state[item.id] = { status: 'completed', completedOn: '2026-09-01' };
  }
  return state as ClientToolContext['state'];
}

function outPath(argv: string[]): string | null {
  const at = argv.indexOf('--out');
  return at >= 0 && argv[at + 1] ? path.resolve(argv[at + 1]!) : null;
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

async function main() {
  const configured = await getAskProvider();
  if (!configured) {
    console.error('No provider configured. Set ANTHROPIC_API_KEY (or Bedrock env) and try again.');
    process.exit(2);
  }
  // A reply cut at max_tokens is asked for again, so the count shows how tight the limits are.
  let cutOffs = 0;
  const provider: LlmProvider = {
    name: configured.name,
    async complete(req) {
      const response = await configured.complete(req);
      if (response.stopReason === 'max_tokens') cutOffs += 1;
      return response;
    },
  };
  const config = askConfig();
  const out = outPath(process.argv.slice(2));
  const cases = GOLDEN.filter((c) => c.live && c.message);
  const results: CaseResult[] = [];
  const models = new Set<string>();

  for (const c of cases) {
    const live = c.live!;
    const snapshotName = c.snapshot ?? 'foreignCompany';
    const snapshot = c.shell === 'client' ? SNAPSHOTS[snapshotName] : null;
    const audience = c.shell === 'client' ? 'client' : 'staff';
    const problems: string[] = [];
    let intentSeen = '—';
    let line = '';
    let toolsCalled: string[] = [];
    let guardTokens = NO_LLM_USAGE;
    let answerTokens = NO_LLM_USAGE;
    let guardModel = '';
    let answerModel = '';
    try {
      const history = live.history ?? [];
      const lastAsked = history.findLast((m) => m.sender === 'user')?.text ?? '';
      const topics = shortlistTopics(`${c.message!} ${lastAsked}`, audience);
      const guard = await runGuard(provider, {
        model: config.models.guard,
        shell: c.shell,
        message: c.message!,
        history,
        topics: topics.map((t) => ({ slug: t.slug, question: t.question })),
        metrics: metricsForRole(c.shell === 'client' ? 'client' : 'admin').map((m) => m.name),
      });
      guardModel = guard.model;
      models.add(guardModel);
      guardTokens = guard.usage;
      intentSeen = guard.result.intent;
      if (!live.intents.includes(guard.result.intent)) {
        problems.push(`intent ${guard.result.intent}, expected ${live.intents.join('|')}`);
      }
      if (live.rewriteIncludes && !live.rewriteIncludes.test(guard.result.rewrittenQuery)) {
        problems.push(`rewrite lost the subject: ${guard.result.rewrittenQuery}`);
      }
      if (live.topicSlug && guard.result.topicSlug !== live.topicSlug) {
        problems.push(`topic ${guard.result.topicSlug ?? 'none'}, expected ${live.topicSlug}`);
      }
      const applicability = applicabilityFromSnapshot(snapshot);
      const reviewed = guard.result.topicSlug ? resolveTopicForViewer(guard.result.topicSlug, applicability, audience) : null;
      const answerable = !['off_topic', 'unsafe', 'greeting', 'do_work'].includes(guard.result.intent) && !(reviewed && isReviewed(reviewed));
      if (answerable) {
        const now = new Date();
        const clientCtx: ClientToolContext | null = snapshot
          ? {
              snapshot,
              state: stateFor(snapshotName),
              filings: [{ particular: 'GSTR-3B', dueDate: '2026-10-20', filedOn: null }],
              now,
            }
          : null;
        const staff: StaffData = { engagements: [], filings: [], now };
        const tools = clientCtx
          ? Object.values(CLIENT_TOOLS).map((t) => ({ definition: t.definition, run: (i: Record<string, unknown>) => t.run(clientCtx, i) }))
          : Object.values(STAFF_TOOLS).map((t) => ({ definition: t.definition, run: (i: Record<string, unknown>) => t.run(staff, i) }));
        const matched = matchTopics(guard.result.rewrittenQuery, applicability, audience, config.retrievalTopK);
        // The source text a case injects takes a slot, as a retrieved chunk would.
        const injected = (c.mock?.retrieved ?? []).map((r) => ({ id: r.id, kind: 'topic' as const, label: r.label, text: r.text }));
        const sources = [...injected, ...matched.map(topicSource)].slice(0, config.retrievalTopK);
        const kept = new Set(sources.map((s) => s.id));
        const allowed = new Set<string>([
          ...kept,
          ...matched.filter((t) => kept.has(t.slug)).flatMap((t) => t.citations.map((x) => x.id)),
          ...tools.map((t) => t.definition.name),
          ...(snapshot ? [SNAPSHOT_SOURCE_ID] : []),
        ]);
        const decision = guard.result.intent === 'decision_request';
        const generated = await generateAnswer({
          provider,
          model: expectsData(guard.result.intent) ? config.models.answer : config.models.document,
          effort: config.answerEffort,
          maxTotalTokens: askBudgets().answerMaxTokens,
          shell: c.shell,
          firmName: 'SBC',
          snapshot,
          sources,
          history,
          message: guard.result.rewrittenQuery,
          language: guard.result.language,
          depth: 'normal',
          decision,
          tools,
          validate: (raw, texts) =>
            validateAnswer(
              raw && typeof raw === 'object' ? { ...(raw as object), origin: 'generated', depth: 'normal' } : raw,
              { shell: c.shell, allowedCitationIds: allowed, toolResultTexts: texts },
            ),
        });
        answerModel = generated.model;
        models.add(answerModel);
        answerTokens = generated.usage;
        toolsCalled = generated.toolCalls.map((t) => t.name);
        const result = generated.result;
        if (result.ok !== true) {
          problems.push(`answer rejected: ${'errors' in result ? result.errors.join('; ') : 'unknown'}`);
          if ('textOnly' in result) line = result.textOnly;
        } else {
          line = result.answer.line;
          if (live.lineExcludes && live.lineExcludes.test(result.answer.line)) problems.push(`line matched ${live.lineExcludes}`);
          // The pipeline adds "Ask my lead" to every decision request itself.
          if (live.mustAskLead && !decision && !result.answer.actions.includes('askLead')) problems.push('no askLead action');
        }
      }
    } catch (error) {
      problems.push(`error: ${(error as Error).message}`);
    }
    results.push({
      id: c.id,
      category: c.category,
      pass: problems.length === 0,
      intentSeen,
      intentExpected: live.intents.join(' | '),
      problems,
      line,
      tools: toolsCalled,
      guardTokens,
      answerTokens,
      cost: estimateCostUsd(guardModel, guardTokens) + estimateCostUsd(answerModel, answerTokens),
    });
    console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${c.id}${problems.length ? `  — ${problems.join(' / ')}` : ''}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const guardSum = results.reduce((sum, r) => addLlmUsage(sum, r.guardTokens), NO_LLM_USAGE);
  const answerSum = results.reduce((sum, r) => addLlmUsage(sum, r.answerTokens), NO_LLM_USAGE);
  const answered = results.filter((r) => totalTokens(r.answerTokens) > 0);
  const cost = results.reduce((sum, r) => sum + r.cost, 0);
  const perGuard = Math.round(totalTokens(guardSum) / Math.max(results.length, 1));
  const perAnswer = Math.round(totalTokens(answerSum) / Math.max(answered.length, 1));
  const describe = (u: LlmUsage) =>
    `${u.inputTokens} input, ${u.cacheReadTokens} cache read, ${u.cacheWriteTokens} cache write, ${u.outputTokens} output`;
  console.log(`\n${passed}/${results.length} live cases passed. Guard: ${describe(guardSum)}. Answer: ${describe(answerSum)}.`);
  console.log(`Per guard call ${perGuard} tokens; per generated answer ${perAnswer} tokens on ${answered.length} cases; ${cutOffs} replies cut at the limit; about $${cost.toFixed(3)}.`);

  if (out) {
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const md = [
      `# Ask VCFO — live evaluation, ${date}`,
      '',
      'Generated by `npm run eval:live -- --out <path>`. The guard and answer models were called for real; project data is fixture data.',
      '',
      `- **Result:** ${passed} of ${results.length} cases passed`,
      `- **Provider:** ${provider.name}`,
      `- **Models:** ${[...models].join(', ')} (answer effort ${config.answerEffort})`,
      `- **Guard tokens:** ${describe(guardSum)} (${perGuard} per call)`,
      `- **Answer tokens:** ${describe(answerSum)} (${perAnswer} per generated answer, ${answered.length} cases)`,
      `- **Replies cut at max_tokens and asked for again:** ${cutOffs}`,
      `- **Cost at list price:** about $${cost.toFixed(3)}`,
      '',
      '| Case | Category | Result | Intent seen | Intent expected | Guard tokens | Answer tokens | Problems |',
      '|---|---|---|---|---|---:|---:|---|',
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.category} | ${r.pass ? 'pass' : '**FAIL**'} | ${r.intentSeen} | ${r.intentExpected} | ${totalTokens(r.guardTokens)} | ${totalTokens(r.answerTokens)} | ${cell(r.problems.join(' / ')) || '—'} |`,
      ),
      '',
      '## Answers (for human review)',
      '',
      ...results
        .filter((r) => r.line)
        .flatMap((r) => [`**${r.id}**${r.tools.length ? ` (tools: ${r.tools.join(', ')})` : ''}`, '', `> ${cell(r.line)}`, '']),
    ].join('\n');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${md}\n`);
    console.log(`Report: ${path.relative(process.cwd(), out)}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

void main();
