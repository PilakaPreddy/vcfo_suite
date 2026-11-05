import 'server-only';
import { and, desc, eq, inArray, isNull, like, notLike, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagementLeads, engagementManagers, profiles, tasks } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { StatusCode } from '@/data/checklist';
import type { TaskInstance } from '@/data/engagements';
import {
  assertEngagementAccess,
  listEngagements,
  listScopedEngagementIds,
} from '@/db/repositories/engagements';
import {
  engagementDbId,
  LEGACY_ENGAGEMENT_IDS,
} from '@/lib/projects/legacy-engagement-ids';
import { isAdminOrManager, isFirmWideAdmin, isValidDbRole } from '@/lib/auth';
import {
  canAccessPersonalTodos,
  canMutatePersonalTodo,
  CUSTOM_INTERN_FOCUS_PREFIX,
  entryIdFromPersonalTodoStepId,
  INTERN_FOCUS_TITLE_MAX,
  isPersonalTodoStepId,
  managerVisibleTodoOwnerIds,
  PERSONAL_TODO_STAFF_ROLES,
  PERSONAL_TODO_STEP_PREFIX,
  personalTodoStepId,
  type PersonalTodoDto,
} from '@/lib/intern/personal-todos';
import { taskAssignmentPatch, taskCompletionPatch } from '@/lib/metrics/trend-stamps';

/**
 * TASKS REPOSITORY — replaces vcfo.tasks localStorage.
 *
 * Access (product default, no original RLS):
 *   admin: all
 *   manager: via owned engagements (manager_id / legacy admin_id)
 *   intern/client: rows whose engagement is in their scoped list
 *
 * Personal todos (LeadFocusCard) reuse this table with engagement_id null,
 * assigned_to = owner, step_id prefix `todo:`. They are excluded from
 * listTasks / getTaskById. See listPersonalTodos for Path A rules.
 *
 * Every write that changes the status also stamps `completed_at` (`taskCompletionPatch`): set
 * when the task moves to done, cleared when it reopens. The home trend lines read it.
 */

type Row = typeof tasks.$inferSelect;

const APP_TO_DB_STATUS: Partial<Record<StatusCode, string>> = {
  'not-started': 'open',
  'in-progress': 'in-progress',
  completed: 'done',
  'awaiting-client': 'open',
  overdue: 'open',
  'not-applicable': 'open',
};

function dbStatusToApp(status: string): StatusCode {
  if (status === 'open') return 'not-started';
  if (status === 'in-progress') return 'in-progress';
  if (status === 'done') return 'completed';
  const known: StatusCode[] = [
    'not-started',
    'in-progress',
    'awaiting-client',
    'completed',
    'overdue',
    'not-applicable',
  ];
  return (known as string[]).includes(status) ? (status as StatusCode) : 'not-started';
}

function appStatusToDb(status: StatusCode | string): string {
  return APP_TO_DB_STATUS[status as StatusCode] ?? status;
}

function appEngagementId(dbId: string | null): string {
  if (!dbId) return '';
  return LEGACY_ENGAGEMENT_IDS[dbId] ?? dbId;
}

/** A board place from the client: a whole number from 0 to 100000, or null to clear it. */
function normalizeSortOrder(value: unknown): number | null {
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) return null;
  return n;
}

export function toAppTask(row: Row): TaskInstance {
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    checklistKey: row.stepId ?? '',
    status: dbStatusToApp(row.status),
    assigneeId: row.assignedTo ?? undefined,
    dueAt: row.deadline ? row.deadline.toISOString() : undefined,
    notes: row.description ?? undefined,
    title: row.title,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.assignedBy ? { assignedById: row.assignedBy } : {}),
    ...(row.sortOrder != null ? { sortOrder: row.sortOrder } : {}),
  };
}

/** Adds the name of whoever assigned each task ("Assigned by" in the Work drawer). One query. */
async function withAssignerNames(list: TaskInstance[]): Promise<TaskInstance[]> {
  const ids = [...new Set(list.map((t) => t.assignedById).filter(Boolean) as string[])];
  if (ids.length === 0) return list;
  const rows = await db.select({ id: profiles.id, name: profiles.name }).from(profiles).where(inArray(profiles.id, ids));
  const names = new Map(rows.map((r) => [r.id, r.name ?? '']));
  return list.map((t) => (t.assignedById && names.get(t.assignedById) ? { ...t, assignedByName: names.get(t.assignedById) } : t));
}

