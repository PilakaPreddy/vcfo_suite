import 'server-only';
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lt, lte, min, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditEvents,
  clientNeedMeta,
  complianceInstances,
  documentRequestFiles,
  documentRequests,
  emailSendLog,
  engagementStepEvents,
  engagements,
  notificationDeliveries,
  tasks,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import {
  assertEngagementAccess,
  checklistStateForViewer,
  checklistStateFromRow,
  getMyEngagement,
  listScopedEngagementIds,
} from '@/db/repositories/engagements';
import { getReviewStatus } from '@/lib/checklist/checklist-item-review';
import { primaryPhaseItems } from '@/lib/projects/project-stuck';
import { isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';
import {
  awaitingApprovalAsOf,
  doneOnDayAsOf,
  indexStepEvents,
  type ReviewStepNow,
  type StepHistoryEvent,
} from '@/lib/metrics/staff-home-trends';
import { assertDeveloper } from '@/db/repositories/dev-scope';
import { getHomeTileStampDays } from '@/db/repositories/home-tile-stamps';
import type { StampHome } from '@/lib/metrics/home-tile-stamps';
import {
  clientTilesAsOf,
  type ClientRequestHistoryRow,
  type StepStatusHistoryEvent,
} from '@/lib/metrics/client-home-history';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';
import {
  addDaysYmd,
  engagementLiveAt,
  fyStartOfYmd,
  messagesFailedAsOf,
  pastDays,
  pastMonthEnds,
  rollingDaySum,
  superFilingsDueAsOf,
  trailingKnown,
  withSnapshots,
  type EngagementDeleteEvent,
  type FilingHistoryRow,
  type FilingReopen,
  type HomeTrendHome,
  type HomeTrends,
  type TrendPeriod,
} from '@/lib/metrics/home-trends';

/**
 * HOME TRENDS REPOSITORY — the past values behind the home card trend lines (R-18, C-0122).
 *
 * A series is returned only where the stored rows say what the tile showed at the end of each
 * past period (the pure rules are in `src/lib/metrics/home-trends.ts`). Tiles whose past
 * cannot be known get no series and draw no line.
 *
 * WINDOW (owner item B2, 2026-10-31): every daily home (client, lead, manager, admin, dev)
 * covers the 30 India days before today, one point per day (`TREND_DAYS`). Each metric is one
 * scoped query for the whole window, never one query per day. The super admin home keeps its
 * four month ends, because its tiles show the change against last month. On the lead, manager
 * and admin homes a day the person's home stamped (`kpi_snapshots`, `home-tile-stamps.ts`)
 * uses the stamped value, and a stamp wins over the rebuilt value of the same day. What each
 * home gets:
 *
 *   super   clients      engagements that existed and were not deleted at each month end
 *                        (created_at, deleted_at, and the project.deleted / project.restored
 *                        audit events for projects deleted and later restored)
 *           filingsDue   filings not filed and due by 30 days after each month end, from
 *                        due_date, filed_on, created_at and the compliance.reopened events
 *   dev     messagesFailed  email and WhatsApp rows written in the 24 hours before each day
 *                        end that had failed by then (status, created_at, updated_at)
 *           denied       audit events with result "denied" in the 7 days before each day end
 *   client  every tile of the five fixed tiles (owner item B2): waiting, overdue (+
 *           filingsOverdue after the COI), withSbc, docsIn, stepsDone, regs and dueSoon.
 *           The checklist state of each past day is rebuilt by undoing the later step
 *           events; requests close at `closed_at` or their first uploaded file; filings
 *           read their due and filed dates (`src/lib/metrics/client-home-history.ts`).
 *           A day before the engagement was created is unknown, so a young engagement's
 *           line starts on its creation day. No `kpi_snapshots` row is ever written for a
 *           client tile (only staff homes stamp), so the rebuild alone draws these lines.
 *   lead    doneToday    steps completed that day (status events), tasks whose
 *                        `completed_at` falls in it, filings due that day and filed by its end
 *   manager approvals    steps awaiting a manager decision at each day end, rebuilt from the
 *                        `review_status` of the step events (migration 0027)
 *   admin   awaitingApproval  the same count, firm-wide
 *   The pure rules for these three are in `src/lib/metrics/staff-home-trends.ts`. Each starts
 *   on the first day its history covers, so a new install draws no line for a few days.
 *
 * Staff tiles with no line and why: lead Needs action, Overdue, Waiting on clients and Due this
 * week, and manager Overdue, Waiting on clients and Due this week (they mix step windows,
 * filing windows and request states, and window edits keep no history); manager Active
 * projects and admin Clients, Incorporating, In compliance and Stuck (the project stage and
 * the stuck reason keep no history).
 *
 * Tiles with no line and why: developer Jobs failed (the Inngest list is capped, so older days
 * would be short), Services working and Outlook mailboxes (only the current state is kept);
 * super admin Need attention and Awaiting review (step states).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   super  — firm-wide admins only (`isFirmWideAdmin`), like the super admin overview.
 *   dev    — developer or super admin (`assertDeveloper`); counts only, nothing names a client.
 *   client — the caller's own engagement (`getMyEngagement`), or an engagement id that
 *            `assertEngagementAccess` approves; anything else reads as no trends.
 *   lead    — project leads only; their engagements (`listScopedEngagementIds`) and the tasks
 *             assigned to them.
 *   manager — managers and firm admins (`isAdminOrManager`); their engagements
 *             (`listScopedEngagementIds`, firm-wide for admins).
 *   admin   — firm-wide admins only (`isFirmWideAdmin`); every engagement not deleted.
 * Nothing here writes.
 */

export class HomeTrendsError extends Error {
  constructor(
    message: string,
    readonly status: 403,
  ) {
    super(message);
  }
}

const DAY_MS = 86_400_000;

export interface HomeTrendsOptions {
  /** Client home: the engagement shown (staff preview). Clients default to their own. */
  engagementId?: string;
  now?: Date;
}

export async function getHomeTrends(ctx: AuthContext, home: HomeTrendHome, opts: HomeTrendsOptions = {}): Promise<HomeTrends> {
  const now = opts.now ?? new Date();
  switch (home) {
    case 'lead':
      if (ctx.role !== 'intern') throw new HomeTrendsError('Only project leads have this home', 403);
      return withStampedDays(ctx, 'lead', now, leadTrends(ctx, now));
    case 'manager':
      if (!isAdminOrManager(ctx.role)) throw new HomeTrendsError('Only managers and admins have this home', 403);
      return withStampedDays(ctx, 'manager', now, (async () => approvalTrends(await listScopedEngagementIds(ctx), 'approvals', now))());
    case 'admin':
      if (!isFirmWideAdmin(ctx.role)) throw new HomeTrendsError('Only firm admins have this home', 403);
      return withStampedDays(ctx, 'admin', now, approvalTrends(null, 'awaitingApproval', now));
    case 'super':
      if (!isFirmWideAdmin(ctx.role)) throw new HomeTrendsError('Only firm-wide admins have this home', 403);
      return superTrends(now);
    case 'dev':
      try {
        assertDeveloper(ctx);
      } catch {
        throw new HomeTrendsError('Only developers have this home', 403);
      }
      return devTrends(now);
    case 'client':
      return clientTrends(ctx, opts.engagementId, now);
  }
}

/** Drops empty series, so a tile without history simply has no key. */
function keep(series: Record<string, number[]>): HomeTrends {
  return Object.fromEntries(Object.entries(series).filter(([, v]) => v.length > 0));
}

/** Rebuilt values per day (`null` = cannot be known), one array per tile, aligned with `periods`. */
interface DailyRebuild {
  periods: TrendPeriod[];
  days: Record<string, Array<number | null>>;
}

/**
 * A staff home's series: the rebuilt days with the person's stamped days laid over them (a
 * stamp wins for its day), then the known run that reaches yesterday. The stamp read (one
 * query) runs beside the rebuild.
 */
async function withStampedDays(ctx: AuthContext, home: StampHome, now: Date, rebuild: Promise<DailyRebuild>): Promise<HomeTrends> {
  const [rebuilt, stamps] = await Promise.all([rebuild, getHomeTileStampDays(ctx, home, now)]);
  const keys = new Set([...Object.keys(rebuilt.days), ...Object.keys(stamps)]);
  const out: Record<string, number[]> = {};
  for (const key of keys) out[key] = trailingKnown(withSnapshots(rebuilt.periods, rebuilt.days[key], stamps[key]));
  return keep(out);
}

function reopensFrom(rows: Array<{ metadata: unknown; createdAt: Date }>): FilingReopen[] {
  const out: FilingReopen[] = [];
  for (const row of rows) {
    const m = (row.metadata ?? {}) as { instanceId?: unknown; previousFiledOn?: unknown };
    if (typeof m.instanceId !== 'string') continue;
    out.push({
      instanceId: m.instanceId,
      previousFiledOn: typeof m.previousFiledOn === 'string' ? m.previousFiledOn : null,
      at: row.createdAt,
    });
  }
  return out;
}

const filingColumns = {
  id: complianceInstances.id,
  engagementId: complianceInstances.engagementId,
  dueDate: complianceInstances.dueDate,
  status: complianceInstances.status,
  filedOn: complianceInstances.filedOn,
  createdAt: complianceInstances.createdAt,
};

/* ------------------------------------------------------------------ super admin */

async function superTrends(now: Date): Promise<HomeTrends> {
  const periods = pastMonthEnds(now);
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;

  const [engRows, deleteRows, filingRows, reopenRows] = await Promise.all([
    // Firm-wide on purpose (the caller is a firm-wide admin), deleted rows included: a project
    // deleted this month still counted at the end of last month.
    db
      .select({ id: engagements.id, createdAt: engagements.createdAt, deletedAt: engagements.deletedAt })
      .from(engagements)
      .where(lt(engagements.createdAt, last.end)),
    db
      .select({ engagementId: auditEvents.engagementId, action: auditEvents.action, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .where(and(inArray(auditEvents.action, ['project.deleted', 'project.restored']), lt(auditEvents.createdAt, last.end))),
    db
      .select(filingColumns)
      .from(complianceInstances)
      .where(
        and(
          gte(complianceInstances.dueDate, new Date(first.end.getTime() - 90 * DAY_MS).toISOString().slice(0, 10)),
          lte(complianceInstances.dueDate, new Date(last.end.getTime() + 31 * DAY_MS).toISOString().slice(0, 10)),
          lt(complianceInstances.createdAt, last.end),
        ),
      ),
    db
      .select({ metadata: auditEvents.metadata, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'compliance.reopened'), gte(auditEvents.createdAt, first.end))),
  ]);

  const events: EngagementDeleteEvent[] = deleteRows
    .filter((r): r is typeof r & { engagementId: string } => Boolean(r.engagementId))
    .map((r) => ({ engagementId: r.engagementId, action: r.action as EngagementDeleteEvent['action'], at: r.createdAt }));
  const reopens = reopensFrom(reopenRows);
  const filings = filingRows as FilingHistoryRow[];

  const liveSets = periods.map((p) => new Set(engRows.filter((r) => engagementLiveAt(r, events, p)).map((r) => r.id)));
  return keep({
    clients: liveSets.map((s) => s.size),
    filingsDue: trailingKnown(periods.map((p, i) => superFilingsDueAsOf(filings, reopens, p, liveSets[i]!))),
  });
}

/* ------------------------------------------------------------------ staff: lead, manager, admin */

const stepEventColumns = {
  engagementId: engagementStepEvents.engagementId,
  stepId: engagementStepEvents.stepId,
  fromStatus: engagementStepEvents.fromStatus,
  toStatus: engagementStepEvents.toStatus,
  reviewStatus: engagementStepEvents.reviewStatus,
  at: engagementStepEvents.at,
};

/** The steps the approvals tiles count: primary-phase steps outside the direct flow. */
function approvalStepIds(): string[] {
  return primaryPhaseItems()
    .map((item) => item.id)
    .filter((id) => !isDirectFlowStep(id));
}

/**
 * Manager "Needs your approval" (`ids` = the manager's engagements) and admin "Awaiting
 * approval" (`ids` = null, every engagement not deleted), per past day end.
 */
async function approvalTrends(ids: string[] | null, key: 'approvals' | 'awaitingApproval', now: Date): Promise<DailyRebuild> {
  const periods = pastDays(now);
  if (ids && ids.length === 0) return { periods, days: {} };
  const first = periods[0]!;
  const stepIds = approvalStepIds();

  const [sinceRows, engRows, eventRows] = await Promise.all([
    // The first event that carries a review state: review history starts there.
    db.select({ at: min(engagementStepEvents.at) }).from(engagementStepEvents).where(isNotNull(engagementStepEvents.reviewStatus)),
    db
      .select({ id: engagements.id, createdAt: engagements.createdAt, checklistState: engagements.checklistState })
      .from(engagements)
      .where(ids ? and(inArray(engagements.id, ids), isNull(engagements.deletedAt)) : isNull(engagements.deletedAt)),
    db
      .select(stepEventColumns)
      .from(engagementStepEvents)
      .where(
        and(
          ...(ids ? [inArray(engagementStepEvents.engagementId, ids)] : []),
          inArray(engagementStepEvents.stepId, stepIds),
          gte(engagementStepEvents.at, new Date(first.end.getTime() - 60 * DAY_MS)),
        ),
      )
      .orderBy(asc(engagementStepEvents.at)),
  ]);

  const reviewSince = sinceRows[0]?.at ?? null;
  const steps: ReviewStepNow[] = [];
  const createdAt = new Map<string, Date>();
  for (const row of engRows) {
    createdAt.set(row.id, row.createdAt);
    const state = (row.checklistState ?? {}) as Record<string, unknown>;
    for (const stepId of stepIds) {
      const slice = state[stepId];
      const reviewNow = slice && typeof slice === 'object' ? getReviewStatus(slice as Parameters<typeof getReviewStatus>[0]) : null;
      steps.push({ engagementId: row.id, stepId, reviewNow });
    }
  }
  const events = indexStepEvents(eventRows as StepHistoryEvent[]);
  return {
    periods,
    days: { [key]: periods.map((period) => awaitingApprovalAsOf({ steps, events, engagementCreatedAt: createdAt, period, reviewSince })) },
  };
}

/** Lead "Done today" per past day: their engagements, and the tasks assigned to them. */
async function leadTrends(ctx: AuthContext, now: Date): Promise<DailyRebuild> {
  const ids = await listScopedEngagementIds(ctx);
  const periods = pastDays(now);
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const since = new Date(first.end.getTime() - DAY_MS);

  const [sinceRows, eventRows, taskRows, filingRows, reopenRows] = await Promise.all([
    // The first recorded step event: status history starts there.
    db.select({ at: min(engagementStepEvents.at) }).from(engagementStepEvents),
    ids.length
      ? db
          .select(stepEventColumns)
          .from(engagementStepEvents)
          .where(and(inArray(engagementStepEvents.engagementId, ids), gte(engagementStepEvents.at, new Date(since.getTime() - 60 * DAY_MS))))
          .orderBy(asc(engagementStepEvents.at))
      : Promise.resolve([]),
    // Assigned tasks only, as the lead's Work list shows them: a task tied to a step, and a
    // personal to-do (step id "todo:…", no engagement), are left out.
    db
      .select({ status: tasks.status, completedAt: tasks.completedAt, updatedAt: tasks.updatedAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, ctx.userId),
          isNotNull(tasks.engagementId),
          or(isNull(tasks.stepId), eq(tasks.stepId, '')),
          or(gte(tasks.updatedAt, since), gte(tasks.completedAt, since)),
        ),
      ),
    ids.length
      ? db
          .select(filingColumns)
          .from(complianceInstances)
          .where(
            and(
              inArray(complianceInstances.engagementId, ids),
              gte(complianceInstances.dueDate, first.ymd),
              lte(complianceInstances.dueDate, last.ymd),
            ),
          )
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ metadata: auditEvents.metadata, createdAt: auditEvents.createdAt })
          .from(auditEvents)
          .where(
            and(
              inArray(auditEvents.engagementId, ids),
              eq(auditEvents.action, 'compliance.reopened'),
              gte(auditEvents.createdAt, first.end),
            ),
          )
      : Promise.resolve([]),
  ]);

  const statusSince = sinceRows[0]?.at ?? null;
  const stepEvents = indexStepEvents(eventRows as StepHistoryEvent[]);
  const filings = filingRows as FilingHistoryRow[];
  const reopens = reopensFrom(reopenRows);
  return {
    periods,
    days: { doneToday: periods.map((period) => doneOnDayAsOf({ period, stepEvents, statusSince, tasks: taskRows, filings, reopens })) },
  };
}

