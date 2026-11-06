/**
 * `npm run eval:knowledge:live` runs the paraphrase and Hinglish cases through the real pipeline: the
 * real router and document model, real retrieval on the loaded content, real rows in the database it
 * points at. It costs tokens, so run it on demand and on a local database only. Embeddings follow
 * ASK_EMBEDDINGS_PROVIDER, so on `none` this is the full-text path.
 *
 * Each case passes when the answer took a document or topic path, is not the uncertain fallback, and
 * cites something. A standing question runs twice, and the second run must come from the saved
 * answers with no model call. Name case ids after `--` to run only those.
 */
import '../../../scripts/load-env';

import { sql } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';
import { db } from '@/db/client';
import { askChunks } from '@/db/schema';
import { runAskChat } from '@/lib/ask/pipeline';
import { REFUSAL_COPY } from '@/lib/ask/refusals';
import { HINGLISH_CASES, PARAPHRASE_CASES, type KnowledgeCase } from './knowledge-cases';

async function adminContext(): Promise<AuthContext> {
  const { rows } = await db.execute<{ id: string }>(sql`select id from profiles where role = 'admin' limit 1`);
  return { userId: rows[0]!.id, email: 'eval@vcfo.local', name: 'Eval', role: 'admin' };
}

async function pathOf(conversationId: string): Promise<{ path: string | null; input: number | null; output: number | null }> {
  const { rows } = await db.execute<{ path: string | null; input_tokens: number | null; output_tokens: number | null }>(
    sql`select path, input_tokens, output_tokens from ask_messages where conversation_id = ${conversationId} and sender = 'assistant' order by created_at desc limit 1`,
  );
  return { path: rows[0]?.path ?? null, input: rows[0]?.input_tokens ?? null, output: rows[0]?.output_tokens ?? null };
}

async function ask(ctx: AuthContext, question: string): Promise<{ answer: AnswerEnvelope | null; path: string | null; input: number; output: number }> {
  let answer: AnswerEnvelope | null = null;
  let conversationId = '';
  await runAskChat(ctx, { shell: 'admin', message: question }, (event) => {
    if (event.type === 'answer') {
      answer = event.answer;
      conversationId = event.conversationId;
    }
  });
  const usage = conversationId ? await pathOf(conversationId) : { path: null, input: 0, output: 0 };
  return { answer, path: usage.path, input: usage.input ?? 0, output: usage.output ?? 0 };
}

async function main() {
  const ctx = await adminContext();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(askChunks);
  console.log(`chunks loaded: ${row?.n}. Embeddings: ${process.env.ASK_EMBEDDINGS_PROVIDER ?? 'none'}.`);
  const only = process.argv.slice(2);
  const cases: readonly KnowledgeCase[] = [...PARAPHRASE_CASES, ...HINGLISH_CASES].filter((c) => only.length === 0 || only.includes(c.id));
  let passed = 0;
  let input = 0;
  let output = 0;
  for (const c of cases) {
    const { answer, path, input: i, output: o } = await ask(ctx, c.question);
    input += i;
    output += o;
    const typed = answer as AnswerEnvelope | null;
    const cited = (typed?.citations.length ?? 0) > 0;
    const certain = typed ? !typed.line.includes(REFUSAL_COPY.uncertain) : false;
    const ok = cited && certain && (path === 'document_answer' || path === 'router_topic' || path === 'saved_answer');
    if (ok) passed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id} [${path}] ${i}+${o} cites=${typed?.citations.map((x) => x.label).join('; ')}\n     ${typed?.line.slice(0, 180)}`);
  }
  const standing = PARAPHRASE_CASES.find((c) => c.id === 'sales-return')!.question;
  await ask(ctx, standing);
  const again = await ask(ctx, standing);
  console.log(`a standing question asked again: path ${again.path}, tokens ${again.input}+${again.output}`);
  console.log(`${passed} of ${cases.length} passed. Tokens stored on the answers: ${input} in, ${output} out.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
