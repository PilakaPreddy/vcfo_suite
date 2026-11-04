import 'server-only';

import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditEvents,
  clientNeedMeta,
  clientTimelineRequests,
  clientWorkItems,
  complianceInstances,
  complianceObligations,
  documentRequests,
  documents,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import {
  assertEngagementAccess,
  checklistStateForViewer,
  checklistStateFromRow,
  getMyEngagement,
  type EngagementDbRow,
} from '@/db/repositories/engagements';
import { listDocuments } from '@/db/repositories/documents';
import { isClientVisibleAuditAction, scrubForClient } from '@/db/repositories/client-audit';
import { listAuditEvents, recordAuditEvent } from '@/db/repositories/audit-events';
import { getItem } from '@/data/checklist';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { identifiersFromState } from '@/lib/client/client-overview';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { displayName, displayPeriod } from '@/lib/client-portal/compliances';
import { dinsFromState } from '@/lib/client-portal/identifiers';
import {
  fyLabelOf,
  fyStartYearOf,
  isNeedKind,
  maskId,
  type ClientHome,
  type HomeActivity,
  type HomeDoc,
  type HomeFiling,
  type HomeNeedRequest,
  type HomeWorkItem,
  type NeedKind,
  type TimelinePhaseDates,
  type TimelineRequestDto,
} from '@/lib/client/client-home';

/**
 * CLIENT HOME REPOSITORY — the aggregate behind `GET /api/client/home`
 * (client portal v7 Home) plus the few writes the Home cards make.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Every function resolves the engagement through `assertEngagementAccess`
 * (admin all / manager owned-or-member / lead assigned-or-member / client
 * owner-or-member) and then reads or writes ONLY rows carrying that approved
 * engagement id. Nothing takes an engagement id from a row the caller named
 * without that check:
 *
 *   document_requests, client_need_meta — engagement_id = approved id
 *   client_work_items                    — engagement_id = approved id;
 *                                          writes: staff only (admin/manager/lead)
 *   documents                            — via `listDocuments(ctx, id)` (its own
 *                                          client release rules) + uploads the
 *                                          client makes against an open request
 *   audit_events                         — via `listAuditEvents(ctx, { engagementId })`
 *   compliance_instances                 — engagement_id = approved id
 *   client_timeline_requests             — engagement_id = approved id; a
 *                                          withdraw is the requester's own only
 *   profiles                             — only names / roles of people already
 *                                          attached to rows above
 *
 * PAN and TAN leave this module MASKED. The clear values are revealed by the
 * credentials flow (IdsRevealDialog), never by this read.
 */

const STAFF_ROLES = new Set(['super_admin', 'admin', 'manager', 'intern']);
const HIDDEN_AUDIT_ACTIONS = new Set([
  'board_resolution.draft',
  'board_resolution.update',
  'engagement.checklist.save_draft',
]);

type Access = { dbId: string; row: EngagementDbRow };

async function resolve(ctx: AuthContext, engagementId?: string): Promise<Access | null> {
  let id = engagementId?.trim();
  if (!id) {
    const mine = await getMyEngagement(ctx);
    if (!mine) return null;
    id = mine.id;
  }
  const access = await assertEngagementAccess(ctx, id);
  if (!access.ok) return null;
  return { dbId: access.dbId, row: access.row };
}

async function namesFor(ids: (string | null | undefined)[]): Promise<Map<string, { name: string; role: string }>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (uniq.length === 0) return new Map();
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(inArray(profiles.id, uniq));
  return new Map(rows.map((r) => [r.id, { name: r.name?.trim() || (r.role === 'client' ? r.email.split('@')[0]! : 'SBC'), role: r.role }]));
}

/* ------------------------------------------------------------------ reads */

