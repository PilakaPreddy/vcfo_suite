import 'server-only';

import { and, eq, inArray, isNull, lt, lte, max, min, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  clientMessages,
  complianceEvents,
  complianceInstanceWorkflow,
  complianceInstances,
  complianceObligations,
  complianceTasks,
  documentRequests,
  documents,
  engagementStepEvents,
  engagements,
  profiles,
} from '@/db/schema';
import { clientHealthScores, slaEscalations, type ClientHealthRow } from '@/db/schema';
import { noticeCases } from '@/db/schema';
import type { AppRole, AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { assertEngagementAccess, listScopedEngagementIds, type EngagementDbRow } from '@/db/repositories/engagements';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { HEALTH_BAND_LABEL, isHealthBand, type HealthBand, type HealthScore, type HealthSignals } from '@/lib/client-health/score';
import type { SlaLevel } from '@/data/sla';

/**
 * CLIENT HEALTH REPOSITORY (IDEAS-PLAN wave 2, section E) — the computed health band per client
 * and the SLA ladder's record of what it already sent.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   super_admin / admin — every live client (`isFirmWideAdmin`).
 *   manager / intern    — the clients in `listScopedEngagementIds(ctx)`; one client through
 *                         `assertEngagementAccess`.
 *   client and others   — nothing, before the first query. The health band is a staff view.
 * The manual override is a manager's or admin's call (`isAdminOrManager`) and records an audit
 * event. The screens and the chat reach it through the `statuses.setClientHealth` card.
 *
 * `system*` helpers serve the nightly job (src/jobs/client-health-nightly.ts), which runs with
 * no session and reads across clients the same way the notice and expiry jobs do. They return
 * plain data; nothing they return reaches a client.
 */

const STAFF = new Set<AppRole>(['super_admin', 'admin', 'manager', 'intern']);

export class ClientHealthError extends Error {
  constructor(
    readonly code: 'forbidden' | 'not_found' | 'invalid',
    readonly status: 400 | 403 | 404,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface ClientHealthDto {
  /** App engagement id (legacy "e1" or the uuid). */
  engagementId: string;
  companyName: string;
  score: number;
  /** The computed band. */
  band: HealthBand;
  /** The band the screens show: the override while one is set, else the computed band. */
  effectiveBand: HealthBand;
  signals: HealthSignals;
  computedAt: string;
  previousBand: HealthBand | null;
  override: { band: HealthBand; reason: string | null; byName: string | null; at: string | null } | null;
}

function toDto(row: ClientHealthRow, extra: { companyName: string; overrideByName: string | null }): ClientHealthDto {
  const band = isHealthBand(row.band) ? row.band : 'watch';
  const override = isHealthBand(row.overrideBand)
    ? { band: row.overrideBand, reason: row.overrideReason ?? null, byName: extra.overrideByName, at: row.overrideAt?.toISOString() ?? null }
    : null;
  return {
    engagementId: appEngagementId(row.engagementId),
    companyName: extra.companyName,
    score: row.score,
    band,
    effectiveBand: override?.band ?? band,
    signals: row.signals,
    computedAt: row.computedAt.toISOString(),
    previousBand: isHealthBand(row.previousBand) ? row.previousBand : null,
    override,
  };
}

async function readRows(engagementIds: string[] | 'all'): Promise<ClientHealthDto[]> {
  if (engagementIds !== 'all' && engagementIds.length === 0) return [];
  const where = engagementIds === 'all' ? isNull(engagements.deletedAt) : and(isNull(engagements.deletedAt), inArray(clientHealthScores.engagementId, engagementIds));
  const rows = await db
    .select({ row: clientHealthScores, companyName: engagements.companyName, overrideByName: profiles.name })
    .from(clientHealthScores)
    .innerJoin(engagements, eq(engagements.id, clientHealthScores.engagementId))
    .leftJoin(profiles, eq(profiles.id, clientHealthScores.overrideBy))
    .where(where);
  return rows.map((r) => toDto(r.row, { companyName: r.companyName, overrideByName: r.overrideByName ?? null }));
}

/** The health of one client, or null when it has not been computed yet. */
export async function getClientHealth(ctx: AuthContext, engagementId: string): Promise<ClientHealthDto | null> {
  if (!STAFF.has(ctx.role)) throw new ClientHealthError('forbidden', 403);
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new ClientHealthError('not_found', 404);
  const [found] = await readRows([access.dbId]);
  return found ?? null;
}

/** The health of every client in the caller's scope, worst first by score. */
export async function listClientHealth(ctx: AuthContext): Promise<ClientHealthDto[]> {
  if (!STAFF.has(ctx.role)) return [];
  const rows = isFirmWideAdmin(ctx.role) ? await readRows('all') : await readRows(await listScopedEngagementIds(ctx));
  return rows.sort((a, b) => a.score - b.score || a.companyName.localeCompare(b.companyName));
}

export interface SetHealthOverrideInput {
  engagementId: string;
  /** The band to show; null clears the override. */
  band: HealthBand | null;
  reason?: string | null;
}

/**
 * Sets or clears the manual band (managers and admins). Returns the record after and before the
 * change, so the card can undo it.
 */
export async function setClientHealthOverride(
  ctx: AuthContext,
  input: SetHealthOverrideInput,
): Promise<{ item: ClientHealthDto; previous: ClientHealthDto }> {
  if (!isAdminOrManager(ctx.role)) throw new ClientHealthError('forbidden', 403, 'Only a manager or an admin can set the health band.');
  if (input.band !== null && !isHealthBand(input.band)) throw new ClientHealthError('invalid', 400, 'Unknown health band.');
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) throw new ClientHealthError('not_found', 404);
  const [before] = await readRows([access.dbId]);
  if (!before) throw new ClientHealthError('not_found', 404, 'The health score has not been computed for this client yet.');
  const reason = input.reason?.trim().slice(0, 500) || null;
  await db
    .update(clientHealthScores)
    .set(
      input.band
        ? { overrideBand: input.band, overrideReason: reason, overrideBy: ctx.userId, overrideAt: new Date() }
        : { overrideBand: null, overrideReason: null, overrideBy: null, overrideAt: null },
    )
    .where(eq(clientHealthScores.engagementId, access.dbId));
  const [after] = await readRows([access.dbId]);
  void recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: 'client_health.override',
    summary: input.band ? `set the health band to ${HEALTH_BAND_LABEL[input.band]}${reason ? ` (${reason})` : ''}` : 'cleared the health band override',
    metadata: { band: input.band, previous: before.override?.band ?? null },
  });
  return { item: after ?? before, previous: before };
}

