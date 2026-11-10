import 'server-only';

import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { documentRequests, engagements, tasks } from '@/db/schema';
import { requestListItems, requestLists, type RequestListItemRow, type RequestListRow } from '@/db/schema';
import { createDocumentRequest } from '@/db/repositories/document-requests';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';
import { getRequestTemplate, templateListTitle, type RequestItemKind } from '@/data/request-templates';
import { isFirmWideAdmin } from '@/lib/auth';
import { queueIndexRefresh } from '@/lib/ask/index-cards/queue';
import { itemStatusFromDocumentRequest, listProgress, type RequestListStatus } from '@/lib/request-lists/model';

/**
 * REQUEST LISTS REPOSITORY (IDEAS-PLAN wave 2, section A).
 *
 * Access:
 *   super admin and admin — every list;
 *   manager and intern    — lists on engagements in their scope (`listScopedEngagementIds`);
 *   client                — lists on their own engagements that were sent (never drafts or cancelled
 *                           lists), and may only answer the answer and confirmation items on them.
 *
 * Only staff create, edit and send. Sending is called by the `requests.sendList` action after a
 * person approved its card; it creates one existing document request per document item, so the
 * client uploads through the request path the portal already has.
 *
 * The `system*` functions at the bottom take no AuthContext. Only the reminder job calls them.
 */

export class RequestListError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'RequestListError';
  }
}

export interface RequestListItemView {
  id: string;
  kind: RequestItemKind;
  label: string;
  help: string | null;
  status: string;
  answerText: string | null;
  documentRequestId: string | null;
  receivedAt: string | null;
  ordinal: number;
}

export interface RequestListSummary {
  id: string;
  engagementId: string;
  companyName: string;
  templateId: string | null;
  title: string;
  periodLabel: string | null;
  status: RequestListStatus;
  dueOn: string | null;
  cadenceDays: number;
  reminderCount: number;
  lastRemindedAt: string | null;
  firstSentAt: string | null;
  createdAt: string;
  progress: { total: number; done: number; percent: number };
}

export interface RequestListDetail extends RequestListSummary {
  items: RequestListItemView[];
}

const isClient = (ctx: AuthContext) => ctx.role === 'client';
const CLIENT_HIDDEN: RequestListStatus[] = ['draft', 'cancelled'];

function iso(v: Date | null): string | null {
  return v ? v.toISOString() : null;
}

function toItemView(row: RequestListItemRow): RequestListItemView {
  return {
    id: row.id,
    kind: row.kind as RequestItemKind,
    label: row.label,
    help: row.help,
    status: row.status,
    answerText: row.answerText,
    documentRequestId: row.documentRequestId,
    receivedAt: iso(row.receivedAt),
    ordinal: row.ordinal,
  };
}

function toSummary(row: RequestListRow, companyName: string, items: ReadonlyArray<{ status: string }>): RequestListSummary {
  return {
    id: row.id,
    engagementId: row.engagementId,
    companyName,
    templateId: row.templateId,
    title: row.title,
    periodLabel: row.periodLabel,
    status: row.status as RequestListStatus,
    dueOn: row.dueOn,
    cadenceDays: row.cadenceDays,
    reminderCount: row.reminderCount,
    lastRemindedAt: iso(row.lastRemindedAt),
    firstSentAt: iso(row.firstSentAt),
    createdAt: row.createdAt.toISOString(),
    progress: listProgress(items),
  };
}

function assertStaff(ctx: AuthContext) {
  if (isClient(ctx)) throw new RequestListError(403, 'Clients may not change request lists.');
}

async function scope(ctx: AuthContext): Promise<string[] | 'all'> {
  if (isFirmWideAdmin(ctx.role)) return 'all';
  return listScopedEngagementIds(ctx);
}

async function itemsOf(listIds: string[]): Promise<RequestListItemRow[]> {
  if (listIds.length === 0) return [];
  return db.select().from(requestListItems).where(inArray(requestListItems.listId, listIds)).orderBy(asc(requestListItems.ordinal));
}

