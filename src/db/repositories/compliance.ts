import 'server-only';

import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  complianceInstanceWorkflow,
  complianceInstances,
  complianceObligations,
  complianceReminders,
  engagementComplianceTriggers,
  engagements,
  filingEvents,
  profiles,
  regCalendarProposals,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager } from '@/lib/auth';
import { generateComplianceInstances } from '@/lib/compliance/generate-instances';
import { extractTriggersFromChecklist } from '@/lib/compliance/extract-triggers';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { COMPLIANCE_OBLIGATIONS } from '@/lib/compliance/obligations-seed';
import { OBLIGATION_ACTIVITY } from '@/data/compliance-activities';
import {
  periodKey,
  periodRowsToMove,
  withCalendarChanges,
  type CalendarChange,
  type PeriodRow,
} from '@/lib/watch/calendar-proposal';
import { todayIST } from '@/lib/compliance/filings';
import { formatSourceDate } from '@/lib/watch/source-status';
import type {
  ComplianceInstance,
  EngagementComplianceTriggers,
  EntityLegalForm,
} from '@/lib/compliance/types';

/**
 * COMPLIANCE REPOSITORY.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Reproduces 20260708120000_compliance_calendar.sql + v2/v3:
 *
 *   compliance_obligations — admin/manager/intern/client: read
 *   engagement_compliance_triggers / compliance_instances —
 *     admin: all
 *     manager: via owned engagements (manager_id / legacy admin_id)
 *     intern: write via assigned engagement; read same
 *     client: read-only via own engagement
 *
 * `systemGenerateComplianceInstances` is the Inngest
 * cron entry point. It is intentionally unscoped (no AuthContext) and is the
 * ONLY system-job writer for this table — document any new callers as system jobs.
 *
 * `moveFilingPeriod` is the one way a due date changes: admin, super admin or manager, and only
 * for a calendar proposal they approved. It writes across the firm, as a statutory date does.
 */

type EngagementComplianceTriggersRow =
  typeof engagementComplianceTriggers.$inferSelect;

function triggersFromRow(
  row: EngagementComplianceTriggersRow,
): EngagementComplianceTriggers {
  return {
    incorporationDate: row.incorporationDate,
    gstRegistrationDate: row.gstRegistrationDate,
    tanRegistrationDate: row.tanRegistrationDate,
    pfRegistrationDate: row.pfRegistrationDate,
    esiRegistrationDate: row.esiRegistrationDate,
    ptRegistrationDate: row.ptRegistrationDate,
    tdsLiabilityStartDate: row.tdsLiabilityStartDate,
    agmDate: row.agmDate,
  };
}

/** The stored trigger row, filled in from the checklist's registration answers. */
export function complianceTriggersFor(
  row: EngagementComplianceTriggersRow,
  checklistState: unknown,
): EngagementComplianceTriggers {
  const state = (checklistState && typeof checklistState === 'object' ? checklistState : {}) as Record<string, ChecklistItemStateSlice>;
  return extractTriggersFromChecklist(state, triggersFromRow(row));
}

interface UpsertComplianceInstanceInput {
  engagementId: string;
  obligationId: string;
  dueDate: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
  fyLabel?: string | null;
  status: string;
  ownerId?: string | null;
}

async function upsertComplianceInstanceRows(
  inputs: UpsertComplianceInstanceInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;

  let written = 0;
  const CHUNK = 100;
  for (let i = 0; i < inputs.length; i += CHUNK) {
    const chunk = inputs.slice(i, i + CHUNK);
    await db
      .insert(complianceInstances)
      .values(
        chunk.map((row) => ({
          engagementId: row.engagementId,
          obligationId: row.obligationId,
          dueDate: row.dueDate,
          periodStart: row.periodStart ?? null,
          periodEnd: row.periodEnd ?? null,
          periodLabel: row.periodLabel ?? '',
          fyLabel: row.fyLabel ?? null,
          status: row.status,
          ownerId: row.ownerId ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [
          complianceInstances.engagementId,
          complianceInstances.obligationId,
          complianceInstances.dueDate,
          complianceInstances.periodLabel,
        ],
        set: {
          // Do not clobber filed/in-progress workflow state on regeneration.
          periodStart: sql`excluded.period_start`,
          periodEnd: sql`excluded.period_end`,
          fyLabel: sql`excluded.fy_label`,
          ownerId: sql`COALESCE(excluded.owner_id, ${complianceInstances.ownerId})`,
        },
      });
    written += chunk.length;
  }
  return written;
}

/** Ensure the static obligation library rows exist (FK for instances). */
async function ensureObligationsSeeded(): Promise<void> {
  if (COMPLIANCE_OBLIGATIONS.length === 0) return;
  await db
    .insert(complianceObligations)
    .values(
      COMPLIANCE_OBLIGATIONS.map((o) => ({
        id: o.id,
        complianceArea: o.complianceArea,
        particular: o.particular,
        authority: o.authority,
        frequency: o.frequency,
        triggerType: o.triggerType,
        dueRule: o.dueRule,
        appliesTo: o.appliesTo,
        applicabilityNote: o.applicabilityNote ?? null,
        isConditional: o.isConditional ?? false,
        penaltyRisk: o.penaltyRisk,
        // The activity master link (0030); existing rows get it from systemEnsureActivitiesSeeded.
        activityId: OBLIGATION_ACTIVITY[o.id] ?? null,
      })),
    )
    .onConflictDoNothing();
}

async function resolveOwnerUuid(
  internScopingId: string,
  adminId: string | null,
): Promise<string | null> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.internId, internScopingId))
    .limit(1);
  return row?.id ?? adminId ?? null;
}

