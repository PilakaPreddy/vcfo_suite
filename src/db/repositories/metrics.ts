import 'server-only';
import { and, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  complianceEvents,
  complianceInstances,
  complianceObligations,
  engagementLeads,
  engagementManagers,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { coerceStatusCode, getItem, getRegistrationPhases } from '@/data/checklist';
import { CERTIFICATE_OF_INCORPORATION_STEP_ID } from '@/lib/compliance/incorporation-state';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { normalizeEngagementSchedule, windowForStep } from '@/lib/projects/schedule-windows';
import {
  buildJourney,
  summarizeEngagement,
  type SuperOverviewState,
} from '@/lib/super/super-overview';
import { listChecklistIndex, listEngagements, type EngagementListRow } from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { getTimingIndex, incorporationStages } from '@/db/repositories/step-events';
import { stageAverages, stepTimeRows } from '@/lib/metrics/step-timing';
import { windowStart } from '@/lib/metrics/filing-metrics';
import {
  buildAnalyticsMetrics,
  buildPeopleMetrics,
  buildPracticeMetrics,
  type AnalyticsMetrics,
  type MetricClient,
  type MetricFiling,
  type MetricPerson,
  type PersonMetrics,
  type PracticeMetrics,
  type RegistrationCell,
} from '@/lib/metrics/practice-metrics';

/**
 * METRICS REPOSITORY — practice cards, the managers and leads grids, and Analytics
 * (G-13, G-14, G-27, G-29).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * No unscoped branch is written here. Engagements come from `listEngagements(ctx)` and
 * `listChecklistIndex(ctx)` (firm-wide only for `isFirmWideAdmin`), step events from
 * `getTimingIndex(ctx)` (same scope), and every direct read below (memberships, filings,
 * profiles) is restricted to the engagement ids that scope returned.
 *
 *   practice, analytics — staff (super admin, admin, manager, project lead), each over their
 *                         own engagement scope. Clients and developers get null.
 *   people              — admin and super admin: every manager and project lead. Manager:
 *                         themselves and the leads who report to them, counted over the
 *                         manager's own engagements. Everyone else: nothing.
 *   capacity write      — admin and super admin only, on a manager or project lead, with an
 *                         audit event.
 */

const REGISTRATION_PHASE_ID = 'registration-phase-4';
const FILING_HORIZON_DAYS = 90;
/** History behind on-time figures and Analytics. */
const HISTORY_MONTHS = 12;

function isStaff(ctx: AuthContext): boolean {
  return isAdminOrManager(ctx.role) || ctx.role === 'intern';
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayOf(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : ymd(parsed);
}

/** The certificate date: the engagement column first, then what the Pre-12 step recorded. */
function certificateDateOf(row: EngagementListRow, state: SuperOverviewState): string | null {
  const column = dayOf(row.incorporationDate ?? null);
  if (column) return column;
  const coi = state[CERTIFICATE_OF_INCORPORATION_STEP_ID];
  const responses = (coi?.responses ?? {}) as Record<string, unknown>;
  const answered = typeof responses.dateOfIncorporation === 'string' ? responses.dateOfIncorporation : null;
  return dayOf(answered) ?? dayOf(coi?.completedOn ?? null);
}

async function loadMemberships(dbIds: string[]) {
  if (dbIds.length === 0) return { leads: [], managers: [] };
  const [leads, managers] = await Promise.all([
    db
      .select({ engagementId: engagementLeads.engagementId, internId: engagementLeads.internId })
      .from(engagementLeads)
      .where(inArray(engagementLeads.engagementId, dbIds)),
    db
      .select({ engagementId: engagementManagers.engagementId, managerId: engagementManagers.managerId })
      .from(engagementManagers)
      .where(inArray(engagementManagers.engagementId, dbIds)),
  ]);
  return { leads, managers };
}

/**
 * Filings on the approved engagements: due from `floor` to 90 days ahead, plus anything older
 * that is still not filed. Statutory filings (`compliance_instances`, with their authority) and
 * event-driven filings (`compliance_events`) both count.
 */
async function loadFilings(dbIds: string[], floor: string, now: Date): Promise<MetricFiling[]> {
  if (dbIds.length === 0) return [];
  const horizon = ymd(new Date(now.getTime() + FILING_HORIZON_DAYS * 86_400_000));
  const [instances, events] = await Promise.all([
    db
      .select({
        engagementId: complianceInstances.engagementId,
        dueDate: complianceInstances.dueDate,
        filedOn: complianceInstances.filedOn,
        status: complianceInstances.status,
        authority: complianceObligations.authority,
      })
      .from(complianceInstances)
      .leftJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
      .where(
        and(
          inArray(complianceInstances.engagementId, dbIds),
          lte(complianceInstances.dueDate, horizon),
          or(
            gte(complianceInstances.dueDate, floor),
            gte(complianceInstances.filedOn, floor),
            and(ne(complianceInstances.status, 'filed'), isNull(complianceInstances.filedOn)),
          ),
        ),
      ),
    db
      .select({
        engagementId: complianceEvents.engagementId,
        dueDate: complianceEvents.dueDate,
        filedOn: complianceEvents.filedOn,
        status: complianceEvents.status,
      })
      .from(complianceEvents)
      .where(
        and(
          inArray(complianceEvents.engagementId, dbIds),
          lte(complianceEvents.dueDate, horizon),
          or(
            gte(complianceEvents.dueDate, floor),
            gte(complianceEvents.filedOn, floor),
            and(ne(complianceEvents.status, 'filed'), isNull(complianceEvents.filedOn)),
          ),
        ),
      ),
  ]);
  return [
    ...instances.map((r) => ({
      engagementId: appEngagementId(r.engagementId),
      dueDate: r.dueDate,
      filedOn: r.filedOn ?? null,
      status: r.status,
      authority: r.authority?.trim() || null,
    })),
    ...events.map((r) => ({
      engagementId: appEngagementId(r.engagementId),
      dueDate: r.dueDate,
      filedOn: r.filedOn ?? null,
      status: r.status,
      authority: null,
    })),
  ];
}

/** Display names for the manager profile ids and lead intern ids on the scoped engagements. */
async function loadNames(managerIds: string[], internIds: string[]) {
  const byProfileId = new Map<string, string>();
  const byInternId = new Map<string, string>();
  if (managerIds.length === 0 && internIds.length === 0) return { byProfileId, byInternId };
  const conds = [];
  if (managerIds.length) conds.push(inArray(profiles.id, managerIds));
  if (internIds.length) conds.push(inArray(profiles.internId, internIds));
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, internId: profiles.internId })
    .from(profiles)
    .where(or(...conds));
  for (const row of rows) {
    const name = row.name?.trim() || row.email;
    byProfileId.set(row.id, name);
    if (row.internId?.trim()) byInternId.set(row.internId.trim(), name);
  }
  return { byProfileId, byInternId };
}

