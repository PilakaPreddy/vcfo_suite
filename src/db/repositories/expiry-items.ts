import 'server-only';

import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { companyDirectors, engagementCredentials, engagements, profiles } from '@/db/schema';
import { expiryAlerts, expiryItems, type ExpiryItemRow } from '@/db/schema';
import { requestListItems, requestLists } from '@/db/schema';
import type { AppRole, AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { assertEngagementAccess, listScopedEngagementIds, type EngagementDbRow } from '@/db/repositories/engagements';
import { normalizeEngagementChecklistState } from '@/lib/checklist/checklist-state-key';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { buildRegistrationFacts } from '@/lib/registrations/registration-facts';
import {
  daysUntil,
  dueAlertStage,
  EXPIRY_KIND_LABEL,
  expiryBand,
  itemTitle,
  nextExpiryAfterRenewal,
  RENEWAL_DOCUMENTS,
  subjectKindOf,
  subjectSlug,
  type AlertStage,
  type ExpiryBand,
  type ExpiryKind,
  type ExpirySource,
  type SubjectKind,
} from '@/lib/expiries/model';
import { seedRowsFor, type SeedRow } from '@/lib/expiries/seed';

/**
 * EXPIRY ITEMS REPOSITORY (IDEAS-PLAN wave 2, section B) — DSCs, DIR-3 KYC and registration
 * renewals across clients.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   super_admin / admin — firm-wide.
 *   manager / intern    — engagements in `listScopedEngagementIds(ctx)`; one engagement through
 *                         `assertEngagementAccess`.
 *   client              — reads its own engagements' items (the same scope); never writes.
 *   any other role      — nothing, before the first query.
 * Writes (add, update, mark renewed, delete) are staff only and record an audit event.
 *
 * `system*` helpers serve the daily job (src/jobs/expiry-alerts.ts), which has no session.
 */

const STAFF = new Set<AppRole>(['super_admin', 'admin', 'manager', 'intern']);
const READERS = new Set<AppRole>([...STAFF, 'client']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class ExpiryError extends Error {
  constructor(
    readonly code: 'forbidden' | 'not_found' | 'invalid',
    readonly status: 400 | 403 | 404,
  ) {
    super(code);
  }
}

export interface ExpiryItemDto {
  id: string;
  /** App engagement id (legacy "e1" or the uuid). */
  engagementId: string;
  companyName: string;
  subjectKind: SubjectKind;
  subjectName: string;
  kind: ExpiryKind;
  kindLabel: string;
  referenceLabel: string | null;
  expiresOn: string;
  daysLeft: number;
  band: ExpiryBand;
  source: ExpirySource;
  renewedAt: string | null;
  notes: string | null;
  lastAlertStage: number | null;
  requestListId: string | null;
  updatedAt: string;
}

function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function toExpiryDto(row: ExpiryItemRow, companyName: string, today: string): ExpiryItemDto {
  const days = daysUntil(row.expiresOn, today);
  const kind = row.kind as ExpiryKind;
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    companyName,
    subjectKind: row.subjectKind as SubjectKind,
    subjectName: row.subjectName,
    kind,
    kindLabel: EXPIRY_KIND_LABEL[kind] ?? row.kind,
    referenceLabel: row.referenceLabel ?? null,
    expiresOn: row.expiresOn,
    daysLeft: days,
    band: expiryBand(days, Boolean(row.renewedAt)),
    source: row.source as ExpirySource,
    renewedAt: row.renewedAt ? new Date(row.renewedAt).toISOString() : null,
    notes: row.notes ?? null,
    lastAlertStage: row.lastAlertStage ?? null,
    requestListId: row.requestListId ?? null,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** Engagement db ids the caller may read, honouring one named engagement. */
async function readableIds(ctx: AuthContext, engagementId?: string | null): Promise<string[]> {
  if (!READERS.has(ctx.role)) return [];
  const scoped = await listScopedEngagementIds(ctx);
  if (!engagementId?.trim()) return scoped;
  const access = await assertEngagementAccess(ctx, engagementId.trim());
  if (!access.ok) return [];
  return scoped.includes(access.dbId) ? [access.dbId] : [];
}

async function writableEngagement(ctx: AuthContext, engagementId: string): Promise<{ dbId: string; row: EngagementDbRow }> {
  if (!STAFF.has(ctx.role)) throw new ExpiryError('forbidden', 403);
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new ExpiryError('not_found', 404);
  return { dbId: access.dbId, row: access.row };
}

export interface ListExpiryOptions {
  /** Only items expiring within this many days from today (expired ones included). */
  withinDays?: number;
  engagementId?: string | null;
  /** Keep renewed items; by default they are kept unless `withinDays` is given. */
  includeRenewed?: boolean;
}

/** Expiry items in the caller's scope, soonest first. */
export async function listExpiryItems(ctx: AuthContext, opts: ListExpiryOptions = {}, today: string = istToday()): Promise<ExpiryItemDto[]> {
  const ids = await readableIds(ctx, opts.engagementId);
  if (ids.length === 0) return [];
  const conds = [inArray(expiryItems.engagementId, ids)];
  if (opts.withinDays !== undefined) conds.push(lte(expiryItems.expiresOn, addDays(today, Math.max(0, Math.floor(opts.withinDays)))));
  const includeRenewed = opts.includeRenewed ?? opts.withinDays === undefined;
  if (!includeRenewed) conds.push(isNull(expiryItems.renewedAt));
  const rows = await db
    .select({ item: expiryItems, companyName: engagements.companyName })
    .from(expiryItems)
    .innerJoin(engagements, eq(engagements.id, expiryItems.engagementId))
    .where(and(...conds))
    .orderBy(asc(expiryItems.expiresOn));
  return rows.map((r) => toExpiryDto(r.item, r.companyName, today));
}

/** One item, or null when it does not exist or is outside the caller's scope. */
export async function getExpiryItem(ctx: AuthContext, id: string, today: string = istToday()): Promise<ExpiryItemDto | null> {
  if (!READERS.has(ctx.role)) return null;
  const [row] = await db
    .select({ item: expiryItems, companyName: engagements.companyName })
    .from(expiryItems)
    .innerJoin(engagements, eq(engagements.id, expiryItems.engagementId))
    .where(eq(expiryItems.id, id))
    .limit(1);
  if (!row) return null;
  const ids = await readableIds(ctx, row.item.engagementId);
  if (!ids.includes(row.item.engagementId)) return null;
  return toExpiryDto(row.item, row.companyName, today);
}

/**
 * The item the chat or a person most likely means: the same engagement, kind and subject name
 * (case and spacing ignored). Null when there is none or it is out of scope.
 */
export async function findExpiryItem(
  ctx: AuthContext,
  input: { engagementId: string; kind: ExpiryKind; subjectName: string },
  today: string = istToday(),
): Promise<ExpiryItemDto | null> {
  const ids = await readableIds(ctx, input.engagementId);
  if (ids.length === 0) return null;
  const rows = await db
    .select({ item: expiryItems, companyName: engagements.companyName })
    .from(expiryItems)
    .innerJoin(engagements, eq(engagements.id, expiryItems.engagementId))
    .where(and(inArray(expiryItems.engagementId, ids), eq(expiryItems.kind, input.kind)));
  const want = subjectSlug(input.subjectName);
  const hit = rows.find((r) => subjectSlug(r.item.subjectName) === want) ?? rows.find((r) => subjectSlug(r.item.subjectName).startsWith(want) || want.startsWith(subjectSlug(r.item.subjectName)));
  return hit ? toExpiryDto(hit.item, hit.companyName, today) : null;
}

export interface UpsertExpiryInput {
  /** Update this item; without it the item with the same engagement, kind and name is updated, or one is added. */
  id?: string;
  engagementId: string;
  kind: ExpiryKind;
  subjectName: string;
  subjectKind?: SubjectKind;
  referenceLabel?: string | null;
  expiresOn: string;
  notes?: string | null;
  /** manual from the page, ask from the chat. Undo may restore the earlier source. */
  source?: ExpirySource;
}

/**
 * Staff add an item or change one. Changing the date starts the alert stages again and clears
 * "renewed". A hand-set item takes the source `manual` or `ask`, so the daily backfill no longer
 * overwrites it. Returns the saved item and the item as it was (null when it was added).
 */
export async function upsertExpiryItem(
  ctx: AuthContext,
  input: UpsertExpiryInput,
  today: string = istToday(),
): Promise<{ item: ExpiryItemDto; previous: ExpiryItemDto | null }> {
  if (!ISO.test(input.expiresOn) || Number.isNaN(Date.parse(`${input.expiresOn}T00:00:00Z`))) throw new ExpiryError('invalid', 400);
  const subjectName = input.subjectName.trim();
  if (!subjectName) throw new ExpiryError('invalid', 400);
  const { dbId, row: eng } = await writableEngagement(ctx, input.engagementId);
  const source: ExpirySource = input.source ?? 'manual';

  let existing: ExpiryItemRow | undefined;
  if (input.id) {
    [existing] = await db.select().from(expiryItems).where(eq(expiryItems.id, input.id)).limit(1);
    if (!existing || existing.engagementId !== dbId) throw new ExpiryError('not_found', 404);
  } else {
    const same = await db.select().from(expiryItems).where(and(eq(expiryItems.engagementId, dbId), eq(expiryItems.kind, input.kind)));
    existing = same.find((r) => subjectSlug(r.subjectName) === subjectSlug(subjectName));
  }
  const previous = existing ? toExpiryDto(existing, eng.companyName, today) : null;

  let saved: ExpiryItemRow | undefined;
  if (existing) {
    const dateChanged = existing.expiresOn !== input.expiresOn;
    [saved] = await db
      .update(expiryItems)
      .set({
        subjectName,
        subjectKind: input.subjectKind ?? existing.subjectKind,
        referenceLabel: input.referenceLabel === undefined ? existing.referenceLabel : input.referenceLabel,
        expiresOn: input.expiresOn,
        notes: input.notes === undefined ? existing.notes : input.notes,
        source,
        ...(dateChanged ? { lastAlertStage: null, renewedAt: null, renewedBy: null } : {}),
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(expiryItems.id, existing.id))
      .returning();
  } else {
    [saved] = await db
      .insert(expiryItems)
      .values({
        engagementId: dbId,
        subjectKind: input.subjectKind ?? subjectKindOf(input.kind),
        subjectName,
        kind: input.kind,
        referenceLabel: input.referenceLabel ?? null,
        expiresOn: input.expiresOn,
        notes: input.notes ?? null,
        source,
        sourceKey: `${source}:${input.kind}:${subjectSlug(subjectName)}:${Date.now().toString(36)}`,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
  }
  if (!saved) throw new ExpiryError('not_found', 404);
  const item = toExpiryDto(saved, eng.companyName, today);
  void recordAuditEvent(ctx, {
    engagementId: dbId,
    action: previous ? 'expiries.updated' : 'expiries.added',
    summary: `${previous ? 'set' : 'added'} the expiry of ${itemTitle(item)} to ${item.expiresOn}`,
    metadata: { itemId: item.id, kind: item.kind, expiresOn: item.expiresOn, previous: previous?.expiresOn ?? null },
  });
  return { item, previous };
}

/**
 * Staff mark an item renewed. With a new expiry date the item carries on with that date and its
 * alerts start again. Without one, DIR-3 KYC and LEI roll on to their next cycle
 * (`nextExpiryAfterRenewal`); any other kind is closed as renewed and stops alerting.
 */
export async function markRenewed(
  ctx: AuthContext,
  id: string,
  opts: { newExpiresOn?: string | null } = {},
  today: string = istToday(),
): Promise<ExpiryItemDto> {
  if (!STAFF.has(ctx.role)) throw new ExpiryError('forbidden', 403);
  const [existing] = await db.select().from(expiryItems).where(eq(expiryItems.id, id)).limit(1);
  if (!existing) throw new ExpiryError('not_found', 404);
  const { row: eng } = await writableEngagement(ctx, existing.engagementId);
  if (opts.newExpiresOn && !ISO.test(opts.newExpiresOn)) throw new ExpiryError('invalid', 400);
  const next = opts.newExpiresOn || nextExpiryAfterRenewal(existing.kind as ExpiryKind, existing.expiresOn);
  const [saved] = await db
    .update(expiryItems)
    .set(
      next
        ? { expiresOn: next, lastAlertStage: null, renewedAt: null, renewedBy: null, requestListId: null, updatedBy: ctx.userId, updatedAt: new Date() }
        : { renewedAt: new Date(), renewedBy: ctx.userId, updatedBy: ctx.userId, updatedAt: new Date() },
    )
    .where(eq(expiryItems.id, id))
    .returning();
  const item = toExpiryDto(saved ?? existing, eng.companyName, today);
  void recordAuditEvent(ctx, {
    engagementId: existing.engagementId,
    action: 'expiries.renewed',
    summary: next ? `marked ${itemTitle(item)} renewed, next expiry ${next}` : `marked ${itemTitle(item)} renewed`,
    metadata: { itemId: id, previous: existing.expiresOn, next },
  });
  return item;
}

/** Staff remove an item (an undo of an added item, or one added in error). */
export async function deleteExpiryItem(ctx: AuthContext, id: string): Promise<boolean> {
  if (!STAFF.has(ctx.role)) throw new ExpiryError('forbidden', 403);
  const [existing] = await db.select().from(expiryItems).where(eq(expiryItems.id, id)).limit(1);
  if (!existing) return false;
  await writableEngagement(ctx, existing.engagementId);
  await db.delete(expiryItems).where(eq(expiryItems.id, id));
  void recordAuditEvent(ctx, {
    engagementId: existing.engagementId,
    action: 'expiries.deleted',
    summary: `removed the expiry of ${existing.subjectName}'s ${EXPIRY_KIND_LABEL[existing.kind as ExpiryKind] ?? existing.kind}`,
    metadata: { itemId: id },
  });
  return true;
}

/* ---------- System helpers for the daily job (no session) ---------- */

/** Upsert one engagement's seed rows; returns how many rows were added or changed. */
async function upsertSeedRows(engagementId: string, rows: SeedRow[]): Promise<number> {
  let touched = 0;
  for (const r of rows) {
    const values = {
      engagementId,
      subjectKind: r.subjectKind,
      subjectName: r.subjectName,
      kind: r.kind,
      referenceLabel: r.referenceLabel,
      expiresOn: r.expiresOn,
      source: r.source,
      sourceKey: r.sourceKey,
    };
    const q = db.insert(expiryItems).values(values);
    const done = r.sync
      ? await q
          .onConflictDoUpdate({
            target: [expiryItems.engagementId, expiryItems.sourceKey],
            set: {
              subjectName: sql`excluded.subject_name`,
              referenceLabel: sql`excluded.reference_label`,
              expiresOn: sql`excluded.expires_on`,
              lastAlertStage: sql`CASE WHEN ${expiryItems.expiresOn} <> excluded.expires_on THEN NULL ELSE ${expiryItems.lastAlertStage} END`,
              renewedAt: sql`CASE WHEN ${expiryItems.expiresOn} <> excluded.expires_on THEN NULL ELSE ${expiryItems.renewedAt} END`,
              updatedAt: new Date(),
            },
            // Only rows the backfill owns, and only when something changed: a date set by hand
            // (source manual or ask) is never overwritten.
            setWhere: sql`${expiryItems.source} = excluded.source AND (${expiryItems.expiresOn} <> excluded.expires_on OR ${expiryItems.subjectName} <> excluded.subject_name OR ${expiryItems.referenceLabel} IS DISTINCT FROM excluded.reference_label)`,
          })
          .returning({ id: expiryItems.id })
      : await q.onConflictDoNothing({ target: [expiryItems.engagementId, expiryItems.sourceKey] }).returning({ id: expiryItems.id });
    touched += done.length;
  }
  return touched;
}

/**
 * The backfill: every live engagement's DSC, DIR-3 KYC and registration expiries, from its
 * checklist, its credentials "reg" rows and its current directors. Idempotent.
 */
export async function systemSeedExpiryItems(today: string): Promise<{ engagements: number; touched: number }> {
  const engs = await db
    .select({ id: engagements.id, companyName: engagements.companyName, checklistState: engagements.checklistState })
    .from(engagements)
    .where(isNull(engagements.deletedAt));
  if (engs.length === 0) return { engagements: 0, touched: 0 };
  const ids = engs.map((e) => e.id);
  const regRows = await db
    .select({ engagementId: engagementCredentials.engagementId, rowKey: engagementCredentials.rowKey, fields: engagementCredentials.fields })
    .from(engagementCredentials)
    .where(and(inArray(engagementCredentials.engagementId, ids), eq(engagementCredentials.sheet, 'reg')));
  const dirRows = await db
    .select({ engagementId: companyDirectors.engagementId, name: companyDirectors.name, din: companyDirectors.din, ceasedOn: companyDirectors.ceasedOn })
    .from(companyDirectors)
    .where(inArray(companyDirectors.engagementId, ids));

  let touched = 0;
  for (const e of engs) {
    const raw = e.checklistState && typeof e.checklistState === 'object' && !Array.isArray(e.checklistState) ? (e.checklistState as Record<string, unknown>) : {};
    const state = normalizeEngagementChecklistState(raw);
    const stored: Record<string, Record<string, string>> = {};
    for (const r of regRows) if (r.engagementId === e.id) stored[r.rowKey] = (r.fields ?? {}) as Record<string, string>;
    const { facts } = buildRegistrationFacts({ state, stored, documents: [] });
    const rows = seedRowsFor({
      companyName: e.companyName,
      state,
      registrationFacts: facts,
      directors: dirRows.filter((d) => d.engagementId === e.id).map((d) => ({ name: d.name, din: d.din ?? null, ceasedOn: d.ceasedOn ?? null })),
      today,
    });
    touched += await upsertSeedRows(e.id, rows);
  }
  return { engagements: engs.length, touched };
}

export interface DueExpiryAlert {
  itemId: string;
  stage: AlertStage;
}

/** Items with an alert stage due today (not renewed, within 60 days or expired). */
export async function systemListDueExpiryAlerts(today: string): Promise<DueExpiryAlert[]> {
  const rows = await db
    .select({ id: expiryItems.id, expiresOn: expiryItems.expiresOn, lastAlertStage: expiryItems.lastAlertStage, renewedAt: expiryItems.renewedAt })
    .from(expiryItems)
    .innerJoin(engagements, eq(engagements.id, expiryItems.engagementId))
    .where(and(isNull(expiryItems.renewedAt), isNull(engagements.deletedAt), lte(expiryItems.expiresOn, addDays(today, 60))));
  const out: DueExpiryAlert[] = [];
  for (const r of rows) {
    const stage = dueAlertStage(r, today);
    if (stage !== null) out.push({ itemId: r.id, stage });
  }
  return out;
}

export interface ExpiryAlertSubject {
  item: ExpiryItemDto;
  engagement: EngagementDbRow;
  alertId: string;
  /** The renewal task already opened for this stage on an earlier try, if any. */
  taskId: string | null;
}

/**
 * Claims the alert row for an item, stage and expiry date. Returns null when the item is gone,
 * renewed, or this stage was already finished; otherwise the item, its engagement and the alert
 * row (a retried job gets the same row back, with the task it already opened).
 */
export async function systemClaimExpiryAlert(itemId: string, stage: AlertStage, today: string): Promise<ExpiryAlertSubject | null> {
  const [row] = await db
    .select({ item: expiryItems, engagement: engagements })
    .from(expiryItems)
    .innerJoin(engagements, eq(engagements.id, expiryItems.engagementId))
    .where(eq(expiryItems.id, itemId))
    .limit(1);
  if (!row || row.item.renewedAt || row.engagement.deletedAt) return null;
  if (row.item.lastAlertStage !== null && row.item.lastAlertStage <= stage) return null;
  await db.insert(expiryAlerts).values({ itemId, stage, expiresOn: row.item.expiresOn }).onConflictDoNothing();
  const [alert] = await db
    .select()
    .from(expiryAlerts)
    .where(and(eq(expiryAlerts.itemId, itemId), eq(expiryAlerts.stage, stage), eq(expiryAlerts.expiresOn, row.item.expiresOn)))
    .limit(1);
  if (!alert) return null;
  return { item: toExpiryDto(row.item, row.engagement.companyName, today), engagement: row.engagement, alertId: alert.id, taskId: alert.taskId ?? null };
}

export async function systemSetExpiryAlertTask(alertId: string, taskId: string): Promise<void> {
  await db.update(expiryAlerts).set({ taskId }).where(eq(expiryAlerts.id, alertId));
}

/** Closes the stage on the item, so the next run moves on to the next stage only. */
export async function systemFinishExpiryAlert(itemId: string, stage: AlertStage): Promise<void> {
  await db.update(expiryItems).set({ lastAlertStage: stage, updatedAt: new Date() }).where(eq(expiryItems.id, itemId));
}

export async function systemMarkExpiryAlertEmailed(alertId: string): Promise<void> {
  await db.update(expiryAlerts).set({ emailedAt: new Date() }).where(eq(expiryAlerts.id, alertId));
}

/**
 * The AuthContext of an active staff member, so the job can read and write as the lead it is
 * alerting (getFilings, createTask) and stay inside that person's scope. Null for anyone else.
 */
export async function systemStaffContext(profileId: string | null | undefined): Promise<AuthContext | null> {
  if (!profileId) return null;
  const [row] = await db
    .select({ id: profiles.id, email: profiles.email, name: profiles.name, role: profiles.role, status: profiles.status, removedAt: profiles.removedAt, internId: profiles.internId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!row || row.status !== 'active' || row.removedAt || !STAFF.has(row.role as AppRole)) return null;
  return { userId: row.id, email: row.email, name: row.name?.trim() || row.email, role: row.role as AppRole, ...(row.internId ? { internId: row.internId } : {}) };
}

/**
 * Opens the draft client request list for an item's renewal documents, once per expiry date.
 * The list stays a draft: a person sends it from the request list (an approved card), never the
 * job. Returns the list id, or the one already opened.
 */
export async function systemEnsureRenewalRequestDraft(itemId: string, input: { title: string; dueOn: string; createdBy: string | null }): Promise<string | null> {
  const [item] = await db.select().from(expiryItems).where(eq(expiryItems.id, itemId)).limit(1);
  if (!item) return null;
  if (item.requestListId) return item.requestListId;
  const docs = RENEWAL_DOCUMENTS[item.kind as ExpiryKind] ?? RENEWAL_DOCUMENTS.other;
  const [list] = await db
    .insert(requestLists)
    .values({ engagementId: item.engagementId, title: input.title, status: 'draft', dueOn: input.dueOn, createdBy: input.createdBy })
    .returning({ id: requestLists.id });
  if (!list) return null;
  await db.insert(requestListItems).values(docs.map((d, i) => ({ listId: list.id, kind: d.kind, label: d.label, ordinal: i })));
  await db.update(expiryItems).set({ requestListId: list.id }).where(and(eq(expiryItems.id, itemId), isNull(expiryItems.requestListId)));
  return list.id;
}