async function loadNeeds(dbId: string): Promise<HomeNeedRequest[]> {
  const rows = await db
    .select({
      id: documentRequests.id,
      title: documentRequests.title,
      detail: documentRequests.detail,
      status: documentRequests.status,
      requestedBy: documentRequests.requestedBy,
      createdAt: documentRequests.createdAt,
      stepId: clientNeedMeta.stepId,
      complianceInstanceId: clientNeedMeta.complianceInstanceId,
      kind: clientNeedMeta.kind,
      dueDate: clientNeedMeta.dueDate,
    })
    .from(documentRequests)
    .leftJoin(clientNeedMeta, eq(clientNeedMeta.requestId, documentRequests.id))
    .where(and(eq(documentRequests.engagementId, dbId), eq(documentRequests.status, 'pending')))
    .orderBy(asc(documentRequests.createdAt));
  const names = await namesFor(rows.map((r) => r.requestedBy));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail ?? undefined,
    kind: isNeedKind(r.kind) ? r.kind : 'upload',
    stepId: r.stepId ?? undefined,
    complianceInstanceId: r.complianceInstanceId ?? undefined,
    dueDate: r.dueDate ?? undefined,
    requestedByName: r.requestedBy ? names.get(r.requestedBy)?.name : undefined,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function loadWork(dbId: string): Promise<HomeWorkItem[]> {
  const rows = await db
    .select()
    .from(clientWorkItems)
    .where(and(eq(clientWorkItems.engagementId, dbId), eq(clientWorkItems.status, 'active')))
    .orderBy(desc(clientWorkItems.progressPct), asc(clientWorkItems.createdAt));
  const names = await namesFor(rows.map((r) => r.assigneeId));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    stepId: r.stepId ?? undefined,
    assigneeName: r.assigneeId ? names.get(r.assigneeId)?.name : undefined,
    progressPct: Math.max(0, Math.min(100, r.progressPct)),
    readyOn: r.readyOn ?? undefined,
  }));
}

async function loadDocs(ctx: AuthContext, dbId: string): Promise<HomeDoc[]> {
  const list = await listDocuments(ctx, appEngagementId(dbId));
  const recent = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const names = await namesFor(recent.map((d) => d.uploadedBy));
  return recent.map((d) => {
    const who = d.uploadedBy ? names.get(d.uploadedBy) : undefined;
    return {
      id: d.id,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      stepId: d.stepId,
      createdAt: d.createdAt,
      from: who?.role === 'client' ? 'client' : 'firm',
      uploaderName: who?.name,
    };
  });
}

async function loadActivity(ctx: AuthContext, dbId: string): Promise<HomeActivity[]> {
  const rows = await listAuditEvents(ctx, { engagementId: dbId, limit: 40 });
  return rows
    // client-safe only (security review M2): the Audit page's allowlist, no
    // e-mail addresses, staff by name only
    .filter((r) => !HIDDEN_AUDIT_ACTIONS.has(r.action) && (isClientVisibleAuditAction(r.action) || r.action.startsWith('schedule.') || r.action.startsWith('system.') || r.action.startsWith('compliance.job')))
    .slice(0, 12)
    .map((r) => {
      const system = r.action.startsWith('system.') || r.action.startsWith('compliance.job');
      return {
        id: r.id,
        at: r.created_at,
        label: scrubForClient(r.summary),
        action: r.action,
        actorName: system ? 'VCFO Suite' : r.actor_name?.trim() || (r.actor_role === 'client' ? 'Your team' : 'SBC'),
        actorKind: system ? 'system' : r.actor_role === 'client' ? 'client' : 'firm',
      } satisfies HomeActivity;
    });
}

/**
 * System rows for the activity feed (prototype: "TDS Payment overdue · VCFO
 * Suite"): every open filing whose due date has passed went overdue the day
 * after it was due. Derived from compliance_instances, not stored.
 */