function registrationCell(kind: string, status: string): RegistrationCell {
  if (status === 'not-applicable') return 'not-needed';
  if (kind === 'done') return 'done';
  if (kind === 'locked') return 'locked';
  if (status === 'overdue') return 'overdue';
  return kind === 'waiting' ? 'waiting' : 'progress';
}

/** One cell per registration step of an engagement. */
export function registrationCells(state: Parameters<typeof buildJourney>[0], key: string): Record<string, RegistrationCell> {
  const cells: Record<string, RegistrationCell> = {};
  for (const step of buildJourney(state, key)) {
    if (step.phaseId !== REGISTRATION_PHASE_ID) continue;
    cells[step.id] = registrationCell(step.kind, coerceStatusCode(state[step.id]?.status));
  }
  return cells;
}

interface Gathered {
  clients: MetricClient[];
  filings: MetricFiling[];
  timings: Awaited<ReturnType<typeof getTimingIndex>>;
}

/** The scoped rows every metric is built from. */
async function gather(ctx: AuthContext, now: Date): Promise<Gathered> {
  const [rows, checklistIndex] = await Promise.all([listEngagements(ctx), listChecklistIndex(ctx)]);
  const dbIds = rows.map((row) => row.id);
  const appIds = rows.map((row) => appEngagementId(row.id));
  const floor = windowStart(now, HISTORY_MONTHS + 1);

  const [memberships, filings, timings] = await Promise.all([
    loadMemberships(dbIds),
    loadFilings(dbIds, floor, now),
    appIds.length ? getTimingIndex(ctx, { engagementIds: appIds }, now) : Promise.resolve(new Map()),
  ]);

  const coLeads = new Map<string, string[]>();
  for (const m of memberships.leads) {
    if (!m.internId?.trim()) continue;
    coLeads.set(m.engagementId, [...(coLeads.get(m.engagementId) ?? []), m.internId.trim()]);
  }
  const coManagers = new Map<string, string[]>();
  for (const m of memberships.managers) {
    coManagers.set(m.engagementId, [...(coManagers.get(m.engagementId) ?? []), m.managerId]);
  }

  const managerIdsOf = (row: EngagementListRow) =>
    [...new Set([row.managerId ?? row.adminId ?? null, ...(coManagers.get(row.id) ?? [])].filter(Boolean) as string[])];
  const leadIdsOf = (row: EngagementListRow) =>
    [...new Set([row.internId?.trim() || null, ...(coLeads.get(row.id) ?? [])].filter(Boolean) as string[])];

  const names = await loadNames(
    [...new Set(rows.flatMap(managerIdsOf))],
    [...new Set(rows.flatMap(leadIdsOf))],
  );

  const clients: MetricClient[] = rows.map((row) => {
    const appId = appEngagementId(row.id);
    const state = (checklistIndex[appId] ?? {}) as SuperOverviewState;
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
    const registrations = registrationCells(state, row.slug ?? appId);
    const schedule = normalizeEngagementSchedule(row.schedule);
    return {
      id: appId,
      slug: row.slug ?? null,
      companyName: row.companyName,
      managerName: summary.managerName,
      incorporated: summary.incorporated,
      startedPreInc: row.stage === 'Pre-Incorporation',
      createdAt: summary.createdAt,
      certificateDate: summary.incorporated ? certificateDateOf(row, state) : null,
      expectedCoiOn: dayOf(row.expectedCoiOn ?? null),
      phases: summary.phases.map((p) => ({ id: p.id, label: p.label, done: p.done, total: p.total })),
      currentStep: summary.currentStep ? { id: summary.currentStep.id, title: summary.currentStep.title } : null,
      openSteps: summary.ballInCourt.firm + summary.ballInCourt.client,
      registrations,
      windowEnd: (stepId: string) => windowForStep(schedule, stepId)?.to ?? null,
      managerIds: managerIdsOf(row),
      leadIds: leadIdsOf(row),
    };
  });

  return { clients, filings, timings };
}

