import 'server-only';
import { and, eq, max } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceTaskChecklistItems, complianceTaskComments, complianceTaskEvents, complianceTasks } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { getActivityRow, systemEnsureActivitiesSeeded } from '@/db/repositories/compliance-activities';
import { queueIndexRefresh } from '@/lib/ask/index-cards/queue';
import { queueTaskCompleted } from '@/lib/compliance-tasks/events';
import {
  STAGE_LABEL,
  periodLabelFor,
  repeatsOfFrequency,
  type Repeats,
  type Stage,
  type Urgency,
  type Visibility,
} from '@/lib/compliance-tasks/model';
import { buildTaskDetail, type TaskDetailDto } from './read';
import { systemCreateNextOccurrence } from './repeat';
import {
  ComplianceTaskError,
  STAFF,
  canManage,
  engagementLeadProfileId,
  engagementReviewerId,
  forbidden,
  isActiveStaff,
  notFound,
  notifyTask,
  scopedTask,
  type TaskRow,
} from './shared';

/**
 * COMPLIANCE TASK WRITES — New task (S-5), stage changes (3.3), edits, review, checklist and
 * comments. Roles (3.5): admin, super admin and manager create, edit and review; a lead works
 * the task (stage, checklist, comments, files) and submits it for review; a client comments
 * and uploads on a task it can see. Every write records a `compliance_task_events` row.
 */

async function recordEvent(ctx: AuthContext, taskId: string, label: string, internal = false): Promise<void> {
  try {
    await db.insert(complianceTaskEvents).values({ taskId, actorId: ctx.userId, label: label.slice(0, 300), internal });
  } catch (err) {
    console.error('[compliance-tasks] could not record an event', err);
  }
}

const VIS_LABEL: Record<Visibility, string> = { firm: 'Firm only', client: 'Client only', both: 'Firm and client' };

export interface CreateTaskInput {
  engagementId: string;
  activityId: string | null;
  name?: string | null;
  startDate: string;
  dueDate: string;
  urgency: Urgency;
  visibility: Visibility;
  ownerId?: string | null;
  reviewerId?: string | null;
  repeats?: Repeats | null;
  remindBefore?: number | null;
  checklist?: string[];
}

/** S-5: an admin, super admin or manager adds a non-statutory task for a client in scope. */
export async function createTask(ctx: AuthContext, input: CreateTaskInput): Promise<TaskDetailDto> {
  if (!canManage(ctx.role)) throw forbidden();
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) throw notFound();
  if (input.dueDate < input.startDate) throw new ComplianceTaskError(400, 'end_before_start');

  await systemEnsureActivitiesSeeded();
  const activity = input.activityId ? await getActivityRow(input.activityId) : null;
  if (input.activityId && (!activity || activity.activityGroup !== 'non-statutory')) throw new ComplianceTaskError(400, 'unknown_activity');
  const name = (input.name?.trim() || activity?.name || '').slice(0, 120);
  if (!name) throw new ComplianceTaskError(400, 'name_required');

  const ownerId = input.ownerId === undefined ? await engagementLeadProfileId(access.row) : input.ownerId;
  const reviewerId = input.reviewerId === undefined ? engagementReviewerId(access.row) : input.reviewerId;
  for (const id of [ownerId, reviewerId]) {
    if (id && !(await isActiveStaff(id))) throw new ComplianceTaskError(400, 'owner_not_staff');
  }
  const repeats: Repeats = input.repeats ?? repeatsOfFrequency(activity?.frequency);
  const remindBefore = input.remindBefore ?? activity?.notifyDays ?? 5;

  const [task] = await db
    .insert(complianceTasks)
    .values({
      engagementId: access.dbId,
      activityId: activity?.id ?? null,
      name,
      periodLabel: periodLabelFor(repeats, input.startDate),
      startDate: input.startDate,
      dueDate: input.dueDate,
      urgency: input.urgency,
      visibility: input.visibility,
      ownerId: ownerId ?? null,
      reviewerId: reviewerId ?? null,
      repeats,
      remindBefore,
      createdBy: ctx.userId,
    })
    .returning();
  if (!task) throw new ComplianceTaskError(400, 'create_failed');
  queueIndexRefresh('compliance_task', task.id);
  // A repeating task starts its own series, so the next occurrences can find it.
  let row: TaskRow = task;
  if (repeats !== 'one-time') {
    const [withSeries] = await db.update(complianceTasks).set({ seriesId: task.id }).where(eq(complianceTasks.id, task.id)).returning();
    row = withSeries ?? task;
  }
  const labels = (input.checklist ?? []).map((l) => l.trim().slice(0, 200)).filter(Boolean).slice(0, 30);
  if (labels.length) {
    await db.insert(complianceTaskChecklistItems).values(labels.map((label, i) => ({ taskId: task.id, label, position: i + 1, createdBy: ctx.userId })));
  }
  await recordEvent(ctx, task.id, `Created the task · ${input.urgency} · ${VIS_LABEL[input.visibility]}`);
  await notifyTask(ctx, {
    task: row,
    companyName: access.row.companyName,
    title: `New task: ${name}`,
    body: `Due ${input.dueDate}`,
    recipientIds: [ownerId, reviewerId],
  });
  return buildTaskDetail(ctx, row, access.row.companyName);
}

