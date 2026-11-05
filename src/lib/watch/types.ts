import { z } from 'zod';

/**
 * Watch: official portals to reviewed updates. It is a fixed pipeline; the one model step has no
 * tools, its output is checked by code against the source, and a person reviews before clients
 * see anything. Sources that refuse automated reading stay on `manual` or `email` intake.
 */
export const REG_SOURCE_TYPES = ['feed', 'page', 'manual', 'email'] as const;
export type RegSourceType = (typeof REG_SOURCE_TYPES)[number];

export const REG_SOURCE_HEALTH = ['unknown', 'ok', 'empty', 'failing', 'blocked'] as const;
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

/** Drives who gets what: fixed rules in code, never the model. */
export const REG_IMPORTANCE = ['important', 'normal', 'staff_only'] as const;
export type RegImportance = (typeof REG_IMPORTANCE)[number];

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
}

export interface SourceAdapter {
  id: string;
  /** Parses a fetched body. Returning nothing raises an alert, in case the layout changed. */
  list(body: string, baseUrl: string): ListedItem[];
  /** Why an item is noise (tender, job, routine auction), or null to keep it. */
  noise?(item: ListedItem): string | null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/** What the model returns for one document, on a strict tool schema. Page text is data only. */
export const regSummarySchema = z.object({
  area: z.string().trim().min(1).max(60),
  act: z.string().trim().max(160).nullable(),
  changeType: z.enum(REG_CHANGE_TYPES),
  importance: z.enum(REG_IMPORTANCE),
  effectiveDate: isoDate,
  oldDueDate: isoDate,
  newDueDate: isoDate,
  affects: z.string().trim().max(400),
  summary: z.string().trim().min(1).max(1200),
  /** Copied word for word from the source; the code check fails it otherwise. */
  quote: z.string().trim().min(1).max(600),
});
export type RegSummary = z.infer<typeof regSummarySchema>;

/** A problem the code check found: a date, number or quote that is not in the source. */
export interface RegVerifyProblem {
  field: string;
  value: string;
  message: string;
}