function stageDaysFor(gathered: Gathered, clients: MetricClient[], now: Date) {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - HISTORY_MONTHS);
  const labels = Object.fromEntries((clients[0]?.phases ?? []).map((p) => [p.id, p.label]));
  return stageAverages({ phases: incorporationStages(labels), timings: gathered.timings, since, now });
}

/** Practice cards: stage splits, stage days, expected certificates, registrations, filings. */
export async function getPracticeMetrics(
  ctx: AuthContext,
  now: Date = new Date(),
): Promise<PracticeMetrics | null> {
  if (!isStaff(ctx)) return null;
  const gathered = await gather(ctx, now);
  const registrationTypes = getRegistrationPhases()
    .filter((phase) => phase.id === REGISTRATION_PHASE_ID)
    .flatMap((phase) => phase.items.map((item) => ({ id: item.id, title: item.title })));
  return buildPracticeMetrics({
    clients: gathered.clients,
    filings: gathered.filings,
    timings: gathered.timings,
    stageDays: stageDaysFor(gathered, gathered.clients, now),
    registrationTypes,
    now,
  });
}

/** Analytics: monthly filings, on-time share, time in step and stage days. */
export async function getAnalyticsMetrics(
  ctx: AuthContext,
  options: { months?: number } = {},
  now: Date = new Date(),
): Promise<AnalyticsMetrics | null> {
  if (!isStaff(ctx)) return null;
  const months = Math.min(Math.max(options.months ?? 6, 1), HISTORY_MONTHS);
  const gathered = await gather(ctx, now);
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - months);
  const stepIds = incorporationStages().flatMap((stage) => stage.stepIds);
  return buildAnalyticsMetrics({
    clients: gathered.clients,
    filings: gathered.filings,
    stepRows: stepTimeRows({ stepIds, timings: gathered.timings, since }),
    stepTitle: (stepId) => getItem(stepId)?.title ?? stepId,
    stageDays: stageDaysFor(gathered, gathered.clients, now),
    months,
    now,
  });
}

