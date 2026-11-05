import 'server-only';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  complianceInstanceDetails,
  complianceInstanceWorkflow,
  complianceInstances,
  complianceObligations,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import type { EngagementDbRow } from '@/db/repositories/engagements';
import { confirmPending, getActivityRow, systemEnsureActivitiesSeeded, toActivityDto, type ActivityDto } from '@/db/repositories/compliance-activities';
import { getSubjectInputs, type SubjectInputsDto } from '@/db/repositories/compliance-inputs';
import { listFilingProofs, upsertFilingDetails, type FilingProof } from '@/db/repositories/client-compliances';
import { listFilingEvents, recordFilingEvent } from '@/db/repositories/filing-events';
import { listChecklistTicks, type ChecklistTick } from '@/db/repositories/compliance-checklist-checks';
import { listAssistRuns } from '@/db/repositories/assist-runs';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { remindersFor } from '@/db/repositories/compliance-tasks/reminder-state';
import {
  ComplianceTaskError,
  READERS,
  STAFF,
  UUID,
  canManage,
  engagementReviewerId,
  forbidden,
  isActiveStaff,
  notFound,
  peopleById,
  personOf,
  statutoryHref,
  today,
  type Person,
} from '@/db/repositories/compliance-tasks/shared';
import {
  NOTIFY_DAYS_BY_FREQUENCY,
} from '@/data/compliance-activities';
import {
  STAGE_LABEL,
  daysBetweenIso,
  isStage,
  reminderBlockers,
  stageFromRegister,
  statusWord,
  statutorySteps,
  type ReminderRowOut,
  type Stage,
  type StatusWord,
  type StepOut,
} from '@/lib/compliance-tasks/model';

/**
 * COMPLIANCE STATUTORY — the statutory detail page (D-1 to D-4) and its workflow.
 *
 * One statutory item is one `compliance_instances` row. Its stage and reviewer live in the side
 * table `compliance_instance_workflow`; everything else on the page is read from the parts that
 * already exist (inputs, details, proofs, filing events, Before filing ticks, Assist runs).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   read  — staff on engagements `assertEngagementAccess` allows; the client on its own
 *           engagement. A client never gets the reviewer, the review note, the `confirm` point,
 *           escalation reminders, the Before filing ticks or Assist runs (D-4).
 *   write — staff only. Stage and submit: any staff in scope. Approve and send back: admin,
 *           super admin and manager, or the named reviewer. Assign and Not applicable: admin,
 *           super admin and manager. Filing itself stays on PATCH /api/filings/:id/status.
 *   An instance of another tenant reads as not found.
 */

type InstanceRow = typeof complianceInstances.$inferSelect;
type ObligationRow = typeof complianceObligations.$inferSelect;
type WorkflowRow = typeof complianceInstanceWorkflow.$inferSelect;

const iso = (d: Date | string | null | undefined): string | null => (d ? (d instanceof Date ? d.toISOString() : String(d)) : null);

const FREQ_TITLE: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  annual: 'Yearly',
  'one-time': 'One-time',
};

export interface StatutoryDetailDto {
  id: string;
  engagementId: string;
  companyName: string;
  obligationId: string;
  name: string;
  periodLabel: string | null;
  fyLabel: string | null;
  title: string;
  area: string;
  authority: string;
  frequency: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  filedOn: string | null;
  window: { from: string; to: string } | null;
  visibility: 'both';
  stage: Stage;
  stageLabel: string;
  word: StatusWord;
  daysToDue: number;
  owner: Person;
  reviewer: Person;
  primaryAction: 'submit' | 'approve' | 'upload' | null;
  activity: ActivityDto | null;
  clientInputs: SubjectInputsDto | null;
  filledBySbc: {
    fields: Array<{ key: string; label: string; value: string | null }>;
    acknowledgementNo: string | null;
    amountPaid: string | null;
    filedBy: string | null;
    dataReceivedOn: string | null;
    preparingSince: string | null;
    approvedOn: string | null;
    locked: boolean;
  };
  proofs: FilingProof[];
  reminders: ReminderRowOut[];
  remindersBlockedBy: string[];
  rule: { dueRule: string; applies: string; penalty: string; note: string | null; confirm: string | null };
  history: Array<{ at: string; who: string | null; what: string; side: 'client' | 'sbc' }>;
  steps: StepOut[];
  checklist: ChecklistTick[];
  assistRuns: Array<{ id: string; form: string | null; state: string; reference: string | null; startedAt: string; finishedAt: string | null }>;
  previous: Array<{ id: string; periodLabel: string | null; dueDate: string; filedOn: string | null; late: boolean | null }>;
  reviewNote: string | null;
  can: { submit: boolean; approve: boolean; sendBack: boolean; assign: boolean; editReminders: boolean; upload: boolean };
}

