import 'server-only';

import { and, asc, cosineDistance, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { askChunks, askDocuments, regUpdates } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { AskForbiddenError, assertAskRole } from '@/lib/ask/access';
import type { QueryVector } from '@/lib/ask/embeddings/types';
import { indiaDay } from '@/lib/ask/nudge';
import { fuseRanked } from '@/lib/ask/rank-fusion';

/**
 * ASK VCFO KNOWLEDGE SOURCES.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Upload, list and status changes: admin / super admin only.
 * Retrieval (`searchAskChunks`) is open to every Ask VCFO role but filters by
 * audience: a client-persona search only ever sees `client` / `both` sources,
 * so staff-only notes never reach a client answer. Only `ready` documents in
 * force today are searched: a replaced or expired source, or one not yet in
 * force, never reaches an answer.
 *
 * `system*` functions are for the ingestion job (no user context) and must
 * never be called from a route.
 */

export type AskDocumentRow = typeof askDocuments.$inferSelect;
export type AskDocumentAudience = 'client' | 'staff' | 'both';
export type AskSourceType = 'govt' | 'firm_pdf' | 'firm_note';

function assertSourceAdmin(ctx: AuthContext) {
  assertAskRole(ctx);
  if (!isFirmWideAdmin(ctx.role)) throw new AskForbiddenError('Only firm admins manage Ask VCFO sources');
}

export interface CreateAskDocumentInput {
  title: string;
  sourceType: AskSourceType;
  sourceUrl?: string | null;
  s3Key?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  /** Takes over once this source is ready and in force. */
  supersedesDocumentId?: string | null;
  audience: AskDocumentAudience;
}

export async function createAskDocument(
  ctx: AuthContext,
  input: CreateAskDocumentInput,
): Promise<AskDocumentRow> {
  assertSourceAdmin(ctx);
  const [row] = await db
    .insert(askDocuments)
    .values({
      title: input.title.trim(),
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      s3Key: input.s3Key ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      supersedesDocumentId: input.supersedesDocumentId ?? null,
      audience: input.audience,
      ownerProfileId: ctx.userId,
      status: 'processing',
      lastVerifiedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('Could not save the source');
  return row;
}

export async function listAskDocuments(ctx: AuthContext): Promise<AskDocumentRow[]> {
  assertSourceAdmin(ctx);
  return db.select().from(askDocuments).orderBy(desc(askDocuments.createdAt));
}

export async function getAskDocument(ctx: AuthContext, id: string): Promise<AskDocumentRow | null> {
  assertSourceAdmin(ctx);
  const [row] = await db.select().from(askDocuments).where(eq(askDocuments.id, id)).limit(1);
  return row ?? null;
}

export async function setAskDocumentStatus(
  ctx: AuthContext,
  id: string,
  status: 'processing' | 'archived',
): Promise<AskDocumentRow | null> {
  assertSourceAdmin(ctx);
  const [row] = await db
    .update(askDocuments)
    .set({ status, error: null })
    .where(eq(askDocuments.id, id))
    .returning();
  // Archiving a replacement puts the source it replaced back in force.
  if (status === 'archived' && row?.supersedesDocumentId) {
    await db.update(askDocuments).set({ supersededAt: null }).where(eq(askDocuments.id, row.supersedesDocumentId));
  }
  return row ?? null;
}

export async function setAskDocumentStorageKey(ctx: AuthContext, id: string, s3Key: string): Promise<void> {
  assertSourceAdmin(ctx);
  await db.update(askDocuments).set({ s3Key }).where(eq(askDocuments.id, id));
}

// ---------- Ingestion job (system) ----------

export async function systemGetAskDocument(id: string): Promise<AskDocumentRow | null> {
  const [row] = await db.select().from(askDocuments).where(eq(askDocuments.id, id)).limit(1);
  return row ?? null;
}

/** Replace every chunk of a document — re-running ingestion is idempotent. */
export async function systemReplaceAskChunks(
  documentId: string,
  chunks: ReadonlyArray<{ ordinal: number; text: string; contextPrefix: string | null }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(askChunks).where(eq(askChunks.documentId, documentId));
    if (chunks.length > 0) {
      await tx.insert(askChunks).values(chunks.map((c) => ({ documentId, ...c })));
    }
  });
}

/**
 * A source that lives in this repository (`scripts/ask-load-knowledge.ts`). Unchanged text is left
 * alone, so its vectors, its chunk ids and the knowledge version all stay as they are.
 */
export async function systemLoadRepoDocument(input: {
  title: string;
  sourceType: AskSourceType;
  audience: AskDocumentAudience;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  chunks: readonly string[];
}): Promise<'created' | 'updated' | 'unchanged' | 'archived'> {
  const [found] = await db
    .select({ id: askDocuments.id, status: askDocuments.status })
    .from(askDocuments)
    .where(and(eq(askDocuments.title, input.title), eq(askDocuments.sourceType, input.sourceType), isNull(askDocuments.s3Key)))
    .limit(1);
  if (found?.status === 'archived') return 'archived';
  const fields = {
    audience: input.audience,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    status: 'ready',
    error: null,
    lastVerifiedAt: new Date(),
  };
  const chunks = input.chunks.map((text, ordinal) => ({ ordinal, text, contextPrefix: null }));
  if (found) {
    const current = await db
      .select({ text: askChunks.text })
      .from(askChunks)
      .where(eq(askChunks.documentId, found.id))
      .orderBy(asc(askChunks.ordinal));
    if (current.length === chunks.length && current.every((c, i) => c.text === input.chunks[i])) return 'unchanged';
    await systemReplaceAskChunks(found.id, chunks);
    await db.update(askDocuments).set(fields).where(eq(askDocuments.id, found.id));
    return 'updated';
  }
  const [row] = await db.insert(askDocuments).values({ title: input.title, sourceType: input.sourceType, ...fields }).returning({ id: askDocuments.id });
  await systemReplaceAskChunks(row!.id, chunks);
  return 'created';
}

export async function systemSetAskDocumentResult(
  documentId: string,
  result: { status: 'ready' } | { status: 'failed'; error: string },
): Promise<void> {
  if (result.status === 'failed') {
    await db.update(askDocuments).set({ status: 'failed', error: result.error.slice(0, 2000) }).where(eq(askDocuments.id, documentId));
    return;
  }
  const [row] = await db
    .update(askDocuments)
    .set({ status: 'ready', error: null, lastVerifiedAt: new Date() })
    .where(eq(askDocuments.id, documentId))
    .returning({ supersedes: askDocuments.supersedesDocumentId, effectiveFrom: askDocuments.effectiveFrom });
  // The old source stands until the new one can be searched and is in force.
  if (row?.supersedes) {
    const from = row.effectiveFrom ? new Date(`${row.effectiveFrom}T00:00:00+05:30`) : new Date(0);
    const at = new Date(Math.max(Date.now(), from.getTime()));
    await db.update(askDocuments).set({ supersededAt: at }).where(eq(askDocuments.id, row.supersedes));
  }
}

/** Chunks with no vector, or one from another model, as the text to embed. */
export async function systemListUnembeddedChunks(model: string, limit: number): Promise<Array<{ id: string; text: string }>> {
  const rows = await db
    .select({ id: askChunks.id, title: askDocuments.title, contextPrefix: askChunks.contextPrefix, text: askChunks.text })
    .from(askChunks)
    .innerJoin(askDocuments, eq(askDocuments.id, askChunks.documentId))
    .where(or(isNull(askChunks.embedding), ne(askChunks.embeddingModel, model)))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, text: [r.title, r.contextPrefix, r.text].filter(Boolean).join('\n') }));
}