function withOverdueEvents(activity: HomeActivity[], filings: HomeFiling[], now: Date): HomeActivity[] {
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const sys: HomeActivity[] = filings
    .filter((f) => !f.filedOn && f.status !== 'filed' && f.dueDate < today)
    .map((f) => {
      const at = new Date(Date.parse(`${f.dueDate}T00:00:00+05:30`) + 86_400_000).toISOString();
      return { id: `sys:overdue:${f.id}`, at, label: `${f.title} overdue`, action: 'system.compliance_overdue', actorName: 'VCFO Suite', actorKind: 'system' } satisfies HomeActivity;
    });
  if (sys.length === 0) return activity;
  return [...activity, ...sys].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
}

async function loadFilings(dbId: string, now: Date, needs: HomeNeedRequest[]): Promise<ClientHome['filings']> {
  const fy = fyStartYearOf(now);
  const rows = await db
    .select({
      id: complianceInstances.id,
      dueDate: complianceInstances.dueDate,
      filedOn: complianceInstances.filedOn,
      periodLabel: complianceInstances.periodLabel,
      periodStart: complianceInstances.periodStart,
      periodEnd: complianceInstances.periodEnd,
      fyLabel: complianceInstances.fyLabel,
      status: complianceInstances.status,
      ownerId: complianceInstances.ownerId,
      windowTo: complianceInstances.windowTo,
      evidenceUrl: complianceInstances.evidenceUrl,
      particular: complianceObligations.particular,
      authority: complianceObligations.authority,
    })
    .from(complianceInstances)
    .innerJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
    .where(
      and(
        eq(complianceInstances.engagementId, dbId),
        gte(complianceInstances.dueDate, `${fy}-04-01`),
        lte(complianceInstances.dueDate, `${fy + 1}-03-31`),
      ),
    )
    .orderBy(asc(complianceInstances.dueDate));
  const owners = await namesFor(rows.map((r) => r.ownerId));
  const needByFiling = new Map(needs.filter((n) => n.complianceInstanceId).map((n) => [n.complianceInstanceId!, n]));
  const out: HomeFiling[] = rows.map((r) => {
    const owner = r.ownerId ? owners.get(r.ownerId) : undefined;
    const need = needByFiling.get(r.id);
    return {
      id: r.id,
      title: displayName(r.particular),
      authority: r.authority,
      periodLabel: (() => {
        const p = displayPeriod(r.periodStart, r.periodEnd, r.periodLabel, r.fyLabel, r.particular, r.dueDate);
        return p === '—' ? undefined : p;
      })(),
      fyLabel: r.fyLabel ?? undefined,
      dueDate: r.dueDate,
      filedOn: r.filedOn ?? undefined,
      status: r.status,
      owner: need || owner?.role === 'client' ? 'client' : owner ? 'firm' : null,
      windowTo: r.windowTo ?? undefined,
      hasProof: Boolean(r.evidenceUrl?.trim()),
      needTitle: need?.title,
      needAskedBy: need?.requestedByName,
    };
  });
  return { fyLabel: fyLabelOf(fy), fyStartYear: fy, rows: out };
}

function toTimelineDto(r: typeof clientTimelineRequests.$inferSelect, viewerId?: string): TimelineRequestDto {
  const p = (r.payload ?? {}) as { phases?: TimelinePhaseDates[]; coiFrom?: string; coiTo?: string; slipDays?: number };
  return {
    id: r.id,
    reason: r.reason,
    status: (['pending', 'approved', 'rejected', 'withdrawn'].includes(r.status) ? r.status : 'pending') as TimelineRequestDto['status'],
    phases: Array.isArray(p.phases) ? p.phases : [],
    coiFrom: p.coiFrom,
    coiTo: p.coiTo,
    slipDays: Number(p.slipDays) || 0,
    createdAt: r.createdAt.toISOString(),
    requestedByName: r.requestedByName ?? undefined,
    mine: viewerId ? r.requestedBy === viewerId : undefined,
  };
}