/** The instance, its obligation and engagement, if and only if the caller may read it. */
export async function scopedStatutory(
  ctx: AuthContext,
  instanceId: string,
): Promise<{ inst: InstanceRow; obligation: ObligationRow; engagement: EngagementDbRow; workflow: WorkflowRow | null }> {
  if (!READERS.has(ctx.role) || !UUID.test(instanceId)) throw notFound();
  const [row] = await db
    .select({ inst: complianceInstances, obligation: complianceObligations })
    .from(complianceInstances)
    .innerJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
    .where(eq(complianceInstances.id, instanceId))
    .limit(1);
  if (!row) throw notFound();
  const access = await assertEngagementAccess(ctx, row.inst.engagementId);
  if (!access.ok) throw notFound();
  const [workflow] = await db.select().from(complianceInstanceWorkflow).where(eq(complianceInstanceWorkflow.instanceId, row.inst.id)).limit(1);
  return { inst: row.inst, obligation: row.obligation, engagement: access.row, workflow: workflow ?? null };
}

/** The stage: filed is always completed; else the workflow row; else from the register status. */
export function statutoryStage(inst: Pick<InstanceRow, 'status' | 'filedOn'>, workflow: Pick<WorkflowRow, 'stage'> | null): Stage {
  if (inst.filedOn || inst.status === 'filed') return 'completed';
  if (workflow && isStage(workflow.stage)) return workflow.stage;
  return stageFromRegister(inst.status, inst.filedOn);
}

/** The reminder lead time: the occurrence's own, else the activity's, else the frequency default. */
export function statutoryNotifyDays(
  workflow: Pick<WorkflowRow, 'notifyDays'> | null,
  activity: { notifyDays: number } | null,
  obligationFrequency: string,
): number {
  if (workflow?.notifyDays != null) return workflow.notifyDays;
  if (activity) return activity.notifyDays;
  const title = FREQ_TITLE[obligationFrequency] ?? 'One-time';
  return NOTIFY_DAYS_BY_FREQUENCY[title as keyof typeof NOTIFY_DAYS_BY_FREQUENCY] ?? 5;
}

/** DR-22 preparation date of a statutory item: the working window start, else the period end. */
export function statutoryPrepDate(inst: Pick<InstanceRow, 'windowFrom' | 'periodEnd'>): string | null {
  return inst.windowFrom ?? inst.periodEnd ?? null;
}

export async function getStatutoryDetail(ctx: AuthContext, instanceId: string): Promise<StatutoryDetailDto> {
  await systemEnsureActivitiesSeeded();
  const { inst, obligation, engagement, workflow } = await scopedStatutory(ctx, instanceId);
  return buildDetail(ctx, inst, obligation, engagement, workflow);
}

