import { z } from 'zod';

/**
 * Watch: official portals to reviewed updates. It is a fixed pipeline; the one model step has no
 * tools, its output is checked by code against the source, and a person reviews before clients
 * see anything. Sources that refuse automated reading stay on `manual` or `email` intake.
 */
export const REG_SOURCE_TYPES = ['feed', 'page', 'manual', 'email'] as const;
export type RegSourceType = (typeof REG_SOURCE_TYPES)[number];

/**
 * empty: the adapter found nothing, so the layout may have changed. stale: readable, but the newest
 * item is over a year old, so the page is probably no longer the live list. failing: three checks in
 * a row failed. blocked: a 403 or a robots refusal; it stays blocked until a person asks for a retest.
 */
export const REG_SOURCE_HEALTH = ['unknown', 'ok', 'empty', 'stale', 'failing', 'blocked'] as const;
export type RegSourceHealth = (typeof REG_SOURCE_HEALTH)[number];

/**
 * queued: found and not yet read. read: text extracted. unreviewed: summarised and shown to staff.
 * needs_attention: the code check failed, so it stays with staff until a person edits it.
 * published and rejected are a reviewer's decision. failed: could not be read or summarised.
 */
export const REG_UPDATE_STATUSES = [
  'queued',
  'read',
  'unreviewed',
  'needs_attention',
  'published',
  'rejected',
  'failed',
] as const;
export type RegUpdateStatus = (typeof REG_UPDATE_STATUSES)[number];

/** Drives who gets what: fixed rules in code (`recipients.ts`), never the model. */
export const REG_IMPORTANCE = ['important', 'normal', 'staff_only'] as const;
export type RegImportance = (typeof REG_IMPORTANCE)[number];

/** Law areas the model may pick from; chat filters and the board's kind read these. */
export const REG_AREAS = ['gst', 'tax', 'mca', 'fema', 'securities', 'labour', 'audit', 'insolvency', 'general'] as const;
export type RegArea = (typeof REG_AREAS)[number];

export const REG_CHANGE_TYPES = [
  'due_date',
  'penalty',
  'law_in_force',
  'form_change',
  'circular',
  'faq',
  'clarification',
  'consultation',
  'other',
] as const;
export type RegChangeType = (typeof REG_CHANGE_TYPES)[number];

export const REG_PROPOSAL_STATUSES = ['proposed', 'approved', 'rejected'] as const;
export type RegProposalStatus = (typeof REG_PROPOSAL_STATUSES)[number];

/** One entry a source adapter found on a feed or listing page. Code only, no model. */
export interface ListedItem {
  externalKey: string;
  title: string;
  url: string;
  publishedOn: string | null;
  /** `YYYY-MM` from the file's upload folder, for the stale check when a list gives no date. */
  listedMonth?: string;
  /** Text the listing already carries, such as a feed description; it can save a request. */
  body?: string;
  /** The department or division a page lists it under, for the noise rules. */
  section?: string;
}

export interface SourceAdapter {
  id: string;
  /** Parses a fetched body. Returning nothing raises an alert, in case the layout changed. */
  list(body: string, baseUrl: string): ListedItem[];
  /** Why an item is noise (tender, job, routine auction), or null to keep it. */
  noise?(item: ListedItem): string | null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/** A strict tool cannot limit a string's length, and a cut record beats a failed one: a person reads the source. */
const cutTo = (max: number) => (text: string): string => (text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') : text);

/**
 * What the model returns for one document, on a strict tool schema. Page text is data only, and
 * importance is not asked for: a hostile page must not be able to choose who gets notified.
 */
export const regSummarySchema = z.object({
  area: z.enum(REG_AREAS),
  act: z.string().trim().max(400).nullable(),
  changeType: z.enum(REG_CHANGE_TYPES),
  effectiveDate: isoDate,
  oldDueDate: isoDate,
  newDueDate: isoDate,
  affects: z.string().trim().max(400),
  summary: z.string().trim().min(1).transform(cutTo(1200)),
  /** Copied word for word from the source; the code check fails it otherwise. */
  quote: z.string().trim().min(1).transform(cutTo(600)),
});
export type RegSummary = z.infer<typeof regSummarySchema>;

/** A problem the code check found: a date, number or quote not in the source, or a draft summarised as made. */
export interface RegVerifyProblem {
  field: string;
  value: string;
  message: string;
}

/** The background job that reads, summarises and checks one update. */
export const WATCH_PROCESS_EVENT = 'watch/update.process';

/** One source as staff see it: silence must never read as no news. */
export interface WatchSourceStatus {
  id: string;
  name: string;
  url: string;
  type: RegSourceType;
  area: string | null;
  audience: string;
  health: RegSourceHealth;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
}

/** A row in the review queue, without the source text. */
export interface RegUpdateListItem {
  id: string;
  title: string;
  status: RegUpdateStatus;
  sourceName: string | null;
  sourceUrl: string | null;
  intake: string;
  area: string | null;
  changeType: string | null;
  importance: RegImportance | null;
  publishedOn: string | null;
  effectiveDate: string | null;
  newDueDate: string | null;
  summary: string | null;
  problemCount: number;
  error: string | null;
  createdAt: string;
}

export interface RegUpdateDetail extends RegUpdateListItem {
  act: string | null;
  oldDueDate: string | null;
  affects: string | null;
  quote: string | null;
  sourceText: string | null;
  verifyProblems: RegVerifyProblem[];
  links: Array<{ url: string; title: string; sourceName: string | null }>;
  rejectReason: string | null;
  fileUrl: string | null;
}

/** What a reviewer may change. Dates are `YYYY-MM-DD` or null. */
export const regReviewEditSchema = z.object({
  title: z.string().trim().min(1).max(300),
  area: z.enum(REG_AREAS),
  act: z.string().trim().max(400).nullable(),
  changeType: z.enum(REG_CHANGE_TYPES),
  importance: z.enum(REG_IMPORTANCE),
  effectiveDate: isoDate,
  oldDueDate: isoDate,
  newDueDate: isoDate,
  affects: z.string().trim().max(400),
  summary: z.string().trim().min(1).max(1200),
  quote: z.string().trim().min(1).max(600),
  /** The reviewer read the source and accepts what the code check still flags. */
  acceptProblems: z.boolean().optional(),
});
export type RegReviewEdit = z.infer<typeof regReviewEditSchema>;
