import 'server-only';

import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditEvents,
  complianceInstances,
  complianceObligations,
  engagementLeads,
  engagementManagers,
  engagementStepEvents,
} from '@/db/schema';
import { normalizeEngagementSchedule, windowForStep } from '@/lib/projects/schedule-windows';
import { pastMonthEnds, type FilingHistoryRow, type FilingReopen } from '@/lib/metrics/home-trends';
import { coerceStatusCode, getRegistrationPhases } from '@/data/checklist';
import { CERTIFICATE_OF_INCORPORATION_STEP_ID } from '@/lib/compliance/incorporation-state';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import {
  assertEngagementAccess,
  checklistStateFromRow,
  listChecklistIndex,
  listEngagements,
  type EngagementListRow,
} from '@/db/repositories/engagements';
import { listDocuments } from '@/db/repositories/documents';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { listStaffPeople, type StaffPersonRow } from '@/db/repositories/profiles';
import { listAuditEvents } from '@/db/repositories/audit-events';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import {
  buildJourney,
  buildSuperOverview,
  needsAttention,
  sortByAttention,
  summarizeEngagement,
  superEngagementHref,
  superFirmViewHref,
  SUPER_FILING_HORIZON_DAYS,
  type SuperActivityEntry,
  type SuperEngagementDetail,
  type SuperEngagementSummary,
  type SuperFiling,
  type SuperJourneyStep,
  type SuperOverview,
  type SuperOverviewState,
  type SuperTeamMember,
} from '@/lib/super/super-overview';
import {
  buildFilingHistory,
  buildMonths,
  buildTeam,
  dayOf,
  daysBetweenDays,
  isFiled,
  windowFloor,
  type SuperInsightClient,
  type SuperInsightFiling,
  type SuperInsights,
  type SuperRegCell,
} from '@/lib/super/super-insights-model';

/**
 * SUPER ADMIN OVERVIEW REPOSITORY.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Super admin's scope is "every engagement", but that scope is still granted by
 * the same predicates every other role goes through — there is no unscoped
 * branch written here:
 *
 *   engagements       — `listEngagements(ctx)` / `listChecklistIndex(ctx)`;
 *                       `scopeFor(ctx)` returns firm-wide only for
 *                       `isFirmWideAdmin(ctx.role)`, and a manager/lead/client
 *                       calling this gets their own narrow slice, not everyone's.
 *   audit_events      — `listAuditEvents(ctx)`, same predicate table.
 *   profiles          — `listStaffPeople(ctx)`, which itself throws unless the
 *                       caller is a firm-wide admin.
 *   compliance rows   — read here, restricted to the engagement ids the
 *                       engagement scope above already approved.
 *
 * On top of that, `assertSuperScope` refuses non-firm-wide callers outright, so
 * this aggregate is never the thing that widens someone's access.
 *
 * Nothing here writes. The whole surface is an observatory (context §3).
 */

/** Firm-wide activity shown on the Overview; the L2 activity screen paginates. */
const ACTIVITY_LIMIT = 24;

/** Audit rows that describe internal churn rather than firm progress. */
const HIDDEN_AUDIT_ACTIONS = new Set([
  'engagement.checklist.save_draft',
  'board_resolution.update',
]);

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function assertSuperScope(ctx: AuthContext): void {
  if (!isFirmWideAdmin(ctx.role)) {
    throw new Error('Only firm-wide admins may read the super admin overview');
  }
}

/** internId → display name, and profile id → display name. */
function nameIndexes(staff: StaffPersonRow[]) {
  const byInternId = new Map<string, string>();
  const byProfileId = new Map<string, string>();
  for (const person of staff) {
    byProfileId.set(person.id, person.name);
    if (person.internId?.trim()) byInternId.set(person.internId.trim(), person.name);
  }
  return { byInternId, byProfileId };
}

