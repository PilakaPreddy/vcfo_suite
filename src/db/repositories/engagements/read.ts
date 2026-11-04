import 'server-only';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagements } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import {
  coerceOwnershipType,
  coerceParentIndianRelationship,
  type Engagement,
} from '@/data/engagements';
import { normalizeEngagementChecklistState } from '@/lib/checklist/checklist-state-key';
import { slimChecklistIndexState } from '@/lib/checklist/checklist-index';
import {
  checklistViewerForRole,
  redactChecklistStateForViewer,
} from '@/lib/checklist/checklist-visibility';
import { LEGACY_ENGAGEMENT_IDS, engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { isFirmWideAdmin } from '@/lib/auth';
import { normalizeEngagementSchedule } from '@/lib/projects/schedule-windows';
import { listClientMemberEngagementIds } from '@/db/repositories/engagement-clients';
import {
  listLeadIdsByEngagementIds,
  listLeadMemberEngagementIds,
} from '@/db/repositories/engagement-leads-membership';
import { listManagerMemberEngagementIds } from '@/db/repositories/engagement-managers-membership';
import { type EngagementDbRow, type EngagementChecklistState, type EngagementListRow, engagementListColumns, checklistIndexSql, rowOwnedByManager, scopeFor } from './scope';

/** Role-scoped reads of engagements and their checklist state, and the app-shape mapping. */

export async function listEngagements(ctx: AuthContext): Promise<EngagementListRow[]> {
  const scope = await scopeFor(ctx);
  return db.select(engagementListColumns).from(engagements).where(scope);
}

/** Role-scoped ids only — used by tasks/requests/activity/invites/audit. */
export async function listScopedEngagementIds(ctx: AuthContext): Promise<string[]> {
  const scope = await scopeFor(ctx);
  const rows = await db.select({ id: engagements.id }).from(engagements).where(scope);
  return rows.map((row) => row.id);
}

/**
 * Slim checklist maps keyed by app engagement id (legacy e1 or uuid).
 * Dashboards / intern Today use this instead of N+1 full /checklist fetches.
 */
export async function listChecklistIndex(
  ctx: AuthContext,
): Promise<Record<string, EngagementChecklistState>> {
  const scope = await scopeFor(ctx);
  const rows = await db
    .select({
      id: engagements.id,
      checklistIndex: checklistIndexSql,
    })
    .from(engagements)
    .where(scope);

  const out: Record<string, EngagementChecklistState> = {};
  for (const row of rows) {
    const appId = LEGACY_ENGAGEMENT_IDS[row.id] ?? row.id;
    const raw = row.checklistIndex;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      out[appId] = {};
      continue;
    }
    out[appId] = checklistStateForViewer(ctx, slimChecklistIndexState(raw));
  }
  return out;
}

/**
 * What this caller may read of a checklist state: the lead's unreleased drafts
 * are stripped for the firm, and anything the manager has not accepted is
 * stripped for the client. Every route that hands `checklist_state` to the
 * browser goes through here; server-side flows keep the full row.
 */
export function checklistStateForViewer(
  ctx: Pick<AuthContext, 'role'>,
  state: EngagementChecklistState,
): EngagementChecklistState {
  return redactChecklistStateForViewer(checklistViewerForRole(ctx.role), state);
}

export async function getEngagementById(ctx: AuthContext, id: string) {
  const scope = await scopeFor(ctx);
  const [row] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.id, id), scope))
    .limit(1);
  return row ?? null;
}

export async function getEngagementBySlug(ctx: AuthContext, slug: string) {
  const scope = await scopeFor(ctx);
  const [row] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.slug, slug), scope))
    .limit(1);
  return row ?? null;
}

/** Map a DB row to the app Engagement shape (legacy e1 ids preserved). */
export function toAppEngagement(
  row: EngagementListRow | EngagementDbRow,
  client?: { email: string; name: string | null } | null,
  leadIds?: string[],
): Engagement {
  const primary = row.internId ?? '';
  const leads =
    leadIds && leadIds.length > 0
      ? Array.from(new Set(leadIds))
      : primary
        ? [primary]
        : [];
  return {
    id: LEGACY_ENGAGEMENT_IDS[row.id] ?? row.id,
    slug: row.slug,
    clientId: row.clientId,
    companyName: row.companyName,
    companyType: row.companyType as Engagement['companyType'],
    ownershipType: coerceOwnershipType(row.ownershipType),
    parentIndianRelationship: coerceParentIndianRelationship(row.parentIndianRelationship),
    schedule: normalizeEngagementSchedule(row.schedule),
    expectedCoiOn: row.expectedCoiOn ?? null,
    entityLegalForm: (row.entityLegalForm ?? 'company') as Engagement['entityLegalForm'],
    incorporationDate: row.incorporationDate ?? null,
    parentEntityName: row.parentEntityName,
    parentEntityAddress: row.parentEntityAddress,
    parentEntityRegistrationNumber: row.parentEntityRegistrationNumber,
    subsidiaryLegalName: row.subsidiaryLegalName,
    subsidiaryRegisteredAddress: row.subsidiaryRegisteredAddress,
    internId: primary,
    leadIds: leads,
    adminId: row.adminId ?? 'admin',
    managerId: row.managerId ?? undefined,
    createdAt: row.createdAt.toISOString().slice(0, 10),
    stage: row.stage as Engagement['stage'],
    health: row.health as Engagement['health'],
    clientUserId: row.clientUserId,
    clientEmail: client?.email ?? null,
    clientDisplayName: row.clientName?.trim() || client?.name?.trim() || null,
    complianceQuestionnaire:
      'complianceQuestionnaire' in row &&
      row.complianceQuestionnaire &&
      typeof row.complianceQuestionnaire === 'object' &&
      !Array.isArray(row.complianceQuestionnaire)
        ? (row.complianceQuestionnaire as Record<string, boolean | number | string>)
        : null,
  };
}

