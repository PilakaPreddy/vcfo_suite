import 'server-only';

import { and, asc, cosineDistance, desc, eq, inArray, isNotNull, isNull, lte, ne, notExists, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  askIndexItems,
  complianceTaskComments,
  complianceTasks,
  documentRequests,
  engagementNotes,
  engagements,
  regUpdates,
  tasks,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { listScopedEngagementIds } from '@/db/repositories/engagements';
import { anyWordQuery, keepStrongHits, MAX_COSINE_DISTANCE, SEARCH_CANDIDATES } from '@/db/repositories/ask-documents';
import { isFirmWideAdmin } from '@/lib/auth';
import { assertAskRole } from '@/lib/ask/access';
import type { QueryVector } from '@/lib/ask/embeddings/types';
import type { CardKind, CardSource, IndexCard } from '@/lib/ask/index-cards/build';
import { indiaDay } from '@/lib/ask/nudge';
import { fuseRanked } from '@/lib/ask/rank-fusion';

/**
 * ASK VCFO RECORD CARDS: short search cards built from notes, comments, requests and task titles.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * `searchIndexItems` filters first by the engagements `scopeFor` gives this person (a soft-deleted
 * engagement never matches), then by owner, then by audience, and only then ranks. A client sees
 * `client` and `both` cards of their own engagements and nothing else. A card with no engagement is
 * firm-wide, such as a published regulatory update.
 *
 * `system*` functions are for the refresh job and the backfill script, which have no signed-in
 * person, and must never be called from a route.
 */

// ---------- Refresh (system) ----------

const company = () => ({ companyName: engagements.companyName, clientId: engagements.clientId });
const onLive = (id: SQL | undefined) => and(isNull(engagements.deletedAt), id);

/** The raw rows a card is built from, one kind at a time. With an id, that one row if it still stands. */
export async function systemReadCardSources(kind: CardKind, id?: string): Promise<CardSource[]> {
  if (kind === 'task') {
    const rows = await db
      .select({ id: tasks.id, engagementId: tasks.engagementId, title: tasks.title, body: tasks.description, ...company() })
      .from(tasks)
      .innerJoin(engagements, eq(engagements.id, tasks.engagementId))
      .where(onLive(id ? eq(tasks.id, id) : undefined));
    return rows.map((r) => ({ ...r, kind, engagementId: r.engagementId! }));
  }
  if (kind === 'request') {
    const rows = await db
      .select({ id: documentRequests.id, engagementId: documentRequests.engagementId, title: documentRequests.title, body: documentRequests.detail, ...company() })
      .from(documentRequests)
      .innerJoin(engagements, eq(engagements.id, documentRequests.engagementId))
      .where(onLive(id ? eq(documentRequests.id, id) : undefined));
    return rows.map((r) => ({ ...r, kind }));
  }
  if (kind === 'note') {
    const rows = await db
      .select({ id: engagementNotes.id, engagementId: engagementNotes.engagementId, body: engagementNotes.body, ...company() })
      .from(engagementNotes)
      .innerJoin(engagements, eq(engagements.id, engagementNotes.engagementId))
      .where(onLive(and(isNull(engagementNotes.deletedAt), id ? eq(engagementNotes.id, id) : undefined)));
    return rows.map((r) => ({ ...r, kind, title: null }));
  }
  if (kind === 'compliance_task') {
    const rows = await db
      .select({ id: complianceTasks.id, engagementId: complianceTasks.engagementId, title: complianceTasks.name, visibility: complianceTasks.visibility, ...company() })
      .from(complianceTasks)
      .innerJoin(engagements, eq(engagements.id, complianceTasks.engagementId))
      .where(onLive(id ? eq(complianceTasks.id, id) : undefined));
    return rows.map((r) => ({ ...r, kind, body: null }));
  }
  const rows = await db
    .select({
      id: complianceTaskComments.id,
      engagementId: complianceTasks.engagementId,
      title: complianceTasks.name,
      body: complianceTaskComments.body,
      internal: complianceTaskComments.internal,
      visibility: complianceTasks.visibility,
      ...company(),
    })
    .from(complianceTaskComments)
    .innerJoin(complianceTasks, eq(complianceTasks.id, complianceTaskComments.taskId))
    .innerJoin(engagements, eq(engagements.id, complianceTasks.engagementId))
    .where(onLive(id ? eq(complianceTaskComments.id, id) : undefined));
  return rows.map((r) => ({ ...r, kind }));
}

/** Changed text loses its vector, so the backfill embeds it again. Unchanged text keeps it and costs nothing. */
export async function systemUpsertIndexItems(cards: readonly IndexCard[]): Promise<void> {
  if (cards.length === 0) return;
  await db
    .insert(askIndexItems)
    .values([...cards])
    .onConflictDoUpdate({
      target: [askIndexItems.sourceKind, askIndexItems.sourceId],
      set: {
        title: sql`excluded.title`,
        cardText: sql`excluded.card_text`,
        engagementId: sql`excluded.engagement_id`,
        clientId: sql`excluded.client_id`,
        audience: sql`excluded.audience`,
        contentHash: sql`excluded.content_hash`,
        embedding: sql`case when ${askIndexItems.contentHash} = excluded.content_hash then ${askIndexItems.embedding} end`,
        embeddingModel: sql`case when ${askIndexItems.contentHash} = excluded.content_hash then ${askIndexItems.embeddingModel} end`,
        updatedAt: new Date(),
      },
    });
}

export async function systemDeleteIndexItem(kind: CardKind, sourceId: string): Promise<void> {
  await db.delete(askIndexItems).where(and(eq(askIndexItems.sourceKind, kind), eq(askIndexItems.sourceId, sourceId)));
}

/** Drops the cards of one kind whose source row is gone. */
export async function systemPruneIndexItems(kind: CardKind, keepSourceIds: readonly string[]): Promise<void> {
  const ofKind = eq(askIndexItems.sourceKind, kind);
  await db.delete(askIndexItems).where(keepSourceIds.length > 0 ? and(ofKind, sql`${askIndexItems.sourceId} <> all(${sql.param([...keepSourceIds])}::text[])`) : ofKind);
}

/** Cards with no vector, or one from another model, as the text to embed. */
export async function systemListUnembeddedCards(model: string, limit: number): Promise<Array<{ id: string; text: string }>> {
  const rows = await db
    .select({ id: askIndexItems.id, title: askIndexItems.title, cardText: askIndexItems.cardText })
    .from(askIndexItems)
    .where(or(isNull(askIndexItems.embedding), ne(askIndexItems.embeddingModel, model)))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.cardText}` }));
}

export async function systemSetCardEmbeddings(model: string, rows: ReadonlyArray<{ id: string; embedding: number[] }>): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.update(askIndexItems).set({ embedding: row.embedding, embeddingModel: model }).where(eq(askIndexItems.id, row.id));
    }
  });
}

// ---------- Search ----------

export interface IndexHit {
  id: string;
  sourceKind: string;
  title: string;
  cardText: string;
  href: string | null;
  engagementId: string | null;
  companyName: string | null;
  rank: number;
}

/**
 * Hybrid search over the cards this person may see, 4 sources' worth at most. `engagementId` narrows
 * a client chat to its one project, and firm-wide cards stay in.
 */
export async function searchIndexItems(
  ctx: AuthContext,
  input: { query: string; persona: 'client' | 'staff'; limit: number; engagementId?: string | null; queryVector?: QueryVector | null },
  now: Date = new Date(),
): Promise<IndexHit[]> {
  assertAskRole(ctx);
  const query = input.query.trim();
  if (!query) return [];
  const persona = ctx.role === 'client' ? 'client' : input.persona;

  const scoped = isFirmWideAdmin(ctx.role) ? null : await listScopedEngagementIds(ctx);
  const onProject = isNotNull(askIndexItems.engagementId);
  const engagementScope = input.engagementId
    ? scoped && !scoped.includes(input.engagementId)
      ? null
      : eq(askIndexItems.engagementId, input.engagementId)
    : scoped
      ? scoped.length > 0
        ? inArray(askIndexItems.engagementId, scoped)
        : null
      : onProject;
  const access = and(
    or(isNull(askIndexItems.engagementId), engagementScope ? and(engagementScope, isNull(engagements.deletedAt)) : sql`false`),
    or(isNull(askIndexItems.ownerProfileId), eq(askIndexItems.ownerProfileId, ctx.userId)),
    inArray(askIndexItems.audience, persona === 'client' ? ['client', 'both'] : ['client', 'staff', 'both']),
    isNull(askIndexItems.supersededAt),
    or(isNull(askIndexItems.effectiveFrom), lte(askIndexItems.effectiveFrom, indiaDay(now))),
    // An update a published one replaced leaves the search the moment its replacement is published.
    notExists(
      db
        .select({ id: regUpdates.id })
        .from(regUpdates)
        .where(and(eq(askIndexItems.sourceKind, 'reg_update'), sql`${regUpdates.supersedesUpdateId}::text = ${askIndexItems.sourceId}`, eq(regUpdates.status, 'published'))),
    ),
  );

  const tsQuery = anyWordQuery(query);
  const rank = sql<number>`ts_rank(${askIndexItems.tsv}, ${tsQuery}, 1)`;
  const search = (match: SQL, order: SQL) =>
    db
      .select({
        id: askIndexItems.id,
        sourceKind: askIndexItems.sourceKind,
        title: askIndexItems.title,
        cardText: askIndexItems.cardText,
        href: askIndexItems.href,
        engagementId: askIndexItems.engagementId,
        companyName: engagements.companyName,
        rank,
      })
      .from(askIndexItems)
      .leftJoin(engagements, eq(engagements.id, askIndexItems.engagementId))
      .where(and(access, match))
      .orderBy(order)
      .limit(SEARCH_CANDIDATES);
  const words = await search(sql`${askIndexItems.tsv} @@ ${tsQuery}`, desc(rank));
  const vector = input.queryVector;
  const distance = vector && cosineDistance(askIndexItems.embedding, vector.values);
  const near =
    vector && distance
      ? await search(and(isNotNull(askIndexItems.embedding), eq(askIndexItems.embeddingModel, vector.model), sql`${distance} <= ${MAX_COSINE_DISTANCE}`)!, asc(distance))
      : [];
  return fuseRanked(
    [keepStrongHits(words.map((r) => ({ ...r, rank: Number(r.rank) }))), near.map((r) => ({ ...r, rank: Number(r.rank) }))],
    Math.max(1, Math.min(input.limit, 20)),
  );
}
