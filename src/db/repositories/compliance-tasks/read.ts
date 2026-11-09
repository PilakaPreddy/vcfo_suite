import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  complianceActivities,
  complianceTaskAttachments,
  complianceTaskChecklistItems,
  complianceTaskComments,
  complianceTaskEvents,
  complianceTasks,
  engagementLeads,
  engagementManagers,
  engagements,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { confirmPending, getActivityRow, systemEnsureActivitiesSeeded, toActivityDto, type ActivityDto } from '@/db/repositories/compliance-activities';
import {
  REPEATS,
  STAGE_LABEL,
  URGENCY_BARS,
  daysBetweenIso,
  isStage,
  reminderBlockers,
  repeatsOfFrequency,
  statusWord,
  taskSteps,
  weekGroup,
  type ReminderRowOut,
  type Repeats,
  type Stage,
  type StatusWord,
  type StepOut,
  type Urgency,
  type Visibility,
  type WeekGroup,
} from '@/lib/compliance-tasks/model';
import { remindersFor } from './reminder-state';
import {
  READERS,
  STAFF,
  canManage,
  engagementLeadProfileId,
  engagementReviewerId,
  notFound,
  peopleById,
  personOf,
  scopeIds,
  scopedTask,
  today,
  type Person,
  type TaskRow,
} from './shared';
import { titleWithPeriod } from '@/lib/compliance/period-title';

export interface TaskRowDto {
  id: string;
  engagementId: string;
  companyName: string;
  activityId: string | null;
  activityName: string | null;
  name: string;
  periodLabel: string | null;
  title: string;
  startDate: string;
  dueDate: string;
  urgency: Urgency;
  urgencyBars: 1 | 2 | 3 | 4;
  visibility: Visibility;
  stage: Stage;
  stageLabel: string;
  word: StatusWord;
  hidden: boolean;
  /** Set when the task stands for a board meeting: the row opens the meeting page. */
  boardMeetingId: string | null;
  week: WeekGroup;
  daysToStart: number;
  daysToDue: number;
  owner: Person;
  reviewer: Person;
  repeats: Repeats;
  remindBefore: number;
  checklist: { done: number; total: number };
  attachmentCount: number;
  deliverable: { id: string; fileName: string } | null;
  completedAt: string | null;
  createdBy: Person;
  createdAt: string;
}

export interface TaskDetailDto extends TaskRowDto {
  activity: ActivityDto | null;
  checklistItems: Array<{ id: string; label: string; done: boolean; doneBy: Person; doneAt: string | null }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mime: string | null;
    sizeBytes: number | null;
    uploadedBy: Person;
    uploadedAt: string;
    deliverable: boolean;
    byClient: boolean;
  }>;
  comments: Array<{ id: string; author: Person; authorRole: string; body: string; internal: boolean; at: string }>;
  reminders: ReminderRowOut[];
  remindersBlockedBy: string[];
  history: Array<{ at: string; who: string | null; what: string }>;
  steps: StepOut[];
  reviewNote: string | null;
  can: { edit: boolean; changeStage: boolean; submit: boolean; review: boolean; tick: boolean; comment: boolean; upload: boolean };
}

const iso = (d: Date | string | null | undefined): string | null => (d ? (d instanceof Date ? d.toISOString() : String(d)) : null);

function asUrgency(v: string): Urgency {
  return (['Low', 'Medium', 'High', 'Critical'].includes(v) ? v : 'Medium') as Urgency;
}
function asVisibility(v: string): Visibility {
  return (['firm', 'client', 'both'].includes(v) ? v : 'firm') as Visibility;
}
function asRepeats(v: string): Repeats {
  return ((REPEATS as readonly string[]).includes(v) ? v : 'one-time') as Repeats;
}
function asStage(v: string): Stage {
  return isStage(v) ? v : 'not-started';
}

interface RowExtras {
  companyName: string;
  activityName: string | null;
  people: Map<string, { id: string; name: string; role: string }>;
  checklist: { done: number; total: number };
  attachmentCount: number;
  deliverable: { id: string; fileName: string } | null;
  forClient: boolean;
  day: string;
}

