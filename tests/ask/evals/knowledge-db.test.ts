// @vitest-environment node
import '../../../scripts/load-env';

import { and, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';
import { db } from '@/db/client';
import { askChunks, askDocuments, askIndexItems, askSavedAnswers, engagementNotes, engagements, profiles, regUpdates } from '@/db/schema';
import {
  createAskDocument,
  searchAskChunks,
  setAskDocumentStatus,
  systemKnowledgeStamp,
  systemReplaceAskChunks,
  systemSetAskDocumentResult,
} from '@/db/repositories/ask-documents';
import { searchIndexItems, systemUpsertIndexItems } from '@/db/repositories/ask-index';
import { findSavedAnswer, saveAnswer } from '@/db/repositories/ask-saved-answers';
import { createEngagementNote, deleteEngagementNote, updateEngagementNote } from '@/db/repositories/engagement-notes';
import { setEmbeddingProviderForTests } from '@/lib/ask/embeddings';
import { backfillEmbeddings } from '@/lib/ask/embeddings/backfill';
import type { IndexCard } from '@/lib/ask/index-cards/build';
import { rebuildIndexCards, refreshIndexCard } from '@/lib/ask/index-cards/refresh';
import { retrieveSources } from '@/lib/ask/retrieve';
import { fakeEmbeddingProvider, fakeVector, FAKE_EMBEDDING_MODEL } from './fake-embeddings';
import { HINGLISH_CASES, PARAPHRASE_CASES } from './knowledge-cases';

/**
 * Real Postgres with pgvector, on the content `npm run ask:knowledge:load` put there and the seeded
 * demo projects. Run with `npm run eval:knowledge`; a plain `npm run test` skips it because CI has no
 * database. It writes only fixture rows, marked `zz-eval`, and removes them again.
 */

const MARK = 'zz-eval';
const TOKEN = 'zephyrquill';

const staffCtx = (role: AuthContext['role'], userId: string, extra: Partial<AuthContext> = {}): AuthContext => ({
  userId,
  email: `${role}@eval.test`,
  name: role,
  role,
  ...extra,
});

function card(over: Partial<IndexCard> & { sourceId: string }): IndexCard {
  return {
    // Not a kind the rebuild owns, so the rebuild test leaves these fixtures alone.
    sourceKind: 'zz_fixture' as IndexCard['sourceKind'],
    title: `${MARK} ${TOKEN} ${over.sourceId}`,
    cardText: `Fixture ${TOKEN} card ${over.sourceId}`,
    engagementId: null as unknown as string,
    clientId: null,
    audience: 'staff',
    contentHash: over.sourceId,
    ...over,
  };
}

async function cleanup(): Promise<void> {
  await db.delete(askIndexItems).where(like(askIndexItems.title, `${MARK}%`));
  await db.delete(askDocuments).where(like(askDocuments.title, `${MARK}%`));
  await db.delete(askSavedAnswers).where(like(askSavedAnswers.questionKey, `${MARK}%`));
  await db.delete(regUpdates).where(like(regUpdates.title, `${MARK}%`));
  await db.delete(engagementNotes).where(like(engagementNotes.body, `${MARK}%`));
}

describe.skipIf(!process.env.ASK_EVAL_DB)('Ask VCFO knowledge on the real database', () => {
  let a: { id: string; clientUserId: string; clientId: string; internId: string | null };
  let b: { id: string; clientUserId: string; clientId: string };
  let admin: AuthContext;

  beforeAll(async () => {
    setEmbeddingProviderForTests(null);
    await cleanup();
    const rows = await db
      .select({ id: engagements.id, clientUserId: engagements.clientUserId, clientId: engagements.clientId, internId: engagements.internId })
      .from(engagements)
      .where(isNotNull(engagements.clientUserId));
    expect(rows.length, 'needs npm run db:seed-demo').toBeGreaterThanOrEqual(2);
    a = rows[0] as typeof a;
    b = rows.find((r) => r.clientUserId !== a.clientUserId && r.clientId !== a.clientId) as typeof b;
    const [adminRow] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.role, 'admin')).limit(1);
    admin = staffCtx('admin', adminRow!.id);
    await systemUpsertIndexItems([
      card({ sourceId: `${MARK}-a-staff`, engagementId: a.id, clientId: a.clientId }),
      card({ sourceId: `${MARK}-a-both`, engagementId: a.id, clientId: a.clientId, audience: 'both' }),
      card({ sourceId: `${MARK}-b-staff`, engagementId: b.id, clientId: b.clientId }),
      card({ sourceId: `${MARK}-b-both`, engagementId: b.id, clientId: b.clientId, audience: 'both' }),
      card({ sourceId: `${MARK}-firm-both`, sourceKind: 'reg_update' as IndexCard['sourceKind'], audience: 'both' }),
      card({ sourceId: `${MARK}-firm-staff`, sourceKind: 'reg_update' as IndexCard['sourceKind'] }),
    ]);
  });

  afterAll(async () => {
    setEmbeddingProviderForTests(undefined);
    await cleanup();
    await db.update(askChunks).set({ embedding: null, embeddingModel: null }).where(eq(askChunks.embeddingModel, FAKE_EMBEDDING_MODEL));
    await db.update(askIndexItems).set({ embedding: null, embeddingModel: null }).where(eq(askIndexItems.embeddingModel, FAKE_EMBEDDING_MODEL));
  });

  const sourceIds = async (ctx: AuthContext, persona: 'client' | 'staff', engagementId?: string) => {
    const hits = await searchIndexItems(ctx, { query: TOKEN, persona, limit: 20, engagementId });
    const titles = hits.map((h) => h.title);
    return titles.map((t) => t.split(' ').pop()!.replace(`${MARK}-`, '')).sort();
  };

  describe('wording unlike the source, on full text alone', () => {
    it.each([...PARAPHRASE_CASES, ...HINGLISH_CASES].map((c) => [c.id, c] as const))('%s', async (_id, c) => {
      const sources = await retrieveSources(admin, { query: c.question, persona: 'staff', topK: 4, applicability: null });
      expect(sources.length).toBeLessThanOrEqual(4);
      const chunks = sources.filter((s) => s.kind === 'chunk');
      expect(
        chunks.some((s) => s.text.toLowerCase().includes(c.chunkHas.toLowerCase())),
        `${c.question} found: ${sources.map((s) => s.text.slice(0, 60)).join(' | ')}`,
      ).toBe(true);
    });

    it('never hands a client a staff-only source', async () => {
      const hits = await searchAskChunks(staffCtx('client', a.clientUserId, { clientId: a.clientId }), {
        query: 'project lead manager approvals incorporation documents directors',
        persona: 'staff',
        limit: 20,
      });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.map((h) => h.documentTitle)).not.toContain('VCFO Suite overview');
      expect(hits.map((h) => h.documentTitle)).not.toContain('Incorporation documents map');
    });
  });

  describe('record cards never cross a client', () => {
    it('a client sees only client cards on their own project, and firm-wide ones', async () => {
      const ctx = staffCtx('client', a.clientUserId, { clientId: a.clientId });
      expect(await sourceIds(ctx, 'client')).toEqual(['a-both', 'firm-both']);
    });

    it('a client cannot widen to staff or reach into another project by naming it', async () => {
      const ctx = staffCtx('client', a.clientUserId, { clientId: a.clientId });
      expect(await sourceIds(ctx, 'staff')).toEqual(['a-both', 'firm-both']);
      expect(await sourceIds(ctx, 'client', b.id)).toEqual(['firm-both']);
    });

    it('the other client sees the mirror image', async () => {
      const ctx = staffCtx('client', b.clientUserId, { clientId: b.clientId });
      expect(await sourceIds(ctx, 'client')).toEqual(['b-both', 'firm-both']);
    });

    it('a project lead and a manager see only the projects they are on', async () => {
      const lead = staffCtx('intern', '00000000-0000-0000-0000-000000000000', { internId: a.internId ?? 'no-such-lead' });
      const seen = await sourceIds(lead, 'staff');
      expect(seen).not.toContain('b-staff');
      expect(seen).not.toContain('b-both');
      if (a.internId && a.internId !== (await db.select({ i: engagements.internId }).from(engagements).where(eq(engagements.id, b.id)))[0]?.i) {
        expect(seen).toEqual(['a-both', 'a-staff', 'firm-both', 'firm-staff']);
      }
      const manager = staffCtx('manager', '00000000-0000-0000-0000-000000000000');
      expect(await sourceIds(manager, 'staff')).toEqual(['firm-both', 'firm-staff']);
    });

    it('a firm-wide admin sees all, a super admin previewing as a client sees what that client would', async () => {
      expect(await sourceIds(admin, 'staff')).toEqual(['a-both', 'a-staff', 'b-both', 'b-staff', 'firm-both', 'firm-staff']);
      expect(await sourceIds(staffCtx('super_admin', admin.userId), 'client', a.id)).toEqual(['a-both', 'firm-both']);
    });

    it('a soft-deleted project leaves the search', async () => {
      await db.update(engagements).set({ deletedAt: new Date() }).where(eq(engagements.id, a.id));
      try {
        expect(await sourceIds(admin, 'staff')).toEqual(['b-both', 'b-staff', 'firm-both', 'firm-staff']);
      } finally {
        await db.update(engagements).set({ deletedAt: null }).where(eq(engagements.id, a.id));
      }
    });
  });

  describe('record cards follow their source', () => {
    const noteCards = async (noteId: string) =>
      db.select({ text: askIndexItems.cardText, audience: askIndexItems.audience }).from(askIndexItems).where(and(eq(askIndexItems.sourceKind, 'note'), eq(askIndexItems.sourceId, noteId)));

    it('refreshes on create, edit and delete, through the real repository hook, with identity numbers gone', async () => {
      process.env.ASK_VCFO_ENABLED = 'true';
      const note = await createEngagementNote(admin, a.id, { body: `${MARK} director PAN ABCDE1234F handed over` });
      await expect.poll(() => noteCards(note.id).then((r) => r[0]?.text), { timeout: 40_000, interval: 250 }).toContain('director');
      const [card] = await noteCards(note.id);
      expect(card!.audience).toBe('staff');
      expect(card!.text).not.toContain('ABCDE1234F');
      expect(card!.text).not.toContain('234F');

      await updateEngagementNote(admin, a.id, note.id, { body: `${MARK} moved to Friday` });
      await expect.poll(() => noteCards(note.id).then((r) => r[0]?.text), { timeout: 40_000, interval: 250 }).toContain('Friday');

      await deleteEngagementNote(admin, a.id, note.id);
      await expect.poll(() => noteCards(note.id).then((r) => r.length), { timeout: 40_000, interval: 250 }).toBe(0);
      delete process.env.ASK_VCFO_ENABLED;
    }, 120_000);

    it('a refresh or a rebuild gets to the same card, and a rebuild drops a card whose row is gone', async () => {
      const [note] = await db.insert(engagementNotes).values({ engagementId: a.id, body: `${MARK} written by a script` }).returning();
      await refreshIndexCard('note', note!.id);
      expect(await noteCards(note!.id)).toHaveLength(1);
      await db.delete(engagementNotes).where(eq(engagementNotes.id, note!.id));
      await rebuildIndexCards();
      expect(await noteCards(note!.id)).toHaveLength(0);
    });

    it('a regulatory update replaced by a published one leaves the search', async () => {
      const [older] = await db.insert(regUpdates).values({ title: `${MARK} older`, intake: 'manual', status: 'published' }).returning({ id: regUpdates.id });
      await systemUpsertIndexItems([card({ sourceId: older!.id, sourceKind: 'reg_update' as IndexCard['sourceKind'], cardText: 'quillupdate threshold' })]);
      const titles = async () => (await searchIndexItems(admin, { query: 'quillupdate', persona: 'staff', limit: 5 })).length;
      expect(await titles()).toBe(1);
      await db.insert(regUpdates).values({ title: `${MARK} draft`, intake: 'manual', status: 'in_review', supersedesUpdateId: older!.id });
      expect(await titles()).toBe(1);
      await db.insert(regUpdates).values({ title: `${MARK} newer`, intake: 'manual', status: 'published', supersedesUpdateId: older!.id });
      expect(await titles()).toBe(0);
    });
  });

  describe('effective dates and replacement', () => {
    const today = new Date('2026-11-06T06:00:00Z');
    const search = async (query: string) => (await searchAskChunks(admin, { query, persona: 'staff', limit: 10 }, today)).map((h) => h.documentTitle);
    const makeDoc = async (title: string, text: string, extra: Partial<Parameters<typeof createAskDocument>[1]> = {}) => {
      const doc = await createAskDocument(admin, { title: `${MARK} ${title}`, sourceType: 'govt', audience: 'staff', ...extra });
      await systemReplaceAskChunks(doc.id, [{ ordinal: 0, text, contextPrefix: null }]);
      await systemSetAskDocumentResult(doc.id, { status: 'ready' });
      return doc;
    };

    it('leaves out a source not yet in force and one that has ended', async () => {
      await makeDoc('future rule', 'quillfuture threshold applies', { effectiveFrom: '2027-01-01' });
      await makeDoc('ended rule', 'quillended threshold applied', { effectiveTo: '2026-03-31' });
      await makeDoc('current rule', 'quillcurrent threshold applies', { effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31' });
      expect(await search('quillfuture')).toEqual([]);
      expect(await search('quillended')).toEqual([]);
      expect(await search('quillcurrent')).toEqual([`${MARK} current rule`]);
    });

    it('a replacement takes over only when ready, and archiving it brings the old text back', async () => {
      const old = await makeDoc('old rate', 'quillrate old text');
      expect(await search('quillrate')).toEqual([`${MARK} old rate`]);
      const replacement = await createAskDocument(admin, {
        title: `${MARK} new rate`,
        sourceType: 'govt',
        audience: 'staff',
        supersedesDocumentId: old.id,
      });
      await systemReplaceAskChunks(replacement.id, [{ ordinal: 0, text: 'quillrate new text', contextPrefix: null }]);
      expect(await search('quillrate')).toEqual([`${MARK} old rate`]);
      await systemSetAskDocumentResult(replacement.id, { status: 'ready' });
      expect(await searchAskChunks(admin, { query: 'quillrate', persona: 'staff', limit: 10 }).then((h) => h.map((x) => x.documentTitle))).toEqual([`${MARK} new rate`]);
      await setAskDocumentStatus(admin, replacement.id, 'archived');
      expect(await searchAskChunks(admin, { query: 'quillrate', persona: 'staff', limit: 10 }).then((h) => h.map((x) => x.documentTitle))).toEqual([`${MARK} old rate`]);
    });

    it('a replacement dated ahead keeps the old text in force until that day', async () => {
      const old = await makeDoc('old slab', 'quillslab old text');
      await makeDoc('new slab', 'quillslab new text', { supersedesDocumentId: old.id, effectiveFrom: '2099-04-01' });
      const hits = await searchAskChunks(admin, { query: 'quillslab', persona: 'staff', limit: 10 });
      expect(hits.map((h) => h.documentTitle)).toEqual([`${MARK} old slab`]);
    });

    it('the knowledge stamp moves when a source changes', async () => {
      const before = await systemKnowledgeStamp();
      await makeDoc('stamp mover', 'quillstamp');
      expect(await systemKnowledgeStamp()).not.toBe(before);
    });
  });

  describe('real vector queries', () => {
    beforeAll(async () => {
      setEmbeddingProviderForTests(fakeEmbeddingProvider);
      await backfillEmbeddings();
    });
    afterAll(() => setEmbeddingProviderForTests(null));

    const queryVector = (text: string) => ({ values: fakeVector(text), model: FAKE_EMBEDDING_MODEL });

    it('the backfill fills every row at 512 dimensions and has nothing left on a second run', async () => {
      const [row] = await db
        .select({ missing: sql<number>`count(*) filter (where embedding is null)::int`, dims: sql<number>`max(vector_dims(embedding))::int` })
        .from(askChunks);
      expect(row).toEqual({ missing: 0, dims: 512 });
      expect(await backfillEmbeddings()).toEqual({ chunks: 0, cards: 0 });
    });

    it('a misspelling full text cannot match is found by cosine distance', async () => {
      const typo = 'gstr3b retrun';
      expect(await searchAskChunks(admin, { query: typo, persona: 'staff', limit: 4 })).toEqual([]);
      const hits = await searchAskChunks(admin, { query: typo, persona: 'staff', limit: 4, queryVector: queryVector('GSTR-3B return') });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.text).toContain('GSTR-3B');
    });

    it('never compares vectors from another model', async () => {
      const hits = await searchAskChunks(admin, {
        query: 'gstr3b retrun',
        persona: 'staff',
        limit: 4,
        queryVector: { values: fakeVector('GSTR-3B return'), model: 'another-model' },
      });
      expect(hits).toEqual([]);
    });

    it('applies access before ranking on vectors too', async () => {
      const ctx = staffCtx('client', a.clientUserId, { clientId: a.clientId });
      const hits = await searchIndexItems(ctx, { query: 'nomatchword', persona: 'client', limit: 20, queryVector: queryVector(`Fixture ${TOKEN} card`) });
      const ids = hits.map((h) => h.engagementId);
      expect(ids).not.toContain(b.id);
      expect(hits.filter((h) => h.title.startsWith(MARK)).map((h) => h.title.split(' ').pop()).sort()).toEqual([`${MARK}-a-both`, `${MARK}-firm-both`]);
      const chunkHits = await searchAskChunks(ctx, { query: 'nomatchword', persona: 'client', limit: 20, queryVector: queryVector('VCFO Suite overview project lead') });
      expect(chunkHits.map((h) => h.documentTitle)).not.toContain('VCFO Suite overview');
    });

    it('changed card text loses its vector, unchanged text keeps it', async () => {
      const sourceId = `${MARK}-a-staff`;
      const read = async () =>
        (await db.select({ model: askIndexItems.embeddingModel }).from(askIndexItems).where(eq(askIndexItems.sourceId, sourceId)))[0]?.model;
      expect(await read()).toBe(FAKE_EMBEDDING_MODEL);
      await systemUpsertIndexItems([card({ sourceId, engagementId: a.id, clientId: a.clientId })]);
      expect(await read()).toBe(FAKE_EMBEDDING_MODEL);
      await systemUpsertIndexItems([card({ sourceId, engagementId: a.id, clientId: a.clientId, cardText: 'edited', contentHash: 'edited' })]);
      expect(await read()).toBeNull();
      await systemUpsertIndexItems([card({ sourceId, engagementId: a.id, clientId: a.clientId })]);
    });

    it('fills a vector dropped by an edit, picked up by the backfill', async () => {
      const done = await backfillEmbeddings();
      expect(done.cards).toBeGreaterThanOrEqual(1);
    });
  });

  describe('saved answers', () => {
    const answer = { line: 'Saved line', citations: [{ id: 'x', label: 'y' }], actions: [], origin: 'generated', depth: 'normal' } as unknown as AnswerEnvelope;
    const key = { questionKey: `${MARK} what is aoc-4`, audience: 'staff' as const, language: 'en', depth: 'normal', knowledgeVersion: 'v1' };

    it('matches only the exact key, counts hits, and clears older versions on save', async () => {
      expect(await findSavedAnswer(admin, key)).toBeNull();
      await saveAnswer(admin, key, answer, null);
      expect((await findSavedAnswer(admin, key))?.line).toBe('Saved line');
      expect(await findSavedAnswer(admin, { ...key, questionKey: `${MARK} what is aoc 4` })).toBeNull();
      expect(await findSavedAnswer(admin, { ...key, audience: 'client' })).toBeNull();
      expect(await findSavedAnswer(admin, { ...key, depth: 'detail' })).toBeNull();
      expect(await findSavedAnswer(admin, { ...key, language: 'hi' })).toBeNull();
      expect(await findSavedAnswer(admin, { ...key, knowledgeVersion: 'v2' })).toBeNull();
      const [row] = await db.select({ hits: askSavedAnswers.hits }).from(askSavedAnswers).where(eq(askSavedAnswers.questionKey, key.questionKey));
      expect(row?.hits).toBe(1);
      await saveAnswer(admin, { ...key, knowledgeVersion: 'v2' }, answer, null);
      const left = await db.select({ v: askSavedAnswers.knowledgeVersion }).from(askSavedAnswers).where(and(eq(askSavedAnswers.questionKey, key.questionKey), inArray(askSavedAnswers.knowledgeVersion, ['v1', 'v2'])));
      expect(left.map((r) => r.v)).toEqual(['v2']);
    });

    it('a client can never read a staff answer, whatever audience is asked for', async () => {
      const ctx = staffCtx('client', a.clientUserId, { clientId: a.clientId });
      expect(await findSavedAnswer(ctx, { ...key, knowledgeVersion: 'v2' })).toBeNull();
    });
  });
});