/** One engagement row, summarised through the shared gate-derived builder. */
function summaryForRow(
  row: EngagementListRow,
  state: SuperOverviewState,
  names: ReturnType<typeof nameIndexes>,
  now: Date,
): SuperEngagementSummary {
  const appId = appEngagementId(row.id);
  const leadId = row.internId?.trim() || null;
  const managerId = row.managerId ?? row.adminId ?? null;
  return summarizeEngagement(
    {
      id: appId,
      slug: row.slug ?? null,
      companyName: row.companyName,
      clientName: row.clientName?.trim() || null,
      stage: row.stage,
      health: row.health,
      leadId,
      leadName: leadId ? (names.byInternId.get(leadId) ?? null) : null,
      managerId,
      managerName: managerId ? (names.byProfileId.get(managerId) ?? null) : null,
      incorporationDate: row.incorporationDate ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      state,
    },
    now,
  );
}

/**
 * Filings across the approved engagement ids only. Scoping by an explicit id
 * list is both correct here and narrower than a role branch. (The old
 * `listComplianceInstances`, whose role branch forgot super admin, was removed
 * from `compliance.ts` on 2026-09-13 and has no successor with that bug.)
 */
async function loadFilings(
  scopedDbIds: string[],
  companyByDbId: Map<string, string>,
  now: Date,
): Promise<SuperFiling[]> {
  if (scopedDbIds.length === 0) return [];

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + SUPER_FILING_HORIZON_DAYS);
  // Overdue filings matter more than upcoming ones, so the window opens behind
  // today as well as ahead of it.
  const floor = new Date(now);
  floor.setDate(floor.getDate() - SUPER_FILING_HORIZON_DAYS);

  const rows = await db
    .select({
      id: complianceInstances.id,
      engagementId: complianceInstances.engagementId,
      obligationId: complianceInstances.obligationId,
      dueDate: complianceInstances.dueDate,
      status: complianceInstances.status,
      periodLabel: complianceInstances.periodLabel,
    })
    .from(complianceInstances)
    .where(
      and(
        inArray(complianceInstances.engagementId, scopedDbIds),
        gte(complianceInstances.dueDate, ymd(floor)),
        lte(complianceInstances.dueDate, ymd(horizon)),
      ),
    )
    .orderBy(asc(complianceInstances.dueDate));

  if (rows.length === 0) return [];

  const obligationIds = [...new Set(rows.map((row) => row.obligationId))];
  const obligations = await db
    .select({
      id: complianceObligations.id,
      particular: complianceObligations.particular,
      authority: complianceObligations.authority,
    })
    .from(complianceObligations)
    .where(inArray(complianceObligations.id, obligationIds));

  const byId = new Map(obligations.map((row) => [row.id, row]));

  return rows.map((row) => {
    const obligation = byId.get(row.obligationId);
    const appId = appEngagementId(row.engagementId);
    return {
      id: row.id,
      engagementId: appId,
      companyName: companyByDbId.get(row.engagementId) ?? 'Unknown company',
      title: obligation?.particular?.trim() || row.obligationId,
      authority: obligation?.authority?.trim() || 'Other',
      dueDate: row.dueDate,
      status: row.status,
      periodLabel: row.periodLabel?.trim() || undefined,
      href: superEngagementHref(appId),
    };
  });
}

function toActivity(
  rows: Awaited<ReturnType<typeof listAuditEvents>>,
  companyByDbId: Map<string, string>,
): SuperActivityEntry[] {
  return rows
    .filter((row) => !HIDDEN_AUDIT_ACTIONS.has(row.action))
    .slice(0, ACTIVITY_LIMIT)
    .map((row) => {
      const appId = row.engagement_id ? appEngagementId(row.engagement_id) : null;
      return {
        id: row.id,
        at: row.created_at,
        actor: row.actor_name?.trim() || row.actor_email?.trim() || null,
        action: row.action,
        label: row.summary,
        engagementId: appId,
        companyName: row.engagement_id
          ? (companyByDbId.get(row.engagement_id) ?? null)
          : null,
        href: appId ? superEngagementHref(appId) : null,
      };
    });
}