/* ------------------------------------------------------------------ developer */

/** The India calendar day of an audit event, `YYYY-MM-DD`. */
const deniedDay = sql<string>`to_char(${auditEvents.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`;

async function devTrends(now: Date): Promise<HomeTrends> {
  const periods = pastDays(now);
  const since = new Date(periods[0]!.end.getTime() - DAY_MS);
  const until = periods[periods.length - 1]!.end;

  const [deliveries, emails, deniedRows] = await Promise.all([
    db
      .select({ createdAt: notificationDeliveries.createdAt, updatedAt: notificationDeliveries.updatedAt })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, 'failed'),
          gte(notificationDeliveries.createdAt, since),
          lt(notificationDeliveries.createdAt, until),
        ),
      ),
    db
      .select({ createdAt: emailSendLog.createdAt, updatedAt: emailSendLog.updatedAt })
      .from(emailSendLog)
      .where(and(eq(emailSendLog.status, 'failed'), gte(emailSendLog.createdAt, since), lt(emailSendLog.createdAt, until))),
    // Denied events per India day over the window and the 7 days before it: one query, then
    // each day end sums its own 7 days (`rollingDaySum`).
    db
      .select({ day: deniedDay, n: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.result, 'denied'),
          gte(auditEvents.createdAt, new Date(periods[0]!.end.getTime() - 7 * DAY_MS)),
          lt(auditEvents.createdAt, until),
        ),
      )
      .groupBy(deniedDay),
  ]);

  const failed = [...deliveries, ...emails];
  const byDay = new Map(deniedRows.map((r) => [String(r.day), Number(r.n) || 0]));
  return keep({
    messagesFailed: periods.map((p) => messagesFailedAsOf(failed, p)),
    denied: rollingDaySum(byDay, periods, 7),
  });
}

