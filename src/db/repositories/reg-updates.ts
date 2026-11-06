import 'server-only';

import { and, count, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  announcementSources,
  askIndexItems,
  profiles,
  regNoiseLog,
  regUpdateLinks,
  regUpdates,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, type Role } from '@/lib/auth';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { istDay } from '@/lib/watch/dates';
import { sha256 } from '@/lib/watch/fetch';
import { audienceFor, isWatchStaff, WATCH_ROLES, type WatchPerson } from '@/lib/watch/recipients';
import type {
  ListedItem,
  RegImportance,
  RegReviewEdit,
  RegSummary,
  RegUpdateDetail,
  RegUpdateListItem,
  RegUpdateStatus,
  RegVerifyProblem,
} from '@/lib/watch/types';
import type { AlertMail } from '@/lib/watch/mail-parse';
import { noiseLogFields } from '@/lib/watch/noise';
import { writeCalendarProposals } from './reg-proposals';
import { systemDeleteWatchBoardRow, systemPublishWatchBoardRow, systemPostWatchBoardRow, type BoardWriter } from './announcements';

/**
 * Regulatory updates: Watch's records from discovery to a reviewer's decision.
 *
 * Access: staff read everything here, and only `isAdminOrManager` may edit, publish or reject.
 * Clients never read this table except through `listUpdatesForChat`, which returns published,
 * non-staff rows. `system*` functions are job-only and take no session.
 */
export type RegUpdateRow = typeof regUpdates.$inferSelect;

function assertStaff(ctx: AuthContext): void {
  if (!isWatchStaff(ctx.role)) throw new Error('not permitted');
}

function assertReviewer(ctx: AuthContext): void {
  if (!isAdminOrManager(ctx.role)) throw new Error('not permitted');
}

function toListItem(row: RegUpdateRow, sourceName: string | null): RegUpdateListItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status as RegUpdateStatus,
    sourceName,
    sourceUrl: row.sourceUrl,
    intake: row.intake,
    area: row.area,
    changeType: row.changeType,
    importance: row.importance as RegImportance | null,
    publishedOn: row.publishedOn,
    effectiveDate: row.effectiveDate,
    newDueDate: row.newDueDate,
    summary: row.summary,
    problemCount: row.verifyProblems.length,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------- Finding items (jobs) ----------

/** Everything this source already listed, whether kept or dropped. */
export async function systemKnownItemKeys(sourceId: string): Promise<Set<string>> {
  const [links, noise] = await Promise.all([
    db.select({ key: regUpdateLinks.externalKey }).from(regUpdateLinks).where(eq(regUpdateLinks.sourceId, sourceId)),
    db.select({ key: regNoiseLog.externalKey }).from(regNoiseLog).where(eq(regNoiseLog.sourceId, sourceId)),
  ]);
  return new Set([...links, ...noise].map((row) => row.key));
}

export async function systemLogRegNoise(
  sourceId: string,
  items: ReadonlyArray<{ item: ListedItem; reason: string }>,
): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(regNoiseLog)
    .values(items.map(({ item, reason }) => ({ sourceId, externalKey: item.externalKey, reason, ...noiseLogFields(item) })))
    .onConflictDoNothing();
}

/**
 * Stores new items. A link another source already gave us joins that update, which is the first
 * merge and costs nothing; everything else becomes a queued update. The listing's own text, if any,
 * is kept as the read step's starting point.
 */
export async function systemQueueRegUpdates(
  source: { id: string; sourceType: string },
  items: readonly ListedItem[],
): Promise<string[]> {
  const queued: string[] = [];
  for (const item of items) {
    const title = maskIdentityNumbers(item.title).slice(0, 300);
    const [sameLink] = await db
      .select({ updateId: regUpdateLinks.updateId })
      .from(regUpdateLinks)
      .where(eq(regUpdateLinks.url, item.url))
      .limit(1);
    const updateId = await db.transaction(async (tx) => {
      let target = sameLink?.updateId ?? null;
      let created = false;
      if (!target) {
        const [row] = await tx
          .insert(regUpdates)
          .values({
            title,
            sourceUrl: item.url,
            sourceId: source.id,
            intake: source.sourceType,
            sourceText: item.body ? maskIdentityNumbers(item.body) : null,
            publishedOn: item.publishedOn,
          })
          .returning({ id: regUpdates.id });
        target = row!.id;
        created = true;
      }
      await tx
        .insert(regUpdateLinks)
        .values({ updateId: target, sourceId: source.id, externalKey: item.externalKey, url: item.url, title })
        .onConflictDoNothing();
      return created ? target : null;
    });
    if (updateId) queued.push(updateId);
  }
  return queued;
}