/** The single scoped read behind the super admin observatory. */
export async function getSuperAdminOverview(
  ctx: AuthContext,
  now: Date = new Date(),
): Promise<SuperOverview> {
  assertSuperScope(ctx);

  const [rows, checklistIndex, staff] = await Promise.all([
    listEngagements(ctx),
    listChecklistIndex(ctx),
    listStaffPeople(ctx),
  ]);

  const scopedDbIds = rows.map((row) => row.id);
  const companyByDbId = new Map(rows.map((row) => [row.id, row.companyName]));
  const { byInternId, byProfileId } = nameIndexes(staff);

  const summaries = rows.map((row: EngagementListRow) => {
    const appId = appEngagementId(row.id);
    const state = (checklistIndex[appId] ?? {}) as SuperOverviewState;
    return summaryForRow(row, state, { byInternId, byProfileId }, now);
  });

  const [filings, auditRows] = await Promise.all([
    loadFilings(scopedDbIds, companyByDbId, now),
    listAuditEvents(ctx, { limit: 60 }),
  ]);

  return buildSuperOverview({
    summaries,
    filings,
    activity: toActivity(auditRows, companyByDbId),
    staff,
    clients: staff.filter((person) => person.role === 'client').length,
    now,
  });
}

/* ------------------------------------------------------------------ *
 * L2 — one engagement, in full.
 * ------------------------------------------------------------------ */

/**
 * Everything the observatory shows for one engagement.
 *
 * Access is `assertEngagementAccess`, the same first hop the client overview
 * uses: a caller who may not see this engagement gets `null`, which the route
 * turns into 404 — never a 403 that would confirm the id exists. The firm-wide
 * assertion still runs first, so this is not a way for a narrow role to read a
 * project through the super surface.
 */