function instanceToUpsert(
  instance: ComplianceInstance,
  ownerUuid: string | null,
): UpsertComplianceInstanceInput {
  return {
    engagementId: instance.engagementId,
    obligationId: instance.obligationId,
    dueDate: instance.dueDate,
    periodStart: instance.periodStart ?? null,
    periodEnd: instance.periodEnd ?? null,
    periodLabel: instance.periodLabel ?? '',
    fyLabel: instance.fyLabel ?? null,
    status: instance.status,
    ownerId: ownerUuid,
  };
}

export interface SystemGenerateResult {
  engagements: number;
  generated: number;
  upserted: number;
  digest: Array<{
    engagementId: string;
    companyName: string;
    upcoming: number;
    overdue: number;
  }>;
}

/**
 * SYSTEM JOB — no AuthContext. Called only from Inngest `compliance-generate`
 * (and similar internal schedulers). Loads all triggers, expands via pure
 * `generateComplianceInstances`, upserts rows. DB access is intentional here.
 */
export async function systemGenerateComplianceInstances(
  asOfDate: Date = new Date(),
): Promise<SystemGenerateResult> {
  await ensureObligationsSeeded();

  const rows: Array<{
    trigger: EngagementComplianceTriggersRow;
    engagement: typeof engagements.$inferSelect;
  }> = (
    await db
      .select({
        trigger: engagementComplianceTriggers,
        engagement: engagements,
      })
      .from(engagementComplianceTriggers)
      .innerJoin(
        engagements,
        eq(engagements.id, engagementComplianceTriggers.engagementId),
      )
  ).map((r) => ({ trigger: r.trigger, engagement: r.engagement }));

  // Also cover engagements that only have incorporation_date on the row and
  // no triggers table entry yet.
  const withTriggers = new Set(rows.map((r) => r.engagement.id));
  const bare = await db.select().from(engagements);
  for (const eng of bare) {
    if (withTriggers.has(eng.id)) continue;
    if (!eng.incorporationDate) continue;
    rows.push({
      trigger: {
        engagementId: eng.id,
        incorporationDate: eng.incorporationDate,
        gstRegistrationDate: null,
        tanRegistrationDate: null,
        pfRegistrationDate: null,
        esiRegistrationDate: null,
        ptRegistrationDate: null,
        tdsLiabilityStartDate: null,
        agmDate: null,
        hasForeignInvestment: false,
        gstQrmp: false,
        sezUnit: false,
        updatedAt: new Date(),
      },
      engagement: eng,
    });
  }

  const changes = await systemApprovedCalendarChanges();
  const existing = await existingPeriodKeys(changes);
  const digest: SystemGenerateResult['digest'] = [];
  const toUpsert: UpsertComplianceInstanceInput[] = [];

  for (const { trigger, engagement } of rows) {
    const ownerUuid = await resolveOwnerUuid(
      engagement.internId,
      engagement.adminId,
    );
    // Nothing writes engagement_compliance_triggers yet, so the registration dates come from the
    // registration steps themselves (GST reg-4, PF reg-1, ESI reg-3, TAN reg-2), the same way the
    // client-side calendar reads them (UAT D-T13-01).
    const triggers = complianceTriggersFor(trigger, engagement.checklistState);
    if (!triggers.incorporationDate && engagement.incorporationDate) {
      triggers.incorporationDate = engagement.incorporationDate;
    }

    const instances = withCalendarChanges(
      generateComplianceInstances({
        engagementId: engagement.id,
        entityLegalForm: (engagement.entityLegalForm ?? 'company') as EntityLegalForm,
        triggers,
        ownerId: ownerUuid ?? engagement.internId,
        asOfDate,
      }),
      changes,
      existing,
      todayIST(asOfDate),
    );

    let upcoming = 0;
    let overdue = 0;
    for (const instance of instances) {
      if (instance.status === 'overdue') overdue += 1;
      else if (instance.status === 'upcoming') upcoming += 1;
      toUpsert.push(instanceToUpsert(instance, ownerUuid));
    }

    digest.push({
      engagementId: engagement.id,
      companyName: engagement.companyName,
      upcoming,
      overdue,
    });
  }

  const upserted = await upsertComplianceInstanceRows(toUpsert);

  return {
    engagements: rows.length,
    generated: toUpsert.length,
    upserted,
    digest,
  };
}

