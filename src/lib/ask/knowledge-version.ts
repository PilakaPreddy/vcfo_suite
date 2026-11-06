import 'server-only';

import { createHash } from 'node:crypto';
import { systemKnowledgeStamp } from '@/db/repositories/ask-documents';
import { listTopics } from '@/lib/ask/topics';

/**
 * A short hash of everything a document answer stands on: topic versions, the sources in force and
 * the latest published regulatory update. When any of them moves, every saved answer stops matching.
 */
export async function currentKnowledgeVersion(now: Date = new Date()): Promise<string> {
  const topics = listTopics().map((t) => `${t.slug}:${t.version}:${t.status}`).join(',');
  return createHash('sha256').update(`${topics}|${await systemKnowledgeStamp(now)}`).digest('hex').slice(0, 16);
}