export async function getSuperEngagementDetail(
  ctx: AuthContext,
  engagementId: string,
  now: Date = new Date(),
): Promise<SuperEngagementDetail | null> {
  assertSuperScope(ctx);

  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return null;

  const { row, dbId } = access;
  const appId = appEngagementId(dbId);
  const state = checklistStateFromRow(row) as SuperOverviewState;
  const slugOrId = row.slug ?? appId;

  const [staff, documents, filings, auditRows, recipients] = await Promise.all([
    listStaffPeople(ctx),
    listDocuments(ctx, engagementId),
    loadFilings([dbId], new Map([[dbId, row.companyName]]), now),
    listAuditEvents(ctx, { engagementId: dbId, limit: 60 }),
    resolveEngagementRecipients(dbId),
  ]);

  const { byInternId, byProfileId } = nameIndexes(staff);
  const leadId = row.internId?.trim() || null;
  const managerId = row.managerId ?? row.adminId ?? null;

  const summary = summarizeEngagement(
    {
      id: appId,
      slug: row.slug ?? null,
      companyName: row.companyName,
      clientName: row.clientName?.trim() || null,
      stage: row.stage,
      health: row.health,
      leadId,
      leadName: leadId ? (byInternId.get(leadId) ?? null) : null,
      managerId,
      managerName: managerId ? (byProfileId.get(managerId) ?? null) : null,
      incorporationDate: row.incorporationDate ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      state,
    },
    now,
  );

  const team: SuperTeamMember[] = [];
  const seen = new Set<string>();
  for (const manager of recipients?.managers ?? []) {
    if (seen.has(manager.userId)) continue;
    seen.add(manager.userId);
    team.push({
      id: manager.userId,
      name: manager.name,
      email: manager.email,
      role: 'Project Manager',
    });
  }
  for (const lead of recipients?.leads ?? []) {
    if (seen.has(lead.userId)) continue;
    seen.add(lead.userId);
    team.push({ id: lead.userId, name: lead.name, email: lead.email, role: 'Project Lead' });
  }
  for (const client of recipients?.clients ?? []) {
    if (seen.has(client.userId)) continue;
    seen.add(client.userId);
    team.push({ id: client.userId, name: client.name, email: client.email, role: 'Client' });
  }

  return {
    summary,
    journey: buildJourney(state, slugOrId),
    documents: documents.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      category: doc.category,
      stepId: doc.stepId,
      sharedWithClient: doc.sharedWithClient,
      createdAt: doc.createdAt,
      sizeBytes: doc.sizeBytes,
    })),
    filings,
    activity: toActivity(auditRows, new Map([[dbId, row.companyName]])),
    team,
    timeline: {
      state,
      schedule: row.schedule ? normalizeEngagementSchedule(row.schedule) : null,
      expectedCoiOn: dayOf(row.expectedCoiOn ?? null),
      incorporationDate: dayOf(row.incorporationDate ?? null),
    },
    enterAs: {
      firm: superFirmViewHref(slugOrId),
      client: '/app/client/overview',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Insights — practice areas, team, risks, growth and reports.
 * ------------------------------------------------------------------ */

/** Audit rows read for "last active" and the admin feed. */
const INSIGHT_AUDIT_LIMIT = 500;

/** Admin actions shown in "What admins did". */
const ADMIN_FEED_LIMIT = 12;

/** Months of history behind Growth and Reports. */
const INSIGHT_MONTHS = 12;

/** The registration phase in `src/data/checklist.ts`. */
const REGISTRATION_PHASE_ID = 'registration-phase-4';

/**
 * Co-lead and co-manager rows, restricted to the engagement ids the engagement scope already
 * approved. The primary pointers (`intern_id`, `manager_id`) are on the engagement row itself.
 */
async function loadMemberships(scopedDbIds: string[]) {
  if (scopedDbIds.length === 0) {
    return { leads: [] as Array<{ engagementId: string; internId: string }>, managers: [] as Array<{ engagementId: string; managerId: string }> };
  }
  const [leads, managers] = await Promise.all([
    db
      .select({ engagementId: engagementLeads.engagementId, internId: engagementLeads.internId })
      .from(engagementLeads)
      .where(inArray(engagementLeads.engagementId, scopedDbIds)),
    db
      .select({ engagementId: engagementManagers.engagementId, managerId: engagementManagers.managerId })
      .from(engagementManagers)
      .where(inArray(engagementManagers.engagementId, scopedDbIds)),
  ]);
  return { leads, managers };
}

/**
 * Filings for Growth, Reports and Risks: everything due from the start of the report window
 * to 90 days ahead, plus every older filing that is still not filed (an overdue filing from
 * last year is still a risk today). Restricted to the approved engagement ids.
 */
async function loadInsightFilings(
  scopedDbIds: string[],
  companyByDbId: Map<string, string>,
  now: Date,
): Promise<SuperInsightFiling[]> {
  if (scopedDbIds.length === 0) return [];

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + SUPER_FILING_HORIZON_DAYS);
  const floor = windowFloor(now, INSIGHT_MONTHS);

  const rows = await db
    .select({
      id: complianceInstances.id,
      engagementId: complianceInstances.engagementId,
      obligationId: complianceInstances.obligationId,
      dueDate: complianceInstances.dueDate,
      filedOn: complianceInstances.filedOn,
      status: complianceInstances.status,
      periodLabel: complianceInstances.periodLabel,
    })
    .from(complianceInstances)
    .where(
      and(
        inArray(complianceInstances.engagementId, scopedDbIds),
        lte(complianceInstances.dueDate, ymd(horizon)),
        or(
          gte(complianceInstances.dueDate, floor),
          and(ne(complianceInstances.status, 'filed'), isNull(complianceInstances.filedOn)),
        ),
      ),
    )
    .orderBy(asc(complianceInstances.dueDate));

  if (rows.length === 0) return [];

  const obligationIds = [...new Set(rows.map((row) => row.obligationId))];
  const obligations = await db
    .select({
      id: complianceObligations.id,
      particular: complianceObligations.particular,
      authority: complianceObligations.authority,
    })
    .from(complianceObligations)
    .where(inArray(complianceObligations.id, obligationIds));
  const byId = new Map(obligations.map((row) => [row.id, row]));

  return rows.map((row) => {
    const obligation = byId.get(row.obligationId);
    const appId = appEngagementId(row.engagementId);
    return {
      id: row.id,
      engagementId: appId,
      companyName: companyByDbId.get(row.engagementId) ?? 'Unknown company',
      title: obligation?.particular?.trim() || row.obligationId,
      authority: obligation?.authority?.trim() || 'Other',
      dueDate: row.dueDate,
      filedOn: row.filedOn ?? null,
      status: row.status,
      periodLabel: row.periodLabel?.trim() || undefined,
      href: superEngagementHref(appId),
    };
  });
}