function toTaskRowDto(t: TaskRow, x: RowExtras): TaskRowDto {
  const stage = asStage(t.stage);
  const urgency = asUrgency(t.urgency);
  const word = statusWord(stage, t.dueDate, t.remindBefore, x.day);
  return {
    id: t.id,
    engagementId: appEngagementId(t.engagementId),
    companyName: x.companyName,
    activityId: t.activityId ?? null,
    activityName: x.activityName,
    name: t.name,
    periodLabel: t.periodLabel ?? null,
    title: titleWithPeriod(t.name, t.periodLabel),
    startDate: t.startDate,
    dueDate: t.dueDate,
    urgency,
    urgencyBars: URGENCY_BARS[urgency],
    visibility: asVisibility(t.visibility),
    stage,
    stageLabel: STAGE_LABEL[stage],
    word,
    hidden: stage === 'not-applicable',
    boardMeetingId: t.boardMeetingId ?? null,
    week: weekGroup(stage, t.dueDate, x.day),
    daysToStart: daysBetweenIso(x.day, t.startDate),
    daysToDue: daysBetweenIso(x.day, t.dueDate),
    owner: personOf(x.people, t.ownerId),
    reviewer: x.forClient ? null : personOf(x.people, t.reviewerId),
    repeats: asRepeats(t.repeats),
    remindBefore: t.remindBefore,
    checklist: x.checklist,
    attachmentCount: x.attachmentCount,
    deliverable: x.deliverable,
    completedAt: iso(t.completedAt),
    createdBy: personOf(x.people, t.createdBy),
    createdAt: iso(t.createdAt) ?? '',
  };
}

export interface TaskListQuery {
  engagementId?: string | null;
  status?: StatusWord[];
  urgency?: Urgency[];
  visibility?: Visibility[];
  activityId?: string | null;
  from?: string | null;
  to?: string | null;
  done?: boolean | null;
  mine?: boolean;
  includeNa?: boolean;
}

/** Tasks in the caller's scope, filtered. A client gets only its own client-visible tasks (K-1). */
export async function listTasks(ctx: AuthContext, q: TaskListQuery = {}): Promise<{ tasks: TaskRowDto[]; today: string }> {
  const day = today();
  const ids = await scopeIds(ctx, q.engagementId);
  if (ids.length === 0) return { tasks: [], today: day };
  const forClient = ctx.role === 'client';

  const where: SQL[] = [inArray(complianceTasks.engagementId, ids)];
  if (forClient) where.push(inArray(complianceTasks.visibility, ['client', 'both']));
  else if (q.visibility?.length) where.push(inArray(complianceTasks.visibility, q.visibility));
  if (q.urgency?.length) where.push(inArray(complianceTasks.urgency, q.urgency));
  if (q.activityId) where.push(eq(complianceTasks.activityId, q.activityId));
  if (q.from) where.push(gte(complianceTasks.dueDate, q.from));
  if (q.to) where.push(lte(complianceTasks.dueDate, q.to));
  if (q.done === true) where.push(eq(complianceTasks.stage, 'completed'));
  if (q.done === false) where.push(ne(complianceTasks.stage, 'completed'));
  if (q.mine) where.push(eq(complianceTasks.ownerId, ctx.userId));
  if (!q.includeNa) where.push(ne(complianceTasks.stage, 'not-applicable'));

  const rows = await db
    .select({ task: complianceTasks, companyName: engagements.companyName, activityName: complianceActivities.name })
    .from(complianceTasks)
    .innerJoin(engagements, eq(engagements.id, complianceTasks.engagementId))
    .leftJoin(complianceActivities, eq(complianceActivities.id, complianceTasks.activityId))
    .where(and(...where))
    .orderBy(asc(complianceTasks.dueDate), asc(complianceTasks.name))
    .limit(2000);
  if (rows.length === 0) return { tasks: [], today: day };

  const taskIds = rows.map((r) => r.task.id);
  const [lists, files, people] = await Promise.all([
    db
      .select({ taskId: complianceTaskChecklistItems.taskId, doneAt: complianceTaskChecklistItems.doneAt })
      .from(complianceTaskChecklistItems)
      .where(inArray(complianceTaskChecklistItems.taskId, taskIds)),
    db
      .select({
        id: complianceTaskAttachments.id,
        taskId: complianceTaskAttachments.taskId,
        fileName: complianceTaskAttachments.fileName,
        isDeliverable: complianceTaskAttachments.isDeliverable,
        uploadedAt: complianceTaskAttachments.uploadedAt,
      })
      .from(complianceTaskAttachments)
      .where(inArray(complianceTaskAttachments.taskId, taskIds))
      .orderBy(desc(complianceTaskAttachments.uploadedAt)),
    peopleById(rows.flatMap((r) => [r.task.ownerId, r.task.reviewerId, r.task.createdBy])),
  ]);
  const checklist = new Map<string, { done: number; total: number }>();
  for (const c of lists) {
    const cur = checklist.get(c.taskId) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (c.doneAt) cur.done += 1;
    checklist.set(c.taskId, cur);
  }
  const fileCount = new Map<string, number>();
  const deliverable = new Map<string, { id: string; fileName: string }>();
  for (const f of files) {
    fileCount.set(f.taskId, (fileCount.get(f.taskId) ?? 0) + 1);
    if (f.isDeliverable && !deliverable.has(f.taskId)) deliverable.set(f.taskId, { id: f.id, fileName: f.fileName });
  }

  let tasks = rows.map((r) =>
    toTaskRowDto(r.task, {
      companyName: r.companyName,
      activityName: r.activityName ?? null,
      people,
      checklist: checklist.get(r.task.id) ?? { done: 0, total: 0 },
      attachmentCount: fileCount.get(r.task.id) ?? 0,
      deliverable: deliverable.get(r.task.id) ?? null,
      forClient,
      day,
    }),
  );
  if (q.status?.length) {
    const want = new Set(q.status);
    tasks = tasks.filter((t) => want.has(t.word));
  }
  return { tasks, today: day };
}