async function loadTimeline(ctx: AuthContext, dbId: string): Promise<ClientHome['timeline']> {
  const [pending] = await db
    .select()
    .from(clientTimelineRequests)
    .where(and(eq(clientTimelineRequests.engagementId, dbId), eq(clientTimelineRequests.status, 'pending')))
    .orderBy(desc(clientTimelineRequests.createdAt))
    .limit(1);
  const audit = await listAuditEvents(ctx, { engagementId: dbId, limit: 200 });
  const last = audit.find((r) => r.action.startsWith('schedule.'));
  return {
    lastChangedBy: last ? last.actor_name?.trim() || 'SBC' : undefined,
    lastChangedAt: last?.created_at,
    pending: pending ? toTimelineDto(pending, ctx.userId) : undefined,
  };
}

/** The Home aggregate. `null` = no engagement / not permitted (route → 404). */
export async function getClientHome(
  ctx: AuthContext,
  engagementId?: string,
  now: Date = new Date(),
): Promise<ClientHome | null> {
  const access = await resolve(ctx, engagementId);
  if (!access) return null;
  const { dbId, row } = access;

  const state = checklistStateForViewer(ctx, checklistStateFromRow(row));
  const ids = identifiersFromState(state);
  const reg4 = getItem('reg-4');
  const gstin = reg4 ? extractItemResponses(reg4, state['reg-4'] ?? null).gstinNumber?.trim() : undefined;

  const needs = await loadNeeds(dbId);
  const reqRows = await db
    .select({ status: documentRequests.status })
    .from(documentRequests)
    .where(eq(documentRequests.engagementId, dbId));
  const requestCounts = {
    total: reqRows.filter((r) => r.status !== 'cancelled').length,
    fulfilled: reqRows.filter((r) => r.status === 'fulfilled' || r.status === 'approved').length,
  };
  const [work, docs, activity, filings, timeline] = await Promise.all([
    loadWork(dbId),
    loadDocs(ctx, dbId),
    loadActivity(ctx, dbId),
    loadFilings(dbId, now, needs),
    loadTimeline(ctx, dbId),
  ]);

  return {
    engagementId: appEngagementId(dbId),
    needs,
    requestCounts,
    work,
    docs,
    activity: withOverdueEvents(activity, filings.rows, now),
    filings,
    identifiers: {
      cin: ids.cin,
      panMasked: maskId(ids.pan),
      tanMasked: maskId(ids.tan),
      gstin: gstin || undefined,
      dins: dinsFromState(state),
    },
    timeline,
  };
}

/* ----------------------------------------------------------------- writes */

/**
 * The client uploaded a file against an open request: index the stored object
 * as a document shared with the client, and mark the request fulfilled.
 * The caller (route) has already stored the bytes under a key it built from
 * the approved engagement id returned by `needUploadTarget`.
 */
export async function needUploadTarget(
  ctx: AuthContext,
  requestId: string,
): Promise<{ dbId: string; title: string; stepId?: string } | null> {
  const [req] = await db
    .select({ id: documentRequests.id, engagementId: documentRequests.engagementId, title: documentRequests.title, status: documentRequests.status, stepId: clientNeedMeta.stepId })
    .from(documentRequests)
    .leftJoin(clientNeedMeta, eq(clientNeedMeta.requestId, documentRequests.id))
    .where(eq(documentRequests.id, requestId))
    .limit(1);
  if (!req) return null;
  const access = await assertEngagementAccess(ctx, req.engagementId);
  if (!access.ok) return null;
  if (req.status !== 'pending') throw new Error('request_closed');
  return { dbId: access.dbId, title: req.title, stepId: req.stepId ?? undefined };
}

async function recordNeedUpload(
  ctx: AuthContext,
  requestId: string,
  file: { objectKey: string; fileName: string; contentType: string | null; sizeBytes: number },
): Promise<{ documentId: string; title: string } | null> {
  const out = await recordNeedUploads(ctx, requestId, [file]);
  return out && out.documents[0] ? { documentId: out.documents[0].documentId, title: out.title } : null;
}

/**
 * G-09: several files answer one open request at once. Every stored object is
 * indexed as a document shared with the client, the request is marked
 * fulfilled once, and one audit event lists every document, so the toast's
 * Undo (which names the first document) removes the whole batch.
 */