/** Audit actions that count as an assignment or a reassignment on the admins grids. */
const ASSIGN_ACTIONS = ['engagement.assign_manager', 'engagement.assign_lead', 'task.assigned'];
const REASSIGN_ACTIONS = ['project.manager_changed', 'work.reassigned'];

/** First instant of the current calendar month (UTC), for the "this month" counts. */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * This month's assignments, reassignments and accepted reviews per person. Assignments come
 * from the audit rows the assign routes write; accepted reviews from `engagement_step_events`
 * (`review_status`, migration 0027). Both reads are restricted to the approved engagement ids.
 */
async function loadMonthCounts(scopedDbIds: string[], now: Date) {
  const assigned = new Map<string, number>();
  const reassigned = new Map<string, number>();
  const approvals = new Map<string, number>();
  if (scopedDbIds.length === 0) return { assigned, reassigned, approvals };
  const since = monthStart(now);
  const [auditRows, reviewRows] = await Promise.all([
    db
      .select({ actor: auditEvents.actorUserId, action: auditEvents.action, n: count() })
      .from(auditEvents)
      .where(
        and(
          inArray(auditEvents.engagementId, scopedDbIds),
          inArray(auditEvents.action, [...ASSIGN_ACTIONS, ...REASSIGN_ACTIONS]),
          gte(auditEvents.createdAt, since),
          isNotNull(auditEvents.actorUserId),
        ),
      )
      .groupBy(auditEvents.actorUserId, auditEvents.action),
    db
      .select({ actor: engagementStepEvents.actorId, n: count() })
      .from(engagementStepEvents)
      .where(
        and(
          inArray(engagementStepEvents.engagementId, scopedDbIds),
          eq(engagementStepEvents.reviewStatus, 'accepted'),
          gte(engagementStepEvents.at, since),
          isNotNull(engagementStepEvents.actorId),
        ),
      )
      .groupBy(engagementStepEvents.actorId),
  ]);
  for (const row of auditRows) {
    if (!row.actor) continue;
    const into = REASSIGN_ACTIONS.includes(row.action) ? reassigned : assigned;
    into.set(row.actor, (into.get(row.actor) ?? 0) + Number(row.n));
  }
  for (const row of reviewRows) {
    if (row.actor) approvals.set(row.actor, Number(row.n));
  }
  return { assigned, reassigned, approvals };
}

/**
 * The rows behind the Overview tiles' month-end history: every filing that could be due in
 * the report window of one of the last four month ends, or still unfiled then, with the
 * reopen events since the oldest of them. Restricted to the approved engagement ids.
 */