/**
 * Brings document items up to date with their linked document requests: an upload makes the item
 * received, an approval accepted, a rejection rejected. Callers have already checked scope.
 */
async function reconcileItems(items: RequestListItemRow[], now = new Date()): Promise<RequestListItemRow[]> {
  const linked = items.filter((i) => i.kind === 'document' && i.documentRequestId);
  if (linked.length === 0) return items;
  const docs = await db
    .select({ id: documentRequests.id, status: documentRequests.status })
    .from(documentRequests)
    .where(inArray(documentRequests.id, linked.map((i) => i.documentRequestId!)));
  const statusById = new Map(docs.map((d) => [d.id, d.status]));
  const out: RequestListItemRow[] = [];
  for (const item of items) {
    const next = item.documentRequestId ? itemStatusFromDocumentRequest(statusById.get(item.documentRequestId), item.status) : null;
    if (!next) {
      out.push(item);
      continue;
    }
    const receivedAt = next === 'rejected' ? null : (item.receivedAt ?? now);
    await db.update(requestListItems).set({ status: next, receivedAt }).where(eq(requestListItems.id, item.id));
    out.push({ ...item, status: next, receivedAt });
  }
  return out;
}

/** Marks a sent list complete once every item is in. Returns the status it now has. */
async function completeIfDone(list: RequestListRow, items: ReadonlyArray<{ status: string }>, now = new Date()): Promise<RequestListStatus> {
  const p = listProgress(items);
  if (list.status !== 'sent' || p.total === 0 || p.done < p.total) return list.status as RequestListStatus;
  await db.update(requestLists).set({ status: 'complete', completedAt: now, updatedAt: now }).where(eq(requestLists.id, list.id));
  return 'complete';
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listRequestLists(
  ctx: AuthContext,
  opts: { engagementId?: string | null; status?: RequestListStatus[] } = {},
): Promise<RequestListSummary[]> {
  const ids = await scope(ctx);
  if (ids !== 'all' && ids.length === 0) return [];
  let engagementFilter: string | null = null;
  if (opts.engagementId) {
    const access = await assertEngagementAccess(ctx, opts.engagementId);
    if (!access.ok) return [];
    engagementFilter = access.dbId;
  }
  const where = and(
    ids === 'all' ? undefined : inArray(requestLists.engagementId, ids),
    engagementFilter ? eq(requestLists.engagementId, engagementFilter) : undefined,
    isClient(ctx) ? notInArray(requestLists.status, CLIENT_HIDDEN) : undefined,
    opts.status?.length ? inArray(requestLists.status, opts.status) : undefined,
    isNull(engagements.deletedAt),
  );
  const rows = await db
    .select({ list: requestLists, companyName: engagements.companyName })
    .from(requestLists)
    .innerJoin(engagements, eq(engagements.id, requestLists.engagementId))
    .where(where)
    .orderBy(desc(requestLists.createdAt))
    .limit(500);
  const items = await itemsOf(rows.map((r) => r.list.id));
  const byList = new Map<string, RequestListItemRow[]>();
  for (const i of items) byList.set(i.listId, [...(byList.get(i.listId) ?? []), i]);
  return rows.map((r) => toSummary(r.list, r.companyName, byList.get(r.list.id) ?? []));
}

async function loadScoped(ctx: AuthContext, id: string): Promise<{ list: RequestListRow; companyName: string } | null> {
  const [list] = await db.select().from(requestLists).where(eq(requestLists.id, id)).limit(1);
  if (!list) return null;
  const access = await assertEngagementAccess(ctx, list.engagementId);
  if (!access.ok) return null;
  if (isClient(ctx) && CLIENT_HIDDEN.includes(list.status as RequestListStatus)) return null;
  return { list, companyName: access.row.companyName };
}

/** One list with its items, reconciled against the document requests as it is read. */
export async function getRequestList(ctx: AuthContext, id: string): Promise<RequestListDetail | null> {
  const found = await loadScoped(ctx, id);
  if (!found) return null;
  const items = await reconcileItems(await itemsOf([id]));
  const status = await completeIfDone(found.list, items);
  return { ...toSummary({ ...found.list, status }, found.companyName, items), items: items.map(toItemView) };
}

// ─── Staff writes ───────────────────────────────────────────────────────────

export interface RequestListItemInput {
  kind: RequestItemKind;
  label: string;
  help?: string | null;
}

export interface CreateRequestListInput {
  engagementId: string;
  title: string;
  periodLabel?: string | null;
  dueOn?: string | null;
  cadenceDays?: number;
  templateId?: string | null;
  items: RequestListItemInput[];
}

export async function createRequestList(ctx: AuthContext, input: CreateRequestListInput): Promise<RequestListDetail> {
  assertStaff(ctx);
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) throw new RequestListError(404, 'This client is not available.');
  const title = input.title.trim();
  if (!title) throw new RequestListError(400, 'A list needs a title.');
  const [list] = await db
    .insert(requestLists)
    .values({
      engagementId: access.dbId,
      templateId: input.templateId ?? null,
      title: title.slice(0, 200),
      periodLabel: input.periodLabel?.trim() || null,
      status: 'draft',
      dueOn: input.dueOn || null,
      cadenceDays: Math.min(30, Math.max(1, input.cadenceDays ?? 3)),
      createdBy: ctx.userId,
    })
    .returning();
  if (!list) throw new Error('Could not create the list');
  const clean = input.items.filter((i) => i.label.trim());
  const items =
    clean.length === 0
      ? []
      : await db
          .insert(requestListItems)
          .values(clean.map((i, ordinal) => ({ listId: list.id, kind: i.kind, label: i.label.trim().slice(0, 300), help: i.help?.trim() || null, ordinal })))
          .returning();
  return { ...toSummary(list, access.row.companyName, items), items: items.map(toItemView) };
}

