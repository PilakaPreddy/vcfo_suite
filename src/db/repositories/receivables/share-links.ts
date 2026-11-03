import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivablePartners, receivableSheets, receivableShareLinks, receivableShareViews, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { todayIst } from '@/lib/receivables/dates';
import type { SnapshotRow } from '@/lib/receivables/model';
import { applyShareFilters, describeShareFilters, normaliseShareFilters, type ShareFilters } from '@/lib/receivables/share-filters';
import {
  SHARE_EMAILS_MAX,
  SHARE_NAME_MAX,
  SHARE_VIEWER_LOG,
  SHARE_VISIBILITIES,
  type SharedRowDto,
  type SharedViewDto,
  type ShareVisibility,
} from '@/lib/receivables/share-wire';
import { UUID, assertEditorRole, conflict, invalid, mayEditSheet, notFound, scopedSheet } from './shared';

/**
 * RECEIVABLES SHARED VIEWS (Phase 10, docs/specs/receivables/PLAN.md): a named link,
 * /receivables/s/<token>, that shows the latest published version through a saved filter.
 *
 * >>> ACCESS CONTROL <<<
 *   Creating, listing, editing and revoking links goes through `scopedSheet`: the sheet's own
 *   manager and the firm-wide admins only. Interns, clients, developers and partners are refused
 *   before any query, and another manager reads the sheet (and its links) as not found.
 *
 *   Opening a link is `systemOpenShareLink`, which takes the token rather than a context because
 *   the token plus the link's visibility rule is the authority:
 *     public     → anyone with the link, signed in or not;
 *     login      → a client partner with an active partner row on the link's sheet, or staff who
 *                  manage the sheet;
 *     restricted → a signed-in person whose email is on the link's list, or staff who manage
 *                  the sheet.
 *   An unknown, revoked or expired token gets the same `not_found`, so the answer never tells
 *   which of the three it was. A partner who may open a link sees every row the manager chose to
 *   share, not only their own invoices. A viewer who does not manage the sheet never sees the
 *   internal fields (TDS, disputes, the reminder pause and its reason).
 */

export type ShareLinkRow = typeof receivableShareLinks.$inferSelect;

export type ShareLinkWithViews = ShareLinkRow & {
  createdByName: string | null;
  viewers: Array<{ viewerEmail: string | null; viewerName: string | null; viewedAt: Date }>;
};

export type ShareLinkFields = {
  name: string;
  filters: ShareFilters;
  visibility: ShareVisibility;
  allowedEmails?: string[];
  allowDownload?: boolean;
  expiresAt?: Date | null;
};

export type ShareLinkChanges = Partial<Omit<ShareLinkFields, 'filters'>>;

export type OpenShareResult =
  | { status: 'not_found' }
  | { status: 'needs_login' }
  | { status: 'forbidden' }
  | { status: 'ok'; view: SharedViewDto };

/** 24 random bytes as base64url: 32 URL-safe characters. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!s || s.length > SHARE_NAME_MAX) throw invalid('name');
  return s;
}

function cleanVisibility(v: unknown): ShareVisibility {
  if (typeof v !== 'string' || !SHARE_VISIBILITIES.includes(v as ShareVisibility)) throw invalid('visibility');
  return v as ShareVisibility;
}

function cleanEmails(list: unknown): string[] {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw invalid('allowed_emails');
  const out = [...new Set(list.map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : '')).filter(Boolean))];
  if (out.length > SHARE_EMAILS_MAX || out.some((e) => !EMAIL.test(e) || e.length > 254)) throw invalid('allowed_emails');
  return out;
}

function cleanExpiry(at: Date | null | undefined, now: Date): Date | null {
  if (at === undefined || at === null) return null;
  if (!(at instanceof Date) || Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) throw invalid('expires_at');
  return at;
}

/** A restricted link must name at least one person; the others keep no list. */
function emailsFor(visibility: ShareVisibility, emails: string[]): string[] {
  if (visibility !== 'restricted') return [];
  if (!emails.length) throw invalid('allowed_emails');
  return emails;
}

/** POST /api/receivables/sheets/:id/share-links — a new link on the caller's sheet. */
export async function createShareLink(ctx: AuthContext, sheetId: string, input: ShareLinkFields, now: Date = new Date()): Promise<ShareLinkWithViews> {
  const sheet = await scopedSheet(ctx, sheetId);
  const name = cleanName(input.name);
  const visibility = cleanVisibility(input.visibility);
  const allowedEmails = emailsFor(visibility, cleanEmails(input.allowedEmails));
  const expiresAt = cleanExpiry(input.expiresAt, now);
  const [row] = await db
    .insert(receivableShareLinks)
    .values({
      sheetId: sheet.id,
      token: newToken(),
      name,
      filters: normaliseShareFilters(input.filters),
      visibility,
      allowedEmails,
      allowDownload: input.allowDownload ?? true,
      expiresAt,
      createdBy: ctx.userId,
    })
    .returning();
  return { ...row, createdByName: ctx.name || null, viewers: [] };
}