async function loadFilingHistory(scopedDbIds: string[], now: Date) {
  const periods = pastMonthEnds(now);
  if (scopedDbIds.length === 0) return buildFilingHistory([], [], periods);
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const floor = windowFloor(new Date(`${first.ymd}T00:00:00Z`));
  const [rows, reopenRows] = await Promise.all([
    db
      .select({
        id: complianceInstances.id,
        engagementId: complianceInstances.engagementId,
        dueDate: complianceInstances.dueDate,
        status: complianceInstances.status,
        filedOn: complianceInstances.filedOn,
        createdAt: complianceInstances.createdAt,
      })
      .from(complianceInstances)
      .where(
        and(
          inArray(complianceInstances.engagementId, scopedDbIds),
          lte(complianceInstances.dueDate, last.ymd),
          lt(complianceInstances.createdAt, last.end),
          or(
            gte(complianceInstances.dueDate, floor),
            isNull(complianceInstances.filedOn),
            gte(complianceInstances.filedOn, floor),
          ),
        ),
      ),
    db
      .select({ metadata: auditEvents.metadata, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .where(
        and(
          inArray(auditEvents.engagementId, scopedDbIds),
          eq(auditEvents.action, 'compliance.reopened'),
          gte(auditEvents.createdAt, first.end),
        ),
      ),
  ]);
  const reopens: FilingReopen[] = [];
  for (const row of reopenRows) {
    const m = (row.metadata ?? {}) as { instanceId?: unknown; previousFiledOn?: unknown };
    if (typeof m.instanceId !== 'string') continue;
    reopens.push({
      instanceId: m.instanceId,
      previousFiledOn: typeof m.previousFiledOn === 'string' ? m.previousFiledOn : null,
      at: row.createdAt,
    });
  }
  return buildFilingHistory(rows as FilingHistoryRow[], reopens, periods);
}

/**
 * The certificate date: the engagement column first, then the date the Pre-12 step recorded.
 * Only read once `isIncorporated` (through the summary) says the company exists.
 */
function certificateDateOf(row: EngagementListRow, state: SuperOverviewState): string | null {
  const column = dayOf(row.incorporationDate ?? null);
  if (column) return column;
  const coi = state[CERTIFICATE_OF_INCORPORATION_STEP_ID];
  const responses = (coi?.responses ?? {}) as Record<string, unknown>;
  const answered = typeof responses.dateOfIncorporation === 'string' ? responses.dateOfIncorporation : null;
  return dayOf(answered) ?? dayOf(coi?.completedOn ?? null);
}

/** One registration step's cell: the stored status for "not needed" and "overdue", else the gate. */
function registrationCell(step: SuperJourneyStep, state: SuperOverviewState): SuperRegCell {
  const status = coerceStatusCode(state[step.id]?.status);
  if (status === 'not-applicable') return 'not-needed';
  if (step.kind === 'done') return 'done';
  if (step.kind === 'locked') return 'locked';
  if (status === 'overdue') return 'overdue';
  return step.kind === 'waiting' ? 'waiting' : 'progress';
}

/**
 * The scoped read behind Practice areas, Team, Risks, Growth and Reports.
 *
 * Same doors as the overview: `assertSuperScope` first, then only the role-scoped repository
 * reads (`listEngagements`, `listChecklistIndex`, `listStaffPeople`, `listAuditEvents`), and
 * every direct read here (memberships, compliance rows) is restricted to the engagement ids
 * that scope approved. Nothing here writes.
 */
export async function getSuperFirmInsights(
  ctx: AuthContext,
  now: Date = new Date(),
): Promise<SuperInsights> {
  assertSuperScope(ctx);

  const [rows, checklistIndex, staff] = await Promise.all([
    listEngagements(ctx),
    listChecklistIndex(ctx),
    listStaffPeople(ctx),
  ]);

  const scopedDbIds = rows.map((row) => row.id);
  const companyByDbId = new Map(rows.map((row) => [row.id, row.companyName]));
  const names = nameIndexes(staff);

  const [memberships, filings, auditRows, monthCounts, history] = await Promise.all([
    loadMemberships(scopedDbIds),
    loadInsightFilings(scopedDbIds, companyByDbId, now),
    listAuditEvents(ctx, { limit: INSIGHT_AUDIT_LIMIT }),
    loadMonthCounts(scopedDbIds, now),
    loadFilingHistory(scopedDbIds, now),
  ]);

  const coLeads = new Map<string, string[]>();
  for (const m of memberships.leads) {
    const id = m.internId?.trim();
    if (!id) continue;
    coLeads.set(m.engagementId, [...(coLeads.get(m.engagementId) ?? []), id]);
  }
  const coManagers = new Map<string, string[]>();
  for (const m of memberships.managers) {
    coManagers.set(m.engagementId, [...(coManagers.get(m.engagementId) ?? []), m.managerId]);
  }

  const nextDue = new Map<string, string>();
  for (const filing of filings) {
    if (isFiled(filing)) continue;
    const current = nextDue.get(filing.engagementId);
    if (!current || filing.dueDate < current) nextDue.set(filing.engagementId, filing.dueDate);
  }

  const registrationTypes = getRegistrationPhases()
    .filter((phase) => phase.id === REGISTRATION_PHASE_ID)
    .flatMap((phase) => phase.items.map((item) => ({ id: item.id, title: item.title })));

  const clients: SuperInsightClient[] = rows.map((row) => {
    const appId = appEngagementId(row.id);
    const state = (checklistIndex[appId] ?? {}) as SuperOverviewState;
    const summary = summaryForRow(row, state, names, now);
    const journey = buildJourney(state, row.slug ?? appId);

    const registrations: Record<string, SuperRegCell> = {};
    const overdueSteps: SuperInsightClient['overdueSteps'] = [];
    for (const step of journey) {
      if (step.phaseId === REGISTRATION_PHASE_ID) registrations[step.id] = registrationCell(step, state);
      const status = coerceStatusCode(state[step.id]?.status);
      if (status === 'overdue' && step.kind !== 'done' && step.kind !== 'locked') {
        overdueSteps.push({ id: step.id, title: step.title, href: step.href });
      }
    }

    const startedPreInc = row.stage === 'Pre-Incorporation';
    const certificateDate = summary.incorporated ? certificateDateOf(row, state) : null;
    const startDay = dayOf(summary.createdAt);
    const coiDays =
      startedPreInc && certificateDate && startDay ? daysBetweenDays(startDay, certificateDate) : null;

    const leadIds = [...new Set([summary.leadId, ...(coLeads.get(row.id) ?? [])].filter(Boolean) as string[])];
    const managerIds = [
      ...new Set([summary.managerId, ...(coManagers.get(row.id) ?? [])].filter(Boolean) as string[]),
    ];

    return {
      summary,
      startedPreInc,
      certificateDate,
      daysToCoi: coiDays !== null && coiDays >= 0 ? coiDays : null,
      managerIds,
      leadIds,
      overdueSteps,
      registrations,
      currentStepHref: summary.currentStep
        ? (journey.find((step) => step.id === summary.currentStep?.id)?.href ?? null)
        : null,
      nextDueDate: nextDue.get(appId) ?? null,
      currentStepDue: summary.currentStep
        ? (windowForStep(normalizeEngagementSchedule(row.schedule), summary.currentStep.id)?.to ?? null)
        : null,
    };
  });

  const lastActive = new Map<string, string>();
  const actions30d = new Map<string, number>();
  const monthAgo = now.getTime() - 30 * 86_400_000;
  for (const event of auditRows) {
    const actor = event.actor_user_id;
    if (!actor) continue;
    const prev = lastActive.get(actor);
    if (!prev || event.created_at > prev) lastActive.set(actor, event.created_at);
    if (Date.parse(event.created_at) >= monthAgo) actions30d.set(actor, (actions30d.get(actor) ?? 0) + 1);
  }

  const byEngagement = new Map(clients.map((client) => [client.summary.id, client]));
  const adminFeed = toActivity(
    auditRows.filter((event) => event.actor_role === 'admin' || event.actor_role === 'super_admin'),
    companyByDbId,
  ).slice(0, ADMIN_FEED_LIMIT);

  return {
    generatedAt: now.toISOString(),
    clients: sortByAttention(clients.map((client) => client.summary)).map(
      (summary) => byEngagement.get(summary.id)!,
    ),
    registrationTypes,
    filings,
    months: buildMonths(clients, filings, now, INSIGHT_MONTHS),
    team: buildTeam({
      staff,
      clients,
      filings,
      lastActive,
      actions30d,
      monthCounts,
      isAttention: needsAttention,
      now,
    }),
    adminFeed,
    history,
  };
}