/** Updates a lost event or a spent budget left behind; the hourly check sends them through again. */
export async function systemStuckRegUpdates(before: Date): Promise<Array<{ id: string; sourceUrl: string | null }>> {
  return db
    .select({ id: regUpdates.id, sourceUrl: regUpdates.sourceUrl })
    .from(regUpdates)
    .where(and(inArray(regUpdates.status, ['queued', 'read']), lt(regUpdates.updatedAt, before)))
    .limit(50);
}

/** A link that stayed unreachable this long needs a person, so it stops going round and says why. */
export async function systemGiveUpOnUnreadUpdates(createdBefore: Date): Promise<void> {
  await db
    .update(regUpdates)
    .set({ status: 'failed', error: 'This could not be read for three days. Upload the PDF, or read it by hand.' })
    .where(and(eq(regUpdates.status, 'queued'), lt(regUpdates.createdAt, createdBefore)));
}

// ---------- The pipeline (jobs) ----------

export interface PipelineUpdate {
  update: RegUpdateRow;
  sourceName: string | null;
  sourceArea: string | null;
  sourceAudience: string | null;
}

export async function systemGetPipelineUpdate(id: string): Promise<PipelineUpdate | null> {
  const [row] = await db
    .select({
      update: regUpdates,
      sourceName: announcementSources.name,
      sourceArea: announcementSources.area,
      sourceAudience: announcementSources.audience,
    })
    .from(regUpdates)
    .leftJoin(announcementSources, eq(regUpdates.sourceId, announcementSources.id))
    .where(eq(regUpdates.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Stores the extracted text. The same text already stored means the same document, so its links move
 * to that update and this row goes: no model call and one update for the reviewer.
 */
export async function systemSaveReadText(id: string, sourceText: string): Promise<{ mergedInto: string | null }> {
  const contentHash = sha256(sourceText);
  const [same] = await db
    .select({ id: regUpdates.id })
    .from(regUpdates)
    .where(and(eq(regUpdates.contentHash, contentHash), ne(regUpdates.id, id)))
    .limit(1);
  if (same) {
    await db.transaction(async (tx) => {
      await tx.update(regUpdateLinks).set({ updateId: same.id }).where(eq(regUpdateLinks.updateId, id));
      await tx.delete(regUpdates).where(eq(regUpdates.id, id));
    });
    return { mergedInto: same.id };
  }
  await db.update(regUpdates).set({ sourceText, contentHash, status: 'read', error: null }).where(eq(regUpdates.id, id));
  return { mergedInto: null };
}

export async function systemMarkRegUpdateFailed(id: string, error: string): Promise<void> {
  await db.update(regUpdates).set({ status: 'failed', error: error.slice(0, 500) }).where(eq(regUpdates.id, id));
}

/** Waits for the next hourly check, for example when the day's token budget is spent. */
export async function systemNoteRegUpdate(id: string, error: string): Promise<void> {
  await db.update(regUpdates).set({ error: error.slice(0, 500) }).where(eq(regUpdates.id, id));
}

/**
 * The summary and the code check's verdict. A clean update gets its staff-only board row with the
 * "Not yet reviewed" mark at once; one that failed the check stays in the queue and is not posted.
 */
export async function systemSaveSummary(
  id: string,
  input: {
    summary: RegSummary;
    importance: RegImportance;
    problems: RegVerifyProblem[];
    model: string;
    inputTokens: number;
    outputTokens: number;
    sourceName: string | null;
  },
): Promise<void> {
  const clean = input.problems.length === 0;
  const { summary } = input;
  const [row] = await db
    .update(regUpdates)
    .set({
      status: clean ? 'unreviewed' : 'needs_attention',
      area: summary.area,
      act: summary.act,
      changeType: summary.changeType,
      importance: input.importance,
      effectiveDate: summary.effectiveDate,
      oldDueDate: summary.oldDueDate,
      newDueDate: summary.newDueDate,
      affects: summary.affects,
      summary: summary.summary,
      quote: summary.quote,
      verifyProblems: input.problems,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      error: null,
    })
    .where(eq(regUpdates.id, id))
    .returning();
  if (clean && row) await postBoardRow(row, input.sourceName);
}

async function postBoardRow(row: RegUpdateRow, sourceName: string | null): Promise<void> {
  const announcementId = await systemPostWatchBoardRow(row, sourceName);
  await db.update(regUpdates).set({ announcementId }).where(eq(regUpdates.id, row.id));
}

// ---------- Review (staff) ----------

export async function listRegUpdates(
  ctx: AuthContext,
  opts: { statuses?: readonly RegUpdateStatus[]; limit?: number } = {},
): Promise<RegUpdateListItem[]> {
  assertStaff(ctx);
  const rows = await db
    .select({ update: regUpdates, sourceName: announcementSources.name })
    .from(regUpdates)
    .leftJoin(announcementSources, eq(regUpdates.sourceId, announcementSources.id))
    .where(opts.statuses?.length ? inArray(regUpdates.status, [...opts.statuses]) : undefined)
    .orderBy(desc(regUpdates.createdAt))
    .limit(Math.min(opts.limit ?? 100, 200));
  return rows.map((row) => toListItem(row.update, row.sourceName));
}

export async function getRegUpdate(ctx: AuthContext, id: string): Promise<(Omit<RegUpdateDetail, 'impact'> & { s3Key: string | null }) | null> {
  assertStaff(ctx);
  const [row] = await db
    .select({ update: regUpdates, sourceName: announcementSources.name })
    .from(regUpdates)
    .leftJoin(announcementSources, eq(regUpdates.sourceId, announcementSources.id))
    .where(eq(regUpdates.id, id))
    .limit(1);
  if (!row) return null;
  const links = await db
    .select({ url: regUpdateLinks.url, title: regUpdateLinks.title, sourceName: announcementSources.name })
    .from(regUpdateLinks)
    .leftJoin(announcementSources, eq(regUpdateLinks.sourceId, announcementSources.id))
    .where(eq(regUpdateLinks.updateId, id));
  const { update } = row;
  return {
    ...toListItem(update, row.sourceName),
    act: update.act,
    oldDueDate: update.oldDueDate,
    affects: update.affects,
    quote: update.quote,
    sourceText: update.sourceText,
    verifyProblems: update.verifyProblems,
    links,
    rejectReason: update.rejectReason,
    fileUrl: null,
    s3Key: update.s3Key,
  };
}

const EDITABLE: readonly RegUpdateStatus[] = ['unreviewed', 'needs_attention'];

/**
 * A reviewer's edit, with the code check's verdict on the edited text. An update that now passes, or
 * whose remaining flags the reviewer accepted, can be published and joins the staff board.
 */
export async function saveRegUpdateEdit(
  ctx: AuthContext,
  id: string,
  edit: Omit<RegReviewEdit, 'acceptProblems'>,
  problems: RegVerifyProblem[],
  acceptProblems: boolean,
  sourceName: string | null,
): Promise<boolean> {
  assertReviewer(ctx);
  const [row] = await db
    .update(regUpdates)
    .set({
      ...edit,
      verifyProblems: problems,
      status: problems.length === 0 || acceptProblems ? 'unreviewed' : 'needs_attention',
      reviewedById: ctx.userId,
      reviewedAt: new Date(),
    })
    .where(and(eq(regUpdates.id, id), inArray(regUpdates.status, [...EDITABLE])))
    .returning();
  if (!row) return false;
  if (row.status === 'unreviewed' && !row.announcementId) await postBoardRow(row, sourceName);
  return true;
}

/**
 * Publish moves one row exactly once: only an `unreviewed` update qualifies, so two reviewers
 * clicking together publish it once. It opens the board row to its audience, adds the chat card and
 * records any calendar change for a manager to approve, all in one transaction, so a failure leaves
 * the update waiting and never half published.
 */
export async function publishRegUpdate(ctx: AuthContext, id: string, sourceName: string | null): Promise<RegUpdateRow | null> {
  assertReviewer(ctx);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(regUpdates)
      .set({ status: 'published', publishedAt: now, reviewedById: ctx.userId, reviewedAt: now })
      .where(and(eq(regUpdates.id, id), eq(regUpdates.status, 'unreviewed')))
      .returning();
    if (!row) return null;
    await systemPublishWatchBoardRow(row, sourceName, tx);
    await upsertChatCard(row, tx);
    await writeCalendarProposals(row, tx);
    return row;
  });
}

/** The chat's knowledge: one masked card per published update, searched like any other card. */
async function upsertChatCard(row: RegUpdateRow, tx: BoardWriter): Promise<void> {
  const importance = (row.importance ?? 'normal') as RegImportance;
  const cardText = maskIdentityNumbers(
    [row.summary, row.affects && `Affects: ${row.affects}`, row.act && `Act: ${row.act}`, row.newDueDate && `New due date: ${row.newDueDate}`, row.sourceUrl && `Source: ${row.sourceUrl}`]
      .filter(Boolean)
      .join('\n'),
  );
  const fields = {
    title: row.title,
    cardText,
    href: null,
    audience: audienceFor(importance) === 'staff' ? 'staff' : 'both',
    contentHash: sha256(cardText),
    effectiveFrom: row.effectiveDate,
  };
  await tx
    .insert(askIndexItems)
    .values({ sourceKind: 'reg_update', sourceId: row.id, ...fields })
    .onConflictDoUpdate({ target: [askIndexItems.sourceKind, askIndexItems.sourceId], set: fields });
}

/** The hash goes with the decision, so a later copy of a rejected document is read and not swallowed by this row. */
export async function rejectRegUpdate(ctx: AuthContext, id: string, reason: string): Promise<boolean> {
  assertReviewer(ctx);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(regUpdates)
      .set({ status: 'rejected', rejectReason: reason, reviewedById: ctx.userId, reviewedAt: new Date(), announcementId: null, contentHash: null })
      .where(and(eq(regUpdates.id, id), notInArray(regUpdates.status, ['published', 'rejected'])))
      .returning({ id: regUpdates.id });
    if (!row) return false;
    await systemDeleteWatchBoardRow(id, tx);
    return true;
  });
}