/** GET /api/receivables/sheets/:id/share-links — every link of the sheet, newest first, with its recent viewers. */
export async function listShareLinks(ctx: AuthContext, sheetId: string): Promise<ShareLinkWithViews[]> {
  const sheet = await scopedSheet(ctx, sheetId);
  const links = await db
    .select({ link: receivableShareLinks, createdByName: profiles.name })
    .from(receivableShareLinks)
    .leftJoin(profiles, eq(profiles.id, receivableShareLinks.createdBy))
    .where(eq(receivableShareLinks.sheetId, sheet.id))
    .orderBy(desc(receivableShareLinks.createdAt))
    .limit(200);
  if (!links.length) return [];
  // The latest openings of each link, numbered per link so one query serves them all.
  const ranked = db
    .select({
      linkId: receivableShareViews.linkId,
      viewerEmail: receivableShareViews.viewerEmail,
      viewerName: profiles.name,
      viewedAt: receivableShareViews.viewedAt,
      n: sql<number>`row_number() over (partition by ${receivableShareViews.linkId} order by ${receivableShareViews.viewedAt} desc)`.as('n'),
    })
    .from(receivableShareViews)
    .leftJoin(profiles, eq(profiles.id, receivableShareViews.viewerId))
    .where(
      inArray(
        receivableShareViews.linkId,
        links.map((l) => l.link.id),
      ),
    )
    .as('ranked');
  const views = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.n} <= ${SHARE_VIEWER_LOG}`)
    .orderBy(desc(ranked.viewedAt));
  const byLink = new Map<string, ShareLinkWithViews['viewers']>();
  for (const v of views) {
    const list = byLink.get(v.linkId) ?? [];
    list.push({ viewerEmail: v.viewerEmail, viewerName: v.viewerName, viewedAt: new Date(v.viewedAt) });
    byLink.set(v.linkId, list);
  }
  return links.map((l) => ({ ...l.link, createdByName: l.createdByName ?? null, viewers: byLink.get(l.link.id) ?? [] }));
}

/** The link and its sheet, if and only if the caller may edit that sheet. */
async function scopedLink(ctx: AuthContext, linkId: string): Promise<ShareLinkRow> {
  assertEditorRole(ctx);
  if (!UUID.test(linkId ?? '')) throw notFound();
  const [link] = await db.select().from(receivableShareLinks).where(eq(receivableShareLinks.id, linkId)).limit(1);
  if (!link) throw notFound();
  await scopedSheet(ctx, link.sheetId);
  return link;
}

/** PATCH /api/receivables/share-links/:id — rename, change who may open it, the expiry or the download. */
export async function updateShareLink(ctx: AuthContext, linkId: string, patch: ShareLinkChanges, now: Date = new Date()): Promise<ShareLinkRow> {
  const link = await scopedLink(ctx, linkId);
  if (link.revokedAt) throw conflict('revoked');
  const set: Partial<typeof receivableShareLinks.$inferInsert> = { updatedAt: now };
  if (patch.name !== undefined) set.name = cleanName(patch.name);
  const visibility = patch.visibility !== undefined ? cleanVisibility(patch.visibility) : (link.visibility as ShareVisibility);
  if (patch.visibility !== undefined) set.visibility = visibility;
  if (patch.visibility !== undefined || patch.allowedEmails !== undefined) {
    set.allowedEmails = emailsFor(visibility, patch.allowedEmails !== undefined ? cleanEmails(patch.allowedEmails) : link.allowedEmails);
  }
  if (patch.allowDownload !== undefined) set.allowDownload = Boolean(patch.allowDownload);
  if (patch.expiresAt !== undefined) set.expiresAt = cleanExpiry(patch.expiresAt, now);
  const [row] = await db.update(receivableShareLinks).set(set).where(eq(receivableShareLinks.id, link.id)).returning();
  return row;
}

/** DELETE /api/receivables/share-links/:id — the link stops working at once; its log stays. */
export async function revokeShareLink(ctx: AuthContext, linkId: string, now: Date = new Date()): Promise<ShareLinkRow> {
  const link = await scopedLink(ctx, linkId);
  if (link.revokedAt) return link;
  const [row] = await db
    .update(receivableShareLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(eq(receivableShareLinks.id, link.id))
    .returning();
  return row;
}

/** A published row as a viewer who does not manage the sheet sees it. */
function outsideRow(r: SnapshotRow): SharedRowDto {
  return { ...r, partnerId: null, tdsInr: 0, disputed: false, pauseReason: null, remindersPausedUntil: null };
}

/** May this signed-in person open a `login` link of the sheet? A partner needs an active partner row there. */
async function isPartnerOfSheet(viewer: AuthContext, sheetId: string): Promise<boolean> {
  if (viewer.role !== 'partner') return false;
  const [row] = await db
    .select({ id: receivablePartners.id })
    .from(receivablePartners)
    .where(and(eq(receivablePartners.sheetId, sheetId), eq(receivablePartners.profileId, viewer.userId), eq(receivablePartners.active, true)))
    .limit(1);
  return Boolean(row);
}

/**
 * The shared page and its Excel download. This skips the AuthContext scoping on purpose: the
 * caller may be anyone, signed out included, and the token plus the link's visibility rule (see
 * the header) decide. `log: false` opens the link without counting a view (the Excel download).
 */
export async function systemOpenShareLink(
  token: string,
  viewer: AuthContext | null,
  opts: { now?: Date; today?: string; log?: boolean } = {},
): Promise<OpenShareResult> {
  const now = opts.now ?? new Date();
  const today = opts.today ?? todayIst(now);
  if (typeof token !== 'string' || !SHARE_TOKEN.test(token)) return { status: 'not_found' };
  const [link] = await db.select().from(receivableShareLinks).where(eq(receivableShareLinks.token, token)).limit(1);
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() <= now.getTime())) return { status: 'not_found' };
  const [sheet] = await db
    .select({ id: receivableSheets.id, clientOrgName: receivableSheets.clientOrgName, managerUserId: receivableSheets.managerUserId, publishedVersionId: receivableSheets.publishedVersionId })
    .from(receivableSheets)
    .where(eq(receivableSheets.id, link.sheetId))
    .limit(1);
  if (!sheet) return { status: 'not_found' };

  const staffViewer = Boolean(viewer && (isFirmWideAdmin(viewer.role) || (viewer.role === 'manager' && mayEditSheet(viewer, sheet))));
  const visibility = link.visibility as ShareVisibility;
  if (visibility !== 'public' && !staffViewer) {
    if (!viewer) return { status: 'needs_login' };
    const allowed =
      visibility === 'login'
        ? await isPartnerOfSheet(viewer, sheet.id)
        : visibility === 'restricted'
          ? Boolean(viewer.email) && (link.allowedEmails ?? []).includes(viewer.email.trim().toLowerCase())
          : false;
    if (!allowed) return { status: 'forbidden' };
  }

  let snapshot: SnapshotRow[] = [];
  let publishedAt: Date | null = null;
  if (sheet.publishedVersionId) {
    const [version] = await db
      .select({ snapshot: receivableVersions.snapshot, publishedAt: receivableVersions.publishedAt })
      .from(receivableVersions)
      .where(and(eq(receivableVersions.id, sheet.publishedVersionId), eq(receivableVersions.sheetId, sheet.id)))
      .limit(1);
    if (version) {
      snapshot = version.snapshot ?? [];
      publishedAt = version.publishedAt;
    }
  }
  const filters = normaliseShareFilters(link.filters);
  const partnerNames: Record<string, string> = {};
  for (const r of snapshot) if (r.partnerSlug && r.partnerName) partnerNames[r.partnerSlug] = r.partnerName;
  const shown = applyShareFilters(snapshot, filters, today);

  if (opts.log !== false) {
    await db.insert(receivableShareViews).values({ linkId: link.id, viewerId: viewer?.userId ?? null, viewerEmail: viewer?.email || null, viewedAt: now });
    await db
      .update(receivableShareLinks)
      .set({ viewCount: sql`${receivableShareLinks.viewCount} + 1`, lastViewedAt: now })
      .where(eq(receivableShareLinks.id, link.id));
  }

  return {
    status: 'ok',
    view: {
      link: {
        name: link.name,
        filters,
        filterText: describeShareFilters(filters, partnerNames),
        visibility,
        allowDownload: link.allowDownload,
        expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      },
      clientOrgName: sheet.clientOrgName,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      today,
      rows: staffViewer ? shown : shown.map(outsideRow),
      staffViewer,
    },
  };
}