/** Stages a lead may set. Completed and Not applicable are the manager's call (3.5). */
const LEAD_STAGES = new Set<Stage>(['not-started', 'ready', 'in-progress', 'waiting', 'review', 'rework']);

/** 3.3: move a task to a stage. `review` is the submit. */
export async function changeTaskStage(ctx: AuthContext, taskId: string, stage: Stage): Promise<TaskDetailDto> {
  if (!STAFF.has(ctx.role)) throw ctx.role === 'client' ? forbidden() : notFound();
  const { task, engagement } = await scopedTask(ctx, taskId);
  if (!canManage(ctx.role) && !LEAD_STAGES.has(stage)) throw forbidden();
  if (task.stage === stage) return buildTaskDetail(ctx, task, engagement.companyName);
  const now = new Date();
  const set: Partial<typeof complianceTasks.$inferInsert> = { stage, updatedAt: now };
  if (stage === 'review') set.submittedAt = now;
  if (stage === 'completed') {
    set.completedAt = now;
    set.approvedBy = ctx.userId;
  } else if (task.stage === 'completed') {
    set.completedAt = null;
    set.approvedBy = null;
  }
  const [updated] = await db.update(complianceTasks).set(set).where(eq(complianceTasks.id, task.id)).returning();
  const row = updated ?? task;
  await recordEvent(ctx, task.id, stage === 'review' ? 'Submitted for review' : `Moved to ${STAGE_LABEL[stage]}`);
  if (stage === 'review') {
    await notifyTask(ctx, {
      task: row,
      companyName: engagement.companyName,
      title: `Ready for review: ${row.name}`,
      body: row.periodLabel ?? '',
      recipientIds: [row.reviewerId ?? engagementReviewerId(engagement)],
    });
  }
  if (stage === 'completed') await afterCompleted(row);
  return buildTaskDetail(ctx, row, engagement.companyName);
}

async function afterCompleted(row: TaskRow): Promise<void> {
  if (row.repeats === 'one-time') return;
  try {
    await systemCreateNextOccurrence(row.id);
  } catch (err) {
    console.error('[compliance-tasks] next occurrence failed; the repeat job will retry', err);
  }
  await queueTaskCompleted(row.id);
}

export interface EditTaskInput {
  name?: string;
  startDate?: string;
  dueDate?: string;
  urgency?: Urgency;
  visibility?: Visibility;
  ownerId?: string | null;
  reviewerId?: string | null;
  repeats?: Repeats;
  remindBefore?: number;
}

