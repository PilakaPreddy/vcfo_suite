import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceInstances } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { assertEngagementAccess, getMyEngagement } from '@/db/repositories/engagements';
import type { EngagementDbRow } from '@/db/repositories/engagements';

/**
 * COMPLIANCE SUBJECT SCOPE — the one access check behind the obligation and registration
 * record parts built on migration 0029 (VCFO Assist runs, the "From the client" and "Filled
 * by SBC" fields, the registration applicability read).
 *
 * A subject is one filing period (`obligation` or `filing`, keyed by the compliance instance
 * id) or one registration (`registration`, keyed by the checklist step id) of one engagement.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   Staff (super admin, admin, manager, lead) and clients only; a developer gets null before
 *   any query. The engagement goes through `assertEngagementAccess` (firm-wide admins every
 *   engagement, a manager owned or co-managed ones, a lead assigned ones, a client its own).
 *   A client that sends no engagement id gets its own engagement. A filing key must be an
 *   instance of that engagement, so a key from another tenant reads as not found.
 */

export type SubjectKind = 'obligation' | 'filing' | 'registration';

const ROLES = new Set(['super_admin', 'admin', 'manager', 'intern', 'client']);
const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REG = /^reg-\d{1,3}$/;
/** The two SPICe+ forms the VCFO Assist extension runs; each is a registration subject of its own. */
const SPICE_RUN_KEYS: ReadonlySet<string> = new Set(['spice-part-a', 'spice-part-b']);

export function isStaff(ctx: AuthContext): boolean {
  return STAFF.has(ctx.role);
}

/** The approved engagement for this caller, or null (out of scope, unknown, or wrong role). */
export async function scopeEngagement(
  ctx: AuthContext,
  engagementId?: string | null,
): Promise<{ dbId: string; row: EngagementDbRow } | null> {
  if (!ROLES.has(ctx.role)) return null;
  let id = engagementId?.trim() || null;
  if (!id) {
    if (ctx.role !== 'client') return null;
    const mine = await getMyEngagement(ctx);
    if (!mine) return null;
    id = mine.id;
  }
  const access = await assertEngagementAccess(ctx, id);
  if (!access.ok) return null;
  return { dbId: access.dbId, row: access.row };
}

/** True when the key names a subject of this engagement (a filing of it, or a registration step). */
export async function subjectInEngagement(dbId: string, kind: SubjectKind, key: string): Promise<boolean> {
  if (kind === 'registration') return REG.test(key) || SPICE_RUN_KEYS.has(key);
  if (!UUID.test(key)) return false;
  const [row] = await db
    .select({ id: complianceInstances.id })
    .from(complianceInstances)
    .where(and(eq(complianceInstances.id, key), eq(complianceInstances.engagementId, dbId)))
    .limit(1);
  return Boolean(row);
}