export async function recordNeedUploads(
  ctx: AuthContext,
  requestId: string,
  files: Array<{ objectKey: string; fileName: string; contentType: string | null; sizeBytes: number }>,
): Promise<{ title: string; documents: Array<{ documentId: string; fileName: string }> } | null> {
  if (files.length === 0) return null;
  const target = await needUploadTarget(ctx, requestId);
  if (!target) return null;
  const rows = await db
    .insert(documents)
    .values(
      files.map((file) => ({
        engagementId: target.dbId,
        category: 'documents',
        fileName: file.fileName,
        objectKey: file.objectKey,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        uploadedBy: ctx.userId,
        stepId: target.stepId ?? null,
        sharedWithClient: true,
      })),
    )
    .returning({ id: documents.id, fileName: documents.fileName });
  await db
    .update(documentRequests)
    // closed_at feeds the staff home trend lines (migration 0027).
    .set({ status: 'fulfilled', closedAt: new Date() })
    .where(and(eq(documentRequests.id, requestId), eq(documentRequests.engagementId, target.dbId)));
  const documentIds = rows.map((r) => r.id);
  await recordAuditEvent(ctx, {
    engagementId: target.dbId,
    action: 'client.need_uploaded',
    summary: rows.length > 1 ? `${target.title} uploaded · ${rows.length} files` : `${target.title} uploaded`,
    metadata: { requestId, documentId: documentIds[0], documentIds },
  });
  return { title: target.title, documents: rows.map((r) => ({ documentId: r.id, fileName: r.fileName })) };
}

/** Undo of the upload toast: reopen the request and drop the caller's own document row. */
export async function undoNeedUpload(
  ctx: AuthContext,
  requestId: string,
  documentId: string,
): Promise<{ objectKey: string; objectKeys: string[] } | null> {
  const [req] = await db
    .select({ engagementId: documentRequests.engagementId, title: documentRequests.title })
    .from(documentRequests)
    .where(eq(documentRequests.id, requestId))
    .limit(1);
  if (!req) return null;
  const access = await assertEngagementAccess(ctx, req.engagementId);
  if (!access.ok) return null;
  // Security review M3: undo only THIS upload — the document must be the one
  // recorded for this request by this caller, within the 10-minute undo window,
  // and the request must still be the fulfilled one it turned into.
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
  const windowStart = new Date(Date.now() - 10 * 60_000);
  const [link] = await db
    .select({ id: auditEvents.id, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.engagementId, access.dbId),
        eq(auditEvents.action, 'client.need_uploaded'),
        eq(auditEvents.actorUserId, ctx.userId),
        gte(auditEvents.createdAt, windowStart),
        sql`${auditEvents.metadata}->>'requestId' = ${requestId}`,
        sql`${auditEvents.metadata}->>'documentId' = ${documentId}`,
      ),
    )
    .limit(1);
  if (!link) return null;
  const reopened = await db
    .update(documentRequests)
    .set({ status: 'pending', closedAt: null })
    .where(
      and(
        eq(documentRequests.id, requestId),
        eq(documentRequests.engagementId, access.dbId),
        eq(documentRequests.status, 'fulfilled'),
      ),
    )
    .returning({ id: documentRequests.id });
  if (!reopened.length) return null;
  // A multi-file upload (G-09) recorded every document of the batch; Undo
  // names the first and removes them all. Ids come from the audit row this
  // caller wrote, and each delete is still limited to the caller's own rows.
  const meta = (link.metadata ?? {}) as { documentIds?: unknown };
  const batch = Array.isArray(meta.documentIds)
    ? meta.documentIds.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
    : [];
  const ids = [...new Set([documentId, ...batch])];
  const docs = await db
    .delete(documents)
    .where(
      and(
        inArray(documents.id, ids),
        eq(documents.engagementId, access.dbId),
        eq(documents.uploadedBy, ctx.userId),
        gte(documents.createdAt, windowStart),
      ),
    )
    .returning({ id: documents.id, objectKey: documents.objectKey });
  const first = docs.find((d) => d.id === documentId);
  if (!first) return null;
  await recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: 'client.need_upload_undone',
    summary: `${req.title} upload undone`,
    metadata: { requestId, documentId, documentIds: docs.map((d) => d.id) },
  });
  return { objectKey: first.objectKey, objectKeys: docs.map((d) => d.objectKey) };
}

