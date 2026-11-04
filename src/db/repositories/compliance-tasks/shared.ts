import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceTasks, engagementLeads, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager } from '@/lib/auth';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';
import type { EngagementDbRow } from '@/db/repositories/engagements';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { todayIso } from '@/lib/client-portal/compliances';

/**
 * Shared parts of the compliance task repositories: roles, errors, the one scope check, people
 * lookups and the bell fan-out.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   Every read and write resolves the task first, then runs `assertEngagementAccess` on its
 *   engagement (firm-wide admins every engagement, a manager owned or co-managed ones, a lead
 *   assigned ones, a client its own). A client also needs visibility `client` or `both` (K-1).
 *   Anything outside scope reads as not found. Developers are refused before any query.
 */

export type TaskRow = typeof complianceTasks.$inferSelect;

export const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);
export const READERS = new Set(['super_admin', 'admin', 'manager', 'intern', 'client']);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ComplianceTaskError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

export const notFound = () => new ComplianceTaskError(404, 'not_found');
export const forbidden = () => new ComplianceTaskError(403, 'forbidden');

function isStaffRole(role: string): boolean {
  return STAFF.has(role);
}

/** Admin, super admin and manager: create, edit and review. */
export function canManage(role: string): boolean {
  return isAdminOrManager(role);
}

function clientMaySee(visibility: string): boolean {
  return visibility === 'client' || visibility === 'both';
}

export function today(): string {
  return todayIso();
}

/** The task and its engagement, if and only if the caller may read it. */
export async function scopedTask(ctx: AuthContext, taskId: string): Promise<{ task: TaskRow; engagement: EngagementDbRow }> {
  if (!READERS.has(ctx.role)) throw notFound();
  if (!UUID.test(taskId)) throw notFound();
  const [task] = await db.select().from(complianceTasks).where(eq(complianceTasks.id, taskId)).limit(1);
  if (!task) throw notFound();
  const access = await assertEngagementAccess(ctx, task.engagementId);
  if (!access.ok) throw notFound();
  if (ctx.role === 'client' && !clientMaySee(task.visibility)) throw notFound();
  return { task, engagement: access.row };
}

/** Engagement db ids the caller may read, narrowed to one when asked (access-checked). */
export async function scopeIds(ctx: AuthContext, engagementId?: string | null): Promise<string[]> {
  if (!READERS.has(ctx.role)) return [];
  const scoped = await listScopedEngagementIds(ctx);
  if (!engagementId?.trim()) return scoped;
  const access = await assertEngagementAccess(ctx, engagementId.trim());
  if (!access.ok) return [];
  return scoped.includes(access.dbId) ? [access.dbId] : [];
}

export type Person = { id: string; name: string } | null;

/** Names of the given profiles. */
export async function peopleById(ids: Array<string | null | undefined>): Promise<Map<string, { id: string; name: string; role: string }>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(inArray(profiles.id, unique));
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name?.trim() || r.email.split('@')[0] || 'Someone', role: r.role }]));
}

export function personOf(map: Map<string, { id: string; name: string }>, id: string | null | undefined): Person {
  if (!id) return null;
  const p = map.get(id);
  return p ? { id: p.id, name: p.name } : null;
}

/** The project lead of an engagement (profile of engagements.intern_id, else the first co-lead). */
export async function engagementLeadProfileId(engagement: Pick<EngagementDbRow, 'id' | 'internId'>): Promise<string | null> {
  const internIds: string[] = [];
  if (engagement.internId) internIds.push(engagement.internId);
  const co = await db.select({ internId: engagementLeads.internId }).from(engagementLeads).where(eq(engagementLeads.engagementId, engagement.id));
  internIds.push(...co.map((r) => r.internId));
  if (internIds.length === 0) return null;
  const rows = await db
    .select({ id: profiles.id, internId: profiles.internId })
    .from(profiles)
    .where(and(inArray(profiles.internId, internIds), eq(profiles.status, 'active'), isNull(profiles.removedAt)));
  for (const iid of internIds) {
    const hit = rows.find((r) => r.internId === iid);
    if (hit) return hit.id;
  }
  return null;
}

/** The manager who reviews by default: manager_id, else admin_id on a legacy row. */
export function engagementReviewerId(engagement: Pick<EngagementDbRow, 'managerId' | 'adminId'>): string | null {
  return engagement.managerId ?? engagement.adminId ?? null;
}

/** True when the profile is an active staff member (owner and reviewer must be staff). */
export async function isActiveStaff(profileId: string): Promise<boolean> {
  if (!UUID.test(profileId)) return false;
  const [row] = await db
    .select({ role: profiles.role, status: profiles.status, removedAt: profiles.removedAt })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return Boolean(row && STAFF.has(row.role) && row.status === 'active' && !row.removedAt);
}

/** The portal segment of a role, for bell links. */
function portalOf(role: string): string {
  if (role === 'super_admin') return 'super';
  if (role === 'intern') return 'intern';
  if (role === 'manager') return 'manager';
  if (role === 'client') return 'client';
  return 'admin';
}

/** Bell link to a task page, per the recipient's portal (docs/ui-port/COMPLIANCE-API.md section 7). */
export function taskHref(role: string, taskId: string): string {
  const portal = portalOf(role);
  if (portal === 'super') return '/app/super/practice/compliances';
  return `/app/${portal}/compliances/obligations/tasks/${taskId}`;
}

/** Bell link to a statutory detail page. */
export function statutoryHref(role: string, obligationId: string, instanceId: string): string {
  const portal = portalOf(role);
  if (portal === 'super') return '/app/super/practice/compliances';
  return `/app/${portal}/compliances/obligations/${encodeURIComponent(obligationId)}/${instanceId}`;
}

/**
 * Bell notifications about one task (kind `compliance.task`). Recipients are resolved by the
 * caller after its own scope check; the caller is never notified about their own action.
 * Never throws: the write that caused it has already succeeded.
 */
export async function notifyTask(
  ctx: AuthContext,
  input: { task: TaskRow; companyName: string; title: string; body: string; recipientIds: Array<string | null | undefined> },
): Promise<void> {
  try {
    const ids = [...new Set(input.recipientIds.filter((x): x is string => Boolean(x) && x !== ctx.userId))];
    if (ids.length === 0) return;
    const people = await peopleById(ids);
    const items = ids
      .map((id) => people.get(id))
      .filter((p): p is { id: string; name: string; role: string } => Boolean(p))
      // A client hears only about tasks it can see.
      .filter((p) => p.role !== 'client' || clientMaySee(input.task.visibility))
      .map((p) => ({
        userId: p.id,
        kind: 'compliance.task' as const,
        title: input.title,
        body: input.body,
        engagementId: appEngagementId(input.task.engagementId),
        companyName: input.companyName,
        itemId: input.task.id,
        href: taskHref(p.role, input.task.id),
        actorId: ctx.userId,
        actorName: ctx.name,
      }));
    await createNotificationsForUsers(items);
  } catch (err) {
    console.error('[compliance-tasks] bell notification failed', err);
  }
}
