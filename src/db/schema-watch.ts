/**
 * Watch: regulatory updates from official portals. Re-exported from src/db/schema.ts. The sources
 * are `announcement_sources`, with the Watch columns added there.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `base.*` may only be
 * touched lazily, inside `.references(() => base.profiles.id)` callbacks.
 *
 * Tables:
 *  - reg_updates             one update, from discovery to a reviewer's decision.
 *  - reg_update_links        where it was found; one circular on two sources keeps both links.
 *  - reg_noise_log           what the source rules dropped, kept so the rules can be audited.
 *  - reg_calendar_proposals  a due-date change a manager must approve; the calendar is never auto-edited.
 */
import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { RegVerifyProblem } from '@/lib/watch/types';
import * as base from './schema';

export const regUpdates = pgTable(
  'reg_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    /** The original document; the original remains the authority. */
    sourceUrl: text('source_url'),
    sourceId: uuid('source_id').references(() => base.announcementSources.id, { onDelete: 'set null' }),
    intake: text('intake').notNull(), // feed|page|manual|email
    intakeById: uuid('intake_by_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** A file given through manual intake, or a downloaded copy of the source. */
    s3Key: text('s3_key'),
    /** Extracted text, so a reviewer and the code check see what the model saw. */
    sourceText: text('source_text'),
    /** SHA-256 of the extracted text: the same document is one update. */
    contentHash: text('content_hash'),
    publishedOn: date('published_on'),
    status: text('status').notNull().default('queued'), // RegUpdateStatus
    area: text('area'),
    act: text('act'),
    changeType: text('change_type'),
    importance: text('importance'),
    effectiveDate: date('effective_date'),
    oldDueDate: date('old_due_date'),
    newDueDate: date('new_due_date'),
    affects: text('affects'),
    summary: text('summary'),
    /** Word for word from the source; the code check confirms it. */
    quote: text('quote'),
    verifyProblems: jsonb('verify_problems').$type<RegVerifyProblem[]>().notNull().default([]),
    /** The older update this one replaces; chat answers leave the replaced one out. */
    supersedesUpdateId: uuid('supersedes_update_id').references((): AnyPgColumn => regUpdates.id, {
      onDelete: 'set null',
    }),
    /** The staff-only board row while unreviewed, then the row everyone sees. */
    announcementId: uuid('announcement_id').references(() => base.announcements.id, { onDelete: 'set null' }),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    error: text('error'),
    reviewedById: uuid('reviewed_by_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** When the bell rows went out, or the day's summary picked it up; stops a second send. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    statusIdx: index('reg_updates_status_idx').on(t.status, t.createdAt),
    publishedIdx: index('reg_updates_published_idx').on(t.publishedAt),
    contentHashUq: uniqueIndex('reg_updates_content_hash_uq').on(t.contentHash),
    sourceIdx: index('reg_updates_source_idx').on(t.sourceId),
    areaIdx: index('reg_updates_area_idx').on(t.area, t.effectiveDate),
    supersedesIdx: index('reg_updates_supersedes_idx').on(t.supersedesUpdateId),
    announcementIdx: index('reg_updates_announcement_idx').on(t.announcementId),
    intakeByIdx: index('reg_updates_intake_by_idx').on(t.intakeById),
    reviewedByIdx: index('reg_updates_reviewed_by_idx').on(t.reviewedById),
  }),
);

export const regUpdateLinks = pgTable(
  'reg_update_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    updateId: uuid('update_id')
      .notNull()
      .references(() => regUpdates.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => base.announcementSources.id, { onDelete: 'set null' }),
    /** The adapter's stable id for the item; a repeat poll finds it here and stops. */
    externalKey: text('external_key').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceKeyUq: uniqueIndex('reg_update_links_source_key_uq').on(t.sourceId, t.externalKey),
    updateIdx: index('reg_update_links_update_idx').on(t.updateId),
  }),
);

export const regNoiseLog = pgTable(
  'reg_noise_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => base.announcementSources.id, { onDelete: 'cascade' }),
    externalKey: text('external_key').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    /** The source rule that dropped it, for example `tender`. */
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceKeyUq: uniqueIndex('reg_noise_log_source_key_uq').on(t.sourceId, t.externalKey),
    createdIdx: index('reg_noise_log_created_idx').on(t.createdAt),
  }),
);

export const regCalendarProposals = pgTable(
  'reg_calendar_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    updateId: uuid('update_id')
      .notNull()
      .references(() => regUpdates.id, { onDelete: 'cascade' }),
    obligationId: text('obligation_id')
      .notNull()
      .references(() => base.complianceObligations.id),
    /** The filing period the date applies to, in the format compliance instances use. */
    period: text('period').notNull(),
    oldDueDate: date('old_due_date'),
    newDueDate: date('new_due_date').notNull(),
    status: text('status').notNull().default('proposed'), // RegProposalStatus
    /** Engagements the change touches, worked out from client data when it was proposed. */
    affectedEngagementIds: uuid('affected_engagement_ids').array().notNull().default([]),
    decidedById: uuid('decided_by_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updateObligationUq: uniqueIndex('reg_calendar_proposals_uq').on(t.updateId, t.obligationId, t.period),
    statusIdx: index('reg_calendar_proposals_status_idx').on(t.status, t.createdAt),
    obligationIdx: index('reg_calendar_proposals_obligation_idx').on(t.obligationId),
    decidedByIdx: index('reg_calendar_proposals_decided_by_idx').on(t.decidedById),
  }),
);