/* ------------------------------------------------------------------ client */

async function clientTrends(ctx: AuthContext, engagementId: string | undefined, now: Date): Promise<HomeTrends> {
  if (ctx.role === 'developer' || ctx.role === 'partner') return {};
  let id = engagementId?.trim();
  if (!id) {
    const mine = await getMyEngagement(ctx);
    if (!mine) return {};
    id = mine.id;
  }
  const access = await assertEngagementAccess(ctx, id);
  if (!access.ok) return {};
  const dbId = access.dbId;

  const periods = pastDays(now);
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const [filingRows, reopenRows, requestRows, uploadRows, eventRows] = await Promise.all([
    db
      .select(filingColumns)
      .from(complianceInstances)
      .where(
        and(
          eq(complianceInstances.engagementId, dbId),
          gte(complianceInstances.dueDate, `${fyStartOfYmd(first.ymd)}-04-01`),
          lte(complianceInstances.dueDate, addDaysYmd(last.ymd, 15)),
          lt(complianceInstances.createdAt, last.end),
        ),
      ),
    db
      .select({ metadata: auditEvents.metadata, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.engagementId, dbId),
          eq(auditEvents.action, 'compliance.reopened'),
          gte(auditEvents.createdAt, first.end),
        ),
      ),
    // Every request of the engagement made before the last day end, with its need details.
    db
      .select({
        id: documentRequests.id,
        status: documentRequests.status,
        closedAt: documentRequests.closedAt,
        createdAt: documentRequests.createdAt,
        kind: clientNeedMeta.kind,
        dueDate: clientNeedMeta.dueDate,
        stepId: clientNeedMeta.stepId,
        complianceInstanceId: clientNeedMeta.complianceInstanceId,
      })
      .from(documentRequests)
      .leftJoin(clientNeedMeta, eq(clientNeedMeta.requestId, documentRequests.id))
      .where(and(eq(documentRequests.engagementId, dbId), lt(documentRequests.createdAt, last.end))),
    // The first file of each request: the close time of a request answered before closed_at existed.
    db
      .select({ requestId: documentRequestFiles.requestId, at: min(documentRequestFiles.uploadedAt) })
      .from(documentRequestFiles)
      .where(eq(documentRequestFiles.engagementId, dbId))
      .groupBy(documentRequestFiles.requestId),
    // Every step change since the first day end: undone to rebuild the state of each past day.
    db
      .select({
        stepId: engagementStepEvents.stepId,
        fromStatus: engagementStepEvents.fromStatus,
        toStatus: engagementStepEvents.toStatus,
        reviewStatus: engagementStepEvents.reviewStatus,
        at: engagementStepEvents.at,
      })
      .from(engagementStepEvents)
      .where(and(eq(engagementStepEvents.engagementId, dbId), gte(engagementStepEvents.at, new Date(first.end.getTime() - 60 * DAY_MS))))
      .orderBy(asc(engagementStepEvents.at)),
  ]);

  const filings = filingRows as FilingHistoryRow[];
  const reopens = reopensFrom(reopenRows);
  const firstUpload = new Map(uploadRows.map((r) => [r.requestId, r.at ? new Date(r.at) : null]));
  const requests: ClientRequestHistoryRow[] = requestRows.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    closedAt: r.closedAt ?? null,
    firstUploadAt: firstUpload.get(r.id) ?? null,
    kind: r.kind ?? null,
    dueDate: r.dueDate ?? null,
    stepId: r.stepId ?? null,
    complianceInstanceId: r.complianceInstanceId ?? null,
  }));
  const row = access.row as { createdAt?: Date | null; schedule?: unknown };
  const state = checklistStateForViewer(ctx, checklistStateFromRow(access.row));
  const tiles = periods.map((period) =>
    clientTilesAsOf({
      state,
      schedule: (row.schedule ?? null) as EngagementSchedule | null,
      engagementCreatedAt: row.createdAt ?? null,
      events: eventRows as StepStatusHistoryEvent[],
      requests,
      filings,
      reopens,
      period,
    }),
  );
  const series = (key: keyof (typeof tiles)[number]) => trailingKnown(tiles.map((t) => t[key]));
  return keep({
    waiting: series('waiting'),
    overdue: series('overdue'),
    filingsOverdue: series('filingsOverdue'),
    withSbc: series('withSbc'),
    docsIn: series('docsIn'),
    stepsDone: series('stepsDone'),
    regs: series('regs'),
    dueSoon: series('dueSoon'),
  });
}
