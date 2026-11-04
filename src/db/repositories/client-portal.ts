import { companyShortName } from '@/lib/client-portal/company';
import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { clientPortalPrefs, documentRequests, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import {
  assertEngagementAccess,
  checklistStateForViewer,
  checklistStateFromRow,
  getMyEngagement,
} from '@/db/repositories/engagements';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { getNotificationInboxHead } from '@/db/repositories/notifications';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { buildProgress, identifiersFromState } from '@/lib/client/client-overview';
import {
  CLIENT_PORTAL_DEFAULT_PREFS,
  normalizePortalPrefsPatch,
  type ClientPortalContact,
  type ClientPortalPrefs,
  type ClientPortalPrefsPatch,
  type ClientPortalShell,
} from '@/lib/client-portal/types';

/**
 * CLIENT PORTAL REPOSITORY (client portal v7 shell).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   client_portal_prefs — the owner only: every read and write is keyed by
 *                         `ctx.userId`; no caller-supplied profile id exists.
 *   shell aggregate     — `getMyEngagement(ctx)` + `assertEngagementAccess`,
 *                         then recipients / requests restricted to that one
 *                         approved engagement id; a client with no engagement
 *                         gets `null` (route → 404). Staff name an engagement
 *                         and get its shell only when it passes
 *                         `assertEngagementAccess`, with no inbox, no client
 *                         preferences and no team photos (those are client-only).
 */

export class ClientPortalForbiddenError extends Error {}

function assertClient(ctx: AuthContext) {
  if (ctx.role !== 'client') throw new ClientPortalForbiddenError('Client portal is for clients only');
}

type PrefsRow = typeof clientPortalPrefs.$inferSelect;

function toPrefs(row: PrefsRow | undefined): ClientPortalPrefs {
  if (!row) return { ...CLIENT_PORTAL_DEFAULT_PREFS };
  return {
    viewState: row.viewState === 'before' || row.viewState === 'after' ? row.viewState : 'auto',
    theme: row.theme === 'dark' || row.theme === 'system' ? row.theme : 'light',
    navOpen: row.navOpen ?? {},
    introSeen: Boolean(row.introSeenAt),
    docGrouping: row.docGrouping === 'category' ? 'category' : 'step',
    botNoteSeen: Boolean(row.botNoteSeenAt),
  };
}

export async function getPortalPrefs(ctx: AuthContext): Promise<ClientPortalPrefs> {
  assertClient(ctx);
  const [row] = await db
    .select()
    .from(clientPortalPrefs)
    .where(eq(clientPortalPrefs.profileId, ctx.userId))
    .limit(1);
  return toPrefs(row);
}

export async function updatePortalPrefs(
  ctx: AuthContext,
  patch: ClientPortalPrefsPatch,
): Promise<ClientPortalPrefs> {
  assertClient(ctx);
  const clean = normalizePortalPrefsPatch(patch);
  const now = new Date();
  const set: Partial<typeof clientPortalPrefs.$inferInsert> = { updatedAt: now };
  if (clean.viewState) set.viewState = clean.viewState;
  if (clean.theme) set.theme = clean.theme;
  if (clean.navOpen) set.navOpen = clean.navOpen;
  if (clean.docGrouping) set.docGrouping = clean.docGrouping;
  if (clean.introSeen) set.introSeenAt = now;
  if (clean.botNoteSeen) set.botNoteSeenAt = now;
  const [row] = await db
    .insert(clientPortalPrefs)
    .values({ profileId: ctx.userId, ...set })
    .onConflictDoUpdate({ target: clientPortalPrefs.profileId, set })
    .returning();
  return toPrefs(row);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Firm help desk, from env so dev/prod differ only by configuration. */
function supportContact(): ClientPortalContact {
  return {
    id: 'support',
    name: process.env.CLIENT_SUPPORT_NAME?.trim() || 'Customer support',
    role: 'SBC help desk',
    initials: 'CS',
    support: true,
    email: process.env.CLIENT_SUPPORT_EMAIL?.trim() || undefined,
    phoneE164: process.env.CLIENT_SUPPORT_PHONE_E164?.trim() || undefined,
    whatsappE164: process.env.CLIENT_SUPPORT_WHATSAPP_E164?.trim() || undefined,
  };
}

/**
 * Everything the portal chrome needs on every page: company, the signed-in
 * client, the team contacts in the sidebar, nav badges, the real COI state
 * and the client's own preferences.
 */
export async function getClientPortalShell(ctx: AuthContext, engagementId?: string): Promise<ClientPortalShell | null> {
  const isClient = ctx.role === 'client';
  // A client always gets the own engagement; staff get the one they name, if they may access it.
  const target = isClient ? (await getMyEngagement(ctx))?.id : engagementId;
  if (!target) return null;
  const access = await assertEngagementAccess(ctx, target);
  if (!access.ok) return null;
  const { row, dbId } = access;

  const state = checklistStateForViewer(ctx, checklistStateFromRow(row));
  const progress = buildProgress(state);
  const spicePhases = progress.byPhase.filter(
    (p) => p.id === 'pre-inc-phase-1' || p.id === 'pre-inc-phase-2',
  );
  const spiceDone = spicePhases.reduce((n, p) => n + p.done, 0);
  const spiceTotal = spicePhases.reduce((n, p) => n + p.total, 0);
  const identifiers = identifiersFromState(state);
  const incorporated = Boolean(identifiers.cin || row.incorporationDate?.trim());

  const [recipients, inbox, prefs, openRequests] = await Promise.all([
    resolveEngagementRecipients(dbId),
    isClient ? getNotificationInboxHead(ctx) : { unreadCount: 0 },
    isClient ? getPortalPrefs(ctx) : { ...CLIENT_PORTAL_DEFAULT_PREFS },
    db
      .select({ n: sql<number>`count(*)` })
      .from(documentRequests)
      .where(and(eq(documentRequests.engagementId, dbId), eq(documentRequests.status, 'pending'))),
  ]);

  const staff: Array<{ userId: string; name: string; email: string; role: ClientPortalContact['role'] }> = [];
  const seen = new Set<string>();
  for (const m of recipients?.managers ?? []) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    staff.push({ userId: m.userId, name: m.name, email: m.email, role: 'Project Manager' });
  }
  for (const l of recipients?.leads ?? []) {
    if (seen.has(l.userId)) continue;
    seen.add(l.userId);
    staff.push({ userId: l.userId, name: l.name, email: l.email, role: 'Project Lead' });
  }
  const phones = staff.length
    ? await db
        .select({ id: profiles.id, phoneE164: profiles.phoneE164, phone: profiles.phone, avatarKey: profiles.avatarObjectKey })
        .from(profiles)
        .where(inArray(profiles.id, staff.map((s) => s.userId)))
    : [];
  const photoById = new Map(phones.map((p) => [p.id, p.avatarKey ? `/api/client/portal/team-photo/${p.id}?v=${encodeURIComponent(p.avatarKey.slice(-12))}` : undefined]));
  const phoneById = new Map(phones.map((p) => [p.id, p.phoneE164?.trim() || p.phone?.trim() || undefined]));

  const team: ClientPortalContact[] = staff.map((s) => ({
    id: s.userId,
    name: s.name,
    role: s.role,
    initials: initialsOf(s.name),
    email: s.email || undefined,
    phoneE164: phoneById.get(s.userId),
    whatsappE164: phoneById.get(s.userId),
    // The photo route serves clients only, so staff see initials.
    avatarUrl: isClient ? photoById.get(s.userId) : undefined,
  }));
  team.push(supportContact());

  const [meRow] = await db
    .select({ name: profiles.name, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);
  const meName = meRow?.name?.trim() || ctx.name || ctx.email;
  const shortCompany = companyShortName(row.companyName);

  return {
    engagementId: appEngagementId(row.id),
    companyName: row.companyName,
    companyShort: shortCompany || row.companyName,
    me: { name: meName, email: meRow?.email ?? ctx.email, initials: initialsOf(meName), roleLabel: `${shortCompany || row.companyName} · ${isClient ? 'Client' : 'SBC'}` },
    team,
    incorporated,
    coiDate: row.incorporationDate?.trim() ? row.incorporationDate.trim().slice(0, 10) : null,
    viewer: isClient ? 'client' : 'staff',
    badges: {
      notifications: inbox.unreadCount,
      documents: Number(openRequests[0]?.n ?? 0),
      spiceDone,
      spiceTotal,
    },
    prefs,
  };
}

/**
 * Object key of a team member's photo, only when that person is a manager or
 * lead on the caller's own engagement (client role). Anything else → null.
 */
export async function getTeamPhotoKey(ctx: AuthContext, profileId: string): Promise<string | null> {
  assertClient(ctx);
  const mine = await getMyEngagement(ctx);
  if (!mine) return null;
  const access = await assertEngagementAccess(ctx, mine.id);
  if (!access.ok) return null;
  const recipients = await resolveEngagementRecipients(access.dbId);
  const onTeam = [...(recipients?.managers ?? []), ...(recipients?.leads ?? [])].some((p) => p.userId === profileId);
  if (!onTeam) return null;
  const [row] = await db.select({ key: profiles.avatarObjectKey }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
  return row?.key ?? null;
}