export async function systemSetChunkEmbeddings(model: string, rows: ReadonlyArray<{ id: string; embedding: number[] }>): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.update(askChunks).set({ embedding: row.embedding, embeddingModel: model }).where(eq(askChunks.id, row.id));
    }
  });
}

/** What saved answers depend on, read in one go. In-force counts change when a date passes. */
export async function systemKnowledgeStamp(now: Date = new Date()): Promise<string> {
  const today = indiaDay(now);
  const [documents] = await db
    .select({
      updated: sql<string>`coalesce(max(${askDocuments.updatedAt})::text, '')`,
      inForce: sql<string>`count(*) filter (where ${inForce(today, now)})`,
    })
    .from(askDocuments);
  const [updates] = await db.select({ published: sql<string>`coalesce(max(${regUpdates.publishedAt})::text, '')` }).from(regUpdates);
  return `${documents?.updated}|${documents?.inForce}|${updates?.published}`;
}

// ---------- Retrieval ----------

export interface AskChunkHit {
  id: string;
  documentId: string;
  documentTitle: string;
  sourceType: string;
  sourceUrl: string | null;
  text: string;
  contextPrefix: string | null;
  rank: number;
}

/** Audiences a persona may read. Client persona never sees staff-only sources. */
function audiencesForPersona(persona: 'client' | 'staff'): AskDocumentAudience[] {
  return persona === 'client' ? ['client', 'both'] : ['client', 'staff', 'both'];
}