/** Admin, super admin and manager change the task's set-up. */
export async function editTask(ctx: AuthContext, taskId: string, input: EditTaskInput): Promise<TaskDetailDto> {
  if (!canManage(ctx.role)) throw ctx.role === 'client' || ctx.role === 'intern' ? forbidden() : notFound();
  const { task, engagement } = await scopedTask(ctx, taskId);
  const start = input.startDate ?? task.startDate;
  const due = input.dueDate ?? task.dueDate;
  if (due < start) throw new ComplianceTaskError(400, 'end_before_start');
  for (const id of [input.ownerId, input.reviewerId]) {
    if (id && !(await isActiveStaff(id))) throw new ComplianceTaskError(400, 'owner_not_staff');
  }
  const set: Partial<typeof complianceTasks.$inferInsert> = { updatedAt: new Date() };
  const changes: string[] = [];
  if (input.name !== undefined && input.name.trim()) {
    set.name = input.name.trim().slice(0, 120);
    changes.push('name');
  }
  if (input.startDate !== undefined) {
    set.startDate = input.startDate;
    changes.push('start date');
  }
  if (input.dueDate !== undefined) {
    set.dueDate = input.dueDate;
    changes.push('end date');
  }
  if (input.urgency !== undefined) {
    set.urgency = input.urgency;
    changes.push(`urgency ${input.urgency}`);
  }
  if (input.visibility !== undefined) {
    set.visibility = input.visibility;
    changes.push(VIS_LABEL[input.visibility]);
  }
  if (input.ownerId !== undefined) {
    set.ownerId = input.ownerId;
    changes.push('owner');
  }
  if (input.reviewerId !== undefined) {
    set.reviewerId = input.reviewerId;
    changes.push('reviewer');
  }
  if (input.repeats !== undefined) {
    set.repeats = input.repeats;
    if (input.repeats !== 'one-time' && !task.seriesId) set.seriesId = task.id;
    changes.push(`repeats ${input.repeats}`);
  }
  if (input.remindBefore !== undefined) {
    set.remindBefore = input.remindBefore;
    changes.push(`remind ${input.remindBefore} days before`);
  }
  if (input.startDate !== undefined || input.repeats !== undefined) {
    set.periodLabel = periodLabelFor((input.repeats ?? task.repeats) as Repeats, start);
  }
  const [updated] = await db.update(complianceTasks).set(set).where(eq(complianceTasks.id, task.id)).returning();
  const row = updated ?? task;
  queueIndexRefresh('compliance_task', task.id);
  if (changes.length) await recordEvent(ctx, task.id, `Changed ${changes.join(', ')}`, input.ownerId !== undefined || input.reviewerId !== undefined);
  if (input.ownerId && input.ownerId !== task.ownerId) {
    await notifyTask(ctx, { task: row, companyName: engagement.companyName, title: `Assigned to you: ${row.name}`, body: `Due ${row.dueDate}`, recipientIds: [input.ownerId] });
  }
  return buildTaskDetail(ctx, row, engagement.companyName);
}

/** The reviewer's decision on a submitted task. */
export async function reviewTask(
  ctx: AuthContext,
  taskId: string,
  input: { decision: 'approve' | 'send-back'; note?: string | null },
): Promise<TaskDetailDto> {
  if (!STAFF.has(ctx.role)) throw ctx.role === 'client' ? forbidden() : notFound();
  const { task, engagement } = await scopedTask(ctx, taskId);
  const isReviewer = task.reviewerId === ctx.userId;
  if (!canManage(ctx.role) && !isReviewer) throw forbidden();
  if (task.stage !== 'review') throw new ComplianceTaskError(409, 'not_in_review');
  const note = input.note?.trim().slice(0, 500) || null;
  if (input.decision === 'send-back' && !note) throw new ComplianceTaskError(400, 'note_required');
  const now = new Date();
  const set: Partial<typeof complianceTasks.$inferInsert> =
    input.decision === 'approve'
      ? { stage: 'completed', completedAt: now, approvedBy: ctx.userId, updatedAt: now }
      : { stage: 'rework', reviewNote: note, updatedAt: now };
  const [updated] = await db.update(complianceTasks).set(set).where(eq(complianceTasks.id, task.id)).returning();
  const row = updated ?? task;
  if (input.decision === 'approve') {
    await recordEvent(ctx, task.id, 'Approved and closed');
    await notifyTask(ctx, { task: row, companyName: engagement.companyName, title: `Approved: ${row.name}`, body: row.periodLabel ?? '', recipientIds: [row.ownerId] });
    await afterCompleted(row);
  } else {
    await recordEvent(ctx, task.id, `Sent back for rework: ${note}`, true);
    await notifyTask(ctx, { task: row, companyName: engagement.companyName, title: `Sent back: ${row.name}`, body: note ?? '', recipientIds: [row.ownerId] });
  }
  return buildTaskDetail(ctx, row, engagement.companyName);
}