/** The spec's short name for the override write. */
export const setOverride = setClientHealthOverride;

/* ---------- System helpers for the nightly job (no session) ---------- */

/** Live engagements, the whole row (the job needs the checklist state and schedule). */
export async function systemListHealthEngagements(): Promise<EngagementDbRow[]> {
  return db.select().from(engagements).where(isNull(engagements.deletedAt));
}

export interface RawHealthCounts {
  oldestRequestAt: Date | null;
  lastClientMessageAt: Date | null;
  lastClientUploadAt: Date | null;
  overdueInstances: number;
  overdueTasks: number;
  overdueEvents: number;
  openNotices: number | null;
}

const toDate = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

/**
 * The raw signal counts of every live client in one pass: grouped queries, no per-client loop.
 * `openNotices` is null for everyone when the notice table cannot be read (not migrated yet).
 */
export async function systemRawHealthCounts(today: string): Promise<{ byEngagement: Map<string, RawHealthCounts>; noticesAvailable: boolean }> {
  const [requests, messages, uploads, instances, tasks, events] = await Promise.all([
    db
      .select({ id: documentRequests.engagementId, at: min(documentRequests.createdAt) })
      .from(documentRequests)
      .where(eq(documentRequests.status, 'pending'))
      .groupBy(documentRequests.engagementId),
    db
      .select({ id: clientMessages.engagementId, at: max(clientMessages.createdAt) })
      .from(clientMessages)
      .where(eq(clientMessages.senderSide, 'client'))
      .groupBy(clientMessages.engagementId),
    db
      .select({ id: documents.engagementId, at: max(documents.createdAt) })
      .from(documents)
      .innerJoin(profiles, eq(profiles.id, documents.uploadedBy))
      .where(eq(profiles.role, 'client'))
      .groupBy(documents.engagementId),
    db
      .select({ id: complianceInstances.engagementId, n: sql<number>`count(*)::int` })
      .from(complianceInstances)
      .leftJoin(complianceInstanceWorkflow, eq(complianceInstanceWorkflow.instanceId, complianceInstances.id))
      .where(
        and(
          lt(complianceInstances.dueDate, today),
          isNull(complianceInstances.filedOn),
          sql`${complianceInstances.status} <> 'filed'`,
          sql`coalesce(${complianceInstanceWorkflow.stage}, '') not in ('completed', 'not-applicable')`,
        ),
      )
      .groupBy(complianceInstances.engagementId),
    db
      .select({ id: complianceTasks.engagementId, n: sql<number>`count(*)::int` })
      .from(complianceTasks)
      .where(and(lt(complianceTasks.dueDate, today), notInArray(complianceTasks.stage, ['completed', 'not-applicable'])))
      .groupBy(complianceTasks.engagementId),
    db
      .select({ id: complianceEvents.engagementId, n: sql<number>`count(*)::int` })
      .from(complianceEvents)
      .where(and(lt(complianceEvents.dueDate, today), isNull(complianceEvents.filedOn), sql`${complianceEvents.status} <> 'filed'`))
      .groupBy(complianceEvents.engagementId),
  ]);
  let notices: Array<{ id: string; n: number }> | null = null;
  try {
    notices = await db
      .select({ id: noticeCases.engagementId, n: sql<number>`count(*)::int` })
      .from(noticeCases)
      .where(notInArray(noticeCases.stage, ['submitted', 'closed']))
      .groupBy(noticeCases.engagementId);
  } catch {
    // The notice desk table is not there yet: leave the signal out rather than fail the run.
    notices = null;
  }

  const out = new Map<string, RawHealthCounts>();
  const get = (id: string) => {
    let r = out.get(id);
    if (!r) {
      r = { oldestRequestAt: null, lastClientMessageAt: null, lastClientUploadAt: null, overdueInstances: 0, overdueTasks: 0, overdueEvents: 0, openNotices: notices ? 0 : null };
      out.set(id, r);
    }
    return r;
  };
  for (const r of requests) get(r.id).oldestRequestAt = toDate(r.at);
  for (const r of messages) get(r.id).lastClientMessageAt = toDate(r.at);
  for (const r of uploads) get(r.id).lastClientUploadAt = toDate(r.at);
  for (const r of instances) get(r.id).overdueInstances = Number(r.n) || 0;
  for (const r of tasks) get(r.id).overdueTasks = Number(r.n) || 0;
  for (const r of events) get(r.id).overdueEvents = Number(r.n) || 0;
  for (const r of notices ?? []) get(r.id).openNotices = Number(r.n) || 0;
  return { byEngagement: out, noticesAvailable: notices !== null };
}

