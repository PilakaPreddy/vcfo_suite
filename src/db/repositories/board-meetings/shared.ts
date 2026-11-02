import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { boardMeetingEvents, boardMeetings, engagementLeads, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { assertEngagementAccess, checklistStateFromRow } from '@/db/repositories/engagements';
import type { EngagementDbRow } from '@/db/repositories/engagements';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { identifiersFromState } from '@/lib/client/client-overview';
import type { MeetingStatus } from '@/lib/board-meetings/model';

/**
 * BOARD MEETINGS — shared parts: roles, errors, the one scope check, people and the bell.
 *
 * >>> ACCESS CONTROL (Path A, docs/specs/board-meetings/PLAN.md) <<<
 *   Every read and write resolves the meeting first, then runs `assertEngagementAccess` on its
 *   engagement: firm-wide admins every engagement, a manager owned or co-managed ones, a lead
 *   assigned ones, a client its own. Anything outside scope reads as not found.
 *   - Staff (super admin, admin, manager, lead) read and work every meeting in scope.
 *   - Approving, sending back and editing a notice that waits for approval: admin, super admin,
 *     manager (`isAdminOrManager`).
 *   - A client reads a meeting only once its notice is sent (sent, held, cancelled after
 *     sending), and only locked documents.
 *   - Developers are refused before any query.
 */

export type MeetingRow = typeof boardMeetings.$inferSelect;

export const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BoardMeetingError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

export const notFound = () => new BoardMeetingError(404, 'not_found');
export const forbidden = () => new BoardMeetingError(403, 'forbidden');
export const conflict = (code: string) => new BoardMeetingError(409, code);
export const invalid = (code: string) => new BoardMeetingError(400, code);

export function isStaff(role: string): boolean {
  return STAFF.has(role);
}

/** Admin, super admin and manager approve, send back and edit a notice waiting for approval. */
export function canApprove(role: string): boolean {
  return isAdminOrManager(role);
}

export function canEditLibrary(role: string): boolean {
  return isFirmWideAdmin(role);
}

/** Statuses a client may read. A meeting cancelled before its notice went out stays hidden. */
export function clientMaySee(row: Pick<MeetingRow, 'status' | 'sentAt'>): boolean {
  const s = row.status as MeetingStatus;
  if (s === 'sent' || s === 'held') return true;
  return s === 'cancelled' && Boolean(row.sentAt);
}

/** The engagement, if the caller may read it; staff only unless `allowClient`. */
export async function scopedEngagement(ctx: AuthContext, engagementId: string, allowClient = false): Promise<EngagementDbRow> {
  if (!isStaff(ctx.role) && !(allowClient && ctx.role === 'client')) throw notFound();
  if (!engagementId?.trim()) throw notFound();
  const access = await assertEngagementAccess(ctx, engagementId.trim());
  if (!access.ok) throw notFound();
  return access.row;
}

/** The meeting and its engagement, if and only if the caller may read it. */
export async function scopedMeeting(ctx: AuthContext, meetingId: string): Promise<{ meeting: MeetingRow; engagement: EngagementDbRow }> {
  if (!isStaff(ctx.role) && ctx.role !== 'client') throw notFound();
  if (!UUID.test(meetingId)) throw notFound();
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId)).limit(1);
  if (!meeting) throw notFound();
  const access = await assertEngagementAccess(ctx, meeting.engagementId);
  if (!access.ok) throw notFound();
  if (ctx.role === 'client' && !clientMaySee(meeting)) throw notFound();
  return { meeting, engagement: access.row };
}

/** Staff only: the meeting for a write. */
export async function scopedMeetingForWrite(ctx: AuthContext, meetingId: string): Promise<{ meeting: MeetingRow; engagement: EngagementDbRow }> {
  if (!isStaff(ctx.role)) throw notFound();
  return scopedMeeting(ctx, meetingId);
}

export async function recordMeetingEvent(actorId: string | null, meetingId: string, label: string): Promise<void> {
  try {
    await db.insert(boardMeetingEvents).values({ meetingId, actorId, label: label.slice(0, 300) });
  } catch (err) {
    console.error('[board-meetings] could not record an event', err);
  }
}

export interface CompanyInfo {
  name: string;
  cin: string | null;
  address: string | null;
}

/** Name, CIN (from the checklist answers) and registered office of the client company. */
export function companyInfoOf(row: EngagementDbRow): CompanyInfo {
  let cin: string | null;
  try {
    cin = identifiersFromState(checklistStateFromRow(row) as never).cin?.trim() || null;
  } catch {
    cin = null;
  }
  const name = row.subsidiaryLegalName?.trim() || row.companyName;
  return { name, cin, address: row.subsidiaryRegisteredAddress?.trim() || null };
}

export type PersonLite = { id: string; name: string; email: string; role: string };

export async function peopleById(ids: Array<string | null | undefined>): Promise<Map<string, PersonLite>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(inArray(profiles.id, unique));
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name?.trim() || r.email.split('@')[0] || 'Someone', email: r.email, role: r.role }]));
}

/** The project lead profile of an engagement (intern_id, else the first co-lead). */
export async function leadProfileId(engagement: Pick<EngagementDbRow, 'id' | 'internId'>): Promise<string | null> {
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

/** The reviewing manager: manager_id, else admin_id on a legacy row. */
export function managerProfileId(engagement: Pick<EngagementDbRow, 'managerId' | 'adminId'>): string | null {
  return engagement.managerId ?? engagement.adminId ?? null;
}

/** Active firm admins (super admin and admin), for CC and bell rows. */
export async function firmAdmins(): Promise<PersonLite[]> {
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(and(inArray(profiles.role, ['admin', 'super_admin']), eq(profiles.status, 'active'), isNull(profiles.removedAt)));
  return rows.map((r) => ({ id: r.id, name: r.name?.trim() || r.email.split('@')[0] || 'Admin', email: r.email, role: r.role }));
}

export function portalOf(role: string): string {
  if (role === 'super_admin') return 'super';
  if (role === 'intern') return 'intern';
  if (role === 'manager') return 'manager';
  if (role === 'client') return 'client';
  return 'admin';
}

/** Where a role opens one meeting. Super admins use the admin pages. */
export function meetingHref(role: string, meetingId: string): string {
  const portal = role === 'super_admin' ? 'admin' : portalOf(role);
  return `/app/${portal}/compliances/obligations/meetings/${meetingId}`;
}

/** Bell rows for staff (and the client when `client` is set) about one meeting. */
export async function notifyMeeting(
  actor: { userId: string; name: string } | null,
  input: { meeting: MeetingRow; companyName: string; title: string; body: string; recipientIds: Array<string | null | undefined> },
): Promise<void> {
  try {
    const ids = [...new Set(input.recipientIds.filter((x): x is string => Boolean(x) && x !== actor?.userId))];
    if (ids.length === 0) return;
    const people = await peopleById(ids);
    const items = ids
      .map((id) => people.get(id))
      .filter((p): p is PersonLite => Boolean(p))
      .filter((p) => p.role !== 'client' || clientMaySee(input.meeting))
      .map((p) => ({
        userId: p.id,
        kind: 'board.meeting' as const,
        title: input.title,
        body: input.body,
        engagementId: appEngagementId(input.meeting.engagementId),
        companyName: input.companyName,
        itemId: input.meeting.id,
        href: meetingHref(p.role, input.meeting.id),
        actorId: actor?.userId,
        actorName: actor?.name,
      }));
    await createNotificationsForUsers(items);
  } catch (err) {
    console.error('[board-meetings] bell fan-out failed', err);
  }
}