/** Staff: say what a request is for (step / filing / verb / due date). */
export async function setNeedMeta(
  ctx: AuthContext,
  requestId: string,
  meta: { stepId?: string | null; complianceInstanceId?: string | null; kind?: NeedKind; dueDate?: string | null; fieldId?: string | null },
): Promise<boolean> {
  if (!STAFF_ROLES.has(ctx.role)) return false;
  const [req] = await db
    .select({ engagementId: documentRequests.engagementId })
    .from(documentRequests)
    .where(eq(documentRequests.id, requestId))
    .limit(1);
  if (!req) return false;
  const access = await assertEngagementAccess(ctx, req.engagementId);
  if (!access.ok) return false;
  if (meta.complianceInstanceId) {
    const [inst] = await db
      .select({ id: complianceInstances.id })
      .from(complianceInstances)
      .where(and(eq(complianceInstances.id, meta.complianceInstanceId), eq(complianceInstances.engagementId, access.dbId)))
      .limit(1);
    if (!inst) return false;
  }
  const values = {
    requestId,
    engagementId: access.dbId,
    stepId: meta.stepId ?? null,
    complianceInstanceId: meta.complianceInstanceId ?? null,
    kind: meta.kind ?? 'upload',
    dueDate: meta.dueDate ?? null,
    fieldId: meta.fieldId ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(clientNeedMeta)
    .values(values)
    .onConflictDoUpdate({ target: clientNeedMeta.requestId, set: values });
  return true;
}

/** Staff: create or update a work item the client sees under "What SBC is doing". */
export async function upsertWorkItem(
  ctx: AuthContext,
  input: {
    engagementId: string;
    id?: string;
    title: string;
    stepId?: string | null;
    assigneeId?: string | null;
    progressPct?: number;
    readyOn?: string | null;
    status?: 'active' | 'done' | 'hidden';
  },
): Promise<HomeWorkItem | null> {
  if (!STAFF_ROLES.has(ctx.role)) return null;
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) return null;
  const pct = Math.max(0, Math.min(100, Math.round(input.progressPct ?? 0)));
  const values = {
    engagementId: access.dbId,
    title: input.title.trim(),
    stepId: input.stepId ?? null,
    assigneeId: input.assigneeId ?? null,
    progressPct: pct,
    readyOn: input.readyOn ?? null,
    status: input.status ?? 'active',
    updatedAt: new Date(),
  };
  let row;
  if (input.id) {
    [row] = await db
      .update(clientWorkItems)
      .set(values)
      .where(and(eq(clientWorkItems.id, input.id), eq(clientWorkItems.engagementId, access.dbId)))
      .returning();
  } else {
    [row] = await db.insert(clientWorkItems).values({ ...values, createdBy: ctx.userId }).returning();
  }
  if (!row) return null;
  return { id: row.id, title: row.title, stepId: row.stepId ?? undefined, progressPct: row.progressPct, readyOn: row.readyOn ?? undefined };
}


/** Staff editor: the engagement's work items (active + done, not hidden), for anyone with access. */
export async function listWorkItems(
  ctx: AuthContext,
  engagementId: string,
): Promise<Array<HomeWorkItem & { status: string }>> {
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return [];
  const rows = await db.select().from(clientWorkItems).where(eq(clientWorkItems.engagementId, access.dbId));
  return rows
    .filter((r) => r.status !== 'hidden')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      title: r.title,
      stepId: r.stepId ?? undefined,
      progressPct: r.progressPct,
      readyOn: r.readyOn ?? undefined,
      status: r.status,
    }));
}