async function scopedEngagementIds(ctx: AuthContext): Promise<string[] | 'all'> {
  if (isFirmWideAdmin(ctx.role)) return 'all';
  return listScopedEngagementIds(ctx);
}

const notPersonalTodo = or(
  isNull(tasks.stepId),
  notLike(tasks.stepId, `${PERSONAL_TODO_STEP_PREFIX}%`),
);

export async function listTasks(ctx: AuthContext): Promise<TaskInstance[]> {
  const scope = await scopedEngagementIds(ctx);
  if (scope !== 'all' && scope.length === 0) return [];

  const rows =
    scope === 'all'
      ? await db.select().from(tasks).where(notPersonalTodo).orderBy(desc(tasks.updatedAt))
      : await db
          .select()
          .from(tasks)
          .where(and(inArray(tasks.engagementId, scope), notPersonalTodo))
          .orderBy(desc(tasks.updatedAt));

  return withAssignerNames(rows.map(toAppTask));
}

export async function getTaskById(
  ctx: AuthContext,
  id: string,
): Promise<TaskInstance | null> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!row) return null;
  if (isPersonalTodoStepId(row.stepId)) return null;
  if (row.engagementId) {
    const access = await assertEngagementAccess(ctx, row.engagementId);
    if (!access.ok) return null;
  } else if (!isAdminOrManager(ctx.role)) {
    return null;
  }
  return toAppTask(row);
}

export interface CreateTaskInput {
  engagementId: string;
  title?: string;
  checklistKey?: string;
  status?: StatusCode;
  assigneeId?: string | null;
  dueAt?: string | null;
  notes?: string | null;
}

export async function createTask(
  ctx: AuthContext,
  input: CreateTaskInput,
): Promise<TaskInstance> {
  if (ctx.role === 'client') {
    throw new Error('Clients may not create tasks');
  }
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) throw new Error('Engagement not found or not permitted');

  const title = input.title?.trim() || input.checklistKey?.trim() || 'Task';
  const status = appStatusToDb(input.status ?? 'not-started');
  const [row] = await db
    .insert(tasks)
    .values({
      engagementId: access.dbId,
      title,
      stepId: input.checklistKey ?? null,
      status,
      ...taskCompletionPatch(null, status),
      assignedTo: input.assigneeId ?? null,
      ...taskAssignmentPatch(ctx.userId, undefined, input.assigneeId ?? null, true),
      deadline: input.dueAt ? new Date(input.dueAt) : null,
      description: input.notes ?? null,
    })
    .returning();
  return toAppTask(row);
}

