import 'server-only';

import { and, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { companyEvents, engagements, profiles, type CompanyEventRow } from '@/db/schema';
import { engagementLeadProfileId } from '@/db/repositories/compliance-tasks/shared';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { EVENT_TRIGGER_RULES, isComplianceEventKind, type ComplianceEventKind } from '@/data/event-triggers';
import { isFirmWideAdmin } from '@/lib/auth';
import { changesFor, type WatchedValue } from '@/lib/compliance-events/detect';
import { planEvent } from '@/lib/compliance-events/plan';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';

/**
 * COMPLIANCE EVENTS REPOSITORY (IDEAS-PLAN wave 2, section D).
 *
 * Access:
 *   super admin and admin — every event;
 *   manager and intern    — events on engagements in their scope (`listScopedEngagementIds`);
 *   client                — none to read or change. A client's own checklist save may still
 *                           propose an event on its own engagement (`syncRecordChangeProposals`),
 *                           which only staff see.
 *
 * Confirming an event (status `tracked`) is the `filing.recordEvent` action's job after a person
 * approved its card; it creates the task and the draft client request first and passes their ids.
 */

export const COMPLIANCE_EVENT_SOURCES = ['manual', 'ask', 'record_change', 'board_meeting'] as const;
export type ComplianceEventSource = (typeof COMPLIANCE_EVENT_SOURCES)[number];
export const COMPLIANCE_EVENT_STATUSES = ['proposed', 'tracked', 'done', 'dismissed'] as const;
export type ComplianceEventStatus = (typeof COMPLIANCE_EVENT_STATUSES)[number];

export class ComplianceEventError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ComplianceEventError';
  }
}

export interface ComplianceEventDto {
  id: string;
  engagementId: string;
  engagementSlug: string | null;
  companyName: string;
  kind: ComplianceEventKind;
  label: string;
  form: string;
  occurredOn: string;
  /** The stored due date once tracked; for a proposal, the date the rule gives. */
  dueOn: string;
  details: Record<string, string>;
  source: ComplianceEventSource;
  status: ComplianceEventStatus;
  taskId: string | null;
  taskKind: 'compliance' | 'work' | null;
  requestListId: string | null;
  createdByName: string | null;
  createdAt: string;
}

const isClient = (ctx: AuthContext) => ctx.role === 'client';

function assertStaff(ctx: AuthContext) {
  if (isClient(ctx)) throw new ComplianceEventError(403, 'Clients may not change compliance events.');
}

async function scope(ctx: AuthContext): Promise<string[] | 'all'> {
  if (isFirmWideAdmin(ctx.role)) return 'all';
  return listScopedEngagementIds(ctx);
}

