/**
 * RECEIVABLES SHARED VIEWS (Phase 10, docs/specs/receivables/PLAN.md): the wire shapes of the
 * share link routes and of the shared page, /receivables/s/<token>. The repository is
 * src/db/repositories/receivables/share-links.ts and the filter logic share-filters.ts.
 */
import type { SnapshotRow } from './model';
import type { ShareFilters } from './share-filters';

export type ShareVisibility = 'public' | 'login' | 'restricted';

export const SHARE_VISIBILITIES: ShareVisibility[] = ['public', 'login', 'restricted'];

export const SHARE_VISIBILITY_LABEL: Record<ShareVisibility, string> = {
  public: 'Anyone with the link',
  login: 'Client-partner logins',
  restricted: 'Specific people',
};

/** The longest link name. */
export const SHARE_NAME_MAX = 120;
/** How many people a restricted link may name. */
export const SHARE_EMAILS_MAX = 50;
/** How many viewers the Links tab shows per link. */
export const SHARE_VIEWER_LOG = 20;

/** The page path of a link. */
export function sharePath(token: string): string {
  return `/receivables/s/${token}`;
}

/** The Excel download of a link. */
export function shareExportPath(token: string): string {
  return `/api/public/receivables/share/${token}/export`;
}

export type ShareViewerDto = {
  viewerEmail: string | null;
  viewerName: string | null;
  viewedAt: string;
};

export type ShareLinkDto = {
  id: string;
  sheetId: string;
  token: string;
  /** The absolute link, built by the route from the site address. */
  url: string;
  name: string;
  filters: ShareFilters;
  visibility: ShareVisibility;
  allowedEmails: string[];
  allowDownload: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  /** The latest openings, newest first (at most SHARE_VIEWER_LOG). */
  viewers: ShareViewerDto[];
};

/** The body of POST /api/receivables/sheets/:id/share-links. */
export type ShareLinkInput = {
  name: string;
  filters: ShareFilters;
  visibility: ShareVisibility;
  allowedEmails?: string[];
  allowDownload?: boolean;
  /** ISO timestamp, or null for a link that never expires. */
  expiresAt?: string | null;
};

/** The body of PATCH /api/receivables/share-links/:id. Filters stay as they were saved. */
export type ShareLinkPatch = Partial<Omit<ShareLinkInput, 'filters'>>;

/**
 * A row as the shared page shows it. For a viewer who is not staff of the sheet the internal
 * parts (TDS, a dispute, the reminder pause and its reason, the partner id) are blanked.
 */
export type SharedRowDto = SnapshotRow;

export type SharedViewDto = {
  link: {
    name: string;
    filters: ShareFilters;
    /** describeShareFilters with the partner names of the snapshot. */
    filterText: string;
    visibility: ShareVisibility;
    allowDownload: boolean;
    expiresAt: string | null;
  };
  clientOrgName: string;
  /** The published version the view reads; null when nothing is published yet. */
  publishedAt: string | null;
  today: string;
  rows: SharedRowDto[];
  /** True when the viewer manages the sheet (its manager or a firm-wide admin). */
  staffViewer: boolean;
};