export async function updateTask(
  ctx: AuthContext,
  id: string,
  patch: Partial<TaskInstance>,
): Promise<TaskInstance | null> {
  const existing = await getTaskById(ctx, id);
  if (!existing) return null;
  if (ctx.role === 'client') {
    throw new Error('Clients may not update tasks');
  }

  // Moving a task: the caller must also have access to the TARGET engagement.
  let targetEngagementDbId: string | undefined;
  if (patch.engagementId !== undefined) {
    targetEngagementDbId = engagementDbId(patch.engagementId);
    const currentDbId = existing.engagementId ? engagementDbId(existing.engagementId) : null;
    if (targetEngagementDbId !== currentDbId) {
      const target = await assertEngagementAccess(ctx, patch.engagementId);
      if (!target.ok) return null;
      targetEngagementDbId = target.dbId;
    }
  }

  const nextStatus = patch.status !== undefined ? appStatusToDb(patch.status) : undefined;
  const [row] = await db
    .update(tasks)
    .set({
      ...(patch.checklistKey !== undefined ? { stepId: patch.checklistKey } : {}),
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      ...taskCompletionPatch(appStatusToDb(existing.status), nextStatus),
      ...(patch.assigneeId !== undefined ? { assignedTo: patch.assigneeId ?? null } : {}),
      ...taskAssignmentPatch(ctx.userId, existing.assigneeId ?? null, patch.assigneeId === undefined ? undefined : (patch.assigneeId ?? null)),
      ...(patch.dueAt !== undefined
        ? { deadline: patch.dueAt ? new Date(patch.dueAt) : null }
        : {}),
      ...(patch.notes !== undefined ? { description: patch.notes ?? null } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: normalizeSortOrder(patch.sortOrder) } : {}),
      ...(targetEngagementDbId !== undefined ? { engagementId: targetEngagementDbId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();
  return row ? toAppTask(row) : null;
}

const personalTodoSelect = {
  task: tasks,
  ownerName: profiles.name,
  ownerEmail: profiles.email,
  ownerRole: profiles.role,
};

function toPersonalTodoDto(row: {
  task: Row;
  ownerName: string | null;
  ownerEmail: string;
  ownerRole: string;
}): PersonalTodoDto | null {
  const entryId = entryIdFromPersonalTodoStepId(row.task.stepId);
  if (!entryId || !row.task.assignedTo) return null;
  const name = row.ownerName?.trim() || row.ownerEmail.split('@')[0] || 'Teammate';
  const ownerRole = isValidDbRole(row.ownerRole) ? row.ownerRole : 'intern';
  return {
    id: row.task.id,
    ownerId: row.task.assignedTo,
    ownerName: name,
    ownerRole,
    title: row.task.title,
    done: row.task.status === 'done',
    custom: entryId.startsWith(CUSTOM_INTERN_FOCUS_PREFIX),
    entryId,
    updatedAt: row.task.updatedAt.toISOString(),
  };
}

async function personalTodoOwnerScope(
  ctx: AuthContext,
): Promise<string[] | 'all' | 'none'> {
  if (!canAccessPersonalTodos(ctx.role)) return 'none';
  if (ctx.role === 'intern') return [ctx.userId];
  if (isFirmWideAdmin(ctx.role)) return 'all';

  const engs = await listEngagements(ctx);
  const internKeys = new Set<string>();
  const managerIds = new Set<string>([ctx.userId]);
  const engIds: string[] = [];
  for (const eng of engs) {
    engIds.push(eng.id);
    if (eng.internId?.trim()) internKeys.add(eng.internId.trim());
    if (eng.managerId) managerIds.add(eng.managerId);
  }
  if (engIds.length > 0) {
    const leadRows = await db
      .select({ internId: engagementLeads.internId })
      .from(engagementLeads)
      .where(inArray(engagementLeads.engagementId, engIds));
    for (const row of leadRows) internKeys.add(row.internId);
    const managerRows = await db
      .select({ managerId: engagementManagers.managerId })
      .from(engagementManagers)
      .where(inArray(engagementManagers.engagementId, engIds));
    for (const row of managerRows) managerIds.add(row.managerId);
  }

  const internIds = internKeys.size
    ? (
        await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(
            and(eq(profiles.role, 'intern'), inArray(profiles.internId, [...internKeys])),
          )
      ).map((row) => row.id)
    : [];

  const reports = (
    await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.role, 'intern'), eq(profiles.reportsToManagerId, ctx.userId)))
  ).map((row) => row.id);

  return managerVisibleTodoOwnerIds({
    managerId: ctx.userId,
    reportProfileIds: reports,
    leadProfileIdsOnEngagements: internIds,
    managerProfileIdsOnEngagements: [...managerIds],
  });
}

const personalTodoMarker = and(
  isNull(tasks.engagementId),
  like(tasks.stepId, `${PERSONAL_TODO_STEP_PREFIX}%`),
);

export async function listPersonalTodos(ctx: AuthContext): Promise<PersonalTodoDto[]> {
  const scope = await personalTodoOwnerScope(ctx);
  if (scope === 'none') return [];

  const ownerFilter =
    scope === 'all'
      ? inArray(profiles.role, [...PERSONAL_TODO_STAFF_ROLES])
      : scope.length === 0
        ? eq(profiles.id, '__none__')
        : inArray(tasks.assignedTo, scope);

  const rows = await db
    .select(personalTodoSelect)
    .from(tasks)
    .innerJoin(profiles, eq(profiles.id, tasks.assignedTo))
    .where(and(personalTodoMarker, ownerFilter))
    .orderBy(desc(tasks.updatedAt));

  return rows.map(toPersonalTodoDto).filter((row): row is PersonalTodoDto => Boolean(row));
}

