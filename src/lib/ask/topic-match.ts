import type { Topic } from '@/data/ask/schema';
import type { RetrievedSource } from '@/lib/ask/retrieve';
import { appliesTo, listTopics, type ApplicabilityContext } from '@/lib/ask/topics';

/** Keyword matching over the reviewed topics. They are few, so no index is needed. */

const STOP = new Set(['what', 'is', 'the', 'a', 'an', 'of', 'do', 'we', 'to', 'and', 'for', 'in', 'my', 'our', 'how', 'why', 'does', 'it', 'i', 'you', 'be', 'on', 'need']);

/** Word endings fold together, so "incorporated" finds "incorporation" and "resolutions" finds "resolution". */
function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ations?|ated?|ing|ers?|ed|es|s)$/, '') : word;
}

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

function scoreTopic(topic: Topic, query: string): number {
  const q = new Set(terms(query));
  if (q.size === 0) return 0;
  const title = new Set(terms(`${topic.title} ${topic.question}`));
  const body = new Set(terms(topic.body.normal));
  let score = 0;
  // A word in the title or question says more about the topic than the same word in its body.
  for (const t of q) score += title.has(t) ? 2 : body.has(t) ? 1 : 0;
  return score / q.size;
}

function ranked(topics: readonly Topic[], query: string, limit: number): Topic[] {
  return topics
    .map((t) => ({ t, s: scoreTopic(t, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}

const forAudience = (t: Topic, audience: 'client' | 'staff') => t.audience === 'both' || t.audience === audience;

/** The likely topics for the router. Applicability is left to the caller, which resolves alternates. */
export function shortlistTopics(query: string, audience: 'client' | 'staff', limit = 8): Topic[] {
  return ranked(listTopics().filter((t) => forAudience(t, audience)), query, limit);
}

const asKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** The topic whose question is exactly this question, apart from case and punctuation. */
export function exactTopic(query: string, audience: 'client' | 'staff'): Topic | null {
  const key = asKey(query);
  return listTopics().find((t) => forAudience(t, audience) && asKey(t.question) === key) ?? null;
}

export function matchTopics(
  query: string,
  ctx: ApplicabilityContext | null,
  audience: 'client' | 'staff',
  limit: number,
): Topic[] {
  return ranked(listTopics().filter((t) => forAudience(t, audience) && appliesTo(t.appliesTo, ctx)), query, limit);
}

/** A topic as evidence. Draft topics count too, as context only, and the answer is then badged. */
export function topicSource(t: Topic): RetrievedSource {
  return {
    id: t.slug,
    kind: 'topic',
    label: t.title,
    text: `${t.question}\n${t.body.detail}\nWhy it matters: ${t.body.why}\nSources: ${t.citations
      .map((c) => `${c.id} (${c.label})`)
      .join('; ')}`,
  };
}