async function buildDetail(
  ctx: AuthContext,
  inst: InstanceRow,
  obligation: ObligationRow,
  engagement: EngagementDbRow,
  workflow: WorkflowRow | null,
): Promise<StatutoryDetailDto> {
  const day = today();
  const forClient = ctx.role === 'client';
  const staff = STAFF.has(ctx.role);
  const activityRow = obligation.activityId ? await getActivityRow(obligation.activityId) : null;
  const stage = statutoryStage(inst, workflow);
  const notifyDays = statutoryNotifyDays(workflow, activityRow, obligation.frequency);
  const reviewerId = workflow?.reviewerId ?? engagementReviewerId(engagement);

  const [details, inputs, proofs, events, ticks, runs, previousRows] = await Promise.all([
    db.select().from(complianceInstanceDetails).where(eq(complianceInstanceDetails.instanceId, inst.id)).limit(1),
    getSubjectInputs(ctx, { engagementId: inst.engagementId, kind: 'obligation', key: inst.id }).catch(() => null),
    listFilingProofs(ctx, inst.id).catch(() => [] as FilingProof[]),
    listFilingEvents(ctx, [inst.id]),
    staff ? listChecklistTicks(ctx, { engagementId: inst.engagementId, subjectKind: 'obligation', subjectKey: inst.id }).catch(() => []) : Promise.resolve([]),
    staff ? listAssistRuns(ctx, { engagementId: inst.engagementId, subjectKind: 'filing', subjectKey: inst.id }).catch(() => null) : Promise.resolve(null),
    db
      .select({ id: complianceInstances.id, periodLabel: complianceInstances.periodLabel, dueDate: complianceInstances.dueDate, filedOn: complianceInstances.filedOn })
      .from(complianceInstances)
      .where(
        and(
          eq(complianceInstances.engagementId, inst.engagementId),
          eq(complianceInstances.obligationId, inst.obligationId),
          lt(complianceInstances.dueDate, inst.dueDate),
        ),
      )
      .orderBy(desc(complianceInstances.dueDate))
      .limit(6),
  ]);
  const det = details[0] ?? null;
  const people = await peopleById([inst.ownerId, reviewerId, det?.filedBy, workflow?.submittedBy]);
  const nameOf = (id: string | null | undefined) => (id ? (people.get(id)?.name ?? null) : null);

  const blockedBy = reminderBlockers({
    engagementId: inst.engagementId,
    stage,
    ownerId: inst.ownerId,
    prepDate: statutoryPrepDate(inst),
    dueDate: inst.dueDate,
    confirmPending: confirmPending(activityRow),
  });
  const reminders = await remindersFor('statutory', inst.id, {
    dueDate: inst.dueDate,
    notifyDays,
    done: stage === 'completed',
    blocked: blockedBy.length > 0,
    forClient,
  });

  const docs = inputs?.docs ?? [];
  const ackProof = proofs.find((p) => p.kind === 'acknowledgement')?.fileName ?? null;
  const challanProof = proofs.find((p) => p.kind === 'challan')?.fileName ?? null;
  const steps = statutorySteps({
    stage,
    clientShort: engagement.companyName,
    owner: nameOf(inst.ownerId),
    reviewer: forClient ? null : nameOf(reviewerId),
    authority: obligation.authority,
    docsAsked: docs.length,
    docsAccepted: docs.filter((d) => d.status === 'Accepted').length,
    dataReceivedOn: det?.dataReceivedOn ?? null,
    preparingSince: det?.preparingSince ?? null,
    submittedAt: iso(workflow?.submittedAt),
    submittedBy: nameOf(workflow?.submittedBy),
    approvedOn: det?.approvedOn ?? null,
    filedOn: inst.filedOn ?? null,
    filedBy: nameOf(det?.filedBy),
    challan: challanProof,
    acknowledgementNo: det?.acknowledgementNo ?? null,
    ackProof,
  });

  const isReviewer = Boolean(reviewerId && reviewerId === ctx.userId);
  const mayReview = staff && (canManage(ctx.role) || isReviewer);
  let primaryAction: StatutoryDetailDto['primaryAction'] = null;
  if (forClient) primaryAction = stage === 'completed' ? null : 'upload';
  else if (stage === 'review' && mayReview) primaryAction = 'approve';
  else if (staff && stage !== 'completed' && stage !== 'review') primaryAction = 'submit';

  const period = inst.periodLabel?.trim() || null;
  return {
    id: inst.id,
    engagementId: appEngagementId(inst.engagementId),
    companyName: engagement.companyName,
    obligationId: obligation.id,
    name: obligation.particular,
    periodLabel: period,
    fyLabel: inst.fyLabel ?? null,
    title: period ? `${obligation.particular} · ${period}` : obligation.particular,
    area: obligation.complianceArea,
    authority: obligation.authority,
    frequency: obligation.frequency,
    periodStart: inst.periodStart ?? null,
    periodEnd: inst.periodEnd ?? null,
    dueDate: inst.dueDate,
    filedOn: inst.filedOn ?? null,
    window: inst.windowFrom && inst.windowTo ? { from: inst.windowFrom, to: inst.windowTo } : null,
    visibility: 'both',
    stage,
    stageLabel: STAGE_LABEL[stage],
    word: statusWord(stage, inst.dueDate, notifyDays, day),
    daysToDue: daysBetweenIso(day, inst.dueDate),
    owner: personOf(people, inst.ownerId),
    reviewer: forClient ? null : personOf(people, reviewerId),
    primaryAction,
    activity: activityRow ? toActivityDto(activityRow, ctx.role) : null,
    clientInputs: inputs,
    filledBySbc: {
      fields: (inputs?.sbc ?? []).map((f) => ({ key: f.key, label: f.label, value: f.value ?? null })),
      acknowledgementNo: det?.acknowledgementNo ?? null,
      amountPaid: det?.amountPaid ?? null,
      filedBy: nameOf(det?.filedBy),
      dataReceivedOn: det?.dataReceivedOn ?? null,
      preparingSince: det?.preparingSince ?? null,
      approvedOn: det?.approvedOn ?? null,
      locked: Boolean(inst.filedOn),
    },
    proofs,
    reminders,
    remindersBlockedBy: forClient ? [] : blockedBy,
    rule: {
      dueRule: activityRow?.dueRule || dueRuleText(obligation),
      applies: activityRow?.applies || '',
      penalty: activityRow?.penalty || '',
      note: obligation.applicabilityNote ?? null,
      confirm: isFirmWideAdmin(ctx.role) && activityRow?.confirm && !activityRow.confirmedAt ? activityRow.confirm : null,
    },
    history: events
      .map((e) => ({ at: e.at, who: e.actorName, what: e.label, side: e.side }))
      .sort((a, b) => (a.at < b.at ? 1 : -1)),
    steps,
    checklist: ticks,
    assistRuns: (runs ?? []).slice(0, 5).map((r) => ({ id: r.id, form: r.form, state: r.state, reference: r.reference, startedAt: r.startedAt, finishedAt: r.finishedAt })),
    previous: previousRows.map((p) => ({
      id: p.id,
      periodLabel: p.periodLabel?.trim() || null,
      dueDate: p.dueDate,
      filedOn: p.filedOn ?? null,
      late: p.filedOn ? p.filedOn > p.dueDate : null,
    })),
    reviewNote: forClient ? null : (workflow?.reviewNote ?? null),
    can: {
      submit: staff && stage !== 'completed' && stage !== 'review',
      approve: stage === 'review' && mayReview,
      sendBack: stage === 'review' && mayReview,
      assign: canManage(ctx.role),
      editReminders: canManage(ctx.role),
      upload: READERS.has(ctx.role) && stage !== 'completed',
    },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The obligation's own rule as words, when it has no activity (GSTR-9, LLP Form 11 and Form 8). */
function dueRuleText(o: Pick<ObligationRow, 'dueRule' | 'applicabilityNote'>): string {
  const r = (o.dueRule ?? {}) as { kind?: string; day?: number; month?: number; days?: number };
  switch (r.kind) {
    case 'fixed-calendar-date':
      return typeof r.day === 'number' && typeof r.month === 'number' ? `${r.day} ${MONTHS[r.month] ?? ''}`.trim() : '';
    case 'nth-day-next-month':
      return typeof r.day === 'number' ? `Day ${r.day} of the next month` : '';
    case 'days-after-fy-end':
      return typeof r.days === 'number' ? `Within ${r.days} days of the year end` : '';
    case 'days-after-agm':
      return typeof r.days === 'number' ? `Within ${r.days} days of the AGM` : '';
    case 'days-after-event':
      return typeof r.days === 'number' ? `Within ${r.days} days of the event` : '';
    default:
      return o.applicabilityNote ?? '';
  }
}

export type StatutoryAction =
  | { action: 'stage'; stage: Stage }
  | { action: 'submit' }
  | { action: 'approve' }
  | { action: 'send-back'; note: string }
  | { action: 'assign'; ownerId?: string | null; reviewerId?: string | null };

async function upsertWorkflow(inst: InstanceRow, ctx: AuthContext, set: Partial<typeof complianceInstanceWorkflow.$inferInsert>) {
  const values = { ...set, updatedBy: ctx.userId, updatedAt: new Date() };
  await db
    .insert(complianceInstanceWorkflow)
    .values({ instanceId: inst.id, engagementId: inst.engagementId, ...values })
    .onConflictDoUpdate({ target: complianceInstanceWorkflow.instanceId, set: values });
}

async function notifyStatutory(
  ctx: AuthContext,
  input: { inst: InstanceRow; obligation: ObligationRow; companyName: string; title: string; body: string; recipientIds: Array<string | null | undefined> },
) {
  try {
    const ids = [...new Set(input.recipientIds.filter((x): x is string => Boolean(x) && x !== ctx.userId))];
    if (ids.length === 0) return;
    const people = await peopleById(ids);
    await createNotificationsForUsers(
      [...people.values()]
        .filter((p) => p.role !== 'client')
        .map((p) => ({
          userId: p.id,
          kind: 'compliance.task' as const,
          title: input.title,
          body: input.body,
          engagementId: appEngagementId(input.inst.engagementId),
          companyName: input.companyName,
          itemId: input.inst.id,
          href: statutoryHref(p.role, input.obligation.id, input.inst.id),
          actorId: ctx.userId,
          actorName: ctx.name,
        })),
    );
  } catch (err) {
    console.error('[compliance-statutory] bell notification failed', err);
  }
}

/** One workflow change on a statutory item. Staff only; see the access notes above. */
export async function updateStatutory(ctx: AuthContext, instanceId: string, input: StatutoryAction): Promise<StatutoryDetailDto> {
  if (!STAFF.has(ctx.role)) throw ctx.role === 'client' ? forbidden() : notFound();
  await systemEnsureActivitiesSeeded();
  const { inst, obligation, engagement, workflow } = await scopedStatutory(ctx, instanceId);
  const stage = statutoryStage(inst, workflow);
  const reviewerId = workflow?.reviewerId ?? engagementReviewerId(engagement);
  const mayReview = canManage(ctx.role) || reviewerId === ctx.userId;
  const title = inst.periodLabel ? `${obligation.particular} · ${inst.periodLabel}` : obligation.particular;

  switch (input.action) {
    case 'stage': {
      if (inst.filedOn || inst.status === 'filed') throw new ComplianceTaskError(409, 'filed');
      if (input.stage === 'completed') throw new ComplianceTaskError(400, 'invalid_stage');
      if (input.stage === 'not-applicable' && !canManage(ctx.role)) throw forbidden();
      if (input.stage === stage) break;
      await upsertWorkflow(inst, ctx, { stage: input.stage, ...(input.stage === 'review' ? { submittedAt: new Date(), submittedBy: ctx.userId } : {}) });
      await recordFilingEvent(ctx, { instanceId: inst.id, side: 'sbc', label: `Moved to ${STAGE_LABEL[input.stage]}` });
      break;
    }
    case 'submit': {
      if (inst.filedOn || inst.status === 'filed') throw new ComplianceTaskError(409, 'filed');
      await upsertWorkflow(inst, ctx, { stage: 'review', submittedAt: new Date(), submittedBy: ctx.userId });
      await recordFilingEvent(ctx, { instanceId: inst.id, side: 'sbc', label: 'Submitted for review' });
      await notifyStatutory(ctx, { inst, obligation, companyName: engagement.companyName, title: `Ready for review: ${title}`, body: engagement.companyName, recipientIds: [reviewerId] });
      break;
    }
    case 'approve':
    case 'send-back': {
      if (!mayReview) throw forbidden();
      if (stage !== 'review') throw new ComplianceTaskError(409, 'not_in_review');
      if (input.action === 'approve') {
        await upsertWorkflow(inst, ctx, { stage: 'in-progress', reviewNote: null });
        await upsertFilingDetails(ctx, inst.id, { approvedOn: today() });
        await recordFilingEvent(ctx, { instanceId: inst.id, side: 'sbc', label: 'Approved' });
        await notifyStatutory(ctx, { inst, obligation, companyName: engagement.companyName, title: `Approved: ${title}`, body: 'Ready to file', recipientIds: [inst.ownerId] });
      } else {
        const note = input.note.trim().slice(0, 500);
        if (!note) throw new ComplianceTaskError(400, 'note_required');
        await upsertWorkflow(inst, ctx, { stage: 'rework', reviewNote: note });
        await recordFilingEvent(ctx, { instanceId: inst.id, side: 'sbc', label: 'Sent back for rework' });
        await notifyStatutory(ctx, { inst, obligation, companyName: engagement.companyName, title: `Sent back: ${title}`, body: note, recipientIds: [inst.ownerId] });
      }
      break;
    }
    case 'assign': {
      if (!canManage(ctx.role)) throw forbidden();
      for (const id of [input.ownerId, input.reviewerId]) {
        if (id && !(await isActiveStaff(id))) throw new ComplianceTaskError(400, 'owner_not_staff');
      }
      if (input.ownerId !== undefined) {
        await db.update(complianceInstances).set({ ownerId: input.ownerId }).where(eq(complianceInstances.id, inst.id));
      }
      if (input.reviewerId !== undefined) await upsertWorkflow(inst, ctx, { reviewerId: input.reviewerId, stage });
      await recordFilingEvent(ctx, { instanceId: inst.id, side: 'sbc', label: 'Owner or reviewer changed' });
      if (input.ownerId && input.ownerId !== inst.ownerId) {
        await notifyStatutory(ctx, { inst, obligation, companyName: engagement.companyName, title: `Assigned to you: ${title}`, body: engagement.companyName, recipientIds: [input.ownerId] });
      }
      break;
    }
  }
  return getStatutoryDetail(ctx, instanceId);
}