/** One task with everything the detail page shows (4.3). */
export async function getTask(ctx: AuthContext, taskId: string): Promise<TaskDetailDto> {
  const { task, engagement } = await scopedTask(ctx, taskId);
  return buildTaskDetail(ctx, task, engagement.companyName);
}

export async function buildTaskDetail(ctx: AuthContext, task: TaskRow, companyName: string): Promise<TaskDetailDto> {
  const day = today();
  const forClient = ctx.role === 'client';
  const staff = STAFF.has(ctx.role);

  const [activityRow, items, files, comments, events] = await Promise.all([
    task.activityId ? getActivityRow(task.activityId) : Promise.resolve(null),
    db
      .select()
      .from(complianceTaskChecklistItems)
      .where(eq(complianceTaskChecklistItems.taskId, task.id))
      .orderBy(asc(complianceTaskChecklistItems.position), asc(complianceTaskChecklistItems.createdAt)),
    db.select().from(complianceTaskAttachments).where(eq(complianceTaskAttachments.taskId, task.id)).orderBy(desc(complianceTaskAttachments.uploadedAt)),
    db
      .select()
      .from(complianceTaskComments)
      .where(forClient ? and(eq(complianceTaskComments.taskId, task.id), eq(complianceTaskComments.internal, false)) : eq(complianceTaskComments.taskId, task.id))
      .orderBy(asc(complianceTaskComments.createdAt)),
    db
      .select()
      .from(complianceTaskEvents)
      .where(forClient ? and(eq(complianceTaskEvents.taskId, task.id), eq(complianceTaskEvents.internal, false)) : eq(complianceTaskEvents.taskId, task.id))
      .orderBy(desc(complianceTaskEvents.at))
      .limit(200),
  ]);
  const people = await peopleById([
    task.ownerId,
    task.reviewerId,
    task.createdBy,
    task.approvedBy,
    ...items.map((i) => i.doneBy),
    ...files.map((f) => f.uploadedBy),
    ...comments.map((c) => c.authorId),
    ...events.map((e) => e.actorId),
  ]);
  const deliverableFile = files.find((f) => f.isDeliverable) ?? null;
  const done = items.filter((i) => i.doneAt).length;
  const row = toTaskRowDto(task, {
    companyName,
    activityName: activityRow?.name ?? null,
    people,
    checklist: { done, total: items.length },
    attachmentCount: files.length,
    deliverable: deliverableFile ? { id: deliverableFile.id, fileName: deliverableFile.fileName } : null,
    forClient,
    day,
  });

  const blockedBy = reminderBlockers({
    engagementId: task.engagementId,
    stage: row.stage,
    ownerId: task.ownerId,
    prepDate: task.startDate,
    dueDate: task.dueDate,
    confirmPending: confirmPending(activityRow),
  });
  const reminders = await remindersFor('task', task.id, {
    dueDate: task.dueDate,
    notifyDays: task.remindBefore,
    done: row.stage === 'completed',
    blocked: blockedBy.length > 0,
    forClient,
  });

  const isReviewer = Boolean(task.reviewerId && task.reviewerId === ctx.userId);
  const name = (id: string | null | undefined) => (id ? (people.get(id)?.name ?? null) : null);

  return {
    ...row,
    activity: activityRow ? toActivityDto(activityRow, ctx.role) : null,
    checklistItems: items.map((i) => ({ id: i.id, label: i.label, done: Boolean(i.doneAt), doneBy: personOf(people, i.doneBy), doneAt: iso(i.doneAt) })),
    attachments: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      mime: f.mime ?? null,
      sizeBytes: f.sizeBytes ?? null,
      uploadedBy: personOf(people, f.uploadedBy),
      uploadedAt: iso(f.uploadedAt) ?? '',
      deliverable: f.isDeliverable,
      byClient: f.byClient,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      author: personOf(people, c.authorId),
      authorRole: c.authorId ? (people.get(c.authorId)?.role ?? 'staff') : 'staff',
      body: c.body,
      internal: c.internal,
      at: iso(c.createdAt) ?? '',
    })),
    reminders,
    remindersBlockedBy: forClient ? [] : blockedBy,
    history: events.map((e) => ({ at: iso(e.at) ?? '', who: name(e.actorId), what: e.label })),
    steps: taskSteps({
      stage: row.stage,
      createdBy: name(task.createdBy),
      createdAt: iso(task.createdAt) ?? '',
      owner: name(task.ownerId),
      reviewer: forClient ? null : name(task.reviewerId),
      checklistDone: done,
      checklistTotal: items.length,
      submittedAt: iso(task.submittedAt),
      completedAt: iso(task.completedAt),
      approvedBy: forClient ? null : name(task.approvedBy),
      firstAttachment: files[files.length - 1]?.fileName ?? null,
    }),
    reviewNote: forClient ? null : (task.reviewNote ?? null),
    can: {
      edit: canManage(ctx.role),
      changeStage: staff,
      submit: staff && !['review', 'completed'].includes(row.stage),
      review: row.stage === 'review' && (canManage(ctx.role) || (staff && isReviewer)),
      tick: staff,
      comment: READERS.has(ctx.role),
      upload: READERS.has(ctx.role),
    },
  };
}