/** Managers and project leads the caller may see, with capacity and last seen. */
async function loadPeople(ctx: AuthContext): Promise<MetricPerson[]> {
  const columns = {
    id: profiles.id,
    name: profiles.name,
    email: profiles.email,
    role: profiles.role,
    internId: profiles.internId,
    capacity: profiles.capacity,
    lastSeenAt: profiles.lastSeenAt,
  };
  const staffRoles = inArray(profiles.role, ['manager', 'intern']);
  const active = eq(profiles.status, 'active');
  let rows: Array<{ id: string; name: string | null; email: string; role: string; internId: string | null; capacity: number | null; lastSeenAt: Date | null }>;
  if (isFirmWideAdmin(ctx.role)) {
    rows = await db.select(columns).from(profiles).where(and(staffRoles, active));
  } else if (ctx.role === 'manager') {
    rows = await db
      .select(columns)
      .from(profiles)
      .where(and(staffRoles, active, or(eq(profiles.id, ctx.userId), eq(profiles.reportsToManagerId, ctx.userId))));
  } else {
    return [];
  }
  return rows.map((row) => ({
    profileId: row.id,
    internId: row.internId?.trim() || null,
    role: row.role === 'manager' ? 'manager' : 'intern',
    name: row.name?.trim() || row.email,
    capacity: row.capacity ?? null,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
  }));
}

/** On time %, load against capacity and last active for each manager and lead in scope. */
export async function getPeopleMetrics(
  ctx: AuthContext,
  now: Date = new Date(),
): Promise<PersonMetrics[]> {
  if (!isFirmWideAdmin(ctx.role) && ctx.role !== 'manager') return [];
  const people = await loadPeople(ctx);
  if (people.length === 0) return [];
  const gathered = await gather(ctx, now);
  return buildPeopleMetrics({ people, clients: gathered.clients, filings: gathered.filings, now });
}

export const MAX_CAPACITY = 500;

/** Set or clear (null) how many open items a manager or project lead can carry. */
export async function setPersonCapacity(
  ctx: AuthContext,
  profileId: string,
  capacity: number | null,
): Promise<{ profileId: string; capacity: number | null }> {
  if (!isFirmWideAdmin(ctx.role)) {
    // The refusal is itself audited (G-28): who tried, on whom, with result "denied".
    void recordAuditEvent(ctx, {
      action: 'people.capacity_set',
      summary: 'Capacity change refused',
      metadata: { profileId, after: capacity },
      result: 'denied',
    });
    throw new Error('Only an admin may set capacity');
  }
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY)) {
    throw new Error('invalid_capacity');
  }
  const [target] = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role, capacity: profiles.capacity })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!target || (target.role !== 'manager' && target.role !== 'intern')) {
    throw new Error('Person not found');
  }
  await db.update(profiles).set({ capacity, updatedAt: new Date() }).where(eq(profiles.id, profileId));
  const name = target.name?.trim() || target.email;
  void recordAuditEvent(ctx, {
    action: capacity === null ? 'people.capacity_cleared' : 'people.capacity_set',
    summary: capacity === null ? `Capacity cleared for ${name}` : `Capacity for ${name} set to ${capacity} open items`,
    metadata: { profileId, before: target.capacity ?? null, after: capacity },
  });
  return { profileId, capacity };
}
