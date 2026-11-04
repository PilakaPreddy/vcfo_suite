import 'server-only';

import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { mailGroupMembers, mailGroups } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { recordAuditEvent } from '@/db/repositories/audit-events';

/**
 * MAIL GROUPS REPOSITORY (G-23): named recipient lists for the staff Email screen.
 *
 * >>> ACCESS CONTROL <<<
 *   staff (super_admin, admin, manager, intern):
 *     read   — groups they own, plus every shared group
 *     create — their own groups; only firm-wide admins (super_admin, admin) may mark one shared
 *     change / delete — their own groups; firm-wide admins also any shared group
 *   client, developer: nothing (every function refuses before the first query)
 */

export interface MailGroupMemberDto {
  email: string;
  name: string | null;
}

export interface MailGroupDto {
  id: string;
  name: string;
  shared: boolean;
  ownerId: string;
  /** True when the signed-in person may rename, change or delete it. */
  canEdit: boolean;
  members: MailGroupMemberDto[];
  createdAt: string;
}

export interface MailGroupInput {
  name: string;
  shared?: boolean;
  members: MailGroupMemberDto[];
}

export class MailGroupError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
  }
}

const MAX_MEMBERS = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertStaff(ctx: AuthContext) {
  if (!(isAdminOrManager(ctx.role) || ctx.role === 'intern')) {
    throw new MailGroupError('not permitted', 403);
  }
}

type GroupRow = typeof mailGroups.$inferSelect;

function canEdit(ctx: AuthContext, row: Pick<GroupRow, 'ownerId' | 'shared'>): boolean {
  return row.ownerId === ctx.userId || (row.shared && isFirmWideAdmin(ctx.role));
}

/** Who may see a group: its owner, or anyone on staff when it is shared. */
function visibleTo(ctx: AuthContext) {
  return or(eq(mailGroups.ownerId, ctx.userId), eq(mailGroups.shared, true));
}

/** Trim, lowercase and de-duplicate the addresses; refuse a bad one. */
function normaliseMembers(members: MailGroupMemberDto[]): MailGroupMemberDto[] {
  const seen = new Set<string>();
  const out: MailGroupMemberDto[] = [];
  for (const m of members) {
    const email = m.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new MailGroupError(`invalid_email:${email}`, 400);
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: m.name?.trim().slice(0, 120) || null });
  }
  if (out.length === 0) throw new MailGroupError('members_required', 400);
  if (out.length > MAX_MEMBERS) throw new MailGroupError('too_many_members', 400);
  return out;
}

function cleanName(name: string): string {
  const out = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!out) throw new MailGroupError('name_required', 400);
  return out;
}

async function withMembers(ctx: AuthContext, rows: GroupRow[]): Promise<MailGroupDto[]> {
  if (rows.length === 0) return [];
  const members = await db
    .select()
    .from(mailGroupMembers)
    .where(
      inArray(
        mailGroupMembers.groupId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(mailGroupMembers.position));
  const byGroup = new Map<string, MailGroupMemberDto[]>();
  for (const m of members) {
    const list = byGroup.get(m.groupId) ?? [];
    list.push({ email: m.email, name: m.name });
    byGroup.set(m.groupId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shared: row.shared,
    ownerId: row.ownerId,
    canEdit: canEdit(ctx, row),
    members: byGroup.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The caller's own groups and every shared group, by name. */
export async function listMailGroups(ctx: AuthContext): Promise<MailGroupDto[]> {
  assertStaff(ctx);
  const rows = await db
    .select()
    .from(mailGroups)
    .where(visibleTo(ctx))
    .orderBy(asc(mailGroups.name));
  return withMembers(ctx, rows);
}

async function loadEditable(ctx: AuthContext, id: string): Promise<GroupRow> {
  const [row] = await db
    .select()
    .from(mailGroups)
    .where(and(eq(mailGroups.id, id), visibleTo(ctx)))
    .limit(1);
  if (!row) throw new MailGroupError('not_found', 404);
  if (!canEdit(ctx, row)) throw new MailGroupError('not permitted', 403);
  return row;
}

async function writeMembers(groupId: string, members: MailGroupMemberDto[]) {
  await db.delete(mailGroupMembers).where(eq(mailGroupMembers.groupId, groupId));
  await db.insert(mailGroupMembers).values(
    members.map((m, position) => ({ groupId, email: m.email, name: m.name, position })),
  );
}

export async function createMailGroup(ctx: AuthContext, input: MailGroupInput): Promise<MailGroupDto> {
  assertStaff(ctx);
  const shared = Boolean(input.shared);
  if (shared && !isFirmWideAdmin(ctx.role)) {
    throw new MailGroupError('Only admins may create a shared group', 403);
  }
  const name = cleanName(input.name);
  const members = normaliseMembers(input.members);
  const [row] = await db
    .insert(mailGroups)
    .values({ name, shared, ownerId: ctx.userId })
    .returning();
  await writeMembers(row.id, members);
  await recordAuditEvent(ctx, {
    action: 'mail_group.create',
    summary: `Mail group ${name} created`,
    metadata: { groupId: row.id, shared, members: members.length },
  });
  const [dto] = await withMembers(ctx, [row]);
  return dto;
}

export async function updateMailGroup(
  ctx: AuthContext,
  id: string,
  patch: Partial<MailGroupInput>,
): Promise<MailGroupDto> {
  assertStaff(ctx);
  const existing = await loadEditable(ctx, id);
  if (patch.shared === true && !existing.shared && !isFirmWideAdmin(ctx.role)) {
    throw new MailGroupError('Only admins may share a group', 403);
  }
  const set: Partial<Pick<GroupRow, 'name' | 'shared'>> = {};
  if (patch.name !== undefined) set.name = cleanName(patch.name);
  if (patch.shared !== undefined) set.shared = patch.shared;
  const members = patch.members !== undefined ? normaliseMembers(patch.members) : null;

  let row = existing;
  if (Object.keys(set).length > 0) {
    [row] = await db.update(mailGroups).set(set).where(eq(mailGroups.id, existing.id)).returning();
  }
  if (members) await writeMembers(existing.id, members);
  await recordAuditEvent(ctx, {
    action: 'mail_group.update',
    summary: `Mail group ${row.name} changed`,
    metadata: { groupId: row.id, shared: row.shared, members: members?.length },
  });
  const [dto] = await withMembers(ctx, [row]);
  return dto;
}

export async function deleteMailGroup(ctx: AuthContext, id: string): Promise<void> {
  assertStaff(ctx);
  const existing = await loadEditable(ctx, id);
  await db.delete(mailGroups).where(eq(mailGroups.id, existing.id));
  await recordAuditEvent(ctx, {
    action: 'mail_group.delete',
    summary: `Mail group ${existing.name} deleted`,
    metadata: { groupId: existing.id },
  });
}

/**
 * Addresses of the groups the caller may use, for the send route. A group the caller cannot
 * see is ignored, so a guessed id expands to nothing.
 */
export async function expandMailGroups(ctx: AuthContext, ids: string[]): Promise<string[]> {
  assertStaff(ctx);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: mailGroups.id })
    .from(mailGroups)
    .where(and(inArray(mailGroups.id, ids), visibleTo(ctx)));
  if (rows.length === 0) return [];
  const members = await db
    .select({ email: mailGroupMembers.email })
    .from(mailGroupMembers)
    .where(
      inArray(
        mailGroupMembers.groupId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(mailGroupMembers.position));
  return [...new Set(members.map((m) => m.email.toLowerCase()))];
}