export async function createRequestListFromTemplate(
  ctx: AuthContext,
  input: { engagementId: string; templateId: string; periodLabel?: string | null; dueOn?: string | null; title?: string | null },
  now = new Date(),
): Promise<RequestListDetail> {
  const template = getRequestTemplate(input.templateId);
  if (!template) throw new RequestListError(400, 'That template does not exist.');
  const dueOn = input.dueOn || new Date(now.getTime() + template.dueInDays * 86_400_000).toISOString().slice(0, 10);
  return createRequestList(ctx, {
    engagementId: input.engagementId,
    templateId: template.id,
    title: input.title?.trim() || templateListTitle(template, input.periodLabel),
    periodLabel: input.periodLabel ?? null,
    dueOn,
    cadenceDays: template.cadenceDays,
    items: template.items.map((i) => ({ kind: i.kind, label: i.label, help: i.help ?? null })),
  });
}

async function loadStaff(ctx: AuthContext, id: string) {
  assertStaff(ctx);
  const found = await loadScoped(ctx, id);
  if (!found) throw new RequestListError(404, 'This list is not available.');
  return found;
}

export async function updateRequestList(
  ctx: AuthContext,
  id: string,
  patch: { title?: string; periodLabel?: string | null; dueOn?: string | null; cadenceDays?: number; cancel?: boolean },
): Promise<RequestListDetail | null> {
  const { list } = await loadStaff(ctx, id);
  if (list.status === 'complete' || list.status === 'cancelled') throw new RequestListError(409, 'This list is closed.');
  await db
    .update(requestLists)
    .set({
      ...(patch.title?.trim() ? { title: patch.title.trim().slice(0, 200) } : {}),
      ...(patch.periodLabel !== undefined ? { periodLabel: patch.periodLabel?.trim() || null } : {}),
      ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn || null } : {}),
      ...(patch.cadenceDays !== undefined ? { cadenceDays: Math.min(30, Math.max(1, patch.cadenceDays)) } : {}),
      ...(patch.cancel ? { status: 'cancelled' } : {}),
      updatedAt: new Date(),
    })
    .where(eq(requestLists.id, id));
  return getRequestList(ctx, id);
}