// ---------- Approved due-date changes ----------

type InstanceReader = Pick<typeof db, 'select'>;

/** A filed row stays where it is, and so does one a person marked not applicable. */
const closedRow = sql<boolean>`${complianceInstances.filedOn} is not null or ${complianceInstances.status} = 'filed' or coalesce(${complianceInstanceWorkflow.stage}, '') = 'not-applicable'`;

function periodRows(reader: InstanceReader, where: SQL | undefined) {
  return reader
    .select({
      id: complianceInstances.id,
      engagementId: complianceInstances.engagementId,
      obligationId: complianceInstances.obligationId,
      periodLabel: sql<string>`coalesce(${complianceInstances.periodLabel}, '')`,
      dueDate: complianceInstances.dueDate,
      ownerId: complianceInstances.ownerId,
      filed: closedRow,
    })
    .from(complianceInstances)
    .innerJoin(engagements, and(eq(engagements.id, complianceInstances.engagementId), isNull(engagements.deletedAt)))
    .leftJoin(complianceInstanceWorkflow, eq(complianceInstanceWorkflow.instanceId, complianceInstances.id))
    .where(where);
}

/** SYSTEM (no AuthContext): every period of these filings, so a proposal is worked out across the firm. */
export async function systemFilingPeriodRows(obligationIds: readonly string[]): Promise<PeriodRow[]> {
  if (obligationIds.length === 0) return [];
  return periodRows(db, inArray(complianceInstances.obligationId, [...obligationIds]));
}

/** SYSTEM (no AuthContext): approved moves, oldest first. A rejected proposal never appears here. */
export async function systemApprovedCalendarChanges(): Promise<CalendarChange[]> {
  return db
    .select({
      obligationId: regCalendarProposals.obligationId,
      period: regCalendarProposals.period,
      oldDueDate: regCalendarProposals.oldDueDate,
      newDueDate: regCalendarProposals.newDueDate,
    })
    .from(regCalendarProposals)
    .where(eq(regCalendarProposals.status, 'approved'))
    .orderBy(asc(regCalendarProposals.decidedAt));
}

async function existingPeriodKeys(changes: readonly CalendarChange[]): Promise<Set<string>> {
  if (changes.length === 0) return new Set();
  const rows = await db
    .select({ engagementId: complianceInstances.engagementId, obligationId: complianceInstances.obligationId, periodLabel: complianceInstances.periodLabel })
    .from(complianceInstances)
    .where(inArray(complianceInstances.obligationId, [...new Set(changes.map((change) => change.obligationId))]));
  return new Set(rows.map((row) => periodKey(row.engagementId, row.obligationId, row.periodLabel ?? '')));
}

export interface MovedFiling {
  id: string;
  engagementId: string;
  ownerId: string | null;
}

/**
 * Moves one filing period to its new date, inside the caller's transaction, for the proposal it just
 * approved. Rows keep their ids, so proofs, workflow and history stay attached. A filing not yet
 * reminded of keeps the same lead time, and one no longer late stops reading as overdue.
 */