/** Details as plain strings; the `baseline` a record change keeps is internal and not shown. */
function publicDetails(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === 'baseline') continue;
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function toDto(row: CompanyEventRow, eng: { companyName: string; slug: string | null }, createdByName: string | null = null): ComplianceEventDto {
  const kind = row.kind as ComplianceEventKind;
  const rule = EVENT_TRIGGER_RULES[kind];
  const details = publicDetails(row.details);
  const dueOn = row.dueOn ?? (rule ? planEvent({ kind, occurredOn: row.occurredOn, details }).dueOn : row.occurredOn);
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    engagementSlug: eng.slug,
    companyName: eng.companyName,
    kind,
    label: rule?.label ?? row.kind,
    form: rule?.form ?? '',
    occurredOn: row.occurredOn,
    dueOn,
    details,
    source: row.source as ComplianceEventSource,
    status: row.status as ComplianceEventStatus,
    taskId: row.taskId,
    taskKind: (row.taskKind as 'compliance' | 'work' | null) ?? null,
    requestListId: row.requestListId,
    createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listComplianceEvents(
  ctx: AuthContext,
  opts: { engagementId?: string | null; status?: ComplianceEventStatus[] } = {},
): Promise<ComplianceEventDto[]> {
  if (isClient(ctx)) return [];
  const ids = await scope(ctx);
  if (ids !== 'all' && ids.length === 0) return [];
  let engagementFilter: string | null = null;
  if (opts.engagementId) {
    const access = await assertEngagementAccess(ctx, opts.engagementId);
    if (!access.ok) return [];
    engagementFilter = access.dbId;
  }
  const rows = await db
    .select({ event: companyEvents, companyName: engagements.companyName, slug: engagements.slug, createdByName: profiles.name })
    .from(companyEvents)
    .innerJoin(engagements, eq(engagements.id, companyEvents.engagementId))
    .leftJoin(profiles, eq(profiles.id, companyEvents.createdBy))
    .where(
      and(
        ids === 'all' ? undefined : inArray(companyEvents.engagementId, ids),
        engagementFilter ? eq(companyEvents.engagementId, engagementFilter) : undefined,
        opts.status?.length ? inArray(companyEvents.status, opts.status) : undefined,
        isNull(engagements.deletedAt),
      ),
    )
    .orderBy(desc(companyEvents.createdAt))
    .limit(500);
  return rows.map((r) => toDto(r.event, { companyName: r.companyName, slug: r.slug }, r.createdByName ?? null));
}

async function loadScoped(ctx: AuthContext, id: string): Promise<{ row: CompanyEventRow; companyName: string; slug: string | null } | null> {
  if (isClient(ctx)) return null;
  const [row] = await db.select().from(companyEvents).where(eq(companyEvents.id, id)).limit(1);
  if (!row) return null;
  const access = await assertEngagementAccess(ctx, row.engagementId);
  if (!access.ok) return null;
  return { row, companyName: access.row.companyName, slug: access.row.slug ?? null };
}

export async function getComplianceEvent(ctx: AuthContext, id: string): Promise<ComplianceEventDto | null> {
  const found = await loadScoped(ctx, id);
  return found ? toDto(found.row, found) : null;
}

// ─── Staff writes ───────────────────────────────────────────────────────────

export interface RecordComplianceEventInput {
  engagementId: string;
  kind: ComplianceEventKind;
  occurredOn: string;
  details: Record<string, string>;
  source: ComplianceEventSource;
  dueOn: string;
  taskId: string | null;
  taskKind: 'compliance' | 'work' | null;
  requestListId: string | null;
  /** A proposed event this confirms; it must be on the same engagement and still proposed. */
  eventId?: string | null;
}

/**
 * Stores a confirmed event as `tracked`: a new row, or the proposal it confirms. Only the
 * `filing.recordEvent` action calls it, after the person approved the card.
 */
export async function recordComplianceEvent(ctx: AuthContext, input: RecordComplianceEventInput, now = new Date()): Promise<ComplianceEventDto> {
  assertStaff(ctx);
  if (!isComplianceEventKind(input.kind)) throw new ComplianceEventError(400, 'That event kind is not known.');
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) throw new ComplianceEventError(404, 'This client is not available.');
  const eng = { companyName: access.row.companyName, slug: access.row.slug ?? null };
  const values = {
    kind: input.kind,
    occurredOn: input.occurredOn,
    details: input.details,
    dueOn: input.dueOn,
    status: 'tracked',
    taskId: input.taskId,
    taskKind: input.taskKind,
    requestListId: input.requestListId,
    confirmedBy: ctx.userId,
    confirmedAt: now,
    updatedAt: now,
  };
  if (input.eventId) {
    const [updated] = await db
      .update(companyEvents)
      .set(values)
      .where(and(eq(companyEvents.id, input.eventId), eq(companyEvents.engagementId, access.dbId), eq(companyEvents.status, 'proposed')))
      .returning();
    if (!updated) throw new ComplianceEventError(409, 'This event was already confirmed or dismissed.');
    return toDto(updated, eng);
  }
  const [row] = await db
    .insert(companyEvents)
    .values({ engagementId: access.dbId, source: input.source, createdBy: ctx.userId, ...values })
    .returning();
  if (!row) throw new Error('Could not record the event');
  return toDto(row, eng);
}

/**
 * Marks a tracked event done (the form is filed), dismisses a proposal or a tracked event, or puts a
 * dismissed event back to proposed. The task and request list are left as they are.
 */
export async function setComplianceEventStatus(
  ctx: AuthContext,
  id: string,
  status: 'done' | 'dismissed' | 'proposed' | 'tracked',
  now = new Date(),
): Promise<ComplianceEventDto | null> {
  assertStaff(ctx);
  const found = await loadScoped(ctx, id);
  if (!found) return null;
  const from = found.row.status as ComplianceEventStatus;
  const allowed: Record<typeof status, ComplianceEventStatus[]> = {
    done: ['tracked'],
    dismissed: ['proposed', 'tracked'],
    proposed: ['dismissed'],
    tracked: ['done', 'dismissed'],
  };
  if (from === status) return toDto(found.row, found);
  // A dismissed event that was never confirmed goes back to proposed, not tracked.
  if (status === 'tracked' && !found.row.confirmedAt) throw new ComplianceEventError(409, 'Confirm this event through its review first.');
  if (status === 'proposed' && found.row.confirmedAt) throw new ComplianceEventError(409, 'A confirmed event cannot go back to a proposal.');
  if (!allowed[status].includes(from)) throw new ComplianceEventError(409, 'This event cannot move to that status.');
  const [row] = await db.update(companyEvents).set({ status, updatedAt: now }).where(eq(companyEvents.id, id)).returning();
  return row ? toDto(row, found) : null;
}

