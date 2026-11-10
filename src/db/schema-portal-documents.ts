/**
 * Client portal v7 — NEW tables for the documents pages. Re-exported from
 * src/db/schema.ts so drizzle-kit and the repositories see one schema.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so
 * `profiles` / `engagements` (and every other schema.ts table) may only be
 * touched lazily, inside `.references(() => profiles.id)` callbacks — never at
 * module top level.
 */
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientLibraryItems, documentRequests, engagements, profiles } from './schema';

/**
 * DOCUMENT REQUEST DETAILS — side table for `document_requests` (that table
 * has no due date / step / field / review-note columns, and the request type
 * `DocRequest.dueAt` was dropped on insert). One row per request, optional.
 * Written by staff when they create or edit a request; read by the client
 * Documents page (outlined "missing" rows: due chip, owning step, SBC note).
 */
export const documentRequestDetails = pgTable(
  'document_request_details',
  {
    requestId: uuid('request_id')
      .primaryKey()
      .references(() => documentRequests.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    dueOn: date('due_on'),
    stepId: text('step_id'),
    fieldId: text('field_id'),
    /** "Bill is older than 2 months. Please send the latest one." — re-upload reason. */
    reviewNote: text('review_note'),
    reviewNoteBy: uuid('review_note_by').references(() => profiles.id, { onDelete: 'set null' }),
    /** What the request is for on the compliance records: 'obligation' or 'registration'; null for other requests (0029). */
    subjectKind: text('subject_kind'),
    /** The compliance instance id (obligation) or the registration step id ('reg-4') the request belongs to (0029). */
    subjectKey: text('subject_key'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('document_request_details_engagement_idx').on(t.engagementId),
    subjectIdx: index('document_request_details_subject_idx').on(t.engagementId, t.subjectKind, t.subjectKey),
  }),
);

/**
 * DOCUMENT REQUEST FILES — every file uploaded against a request (the bytes
 * live in S3 under `engagement-documents/{engagement}/requests/{request}/…`).
 * The newest row with `replaced_at IS NULL` is the current file; older rows
 * are the request's version history ("Replaced" rows on the Documents page).
 */
export const documentRequestFiles = pgTable(
  'document_request_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => documentRequests.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
  },
  (t) => ({
    reqIdx: index('document_request_files_request_idx').on(t.requestId, t.uploadedAt),
    engIdx: index('document_request_files_engagement_idx').on(t.engagementId),
  }),
);

/**
 * LIBRARY READS — reading progress of the client Library ("Recently read"
 * strip + drill). Private to the reader (`profile_id = ctx.userId`). `ref` is
 * the saved item id or `topic:<slug>` for a Learn page.
 */
export const clientLibraryReads = pgTable(
  'client_library_reads',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    ref: text('ref').notNull(),
    itemId: uuid('item_id').references(() => clientLibraryItems.id, { onDelete: 'cascade' }),
    topicSlug: text('topic_slug'),
    title: text('title').notNull(),
    category: text('category').notNull(),
    progressPct: integer('progress_pct').notNull().default(0),
    sectionsRead: integer('sections_read').notNull().default(0),
    sectionsTotal: integer('sections_total').notNull().default(0),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.profileId, t.ref] }),
    recentIdx: index('client_library_reads_recent_idx').on(t.profileId, t.lastReadAt),
  }),
);

/**
 * LIBRARY REMOVALS — "Remove from library" is a soft delete so the toast can
 * offer Undo. A row here hides the saved item everywhere; Undo deletes the row.
 */
export const clientLibraryRemovals = pgTable('client_library_removals', {
  itemId: uuid('item_id')
    .primaryKey()
    .references(() => clientLibraryItems.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  removedAt: timestamp('removed_at', { withTimezone: true }).notNull().defaultNow(),
});
