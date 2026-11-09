/**
 * BUDGETS. One annual cost budget per client (engagement) per financial year; see
 * docs/specs/budget/PLAN.md. Re-exported from `src/db/schema.ts`. Additive only.
 *
 * Circular import note, as in `schema-labour-registers.ts`: `profiles` and `engagements` may only
 * be touched lazily, inside a `.references(() => base.x.id)` callback.
 *
 * Tables:
 *  - budgets               the header: client, year, status, settings.
 *  - budget_rows           one role, benefit or cost row; `data` holds its fields, `version`
 *                          catches two people changing the same row.
 *  - budget_sections       per tab: status, due date and the last reminder.
 *  - budget_section_owners who fills which tab. A client user can edit only these tabs.
 *  - budget_versions       a frozen copy at each publish. Never changed afterwards.
 *  - budget_changes        the change log.
 *  - budget_comments       review comments on a tab or a row.
 *  - budget_actuals        actual cost by month and budget line.
 *  - budget_attachments    supporting documents on a row, in S3.
 *  - budget_variance_months one row per budget and month of the Variance tab: status, closing
 *                          headcount, advance tax paid and, once approved, the budget figures of
 *                          that month as they were, so later setting changes do not move them.
 *  - budget_variance_log   who submitted, approved, sent back or reopened a month, and why.
 */
import { sql } from 'drizzle-orm';
import { bigint, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    fyStartYear: integer('fy_start_year').notNull(),
    /** draft, published (frozen, waiting for approval) or approved (locked). */
    status: text('status').notNull().default('draft'),
    settings: jsonb('settings').notNull(),
    settingsVersion: integer('settings_version').notNull().default(1),
    /** The number of the latest published version; 0 before the first publish. */
    currentVersion: integer('current_version').notNull().default(0),
    approvedBy: uuid('approved_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    approvedByName: text('approved_by_name'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** The latest month the overspend alert ran for, as `YYYY-MM`, so it fires once a month. */
    lastAlertPeriod: text('last_alert_period'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('budgets_engagement_year_live_idx').on(t.engagementId, t.fyStartYear).where(sql`${t.deletedAt} is null`),
    index('budgets_engagement_idx').on(t.engagementId),
  ],
);

export const budgetRows = pgTable(
  'budget_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    position: integer('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    data: jsonb('data').notNull(),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('budget_rows_budget_idx').on(t.budgetId, t.kind, t.position)],
);

export const budgetSections = pgTable(
  'budget_sections',
  {
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    status: text('status').notNull().default('not_started'),
    /** `YYYY-MM-DD`. */
    dueDate: text('due_date'),
    /** Why the reviewer sent the tab back. */
    note: text('note'),
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.section] })],
);

export const budgetSectionOwners = pgTable(
  'budget_section_owners',
  {
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.section, t.userId] }), index('budget_section_owners_user_idx').on(t.userId)],
);

export const budgetVersions = pgTable(
  'budget_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** `{ settings, rows }`, enough for the engine to rebuild every figure. */
    snapshot: jsonb('snapshot').notNull(),
    grandTotal: bigint('grand_total', { mode: 'number' }).notNull().default(0),
    note: text('note'),
    publishedBy: uuid('published_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    publishedByName: text('published_by_name'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    approvedByName: text('approved_by_name'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('budget_versions_budget_version_idx').on(t.budgetId, t.version)],
);

export const budgetChanges = pgTable(
  'budget_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    /** No foreign key: the log outlives a deleted row. */
    rowId: uuid('row_id'),
    rowLabel: text('row_label'),
    field: text('field').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('budget_changes_budget_idx').on(t.budgetId, t.createdAt)],
);

export const budgetComments = pgTable(
  'budget_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    rowId: uuid('row_id'),
    body: text('body').notNull(),
    authorId: uuid('author_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    authorName: text('author_name'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('budget_comments_budget_idx').on(t.budgetId, t.createdAt)],
);

export const budgetActuals = pgTable(
  'budget_actuals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    /** `YYYY-MM`. */
    period: text('period').notNull(),
    lineId: text('line_id').notNull(),
    amount: doublePrecision('amount').notNull().default(0),
    reason: text('reason'),
    source: text('source').notNull().default('manual'),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('budget_actuals_key_idx').on(t.budgetId, t.period, t.lineId)],
);

export const budgetAttachments = pgTable(
  'budget_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    rowId: uuid('row_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type'),
    size: integer('size').notNull().default(0),
    storageKey: text('storage_key').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('budget_attachments_row_idx').on(t.budgetId, t.rowId)],
);

export const budgetVarianceMonths = pgTable(
  'budget_variance_months',
  {
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    /** Financial-year position, 0 to 11. */
    monthIndex: integer('month_index').notNull(),
    /** open, draft, submitted, approved or returned. */
    status: text('status').notNull().default('draft'),
    headcount: doublePrecision('headcount'),
    advanceTaxPaid: doublePrecision('advance_tax_paid'),
    advanceTaxReason: text('advance_tax_reason'),
    /** The last send-back comment or reopen reason. */
    note: text('note'),
    /** Set on approval: `{ lines: { [lineId]: number }, advanceTax: number, headcount: number }`. */
    budgetSnapshot: jsonb('budget_snapshot'),
    submittedBy: uuid('submitted_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.monthIndex] })],
);

export const budgetVarianceLog = pgTable(
  'budget_variance_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    monthIndex: integer('month_index').notNull(),
    /** submitted, approved, sent_back or reopened. */
    action: text('action').notNull(),
    note: text('note'),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('budget_variance_log_budget_idx').on(t.budgetId, t.monthIndex, t.createdAt)],
);