async function getPersonalTodoRow(id: string) {
  const [row] = await db
    .select(personalTodoSelect)
    .from(tasks)
    .innerJoin(profiles, eq(profiles.id, tasks.assignedTo))
    .where(and(eq(tasks.id, id), personalTodoMarker))
    .limit(1);
  return row ?? null;
}

export interface UpsertPersonalTodoInput {
  entryId?: string;
  title: string;
  done?: boolean;
  custom?: boolean;
}

export async function upsertPersonalTodo(
  ctx: AuthContext,
  input: UpsertPersonalTodoInput,
): Promise<PersonalTodoDto> {
  if (!canAccessPersonalTodos(ctx.role)) {
    throw new Error('not permitted');
  }
  const title = input.title.trim().slice(0, INTERN_FOCUS_TITLE_MAX);
  if (!title) throw new Error('title_required');

  const custom = input.custom === true;
  const entryId =
    input.entryId?.trim() ||
    `${CUSTOM_INTERN_FOCUS_PREFIX}${crypto.randomUUID()}`;
  const stepId = personalTodoStepId(entryId);
  const status = input.done ? 'done' : 'open';

  const [existing] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.assignedTo, ctx.userId), eq(tasks.stepId, stepId), personalTodoMarker),
    )
    .limit(1);

  if (existing) {
    if (!canMutatePersonalTodo({ role: ctx.role, userId: ctx.userId }, existing.assignedTo)) {
      throw new Error('not permitted');
    }
    const [row] = await db
      .update(tasks)
      .set({
        title,
        status,
        ...taskCompletionPatch(existing.status, status),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, existing.id))
      .returning();
    const joined = await getPersonalTodoRow(row.id);
    const dto = joined ? toPersonalTodoDto(joined) : null;
    if (!dto) throw new Error('update_failed');
    return dto;
  }

  const [row] = await db
    .insert(tasks)
    .values({
      engagementId: null,
      assignedTo: ctx.userId,
      title,
      stepId,
      status,
      ...taskCompletionPatch(null, status),
      description: custom ? 'custom' : 'pin',
    })
    .returning();
  const joined = await getPersonalTodoRow(row.id);
  const dto = joined ? toPersonalTodoDto(joined) : null;
  if (!dto) throw new Error('create_failed');
  return dto;
}

export async function updatePersonalTodo(
  ctx: AuthContext,
  id: string,
  patch: { title?: string; done?: boolean },
): Promise<PersonalTodoDto | null> {
  const existing = await getPersonalTodoRow(id);
  if (!existing) return null;
  if (!canMutatePersonalTodo({ role: ctx.role, userId: ctx.userId }, existing.task.assignedTo)) {
    throw new Error('not permitted');
  }

  const title =
    patch.title !== undefined ? patch.title.trim().slice(0, INTERN_FOCUS_TITLE_MAX) : undefined;
  if (title !== undefined && !title) throw new Error('title_required');

  const nextStatus = patch.done !== undefined ? (patch.done ? 'done' : 'open') : undefined;
  const [row] = await db
    .update(tasks)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      ...taskCompletionPatch(existing.task.status, nextStatus),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();
  if (!row) return null;
  const joined = await getPersonalTodoRow(row.id);
  return joined ? toPersonalTodoDto(joined) : null;
}

export async function deletePersonalTodo(ctx: AuthContext, id: string): Promise<boolean> {
  const existing = await getPersonalTodoRow(id);
  if (!existing) return false;
  if (!canMutatePersonalTodo({ role: ctx.role, userId: ctx.userId }, existing.task.assignedTo)) {
    throw new Error('not permitted');
  }
  await db.delete(tasks).where(eq(tasks.id, id));
  return true;
}