/** A failed read or summary goes round again, once a person asks. */
export async function retryRegUpdate(ctx: AuthContext, id: string): Promise<boolean> {
  assertReviewer(ctx);
  const rows = await db
    .update(regUpdates)
    .set({ status: 'queued', error: null })
    .where(and(eq(regUpdates.id, id), eq(regUpdates.status, 'failed')))
    .returning({ id: regUpdates.id });
  return rows.length > 0;
}

/** Manual intake starts at the read step, whichever staff member adds it. */
export async function createManualRegUpdate(
  ctx: AuthContext,
  input: { title: string; url: string | null; sourceId: string | null; s3Key?: string | null },
): Promise<string> {
  assertStaff(ctx);
  const title = maskIdentityNumbers(input.title).slice(0, 300);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(regUpdates)
      .values({ title, sourceUrl: input.url, sourceId: input.sourceId, intake: 'manual', intakeById: ctx.userId, s3Key: input.s3Key ?? null })
      .returning({ id: regUpdates.id });
    const key = input.url ?? input.s3Key ?? row!.id;
    await tx
      .insert(regUpdateLinks)
      .values({ updateId: row!.id, sourceId: input.sourceId, externalKey: key, url: input.url ?? key, title })
      .onConflictDoNothing();
    return row!.id;
  });
}