/** The day each step of one client last moved into each status: `{ [stepId]: { [status]: day } }`. */
export async function systemStepEnteredOn(engagementId: string): Promise<Record<string, Record<string, string>>> {
  const rows = await db
    .select({ stepId: engagementStepEvents.stepId, toStatus: engagementStepEvents.toStatus, at: max(engagementStepEvents.at) })
    .from(engagementStepEvents)
    .where(eq(engagementStepEvents.engagementId, engagementId))
    .groupBy(engagementStepEvents.stepId, engagementStepEvents.toStatus);
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const at = toDate(r.at);
    if (!at) continue;
    (out[r.stepId] ??= {})[r.toStatus] = at.toISOString().slice(0, 10);
  }
  return out;
}

export interface OpenComplianceItem {
  itemKey: string;
  title: string;
  dueOn: string;
  windowFrom: string | null;
}

/** One client's open compliance items that are due on or before `today` (the ladder starts at 1x). */
export async function systemOpenComplianceItems(engagementId: string, today: string): Promise<OpenComplianceItem[]> {
  const [instances, tasks, events] = await Promise.all([
    db
      .select({ id: complianceInstances.id, name: complianceObligations.particular, period: complianceInstances.periodLabel, dueOn: complianceInstances.dueDate, windowFrom: complianceInstances.windowFrom })
      .from(complianceInstances)
      .innerJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
      .leftJoin(complianceInstanceWorkflow, eq(complianceInstanceWorkflow.instanceId, complianceInstances.id))
      .where(
        and(
          eq(complianceInstances.engagementId, engagementId),
          lte(complianceInstances.dueDate, today),
          isNull(complianceInstances.filedOn),
          sql`${complianceInstances.status} <> 'filed'`,
          sql`coalesce(${complianceInstanceWorkflow.stage}, '') not in ('completed', 'not-applicable')`,
        ),
      ),
    db
      .select({ id: complianceTasks.id, name: complianceTasks.name, period: complianceTasks.periodLabel, dueOn: complianceTasks.dueDate, startOn: complianceTasks.startDate })
      .from(complianceTasks)
      .where(and(eq(complianceTasks.engagementId, engagementId), lte(complianceTasks.dueDate, today), notInArray(complianceTasks.stage, ['completed', 'not-applicable']))),
    db
      .select({ id: complianceEvents.id, name: complianceEvents.particular, dueOn: complianceEvents.dueDate })
      .from(complianceEvents)
      .where(and(eq(complianceEvents.engagementId, engagementId), lte(complianceEvents.dueDate, today), isNull(complianceEvents.filedOn), sql`${complianceEvents.status} <> 'filed'`)),
  ]);
  const label = (name: string, period: string | null) => (period ? `${name} (${period})` : name);
  return [
    ...instances.map((r) => ({ itemKey: `instance:${r.id}`, title: label(r.name, r.period), dueOn: r.dueOn, windowFrom: r.windowFrom ?? null })),
    ...tasks.map((r) => ({ itemKey: `task:${r.id}`, title: label(r.name, r.period), dueOn: r.dueOn, windowFrom: r.startOn ?? null })),
    ...events.map((r) => ({ itemKey: `event:${r.id}`, title: r.name, dueOn: r.dueOn, windowFrom: null })),
  ];
}