export interface ChecklistItemDto {
  id: string;
  label: string;
  done: boolean;
  doneBy: { id: string; name: string } | null;
  doneAt: string | null;
}

function itemDto(row: typeof complianceTaskChecklistItems.$inferSelect, ctx: AuthContext): ChecklistItemDto {
  return {
    id: row.id,
    label: row.label,
    done: Boolean(row.doneAt),
    doneBy: row.doneBy ? { id: row.doneBy, name: row.doneBy === ctx.userId ? ctx.name : '' } : null,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
  };
}

export async function addChecklistItem(ctx: AuthContext, taskId: string, label: string): Promise<ChecklistItemDto> {
  if (!STAFF.has(ctx.role)) throw ctx.role === 'client' ? forbidden() : notFound();
  const { task } = await scopedTask(ctx, taskId);
  const clean = label.trim().slice(0, 200);
  if (!clean) throw new ComplianceTaskError(400, 'label_required');
  const [{ top } = { top: 0 }] = await db
    .select({ top: max(complianceTaskChecklistItems.position) })
    .from(complianceTaskChecklistItems)
    .where(eq(complianceTaskChecklistItems.taskId, task.id));
  const [row] = await db
    .insert(complianceTaskChecklistItems)
    .values({ taskId: task.id, label: clean, position: Number(top ?? 0) + 1, createdBy: ctx.userId })
    .returning();
  await recordEvent(ctx, task.id, `Added "${clean}"`);
  return itemDto(row!, ctx);
}

export async function setChecklistItem(ctx: AuthContext, taskId: string, itemId: string, done: boolean): Promise<ChecklistItemDto> {
  if (!STAFF.has(ctx.role)) throw ctx.role === 'client' ? forbidden() : notFound();
  const { task } = await scopedTask(ctx, taskId);
  const [row] = await db
    .update(complianceTaskChecklistItems)
    .set(done ? { doneAt: new Date(), doneBy: ctx.userId } : { doneAt: null, doneBy: null })
    .where(and(eq(complianceTaskChecklistItems.id, itemId), eq(complianceTaskChecklistItems.taskId, task.id)))
    .returning();
  if (!row) throw notFound();
  await recordEvent(ctx, task.id, `${done ? 'Ticked' : 'Unticked'} "${row.label}"`);
  return itemDto(row, ctx);
}

export async function deleteChecklistItem(ctx: AuthContext, taskId: string, itemId: string): Promise<void> {
  if (!canManage(ctx.role)) throw forbidden();
  const { task } = await scopedTask(ctx, taskId);
  const [row] = await db
    .delete(complianceTaskChecklistItems)
    .where(and(eq(complianceTaskChecklistItems.id, itemId), eq(complianceTaskChecklistItems.taskId, task.id)))
    .returning();
  if (!row) throw notFound();
  await recordEvent(ctx, task.id, `Removed "${row.label}"`);
}

export interface CommentDto {
  id: string;
  author: { id: string; name: string } | null;
  authorRole: string;
  body: string;
  internal: boolean;
  at: string;
}

/** A comment from staff or the client (K-2). A client's comment is never internal. */
export async function addTaskComment(ctx: AuthContext, taskId: string, input: { body: string; internal?: boolean }): Promise<CommentDto> {
  const { task, engagement } = await scopedTask(ctx, taskId);
  const body = input.body.trim().slice(0, 2000);
  if (!body) throw new ComplianceTaskError(400, 'body_required');
  const internal = ctx.role === 'client' ? false : Boolean(input.internal);
  const [row] = await db.insert(complianceTaskComments).values({ taskId: task.id, authorId: ctx.userId, body, internal }).returning();
  if (row) queueIndexRefresh('comment', row.id);
  const recipients =
    ctx.role === 'client'
      ? [task.ownerId]
      : internal
        ? [task.ownerId, task.reviewerId]
        : [task.ownerId, task.reviewerId, engagement.clientUserId];
  await notifyTask(ctx, { task, companyName: engagement.companyName, title: `Comment on ${task.name}`, body: body.slice(0, 140), recipientIds: recipients });
  return { id: row!.id, author: { id: ctx.userId, name: ctx.name }, authorRole: ctx.role, body, internal, at: row!.createdAt.toISOString() };
}