const MAX_MAIL_TEXT = 50_000;

/**
 * One alert mail, once: a repeat of the message or of a link already known adds no update and returns
 * null. A mail with no link has no `sourceUrl`, and its text is the document.
 */
async function queueAlertMail(sourceId: string, mail: AlertMail, intakeById: string | null): Promise<string | null> {
  const title = maskIdentityNumbers(mail.subject).slice(0, 300);
  const url = mail.link ?? `mail:${mail.messageId}`;
  const known = or(eq(regUpdateLinks.url, url), and(eq(regUpdateLinks.sourceId, sourceId), eq(regUpdateLinks.externalKey, mail.messageId)));
  const [same] = await db.select({ updateId: regUpdateLinks.updateId }).from(regUpdateLinks).where(known).limit(1);
  return db.transaction(async (tx) => {
    let id = same?.updateId;
    const created = !id;
    if (!id) {
      const [row] = await tx
        .insert(regUpdates)
        .values({ title, sourceUrl: mail.link, sourceId, intake: 'email', intakeById, sourceText: maskIdentityNumbers(mail.body).slice(0, MAX_MAIL_TEXT), publishedOn: mail.sentOn })
        .returning({ id: regUpdates.id });
      id = row!.id;
    }
    await tx.insert(regUpdateLinks).values({ updateId: id, sourceId, externalKey: mail.messageId, url, title }).onConflictDoNothing();
    return created ? id : null;
  });
}