/**
 * Stores one client's computed health. Keeps the override, moves the old computed band into
 * `previous_band`, and returns that band (null on the first run).
 */
export async function systemSaveHealth(engagementId: string, health: HealthScore, now: Date = new Date()): Promise<{ previousBand: HealthBand | null; checkInTaskId: string | null }> {
  const [existing] = await db
    .select({ band: clientHealthScores.band, checkInTaskId: clientHealthScores.checkInTaskId })
    .from(clientHealthScores)
    .where(eq(clientHealthScores.engagementId, engagementId))
    .limit(1);
  const previousBand = existing && isHealthBand(existing.band) ? existing.band : null;
  await db
    .insert(clientHealthScores)
    .values({ engagementId, score: health.score, band: health.band, signals: health.signals, computedAt: now, previousBand })
    .onConflictDoUpdate({
      target: clientHealthScores.engagementId,
      set: { score: health.score, band: health.band, signals: health.signals, computedAt: now, previousBand },
    });
  return { previousBand, checkInTaskId: existing?.checkInTaskId ?? null };
}

/** Remembers the partner check-in task opened for the latest fall. */
export async function systemSetCheckInTask(engagementId: string, taskId: string): Promise<void> {
  await db.update(clientHealthScores).set({ checkInTaskId: taskId }).where(eq(clientHealthScores.engagementId, engagementId));
}

/** The ladder levels already sent for one client: `${itemKey}|${stageLabel}` to the levels. */
export async function systemSentSlaLevels(engagementId: string): Promise<Map<string, Set<SlaLevel>>> {
  const rows = await db
    .select({ itemKey: slaEscalations.itemKey, stageLabel: slaEscalations.stageLabel, level: slaEscalations.level })
    .from(slaEscalations)
    .where(eq(slaEscalations.engagementId, engagementId));
  const out = new Map<string, Set<SlaLevel>>();
  for (const r of rows) {
    const key = `${r.itemKey}|${r.stageLabel}`;
    let set = out.get(key);
    if (!set) out.set(key, (set = new Set()));
    set.add(r.level as SlaLevel);
  }
  return out;
}

/**
 * Claims one ladder level for one item and stage. Returns false when it was already sent, so a
 * retried or repeated run never notifies twice (the unique index decides).
 */
export async function systemClaimSlaLevel(input: { engagementId: string; itemKey: string; stageLabel: string; level: SlaLevel }): Promise<boolean> {
  const rows = await db
    .insert(slaEscalations)
    .values(input)
    .onConflictDoNothing({ target: [slaEscalations.engagementId, slaEscalations.itemKey, slaEscalations.stageLabel, slaEscalations.level] })
    .returning({ id: slaEscalations.id });
  return rows.length > 0;
}