export interface TaskDefaultsDto {
  owner: Person;
  reviewer: Person;
  owners: Array<{ id: string; name: string }>;
  reviewers: Array<{ id: string; name: string }>;
  activities: Array<{ id: string; name: string; notifyDays: number; repeats: Repeats; visibility: Visibility }>;
}

/** The New task form's defaults for one engagement (S-5). Admin, super admin and manager. */
export async function taskDefaults(ctx: AuthContext, engagementId: string): Promise<TaskDefaultsDto> {
  if (!canManage(ctx.role)) throw notFound();
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw notFound();
  await systemEnsureActivitiesSeeded();
  const eng = access.row;
  const [leadId, coLeads, coManagers, staffRows, acts] = await Promise.all([
    engagementLeadProfileId(eng),
    db.select({ internId: engagementLeads.internId }).from(engagementLeads).where(eq(engagementLeads.engagementId, eng.id)),
    db.select({ id: engagementManagers.managerId }).from(engagementManagers).where(eq(engagementManagers.engagementId, eng.id)),
    db
      .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role, internId: profiles.internId })
      .from(profiles)
      .where(and(inArray(profiles.role, ['super_admin', 'admin', 'manager', 'intern']), eq(profiles.status, 'active'), isNull(profiles.removedAt))),
    db
      .select()
      .from(complianceActivities)
      .where(eq(complianceActivities.activityGroup, 'non-statutory'))
      .orderBy(asc(complianceActivities.sort)),
  ]);
  const reviewerId = engagementReviewerId(eng);
  const managerIds = new Set([reviewerId, ...coManagers.map((m) => m.id)].filter(Boolean) as string[]);
  const label = (r: { id: string; name: string | null; email: string }) => ({ id: r.id, name: r.name?.trim() || r.email.split('@')[0] || 'Someone' });
  // Owners: this engagement's leads, its managers, and the firm's admins. Reviewers: managers and admins.
  const leadInternIds = new Set([eng.internId, ...coLeads.map((l) => l.internId)].filter(Boolean) as string[]);
  const owners = staffRows
    .filter((r) => isFirmWideAdmin(r.role) || managerIds.has(r.id) || r.id === leadId || (r.role === 'intern' && r.internId && leadInternIds.has(r.internId)))
    .map(label)
    .sort((a, b) => a.name.localeCompare(b.name));
  const reviewers = staffRows
    .filter((r) => isFirmWideAdmin(r.role) || managerIds.has(r.id))
    .map(label)
    .sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(staffRows.map((r) => [r.id, label(r)]));
  return {
    owner: leadId ? (byId.get(leadId) ?? null) : null,
    reviewer: reviewerId ? (byId.get(reviewerId) ?? null) : null,
    owners,
    reviewers,
    activities: acts.map((a) => ({
      id: a.id,
      name: a.name,
      notifyDays: a.notifyDays,
      repeats: repeatsOfFrequency(a.frequency),
      visibility: asVisibility(a.visibility),
    })),
  };
}

/** Counts of tasks by state in a due-date range (the counts route). */
export async function taskCounts(
  ctx: AuthContext,
  q: { engagementId?: string | null; from: string; to: string },
): Promise<{ total: number; open: number; done: number; overdue: number; dueSoon: number }> {
  const { tasks } = await listTasks(ctx, { engagementId: q.engagementId, from: q.from, to: q.to });
  return {
    total: tasks.length,
    open: tasks.filter((t) => t.stage !== 'completed').length,
    done: tasks.filter((t) => t.stage === 'completed').length,
    overdue: tasks.filter((t) => t.word === 'Overdue').length,
    dueSoon: tasks.filter((t) => t.word === 'Due soon').length,
  };
}