/** Adds an item. A sent list's new document item gets its document request at once. */
export async function addRequestListItem(ctx: AuthContext, listId: string, input: RequestListItemInput): Promise<RequestListDetail | null> {
  const { list } = await loadStaff(ctx, listId);
  if (list.status !== 'draft' && list.status !== 'sent') throw new RequestListError(409, 'This list is closed.');
  const existing = await itemsOf([listId]);
  let documentRequestId: string | null = null;
  if (list.status === 'sent' && input.kind === 'document') {
    const req = await createDocumentRequest(ctx, { engagementId: list.engagementId, label: input.label.trim(), message: input.help ?? undefined, dueAt: list.dueOn ?? undefined });
    documentRequestId = req.id;
  }
  await db.insert(requestListItems).values({
    listId,
    kind: input.kind,
    label: input.label.trim().slice(0, 300),
    help: input.help?.trim() || null,
    documentRequestId,
    ordinal: existing.reduce((m, i) => Math.max(m, i.ordinal + 1), 0),
  });
  return getRequestList(ctx, listId);
}

/** Removes an item from a draft list. Once a list is sent, its items stay as the client saw them. */
export async function removeRequestListItem(ctx: AuthContext, listId: string, itemId: string): Promise<RequestListDetail | null> {
  const { list } = await loadStaff(ctx, listId);
  if (list.status !== 'draft') throw new RequestListError(409, 'Items can only be removed before the list is sent.');
  await db.delete(requestListItems).where(and(eq(requestListItems.id, itemId), eq(requestListItems.listId, listId)));
  return getRequestList(ctx, listId);
}

/** Staff review of an answer: accept it, or reject it so the client answers again. */
export async function reviewRequestListItem(ctx: AuthContext, listId: string, itemId: string, decision: 'accepted' | 'rejected'): Promise<RequestListDetail | null> {
  const { list } = await loadStaff(ctx, listId);
  if (list.status !== 'sent' && list.status !== 'complete') throw new RequestListError(409, 'This list has not been sent.');
  await db
    .update(requestListItems)
    .set({ status: decision, ...(decision === 'rejected' ? { receivedAt: null } : {}) })
    .where(and(eq(requestListItems.id, itemId), eq(requestListItems.listId, listId)));
  if (decision === 'rejected' && list.status === 'complete') {
    await db.update(requestLists).set({ status: 'sent', completedAt: null, updatedAt: new Date() }).where(eq(requestLists.id, listId));
  }
  return getRequestList(ctx, listId);
}

/**
 * Sends a draft list: one document request per document item, then the list is marked sent. Only
 * `requests.sendList` calls this, after a person approved the card; the action sends the email.
 */
export async function markRequestListSent(ctx: AuthContext, listId: string, now = new Date()): Promise<RequestListDetail> {
  const { list } = await loadStaff(ctx, listId);
  if (list.status !== 'draft') throw new RequestListError(409, 'This list has already been sent.');
  const items = await itemsOf([listId]);
  if (items.length === 0) throw new RequestListError(400, 'The list has no items.');
  for (const item of items) {
    if (item.kind !== 'document' || item.documentRequestId) continue;
    const req = await createDocumentRequest(ctx, {
      engagementId: list.engagementId,
      label: item.label,
      message: [list.title, item.help].filter(Boolean).join(' · ') || undefined,
      dueAt: list.dueOn ?? undefined,
    });
    await db.update(requestListItems).set({ documentRequestId: req.id }).where(eq(requestListItems.id, item.id));
  }
  await db.update(requestLists).set({ status: 'sent', firstSentAt: now, updatedAt: now }).where(eq(requestLists.id, listId));
  const detail = await getRequestList(ctx, listId);
  if (!detail) throw new RequestListError(404, 'This list is not available.');
  return detail;
}

// ─── Client answers ─────────────────────────────────────────────────────────

/**
 * The client answers an answer item or confirms a confirmation item. Document items are answered
 * by uploading against their document request, never here.
 */
