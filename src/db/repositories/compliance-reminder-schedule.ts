import 'server-only';
import { and, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  complianceInstanceWorkflow,
  complianceInstances,
  complianceObligations,
  complianceReminderLog,
  complianceReminderOverrides,
  complianceTasks,
  engagements,
  notificationPrefs,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { confirmPending, systemActivityMap, systemEnsureActivitiesSeeded } from '@/db/repositories/compliance-activities';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { loadOverridesFor, remindersFor, type ReminderSubjectKind } from '@/db/repositories/compliance-tasks/reminder-state';
import { ComplianceTaskError, STAFF, canManage, forbidden, scopedTask, statutoryHref, taskHref } from '@/db/repositories/compliance-tasks/shared';
import { scopedStatutory, statutoryNotifyDays, statutoryPrepDate, statutoryStage } from '@/db/repositories/compliance-statutory';
import {
  OVERDUE_DAILY_LIMIT,
  REMINDER_RULES,
  addDaysIso,
  isStage,
  reminderBlockers,
  reminderSchedule,
  remindersDueToday,
  type ReminderKey,
  type ReminderRowOut,
  type Stage,
} from '@/lib/compliance-tasks/model';
import type { ReminderLine } from '@/lib/compliance-tasks/reminder-email';
import type { WhatsAppGatePrefs } from '@/lib/notify/prefs-gate';
import { titleWithPeriod } from '@/lib/compliance/period-title';

/**
 * COMPLIANCE REMINDER SCHEDULE — the six reminders of one item (COMPLIANCE-MODEL 3.4, D-2.3)
 * and the system side the reminder job uses.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   read  — whoever can read the item (scoped task or statutory read); a client gets no
 *           escalations and cannot edit.
 *   write — admin, super admin and manager in scope. Writes key on the item's own engagement.
 *   system — `systemPlanComplianceReminders` and `systemDeliverComplianceBells` take no
 *           AuthContext: only the Inngest job calls them, and no person runs a job.
 */

export interface ReminderScheduleDto {
  notifyDays: number;
  rows: ReminderRowOut[];
  blockedBy: string[];
  editable: boolean;
}

async function resolve(ctx: AuthContext, kind: ReminderSubjectKind, id: string) {
  if (kind === 'task') {
    const { task, engagement } = await scopedTask(ctx, id);
    const activity = task.activityId ? (await systemActivityMap()).get(task.activityId) ?? null : null;
    const stage = (isStage(task.stage) ? task.stage : 'not-started') as Stage;
    return {
      engagementId: engagement.id,
      dueDate: task.dueDate,
      notifyDays: task.remindBefore,
      done: stage === 'completed',
      blockedBy: reminderBlockers({
        engagementId: task.engagementId,
        stage,
        ownerId: task.ownerId,
        prepDate: task.startDate,
        dueDate: task.dueDate,
        confirmPending: confirmPending(activity),
      }),
    };
  }
  await systemEnsureActivitiesSeeded();
  const { inst, obligation, workflow } = await scopedStatutory(ctx, id);
  const activity = obligation.activityId ? (await systemActivityMap()).get(obligation.activityId) ?? null : null;
  const stage = statutoryStage(inst, workflow);
  return {
    engagementId: inst.engagementId,
    dueDate: inst.dueDate,
    notifyDays: statutoryNotifyDays(workflow, activity, obligation.frequency),
    done: stage === 'completed',
    blockedBy: reminderBlockers({
      engagementId: inst.engagementId,
      stage,
      ownerId: inst.ownerId,
      prepDate: statutoryPrepDate(inst),
      dueDate: inst.dueDate,
      confirmPending: confirmPending(activity),
    }),
  };
}

export async function getReminderSchedule(ctx: AuthContext, kind: ReminderSubjectKind, id: string): Promise<ReminderScheduleDto> {
  const item = await resolve(ctx, kind, id);
  const forClient = ctx.role === 'client';
  const rows = await remindersFor(kind, id, {
    dueDate: item.dueDate,
    notifyDays: item.notifyDays,
    done: item.done,
    blocked: item.blockedBy.length > 0,
    forClient,
  });
  return { notifyDays: item.notifyDays, rows, blockedBy: forClient ? [] : item.blockedBy, editable: canManage(ctx.role) };
}

export interface ReminderScheduleInput {
  kind: ReminderSubjectKind;
  id: string;
  notifyDays?: number;
  rows?: Array<{ key: ReminderKey; offsetDays?: number | null; enabled?: boolean }>;
  reset?: boolean;
}

export async function setReminderSchedule(ctx: AuthContext, input: ReminderScheduleInput): Promise<ReminderScheduleDto> {
  if (!canManage(ctx.role)) throw forbidden();
  const item = await resolve(ctx, input.kind, input.id);
  const now = new Date();
  if (input.reset) {
    await db
      .delete(complianceReminderOverrides)
      .where(and(eq(complianceReminderOverrides.subjectKind, input.kind), eq(complianceReminderOverrides.subjectId, input.id)));
    if (input.kind === 'statutory') {
      await db.update(complianceInstanceWorkflow).set({ notifyDays: null, updatedBy: ctx.userId, updatedAt: now }).where(eq(complianceInstanceWorkflow.instanceId, input.id));
    }
  }
  if (input.notifyDays !== undefined) {
    if (input.notifyDays < 0 || input.notifyDays > 120) throw new ComplianceTaskError(400, 'invalid_days');
    if (input.kind === 'task') {
      await db.update(complianceTasks).set({ remindBefore: input.notifyDays, updatedAt: now }).where(eq(complianceTasks.id, input.id));
    } else {
      const { inst, workflow } = await scopedStatutory(ctx, input.id);
      const values = { notifyDays: input.notifyDays, updatedBy: ctx.userId, updatedAt: now };
      await db
        .insert(complianceInstanceWorkflow)
        .values({ instanceId: inst.id, engagementId: inst.engagementId, stage: statutoryStage(inst, workflow), ...values })
        .onConflictDoUpdate({ target: complianceInstanceWorkflow.instanceId, set: values });
    }
  }
  for (const r of input.rows ?? []) {
    if (r.offsetDays != null && (r.offsetDays < -120 || r.offsetDays > 60)) throw new ComplianceTaskError(400, 'invalid_days');
    const set = {
      offsetDays: r.offsetDays ?? null,
      enabled: r.enabled ?? true,
      updatedBy: ctx.userId,
      updatedAt: now,
    };
    await db
      .insert(complianceReminderOverrides)
      .values({ engagementId: item.engagementId, subjectKind: input.kind, subjectId: input.id, reminderKey: r.key, ...set })
      .onConflictDoUpdate({
        target: [complianceReminderOverrides.subjectKind, complianceReminderOverrides.subjectId, complianceReminderOverrides.reminderKey],
        set,
      });
  }
  return getReminderSchedule(ctx, input.kind, input.id);
}

/* ------------------------------------------------------------------ system: the reminder job */

export interface PlannedReminder {
  kind: ReminderSubjectKind;
  id: string;
  engagementId: string;
  companyName: string;
  title: string;
  dueDate: string;
  key: ReminderKey;
  label: string;
  obligationId: string | null;
  recipientIds: string[];
}

/** Look ahead far enough for the largest lead time an admin can set. */
const LOOK_AHEAD = 120;
const LOOK_BACK = OVERDUE_DAILY_LIMIT + 1;

const RULE = new Map(REMINDER_RULES.map((r) => [r.key, r]));

function recipientsFor(
  key: ReminderKey,
  people: { ownerId: string | null; reviewerId: string | null; managerId: string | null; adminId: string | null },
  firmAdmins: string[],
): string[] {
  const audience = RULE.get(key)!.audience;
  const reviewer = people.reviewerId ?? people.managerId;
  const list =
    audience === 'owner'
      ? [people.ownerId]
      : audience === 'owner-reviewer'
        ? [people.ownerId, reviewer]
        : audience === 'reviewer'
          ? [reviewer]
          : people.adminId
            ? [people.adminId]
            : firmAdmins;
  return [...new Set(list.filter((x): x is string => Boolean(x)))];
}

/**
 * SYSTEM: every reminder that is due today, for open tasks and unfiled statutory items whose
 * DR-22 set-up is complete. Read-only.
 */
export async function systemPlanComplianceReminders(today: string): Promise<PlannedReminder[]> {
  await systemEnsureActivitiesSeeded();
  const from = addDaysIso(today, -LOOK_BACK);
  const to = addDaysIso(today, LOOK_AHEAD);
  const activities = await systemActivityMap();
  const admins = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.role, 'admin'), eq(profiles.status, 'active'), isNull(profiles.removedAt)));
  const firmAdmins = admins.map((a) => a.id);
  const out: PlannedReminder[] = [];

  const tasks = await db
    .select({ task: complianceTasks, companyName: engagements.companyName, managerId: engagements.managerId, adminId: engagements.adminId })
    .from(complianceTasks)
    .innerJoin(engagements, eq(engagements.id, complianceTasks.engagementId))
    .where(
      and(
        isNull(engagements.deletedAt),
        notInArray(complianceTasks.stage, ['completed', 'not-applicable']),
        gte(complianceTasks.dueDate, from),
        lte(complianceTasks.dueDate, to),
      ),
    );
  const taskOverrides = await loadOverridesFor('task', tasks.map((t) => t.task.id));
  for (const { task, companyName, managerId, adminId } of tasks) {
    const stage = (isStage(task.stage) ? task.stage : 'not-started') as Stage;
    const activity = task.activityId ? (activities.get(task.activityId) ?? null) : null;
    const blocked = reminderBlockers({
      engagementId: task.engagementId,
      stage,
      ownerId: task.ownerId,
      prepDate: task.startDate,
      dueDate: task.dueDate,
      confirmPending: confirmPending(activity),
    });
    if (blocked.length) continue;
    const rows = reminderSchedule({ dueDate: task.dueDate, notifyDays: task.remindBefore, overrides: taskOverrides.get(task.id) ?? [], sends: [], done: false, blocked: false });
    for (const key of remindersDueToday(rows, task.dueDate, today)) {
      out.push({
        kind: 'task',
        id: task.id,
        engagementId: task.engagementId,
        companyName,
        title: titleWithPeriod(task.name, task.periodLabel),
        dueDate: task.dueDate,
        key,
        label: RULE.get(key)!.label,
        obligationId: null,
        recipientIds: recipientsFor(key, { ownerId: task.ownerId, reviewerId: task.reviewerId, managerId, adminId }, firmAdmins),
      });
    }
  }

  const insts = await db
    .select({
      inst: complianceInstances,
      particular: complianceObligations.particular,
      frequency: complianceObligations.frequency,
      activityId: complianceObligations.activityId,
      workflow: complianceInstanceWorkflow,
      companyName: engagements.companyName,
      managerId: engagements.managerId,
      adminId: engagements.adminId,
    })
    .from(complianceInstances)
    .innerJoin(complianceObligations, eq(complianceObligations.id, complianceInstances.obligationId))
    .innerJoin(engagements, eq(engagements.id, complianceInstances.engagementId))
    .leftJoin(complianceInstanceWorkflow, eq(complianceInstanceWorkflow.instanceId, complianceInstances.id))
    .where(
      and(
        isNull(engagements.deletedAt),
        isNull(complianceInstances.filedOn),
        or(isNull(complianceInstances.status), ne(complianceInstances.status, 'filed')),
        gte(complianceInstances.dueDate, from),
        lte(complianceInstances.dueDate, to),
      ),
    );
  const instOverrides = await loadOverridesFor('statutory', insts.map((r) => r.inst.id));
  for (const r of insts) {
    const stage = statutoryStage(r.inst, r.workflow);
    if (stage === 'completed') continue;
    const activity = r.activityId ? (activities.get(r.activityId) ?? null) : null;
    const blocked = reminderBlockers({
      engagementId: r.inst.engagementId,
      stage,
      ownerId: r.inst.ownerId,
      prepDate: statutoryPrepDate(r.inst),
      dueDate: r.inst.dueDate,
      confirmPending: confirmPending(activity),
    });
    if (blocked.length) continue;
    const notifyDays = statutoryNotifyDays(r.workflow, activity, r.frequency);
    const rows = reminderSchedule({ dueDate: r.inst.dueDate, notifyDays, overrides: instOverrides.get(r.inst.id) ?? [], sends: [], done: false, blocked: false });
    const period = r.inst.periodLabel?.trim();
    for (const key of remindersDueToday(rows, r.inst.dueDate, today)) {
      out.push({
        kind: 'statutory',
        id: r.inst.id,
        engagementId: r.inst.engagementId,
        companyName: r.companyName,
        title: titleWithPeriod(r.particular, period),
        dueDate: r.inst.dueDate,
        key,
        label: RULE.get(key)!.label,
        obligationId: r.inst.obligationId,
        recipientIds: recipientsFor(key, { ownerId: r.inst.ownerId, reviewerId: r.workflow?.reviewerId ?? null, managerId: r.managerId, adminId: r.adminId }, firmAdmins),
      });
    }
  }
  return out;
}