// ─── Record-change proposals ────────────────────────────────────────────────

/**
 * Brings the open proposals for one watched value in line with a checklist save. The baseline is
 * the value before the first unconfirmed change, kept on the proposal, so autosaves while someone
 * types update one proposal rather than add more, and a value typed back to the baseline withdraws
 * it. Runs as the person who saved, after their save was authorised; any staff member or the
 * client on their own engagement may propose. Returns the proposals that are new on this save.
 */
export async function syncRecordChangeProposals(
  ctx: AuthContext,
  input: { engagementId: string; watchKey: string; before: WatchedValue; after: WatchedValue; occurredOn: string },
  now = new Date(),
): Promise<ComplianceEventDto[]> {
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) return [];
  const eng = { companyName: access.row.companyName, slug: access.row.slug ?? null };
  const open = await db
    .select()
    .from(companyEvents)
    .where(
      and(
        eq(companyEvents.engagementId, access.dbId),
        eq(companyEvents.status, 'proposed'),
        eq(companyEvents.source, 'record_change'),
        like(companyEvents.sourceKey, `${input.watchKey}:%`),
      ),
    );
  const kept = open.map((r) => (r.details as { baseline?: WatchedValue } | null)?.baseline).find((b) => b !== undefined);
  const baseline: WatchedValue = kept ?? input.before;
  const changes = changesFor(input.watchKey, baseline, input.after);
  const created: ComplianceEventDto[] = [];

  for (const change of changes) {
    const sourceKey = `${input.watchKey}:${change.kind}`;
    const details = { ...change.details, summary: change.summary, baseline };
    const existing = open.find((r) => r.sourceKey === sourceKey);
    if (existing) {
      await db.update(companyEvents).set({ details, updatedAt: now }).where(eq(companyEvents.id, existing.id));
      continue;
    }
    const [row] = await db
      .insert(companyEvents)
      .values({
        engagementId: access.dbId,
        kind: change.kind,
        occurredOn: input.occurredOn,
        details,
        source: 'record_change',
        sourceKey,
        status: 'proposed',
        createdBy: isClient(ctx) ? null : ctx.userId,
      })
      .returning();
    if (row) created.push(toDto(row, eng));
  }
  // Proposals the save undid (the value is back to the baseline) are withdrawn.
  const stillWanted = new Set(changes.map((c) => `${input.watchKey}:${c.kind}`));
  const stale = open.filter((r) => !stillWanted.has(r.sourceKey ?? ''));
  if (stale.length) {
    await db.update(companyEvents).set({ status: 'dismissed', updatedAt: now }).where(inArray(companyEvents.id, stale.map((r) => r.id)));
  }

  if (created.length) await notifyLead(ctx, access.row, created);
  return created;
}

/** The staff page link for a role's portal. */
export function complianceEventsHref(role: string): string {
  const portal = role === 'super_admin' ? 'super' : role === 'manager' ? 'manager' : role === 'intern' ? 'intern' : 'admin';
  return `/app/${portal}/compliances/events`;
}

/** A bell notice to the project lead (else the manager) to review new proposals. Never throws. */
async function notifyLead(
  ctx: AuthContext,
  engagement: { id: string; internId: string | null; managerId: string | null; adminId: string | null; companyName: string },
  created: ComplianceEventDto[],
): Promise<void> {
  try {
    const leadId = (await engagementLeadProfileId(engagement)) ?? engagement.managerId ?? engagement.adminId;
    if (!leadId || leadId === ctx.userId) return;
    const [person] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, leadId)).limit(1);
    if (!person) return;
    await createNotificationsForUsers(
      created.map((e) => ({
        userId: leadId,
        kind: 'compliance.task' as const,
        title: `${engagement.companyName}: ${e.label.toLowerCase()} needs ${e.form}`,
        body: `${e.details.summary ?? e.label}. Review it and confirm the filing.`,
        engagementId: e.engagementId,
        companyName: engagement.companyName,
        itemId: e.id,
        href: complianceEventsHref(person.role),
        actorId: ctx.userId,
        actorName: ctx.name,
      })),
    );
  } catch (err) {
    console.error('[compliance-events] lead notice failed', err);
  }
}
