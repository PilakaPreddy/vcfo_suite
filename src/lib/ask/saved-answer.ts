import type { AnswerEnvelope } from '@/data/ask/schema';
import { SNAPSHOT_SOURCE_ID } from '@/lib/ask/generate';
import type { RetrievedSource } from '@/lib/ask/retrieve';

/**
 * Whether a generated answer may serve the next person who asks in exactly the same words. Only an
 * answer built from documents alone qualifies: no tool result, no record card, no project snapshot,
 * no named company, no link into a project, and no step or flow drawn from one client's project.
 */
export function maySaveAnswer(input: {
  answer: AnswerEnvelope;
  path: string;
  sources: readonly RetrievedSource[];
  namedCompany: boolean;
  companyName: string | null;
}): boolean {
  const { answer, sources, companyName } = input;
  if (input.path !== 'document_answer' || input.namedCompany) return false;
  if (sources.some((s) => s.kind === 'card')) return false;
  if (answer.citations.length === 0 || answer.citations.some((c) => c.id === SNAPSHOT_SOURCE_ID)) return false;
  if (answer.links?.some((link) => 'engagementId' in link.dest)) return false;
  if (answer.visual?.type === 'nextStep' || answer.visual?.type === 'flow') return false;
  return !companyName || !JSON.stringify(answer).toLowerCase().includes(companyName.toLowerCase());
}