export async function moveFilingPeriod(
  ctx: AuthContext,
  change: { obligationId: string; period: string; oldDueDate: string | null; newDueDate: string },
  tx: Pick<typeof db, 'select' | 'insert' | 'update'>,
): Promise<MovedFiling[]> {
  if (!isAdminOrManager(ctx.role)) throw new Error('not permitted');
  const { newDueDate } = change;
  const rows = await periodRows(tx, and(eq(complianceInstances.obligationId, change.obligationId), eq(complianceInstances.periodLabel, change.period)));
  const alreadyThere = new Set(rows.filter((row) => row.dueDate === newDueDate).map((row) => row.engagementId));
  const moving = periodRowsToMove(rows, change.oldDueDate, newDueDate).filter((row) => !alreadyThere.has(row.engagementId));
  if (moving.length === 0) return [];
  const ids = moving.map((row) => row.id);
  await tx
    .update(complianceReminders)
    .set({ remindOn: sql`${complianceReminders.remindOn} + (${newDueDate}::date - ${complianceInstances.dueDate})` })
    .from(complianceInstances)
    .where(and(eq(complianceReminders.instanceId, complianceInstances.id), inArray(complianceInstances.id, ids), isNull(complianceReminders.sentAt)));
  await tx
    .update(complianceInstances)
    .set({
      dueDate: newDueDate,
      status: sql`case when ${complianceInstances.status} = 'overdue' and ${newDueDate}::date >= ${todayIST(new Date())}::date then 'upcoming' else ${complianceInstances.status} end`,
    })
    .where(inArray(complianceInstances.id, ids));
  const newDay = formatSourceDate(new Date(`${newDueDate}T12:00:00+05:30`));
  await tx.insert(filingEvents).values(
    moving.map((row) => ({
      instanceId: row.id,
      side: 'sbc',
      label: `Due date moved from ${formatSourceDate(new Date(`${row.dueDate}T12:00:00+05:30`))} to ${newDay}, from an official update`,
      actorId: ctx.userId,
    })),
  );
  return moving.map((row) => ({ id: row.id, engagementId: row.engagementId, ownerId: row.ownerId }));
}

/**
 * SYSTEM (Inngest only — no AuthContext): the compliance instances that may get a WhatsApp
 * nudge today. Only what a template variable needs — obligation name, company name, due
 * date — plus the frequency and the days left, so the job can apply each recipient's own
 * reminder days (`dueNudgeToday`, notification_prefs.remind_days).
 *
 * Rows:
 *   overdue — due yesterday (IST), any frequency, sent to clients and leads;
 *   due     — due in 1 to 7 IST days. With no personal choice a monthly filing nudges 5 days
 *             before and a quarterly one 7 days before, as before; a client who chose 7, 3 or
 *             1 days is nudged that many days before instead.
 * Filed instances and soft-deleted projects are excluded.
 */
export async function systemListComplianceNudges(today: Date): Promise<ComplianceNudgeRow[]> {
  const { ymdInIst, parseIstNoon } = await import('@/lib/intern/intern-work');

  const shift = (days: number): string => {
    const base = parseIstNoon(ymdInIst(today));
    base.setDate(base.getDate() + days);
    return ymdInIst(base);
  };

  const dueYesterday = shift(-1);
  const ahead = [1, 2, 3, 4, 5, 6, 7].map((d) => [shift(d), d] as const);
  const daysTo = new Map<string, number>(ahead);

  try {
    const rows = await db
      .select({
        instanceId: complianceInstances.id,
        engagementDbId: complianceInstances.engagementId,
        dueDate: complianceInstances.dueDate,
        status: complianceInstances.status,
        companyName: engagements.companyName,
        deletedAt: engagements.deletedAt,
        obligationName: complianceObligations.particular,
        frequency: complianceObligations.frequency,
      })
      .from(complianceInstances)
      .innerJoin(engagements, eq(engagements.id, complianceInstances.engagementId))
      .innerJoin(
        complianceObligations,
        eq(complianceObligations.id, complianceInstances.obligationId),
      )
      .where(inArray(complianceInstances.dueDate, [dueYesterday, ...ahead.map(([d]) => d)]));

    const out: ComplianceNudgeRow[] = [];
    for (const row of rows) {
      // Soft-deleted projects are hidden everywhere else — do not message them.
      if (row.deletedAt) continue;
      if (row.status === 'filed') continue;
      const base = {
        instanceId: row.instanceId,
        engagementDbId: row.engagementDbId,
        companyName: row.companyName,
        obligationName: row.obligationName,
        dueDate: row.dueDate,
        frequency: row.frequency,
      };
      if (row.dueDate === dueYesterday) {
        out.push({ kind: 'compliance_overdue', daysToDue: -1, ...base });
        continue;
      }
      const days = daysTo.get(row.dueDate);
      if (days === undefined) continue;
      out.push({
        kind: row.frequency === 'monthly' ? 'compliance_due_monthly' : 'compliance_due_quarterly',
        daysToDue: days,
        ...base,
      });
    }
    return out;
  } catch (err) {
    console.error('[compliance] nudge scan failed', err);
    return [];
  }
}

export interface ComplianceNudgeRow {
  kind: 'compliance_due_monthly' | 'compliance_due_quarterly' | 'compliance_overdue';
  instanceId: string;
  engagementDbId: string;
  companyName: string;
  obligationName: string;
  dueDate: string;
  frequency: string;
  /** IST days from today to the due date; -1 for the overdue nudge. */
  daysToDue: number;
}