export interface ReminderEmailPlan {
  profileId: string;
  email: string;
  name: string;
  quiet: Pick<WhatsAppGatePrefs, 'quietHours' | 'quietStart' | 'quietEnd' | 'tz'>;
  lines: ReminderLine[];
  logIds: string[];
}

/**
 * SYSTEM: write today's bell rows (kind `compliance.reminder`) and the send log, at most once
 * per item, reminder, recipient and day; return what each person's email should list. Only
 * active staff with an email address receive anything.
 */
export async function systemDeliverComplianceBells(today: string, plan: PlannedReminder[]): Promise<ReminderEmailPlan[]> {
  const ids = [...new Set(plan.flatMap((p) => p.recipientIds))];
  if (ids.length === 0) return [];
  const people = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      quietHours: notificationPrefs.quietHours,
      quietStart: notificationPrefs.quietStart,
      quietEnd: notificationPrefs.quietEnd,
      tz: notificationPrefs.tz,
    })
    .from(profiles)
    .leftJoin(notificationPrefs, eq(notificationPrefs.profileId, profiles.id))
    .where(and(inArray(profiles.id, ids), eq(profiles.status, 'active'), isNull(profiles.removedAt)));
  const byId = new Map(people.filter((p) => STAFF.has(p.role)).map((p) => [p.id, p]));
  const emails = new Map<string, ReminderEmailPlan>();

  // Every (item, reminder, recipient) once, for active staff only.
  const keyOf = (kind: string, id: string, key: string, rid: string) => `${kind}|${id}|${key}|${rid}`;
  const wanted = new Map<string, { p: PlannedReminder; rid: string; person: NonNullable<ReturnType<typeof byId.get>> }>();
  for (const p of plan) {
    for (const rid of p.recipientIds) {
      const person = byId.get(rid);
      if (person) wanted.set(keyOf(p.kind, p.id, p.key, rid), { p, rid, person });
    }
  }
  if (wanted.size === 0) return [];

  // One insert for the whole day; a row already logged today comes back missing, so it is skipped.
  // shortcut: one statement holds at most about 13,000 rows (5 parameters each); chunk if a day ever plans more.
  const logged = await db
    .insert(complianceReminderLog)
    .values([...wanted.values()].map(({ p, rid }) => ({ subjectKind: p.kind, subjectId: p.id, reminderKey: p.key, sentOn: today, recipientId: rid })))
    .onConflictDoNothing()
    .returning({
      id: complianceReminderLog.id,
      subjectKind: complianceReminderLog.subjectKind,
      subjectId: complianceReminderLog.subjectId,
      reminderKey: complianceReminderLog.reminderKey,
      recipientId: complianceReminderLog.recipientId,
    });
  const fresh = logged.flatMap((log) => {
    const w = wanted.get(keyOf(log.subjectKind, log.subjectId, log.reminderKey, log.recipientId));
    if (!w) return [];
    const href = w.p.kind === 'task' ? taskHref(w.person.role, w.p.id) : statutoryHref(w.person.role, w.p.obligationId ?? '', w.p.id);
    return [{ ...w, logId: log.id, href }];
  });
  if (fresh.length === 0) return [];

  // One insert for every bell; the rows come back in the order they were given.
  const bells = await createNotificationsForUsers(
    fresh.map(({ p, rid, href }) => ({
      userId: rid,
      kind: 'compliance.reminder' as const,
      title: `${p.label}: ${p.title}`,
      body: `${p.companyName} · due ${p.dueDate}`,
      engagementId: appEngagementId(p.engagementId),
      companyName: p.companyName,
      itemId: p.id,
      href,
    })),
  );
  const links = fresh.flatMap((f, i) => (bells[i] ? [{ logId: f.logId, bellId: bells[i]!.id }] : []));
  if (links.length) {
    const byLog = sql.join(links.map((l) => sql`when ${l.logId}::uuid then ${l.bellId}::uuid`), sql` `);
    await db
      .update(complianceReminderLog)
      .set({ notificationId: sql`case ${complianceReminderLog.id} ${byLog} end` })
      .where(inArray(complianceReminderLog.id, links.map((l) => l.logId)));
  }

  for (const { p, rid, person, logId, href } of fresh) {
    if (!person.email?.trim()) continue;
    const entry = emails.get(rid) ?? {
      profileId: rid,
      email: person.email,
      name: person.name?.trim() || person.email.split('@')[0] || 'there',
      quiet: {
        quietHours: person.quietHours ?? true,
        quietStart: person.quietStart ?? '21:00',
        quietEnd: person.quietEnd ?? '08:00',
        tz: person.tz || 'Asia/Kolkata',
      },
      lines: [],
      logIds: [],
    };
    entry.lines.push({ title: p.title, companyName: p.companyName, label: p.label, dueDate: p.dueDate, href });
    entry.logIds.push(logId);
    emails.set(rid, entry);
  }
  return [...emails.values()];
}

/** SYSTEM: stamp the log rows whose email went out. */
export async function systemMarkReminderEmailed(logIds: string[]): Promise<void> {
  if (logIds.length === 0) return;
  await db.update(complianceReminderLog).set({ emailedAt: new Date() }).where(inArray(complianceReminderLog.id, logIds));
}