/** SYSTEM (no session): the mailbox endpoint, after its token and sender checks. */
export const systemQueueAlertMail = (sourceId: string, mail: AlertMail): Promise<string | null> => queueAlertMail(sourceId, mail, null);

export async function addPastedAlertMail(ctx: AuthContext, sourceId: string, mail: AlertMail): Promise<string | null> {
  assertStaff(ctx);
  return queueAlertMail(sourceId, mail, ctx.userId);
}

// ---------- Recipients and the daily summary (jobs) ----------

/** Everyone who may be told: active people in the five portal roles. */
export async function systemWatchPeople(): Promise<WatchPerson[]> {
  const rows = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(and(eq(profiles.status, 'active'), isNull(profiles.removedAt), inArray(profiles.role, [...WATCH_ROLES])));
  return rows.map((row) => ({ id: row.id, role: row.role as Role }));
}

export async function systemUpdatesAwaitingSummary(): Promise<RegUpdateRow[]> {
  return db
    .select()
    .from(regUpdates)
    .where(and(eq(regUpdates.status, 'published'), isNull(regUpdates.notifiedAt)))
    .orderBy(desc(regUpdates.publishedAt));
}

export async function systemMarkNotified(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(regUpdates).set({ notifiedAt: new Date() }).where(inArray(regUpdates.id, [...ids]));
}

// ---------- Chat ----------

export interface ChatUpdateRow {
  id: string;
  title: string;
  area: string | null;
  summary: string | null;
  sourceUrl: string | null;
  day: string;
  reviewed: boolean;
}

/**
 * Updates for a list answer, newest first. A client view sees published, non-staff rows only; staff
 * also see unreviewed ones, marked. A super admin previewing the client shell gets the client view.
 */
export async function listUpdatesForChat(
  ctx: AuthContext,
  opts: { clientView: boolean; area?: string; since: string; limit?: number },
): Promise<{ total: number; rows: ChatUpdateRow[] }> {
  const clientView = opts.clientView || !isWatchStaff(ctx.role);
  const day = sql<string>`coalesce(${regUpdates.publishedOn}, ${regUpdates.createdAt}::date)`;
  const where = and(
    clientView
      ? and(eq(regUpdates.status, 'published'), ne(regUpdates.importance, 'staff_only'))
      : inArray(regUpdates.status, ['published', 'unreviewed']),
    opts.area ? eq(regUpdates.area, opts.area) : undefined,
    gte(day, opts.since),
  );
  const [total] = await db.select({ n: count() }).from(regUpdates).where(where);
  const rows = await db
    .select({
      id: regUpdates.id,
      title: regUpdates.title,
      area: regUpdates.area,
      summary: regUpdates.summary,
      sourceUrl: regUpdates.sourceUrl,
      day,
      status: regUpdates.status,
    })
    .from(regUpdates)
    .where(where)
    .orderBy(desc(day), desc(regUpdates.createdAt))
    .limit(opts.limit ?? 6);
  return {
    total: Number(total?.n ?? 0),
    rows: rows.map(({ status, ...row }) => ({ ...row, day: String(row.day).slice(0, 10), reviewed: status === 'published' })),
  };
}
