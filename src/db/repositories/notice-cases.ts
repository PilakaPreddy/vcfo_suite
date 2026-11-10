import 'server-only';

import { and, asc, eq, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagements, profiles } from '@/db/schema';
import { noticeCases, type NoticeAttachment, type NoticeCaseRow } from '@/db/schema';
import type { AppRole, AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { assertEngagementAccess, listScopedEngagementIds, type EngagementDbRow } from '@/db/repositories/engagements';
import { isAdminOrManager } from '@/lib/auth';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import {
  daysUntil,
  isOpenStage,
  NOTICE_AUTHORITIES,
  NOTICE_STAGES,
  noticeLabel,
  type Escalation,
  type NoticeAuthority,
  type NoticeStage,
} from '@/lib/notices/model';

/**
 * NOTICE CASES REPOSITORY (IDEAS-PLAN wave 2, section C) — the notice desk across clients.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   super_admin / admin — firm-wide.
 *   manager / intern    — engagements in `listScopedEngagementIds(ctx)`; one engagement through
 *                         `assertEngagementAccess`.
 *   client and others   — nothing, before the first query. Notices are a staff desk for now.
 * Writes are staff only and record an audit event. Moving a case to `submitted` or `closed` is
 * the partner's approval of the final reply, so it needs an admin or manager (`isAdminOrManager`).
 *
 * `system*` helpers serve the daily escalation job (src/jobs/notice-escalations.ts).
 */

const STAFF = new Set<AppRole>(['super_admin', 'admin', 'manager', 'intern']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PARTNER_STAGES: ReadonlySet<NoticeStage> = new Set(['submitted', 'closed']);

export class NoticeError extends Error {
  constructor(
    readonly code: 'forbidden' | 'not_found' | 'invalid',
    readonly status: 400 | 403 | 404,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface NoticeCaseDto {
  id: string;
  /** App engagement id (legacy "e1" or the uuid). */
  engagementId: string;
  companyName: string;
  authority: NoticeAuthority;
  section: string | null;
  periodLabel: string | null;
  din: string | null;
  demandAmount: string | null;
  receivedOn: string | null;
  responseDueOn: string | null;
  hearingOn: string | null;
  /** Days to the response date; null without one. */
  daysLeft: number | null;
  stage: NoticeStage;
  open: boolean;
  ownerId: string | null;
  ownerName: string | null;
  summary: string | null;
  replyDraft: string | null;
  documentsNeeded: string[];
  requestListId: string | null;
  attachments: NoticeAttachment[];
  notes: string | null;
  label: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function toNoticeDto(row: NoticeCaseRow, extra: { companyName: string; ownerName: string | null }, today: string = istToday()): NoticeCaseDto {
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    companyName: extra.companyName,
    authority: (NOTICE_AUTHORITIES as readonly string[]).includes(row.authority) ? (row.authority as NoticeAuthority) : 'other',
    section: row.section ?? null,
    periodLabel: row.periodLabel ?? null,
    din: row.din ?? null,
    demandAmount: row.demandAmount ?? null,
    receivedOn: row.receivedOn ?? null,
    responseDueOn: row.responseDueOn ?? null,
    hearingOn: row.hearingOn ?? null,
    daysLeft: row.responseDueOn ? daysUntil(row.responseDueOn, today) : null,
    stage: row.stage as NoticeStage,
    open: isOpenStage(row.stage),
    ownerId: row.ownerId ?? null,
    ownerName: extra.ownerName,
    summary: row.summary ?? null,
    replyDraft: row.replyDraft ?? null,
    documentsNeeded: Array.isArray(row.documentsNeeded) ? row.documentsNeeded : [],
    requestListId: row.requestListId ?? null,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    notes: row.notes ?? null,
    label: noticeLabel(row),
    closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** Engagement db ids the caller may read, honouring one named engagement. */
async function readableIds(ctx: AuthContext, engagementId?: string | null): Promise<string[]> {
  if (!STAFF.has(ctx.role)) return [];
  const scoped = await listScopedEngagementIds(ctx);
  if (!engagementId?.trim()) return scoped;
  const access = await assertEngagementAccess(ctx, engagementId.trim());
  if (!access.ok) return [];
  return scoped.includes(access.dbId) ? [access.dbId] : [];
}

async function writableEngagement(ctx: AuthContext, engagementId: string): Promise<{ dbId: string; row: EngagementDbRow }> {
  if (!STAFF.has(ctx.role)) throw new NoticeError('forbidden', 403);
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new NoticeError('not_found', 404);
  return { dbId: access.dbId, row: access.row };
}

const selection = { item: noticeCases, companyName: engagements.companyName, ownerName: profiles.name };

function baseQuery() {
  return db.select(selection).from(noticeCases).innerJoin(engagements, eq(engagements.id, noticeCases.engagementId)).leftJoin(profiles, eq(profiles.id, noticeCases.ownerId));
}

type JoinedRow = { item: NoticeCaseRow; companyName: string; ownerName: string | null };
const dtoOf = (r: JoinedRow, today?: string) => toNoticeDto(r.item, { companyName: r.companyName, ownerName: r.ownerName ?? null }, today);

export interface ListNoticeOptions {
  /** true: open cases only (not submitted or closed); false: submitted and closed only. */
  open?: boolean;
  engagementId?: string | null;
}

/** Notice cases in the caller's scope, the soonest response date first (cases without one last). */
export async function listNoticeCases(ctx: AuthContext, opts: ListNoticeOptions = {}, today: string = istToday()): Promise<NoticeCaseDto[]> {
  const ids = await readableIds(ctx, opts.engagementId);
  if (ids.length === 0) return [];
  const conds = [inArray(noticeCases.engagementId, ids), isNull(engagements.deletedAt)];
  if (opts.open === true) conds.push(notInArray(noticeCases.stage, ['submitted', 'closed']));
  if (opts.open === false) conds.push(inArray(noticeCases.stage, ['submitted', 'closed']));
  const rows = await baseQuery()
    .where(and(...conds))
    .orderBy(sql`${noticeCases.responseDueOn} ASC NULLS LAST`, asc(noticeCases.createdAt));
  return rows.map((r) => dtoOf(r as JoinedRow, today));
}

/** One case, or null when it does not exist or is outside the caller's scope. */
export async function getNoticeCase(ctx: AuthContext, id: string, today: string = istToday()): Promise<NoticeCaseDto | null> {
  if (!STAFF.has(ctx.role)) return null;
  const [row] = await baseQuery().where(eq(noticeCases.id, id)).limit(1);
  if (!row) return null;
  const ids = await readableIds(ctx, row.item.engagementId);
  if (!ids.includes(row.item.engagementId)) return null;
  return dtoOf(row as JoinedRow, today);
}

/** An open case on the same client with the same DIN, so a notice is not opened twice. */
export async function findOpenNoticeByDin(ctx: AuthContext, engagementId: string, din: string): Promise<NoticeCaseDto | null> {
  const ids = await readableIds(ctx, engagementId);
  if (ids.length === 0 || !din.trim()) return null;
  const rows = await baseQuery().where(and(inArray(noticeCases.engagementId, ids), eq(noticeCases.din, din.trim())));
  const hit = rows.find((r) => isOpenStage(r.item.stage));
  return hit ? dtoOf(hit as JoinedRow) : null;
}

const day = (v: string | null | undefined, field: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (!ISO.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new NoticeError('invalid', 400, `${field} must be a date like 2026-11-30`);
  return v;
};

const amount = (v: string | null | undefined): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(v)) throw new NoticeError('invalid', 400, 'The demand must be a number of rupees');
  return v;
};

const text = (v: string | null | undefined, max: number): string | null => {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
};

export interface CreateNoticeInput {
  engagementId: string;
  authority: NoticeAuthority;
  section?: string | null;
  periodLabel?: string | null;
  din?: string | null;
  demandAmount?: string | null;
  receivedOn?: string | null;
  responseDueOn?: string | null;
  hearingOn?: string | null;
  summary?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  attachments?: NoticeAttachment[];
}

/** Staff open a case. The owner defaults to the person opening it. */
export async function createNoticeCase(ctx: AuthContext, input: CreateNoticeInput): Promise<NoticeCaseDto> {
  if (!(NOTICE_AUTHORITIES as readonly string[]).includes(input.authority)) throw new NoticeError('invalid', 400, 'Unknown authority');
  const { dbId, row: eng } = await writableEngagement(ctx, input.engagementId);
  const values = {
    engagementId: dbId,
    authority: input.authority,
    section: text(input.section, 60),
    periodLabel: text(input.periodLabel, 60),
    din: text(input.din, 80),
    demandAmount: amount(input.demandAmount),
    receivedOn: day(input.receivedOn, 'The received date'),
    responseDueOn: day(input.responseDueOn, 'The response date'),
    hearingOn: day(input.hearingOn, 'The hearing date'),
    summary: text(input.summary, 600),
    notes: text(input.notes, 4000),
    ownerId: input.ownerId ?? ctx.userId,
    attachments: input.attachments ?? [],
    stage: 'received',
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  };
  const [saved] = await db.insert(noticeCases).values(values).returning();
  if (!saved) throw new NoticeError('not_found', 404);
  const dto = toNoticeDto(saved, { companyName: eng.companyName, ownerName: saved.ownerId === ctx.userId ? ctx.name : null });
  void recordAuditEvent(ctx, {
    engagementId: dbId,
    action: 'notices.opened',
    summary: `opened a notice case: ${dto.label}`,
    metadata: { caseId: dto.id, authority: dto.authority, responseDueOn: dto.responseDueOn },
  });
  return dto;
}

export interface UpdateNoticeInput {
  authority?: NoticeAuthority;
  section?: string | null;
  periodLabel?: string | null;
  din?: string | null;
  demandAmount?: string | null;
  receivedOn?: string | null;
  responseDueOn?: string | null;
  hearingOn?: string | null;
  stage?: NoticeStage;
  ownerId?: string | null;
  summary?: string | null;
  replyDraft?: string | null;
  documentsNeeded?: string[];
  requestListId?: string | null;
  attachments?: NoticeAttachment[];
  notes?: string | null;
}

/** Staff change a case. Returns the case as saved and as it was, for undo. */
export async function updateNoticeCase(ctx: AuthContext, id: string, patch: UpdateNoticeInput): Promise<{ item: NoticeCaseDto; previous: NoticeCaseDto }> {
  if (!STAFF.has(ctx.role)) throw new NoticeError('forbidden', 403);
  const [existing] = await baseQuery().where(eq(noticeCases.id, id)).limit(1);
  if (!existing) throw new NoticeError('not_found', 404);
  await writableEngagement(ctx, existing.item.engagementId);
  const previous = dtoOf(existing as JoinedRow);
  if (patch.stage !== undefined && !(NOTICE_STAGES as readonly string[]).includes(patch.stage)) throw new NoticeError('invalid', 400, 'Unknown stage');
  if (patch.authority !== undefined && !(NOTICE_AUTHORITIES as readonly string[]).includes(patch.authority)) throw new NoticeError('invalid', 400, 'Unknown authority');
  if (patch.stage && patch.stage !== existing.item.stage && PARTNER_STAGES.has(patch.stage) && !isAdminOrManager(ctx.role)) {
    throw new NoticeError('forbidden', 403, 'A manager or partner approves the final reply before the case is submitted or closed.');
  }
  const set: Partial<typeof noticeCases.$inferInsert> = { updatedBy: ctx.userId, updatedAt: new Date() };
  if (patch.authority !== undefined) set.authority = patch.authority;
  if (patch.section !== undefined) set.section = text(patch.section, 60);
  if (patch.periodLabel !== undefined) set.periodLabel = text(patch.periodLabel, 60);
  if (patch.din !== undefined) set.din = text(patch.din, 80);
  if (patch.demandAmount !== undefined) set.demandAmount = amount(patch.demandAmount);
  if (patch.receivedOn !== undefined) set.receivedOn = day(patch.receivedOn, 'The received date');
  if (patch.responseDueOn !== undefined) set.responseDueOn = day(patch.responseDueOn, 'The response date');
  if (patch.hearingOn !== undefined) set.hearingOn = day(patch.hearingOn, 'The hearing date');
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.summary !== undefined) set.summary = text(patch.summary, 600);
  if (patch.replyDraft !== undefined) set.replyDraft = patch.replyDraft === null ? null : patch.replyDraft.slice(0, 40_000);
  if (patch.documentsNeeded !== undefined) set.documentsNeeded = patch.documentsNeeded.map((d) => d.trim().slice(0, 200)).filter(Boolean).slice(0, 40);
  if (patch.attachments !== undefined) set.attachments = patch.attachments;
  if (patch.requestListId !== undefined) set.requestListId = patch.requestListId;
  if (patch.notes !== undefined) set.notes = text(patch.notes, 4000);
  if (patch.stage !== undefined) {
    set.stage = patch.stage;
    set.closedAt = patch.stage === 'closed' ? new Date() : null;
  }
  const [saved] = await db.update(noticeCases).set(set).where(eq(noticeCases.id, id)).returning();
  if (!saved) throw new NoticeError('not_found', 404);
  const item = toNoticeDto(saved, { companyName: existing.companyName, ownerName: saved.ownerId === existing.item.ownerId ? (existing.ownerName ?? null) : null });
  const changed = Object.keys(patch).filter((k) => k !== 'replyDraft');
  void recordAuditEvent(ctx, {
    engagementId: existing.item.engagementId,
    action: patch.stage && patch.stage !== previous.stage ? 'notices.stage' : 'notices.updated',
    summary: patch.stage && patch.stage !== previous.stage ? `moved ${item.label} to ${patch.stage}` : `updated ${item.label}`,
    metadata: { caseId: id, fields: changed, ...(patch.replyDraft !== undefined ? { replyDraft: true } : {}), ...(patch.stage ? { from: previous.stage, to: patch.stage } : {}) },
  });
  return { item, previous };
}

/** Staff remove a case (the undo of an opened case). */
export async function deleteNoticeCase(ctx: AuthContext, id: string): Promise<boolean> {
  if (!STAFF.has(ctx.role)) throw new NoticeError('forbidden', 403);
  const [existing] = await db.select().from(noticeCases).where(eq(noticeCases.id, id)).limit(1);
  if (!existing) return false;
  await writableEngagement(ctx, existing.engagementId);
  await db.delete(noticeCases).where(eq(noticeCases.id, id));
  void recordAuditEvent(ctx, { engagementId: existing.engagementId, action: 'notices.deleted', summary: `removed ${noticeLabel(existing)}`, metadata: { caseId: id } });
  return true;
}

/* ---------- System helpers for the daily job (no session) ---------- */

export interface EscalationCandidate {
  item: NoticeCaseDto;
  engagement: EngagementDbRow;
  lastEscalation: string | null;
  lastEscalationDueOn: string | null;
}

/** Open cases with a response date within seven days or past it, on live engagements. */
export async function systemListEscalationCandidates(today: string): Promise<EscalationCandidate[]> {
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ item: noticeCases, engagement: engagements, ownerName: profiles.name })
    .from(noticeCases)
    .innerJoin(engagements, eq(engagements.id, noticeCases.engagementId))
    .leftJoin(profiles, eq(profiles.id, noticeCases.ownerId))
    .where(and(isNull(engagements.deletedAt), notInArray(noticeCases.stage, ['submitted', 'closed']), lte(noticeCases.responseDueOn, horizon)));
  return rows.map((r) => ({
    item: toNoticeDto(r.item, { companyName: r.engagement.companyName, ownerName: r.ownerName ?? null }, today),
    engagement: r.engagement,
    lastEscalation: r.item.lastEscalation ?? null,
    lastEscalationDueOn: r.item.lastEscalationDueOn ?? null,
  }));
}

/**
 * Claims an escalation for a case and due date. Returns false when another run already recorded
 * this stage (or a later one) for the same date, so a retried job never notifies twice.
 */
export async function systemClaimEscalation(caseId: string, escalation: Escalation, dueOn: string): Promise<boolean> {
  const order = sql`CASE ${noticeCases.lastEscalation} WHEN 't7' THEN 1 WHEN 't2' THEN 2 WHEN 'overdue' THEN 3 ELSE 0 END`;
  const rank = escalation === 't7' ? 1 : escalation === 't2' ? 2 : 3;
  const done = await db
    .update(noticeCases)
    .set({ lastEscalation: escalation, lastEscalationDueOn: dueOn })
    .where(
      and(
        eq(noticeCases.id, caseId),
        eq(noticeCases.responseDueOn, dueOn),
        sql`(${noticeCases.lastEscalationDueOn} IS DISTINCT FROM ${dueOn} OR ${order} < ${rank})`,
      ),
    )
    .returning({ id: noticeCases.id });
  return done.length > 0;
}

/** Active staff people by id, with their role (for the shell their link opens). */
export async function systemStaffContacts(ids: readonly (string | null | undefined)[]): Promise<Array<{ id: string; name: string; email: string; role: AppRole }>> {
  const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (wanted.length === 0) return [];
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role, status: profiles.status, removedAt: profiles.removedAt })
    .from(profiles)
    .where(inArray(profiles.id, wanted));
  return rows
    .filter((r) => r.status === 'active' && !r.removedAt && STAFF.has(r.role as AppRole))
    .map((r) => ({ id: r.id, name: r.name?.trim() || r.email, email: r.email, role: r.role as AppRole }));
}