export async function answerRequestListItem(
  ctx: AuthContext,
  listId: string,
  itemId: string,
  input: { answerText?: string | null; confirmed?: boolean },
  now = new Date(),
): Promise<RequestListDetail | null> {
  const found = await loadScoped(ctx, listId);
  if (!found) throw new RequestListError(404, 'This list is not available.');
  if (found.list.status !== 'sent') throw new RequestListError(409, 'This list is not open for answers.');
  const [item] = await db
    .select()
    .from(requestListItems)
    .where(and(eq(requestListItems.id, itemId), eq(requestListItems.listId, listId)))
    .limit(1);
  if (!item) throw new RequestListError(404, 'This item is not on the list.');
  if (item.kind === 'document') throw new RequestListError(400, 'Upload the document instead.');
  if (item.status === 'accepted') throw new RequestListError(409, 'This item has already been accepted.');
  const text = input.answerText?.trim() ?? '';
  if (item.kind === 'answer' && !text) throw new RequestListError(400, 'Type an answer first.');
  if (item.kind === 'confirmation' && !input.confirmed && !text) throw new RequestListError(400, 'Confirm the statement, or say why not.');
  const answerText = item.kind === 'confirmation' ? (input.confirmed ? text || 'Confirmed' : `Not confirmed: ${text}`) : text;
  await db
    .update(requestListItems)
    .set({ status: 'received', answerText: answerText.slice(0, 4000), receivedAt: now })
    .where(eq(requestListItems.id, itemId));
  return getRequestList(ctx, listId);
}

// ─── System (reminder job only) ─────────────────────────────────────────────

export interface ReminderCandidate {
  list: RequestListRow;
  companyName: string;
  items: RequestListItemRow[];
}

/**
 * Every sent list on a live engagement (or just `onlyListId`), with its items reconciled and
 * completion applied.
 */
export async function systemListSentRequestLists(now = new Date(), onlyListId?: string): Promise<ReminderCandidate[]> {
  const rows = await db
    .select({ list: requestLists, companyName: engagements.companyName })
    .from(requestLists)
    .innerJoin(engagements, eq(engagements.id, requestLists.engagementId))
    .where(and(eq(requestLists.status, 'sent'), isNull(engagements.deletedAt), onlyListId ? eq(requestLists.id, onlyListId) : undefined));
  const items = await itemsOf(rows.map((r) => r.list.id));
  const out: ReminderCandidate[] = [];
  for (const r of rows) {
    const reconciled = await reconcileItems(
      items.filter((i) => i.listId === r.list.id),
      now,
    );
    const status = await completeIfDone(r.list, reconciled, now);
    out.push({ list: { ...r.list, status }, companyName: r.companyName, items: reconciled });
  }
  return out;
}

/** Counts a reminder that went out. Guarded on the count, so a retried step never counts twice. */
export async function systemRecordRequestListReminder(listId: string, reminder: number, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(requestLists)
    .set({ reminderCount: reminder, lastRemindedAt: now, updatedAt: now })
    .where(and(eq(requestLists.id, listId), eq(requestLists.reminderCount, reminder - 1)))
    .returning({ id: requestLists.id });
  return rows.length > 0;
}

/** Opens the lead's "call the client" task once per list. */
export async function systemCreateRequestListCallTask(
  input: { listId: string; engagementId: string; companyName: string; title: string; openCount: number; leadProfileId: string | null },
  now = new Date(),
): Promise<string | null> {
  const [list] = await db.select({ callTaskId: requestLists.callTaskId }).from(requestLists).where(eq(requestLists.id, input.listId)).limit(1);
  if (!list || list.callTaskId) return null;
  const [task] = await db
    .insert(tasks)
    .values({
      engagementId: input.engagementId,
      title: `Call ${input.companyName} about ${input.title}`.slice(0, 200),
      description: `${input.openCount} item(s) are still open after three reminders. Call the client, then update the list.`,
      stepId: null,
      status: 'open',
      assignedTo: input.leadProfileId,
      deadline: new Date(now.getTime() + 2 * 86_400_000),
    })
    .returning({ id: tasks.id });
  if (!task) return null;
  queueIndexRefresh('task', task.id);
  await db.update(requestLists).set({ callTaskId: task.id, updatedAt: now }).where(eq(requestLists.id, input.listId));
  return task.id;
}
