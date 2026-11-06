import 'server-only';

import type { AppRole } from '@/auth/guards';
import { listEngagements, toAppEngagement } from '@/db/repositories/engagements';
import type { AnswerEnvelope, AskShell, ProjectSnapshot } from '@/data/ask/schema';
import type { AskPath } from '@/lib/ask/paths';
import { greetingAnswer } from '@/lib/ask/refusals';
import { exactTopic } from '@/lib/ask/topic-match';
import { applicabilityFromSnapshot, isReviewed, resolveTopicForViewer, topicToAnswer } from '@/lib/ask/topics';
import { getMetric } from '@/lib/ask/metrics/catalog';
import { contentWords, matchCompany, matchMetric, routerMetricFilters } from '@/lib/ask/metrics/match';
import type { MetricDefinition, MetricEnv, MetricFilters } from '@/lib/ask/metrics/types';

/**
 * What code can answer alone, cheapest first: a greeting, a strict metric match, a reviewed topic
 * asked word for word. Only a strict match skips the model; anything else falls through to the router.
 */

const GREETINGS = new Set(
  (
    'hi|hii|hello|hey|hi there|hello there|hey there|namaste|namaskar|good morning|good afternoon|good evening|' +
    'hi vcfo|hello vcfo|hey vcfo|namaste vcfo'
  ).split('|'),
);

/** A reviewed answer explains; "should we" or "do we" needs the decision wording the router path adds. */
const DECISION_START = /^(?:do|does|did|should|shall|can|could|would|must|is|are|am|may|will)\b/;

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** The one company these words name inside the caller's scope. The client chat only knows its own. */
async function resolveClient(words: readonly string[], env: MetricEnv): Promise<MetricFilters['client'] | null> {
  try {
    const rows = (await listEngagements(env.ctx)).filter((r) => !r.deletedAt && (!env.engagementId || r.id === env.engagementId));
    const row = matchCompany(words, rows);
    return row ? { id: row.id, key: toAppEngagement(row).id, name: row.companyName } : null;
  } catch (error) {
    console.error('[ask-vcfo] company lookup failed', error);
    return null;
  }
}

/** A metric that cannot be read is not an answer: log it and let the question take the normal route. */
async function runMetric(metric: MetricDefinition, filters: MetricFilters, env: MetricEnv): Promise<AnswerEnvelope | null> {
  try {
    return metric.answer(await metric.run(env, filters), filters, env);
  } catch (error) {
    console.error(`[ask-vcfo] metric ${metric.name} failed`, error);
    return null;
  }
}

async function localMetric(message: string, role: AppRole, env: MetricEnv): Promise<AnswerEnvelope | null> {
  const match = matchMetric(message, role);
  if (!match) return null;
  if (match.companyWords.length === 0) return runMetric(match.metric, match.filters, env);
  const client = await resolveClient(match.companyWords, env);
  return client ? runMetric(match.metric, { ...match.filters, client }, env) : null;
}

/** The metric the router named, when code can honour the whole question. Otherwise null and the tools take it. */
export async function metricByName(
  name: string,
  company: string | undefined,
  rewritten: string,
  env: MetricEnv,
): Promise<AnswerEnvelope | null> {
  const metric = getMetric(name);
  const filters = metric && routerMetricFilters(metric, rewritten);
  if (!metric || !filters) return null;
  if (!company?.trim()) return runMetric(metric, filters, env);
  if (!metric.filters.includes('client')) return null;
  const client = await resolveClient(contentWords(company), env);
  return client ? runMetric(metric, { ...filters, client }, env) : null;
}

function localTopic(message: string, shell: AskShell, input: LocalInput): AnswerEnvelope | null {
  const key = plain(message);
  if (DECISION_START.test(key)) return null;
  const audience = shell === 'client' ? 'client' : 'staff';
  const found = exactTopic(message, audience);
  const topic = found && resolveTopicForViewer(found.slug, applicabilityFromSnapshot(input.snapshot), audience);
  return topic && isReviewed(topic) ? topicToAnswer(topic, { depth: input.depth, shell, snapshot: input.snapshot }) : null;
}

export interface LocalInput {
  env: MetricEnv;
  role: AppRole;
  depth: AnswerEnvelope['depth'];
  snapshot: ProjectSnapshot | null;
}

export async function localMatch(
  message: string,
  input: LocalInput,
): Promise<{ path: Extract<AskPath, 'greeting_local' | 'metric_local' | 'topic_local'>; answer: AnswerEnvelope } | null> {
  const { env } = input;
  if (GREETINGS.has(plain(message))) return { path: 'greeting_local', answer: greetingAnswer(env.shell) };
  const metric = await localMetric(message, input.role, env);
  if (metric) return { path: 'metric_local', answer: metric };
  const topic = localTopic(message, env.shell, input);
  return topic ? { path: 'topic_local', answer: topic } : null;
}