/** A source in force today: ready, begun, not ended, not replaced. */
function inForce(today: string, now: Date): SQL {
  return and(
    eq(askDocuments.status, 'ready'),
    or(isNull(askDocuments.effectiveFrom), lte(askDocuments.effectiveFrom, today)),
    or(isNull(askDocuments.effectiveTo), gte(askDocuments.effectiveTo, today)),
    or(isNull(askDocuments.supersededAt), sql`${askDocuments.supersededAt} > ${now.toISOString()}`),
  )!;
}

/** Any word may match, and more matches rank higher: a paraphrase rarely repeats every word of a source. */
export function anyWordQuery(query: string): SQL {
  return sql`replace(plainto_tsquery('english', ${query})::text, ' & ', ' | ')::tsquery`;
}

/** How many rows each search hands to the fusion, and the widest cosine distance still called a match. */
export const SEARCH_CANDIDATES = 20;
export const MAX_COSINE_DISTANCE = 0.8;

/** A hit under this share of the best full-text score matched only a stray word. */
export const MIN_RANK_SHARE = 0.25;

export function keepStrongHits<T extends { rank: number }>(rows: readonly T[]): T[] {
  const best = rows[0]?.rank ?? 0;
  return rows.filter((r) => r.rank >= best * MIN_RANK_SHARE);
}

/**
 * Hybrid search over documents in force: access and audience first, then full text and, with a
 * query vector, cosine distance, merged by reciprocal rank fusion. Scope is filtered before ranking,
 * so a row this person may not read never competes for a place.
 */
export async function searchAskChunks(
  ctx: AuthContext,
  input: { query: string; persona: 'client' | 'staff'; limit: number; queryVector?: QueryVector | null },
  now: Date = new Date(),
): Promise<AskChunkHit[]> {
  assertAskRole(ctx);
  // A client can never widen their persona to staff.
  const persona = ctx.role === 'client' ? 'client' : input.persona;
  const query = input.query.trim();
  if (!query) return [];
  const limit = Math.max(1, Math.min(input.limit, 20));
  const today = indiaDay(now);
  const tsQuery = anyWordQuery(query);
  const rank = sql<number>`ts_rank(${askChunks.tsv}, ${tsQuery}, 1)`;
  const search = (match: SQL, order: SQL) =>
    db
      .select({
        id: askChunks.id,
        documentId: askChunks.documentId,
        documentTitle: askDocuments.title,
        sourceType: askDocuments.sourceType,
        sourceUrl: askDocuments.sourceUrl,
        text: askChunks.text,
        contextPrefix: askChunks.contextPrefix,
        rank,
      })
      .from(askChunks)
      .innerJoin(askDocuments, eq(askDocuments.id, askChunks.documentId))
      .where(
        and(
          inForce(today, now),
          inArray(askDocuments.audience, audiencesForPersona(persona)),
          or(isNull(askChunks.supersededAt), sql`${askChunks.supersededAt} > ${now.toISOString()}`),
          or(isNull(askChunks.effectiveFrom), lte(askChunks.effectiveFrom, today)),
          or(isNull(askChunks.effectiveTo), gte(askChunks.effectiveTo, today)),
          match,
        ),
      )
      .orderBy(order)
      .limit(SEARCH_CANDIDATES);
  const words = await search(sql`${askChunks.tsv} @@ ${tsQuery}`, desc(rank));
  const vector = input.queryVector;
  const distance = vector && cosineDistance(askChunks.embedding, vector.values);
  const near =
    vector && distance
      ? await search(and(isNotNull(askChunks.embedding), eq(askChunks.embeddingModel, vector.model), sql`${distance} <= ${MAX_COSINE_DISTANCE}`)!, asc(distance))
      : [];
  return fuseRanked([keepStrongHits(words.map((r) => ({ ...r, rank: Number(r.rank) }))), near.map((r) => ({ ...r, rank: Number(r.rank) }))], limit);
}
