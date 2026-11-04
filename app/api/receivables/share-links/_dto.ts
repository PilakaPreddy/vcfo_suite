import { z } from 'zod';
import { siteUrl } from '@/lib/site-url';
import type { ShareLinkRow, ShareLinkWithViews } from '@/db/repositories/receivables';
import { SHARE_EMAILS_MAX, SHARE_NAME_MAX, sharePath, type ShareLinkDto, type ShareVisibility } from '@/lib/receivables/share-wire';

/** The wire shape of a share link (src/lib/receivables/share-wire.ts), with its absolute URL. */
export function shareLinkDto(row: ShareLinkRow | ShareLinkWithViews): ShareLinkDto {
  const withViews = row as Partial<ShareLinkWithViews>;
  return {
    id: row.id,
    sheetId: row.sheetId,
    token: row.token,
    url: `${siteUrl()}${sharePath(row.token)}`,
    name: row.name,
    filters: row.filters ?? {},
    visibility: row.visibility as ShareVisibility,
    allowedEmails: row.allowedEmails ?? [],
    allowDownload: row.allowDownload,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    createdByName: withViews.createdByName ?? null,
    viewers: (withViews.viewers ?? []).map((v) => ({ viewerEmail: v.viewerEmail, viewerName: v.viewerName, viewedAt: v.viewedAt.toISOString() })),
  };
}

/** The editable fields; the repository checks the rest (email format, a future expiry). */
export const shareFields = {
  name: z.string().trim().min(1, 'name').max(SHARE_NAME_MAX, 'name'),
  visibility: z.enum(['public', 'login', 'restricted'], { message: 'visibility' }),
  allowedEmails: z.array(z.string().max(254, 'allowed_emails')).max(SHARE_EMAILS_MAX, 'allowed_emails'),
  allowDownload: z.boolean(),
  expiresAt: z
    .string()
    .datetime({ offset: true, message: 'expires_at' })
    .nullable()
    .transform((s) => (s ? new Date(s) : null)),
};