/** Attach leadIds to app engagements in one round-trip. */
export async function toAppEngagementsWithLeads(
  rows: Array<EngagementListRow | EngagementDbRow>,
): Promise<Engagement[]> {
  const leadMap = await listLeadIdsByEngagementIds(rows.map((r) => r.id));
  return rows.map((row) => toAppEngagement(row, null, leadMap.get(row.id)));
}

/** Any uuid-shaped id (the seeded demo ids are not RFC 4122, so `isUuid` is too strict here). */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unscoped existence + role check. `appOrDbId` is an app id, a DB uuid or an engagement slug. Distinguishes notFound vs forbidden so
 * API routes can return the same status codes as the old RLS-backed helpers.
 */
export async function assertEngagementAccess(
  ctx: AuthContext,
  appOrDbId: string,
): Promise<
  | { ok: true; dbId: string; row: EngagementDbRow }
  | { ok: false; dbId: string; notFound: true }
  | { ok: false; dbId: string; forbidden: true }
> {
  const appOrDb = engagementDbId(appOrDbId);
  // Staff project URLs carry the slug; a value that is not a uuid would make Postgres throw.
  const [row] = UUID_SHAPE.test(appOrDb)
    ? await db.select().from(engagements).where(eq(engagements.id, appOrDb)).limit(1)
    : await db.select().from(engagements).where(eq(engagements.slug, appOrDbId)).limit(1);
  const dbId = row?.id ?? appOrDb;
  if (!row || row.deletedAt) return { ok: false, dbId, notFound: true };

  if (isFirmWideAdmin(ctx.role)) return { ok: true, dbId, row };

  if (ctx.role === 'manager') {
    if (rowOwnedByManager(row, ctx.userId)) return { ok: true, dbId, row };
    // Co-managers (engagement_managers) — same membership source as scopeFor().
    const memberIds = await listManagerMemberEngagementIds(ctx.userId);
    if (memberIds.includes(dbId)) return { ok: true, dbId, row };
    return { ok: false, dbId, forbidden: true };
  }

  if (ctx.role === 'intern') {
    if (ctx.internId && row.internId === ctx.internId) return { ok: true, dbId, row };
    if (ctx.internId) {
      const memberIds = await listLeadMemberEngagementIds(ctx.internId);
      if (memberIds.includes(dbId)) return { ok: true, dbId, row };
    }
    return { ok: false, dbId, forbidden: true };
  }

  if (ctx.role === 'client') {
    const isOwner =
      row.clientUserId === ctx.userId ||
      (Boolean(ctx.clientId) && row.clientId === ctx.clientId);
    if (isOwner) return { ok: true, dbId, row };
    const memberIds = await listClientMemberEngagementIds(ctx.userId);
    if (memberIds.includes(dbId)) return { ok: true, dbId, row };
    return { ok: false, dbId, forbidden: true };
  }

  return { ok: false, dbId, forbidden: true };
}

/** Client portal: the single engagement owned by the session user. */
export async function getMyEngagement(ctx: AuthContext): Promise<EngagementListRow | null> {
  if (ctx.role !== 'client') return null;
  const rows = await listEngagements(ctx);
  // Deterministic: the engagement this client OWNS first, then the oldest one
  // they are a member of — never "whichever row the database returned first".
  return (
    [...rows].sort((a, b) => {
      const ao = a.clientUserId === ctx.userId ? 0 : 1;
      const bo = b.clientUserId === ctx.userId ? 0 : 1;
      return ao - bo || a.createdAt.getTime() - b.createdAt.getTime();
    })[0] ?? null
  );
}

export function checklistStateFromRow(row: EngagementDbRow): EngagementChecklistState {
  const raw = row.checklistState;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return normalizeEngagementChecklistState(raw as Record<string, unknown>);
}

/** Recycle bin — soft-deleted projects, newest first. Admin only. */
export async function listDeletedEngagements(ctx: AuthContext): Promise<EngagementListRow[]> {
  if (!isFirmWideAdmin(ctx.role)) return [];
  return db
    .select(engagementListColumns)
    .from(engagements)
    .where(isNotNull(engagements.deletedAt))
    .orderBy(desc(engagements.deletedAt));
}

/** Unscoped read used by delete/restore flows — a soft-deleted row is invisible to getEngagementById. */
export async function getEngagementIncludingDeleted(
  ctx: AuthContext,
  appOrDbId: string,
): Promise<EngagementDbRow | null> {
  if (!isFirmWideAdmin(ctx.role)) return null;
  const [row] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementDbId(appOrDbId)))
    .limit(1);
  return row ?? null;
}
