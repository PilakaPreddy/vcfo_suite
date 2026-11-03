/**
 * Statutory and non-statutory Compliances (30 Oct 2026, docs/ui-port/COMPLIANCE-BRIEF.md,
 * docs/ui-port/COMPLIANCE-API.md). Re-exported from src/db/schema.ts so drizzle-kit and the
 * repositories see one schema. Additive only: no existing table changes except the nullable
 * `compliance_obligations.activity_id` column in schema.ts.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `profiles`,
 * `engagements` and `complianceInstances` may only be touched lazily, inside
 * `.references(() => base.x.id)` callbacks, never at module top level.
 *
 * Tables:
 *  - compliance_activities              — the activity master (DR-01), 43 rows seeded from
 *                                         src/data/compliance-activities.ts.
 *  - compliance_tasks                   — one non-statutory occurrence (DR-02, DR-04, DR-05).
 *  - compliance_task_checklist_items    — its subtasks.
 *  - compliance_task_comments           — its comments (internal ones are staff only).
 *  - compliance_task_attachments        — its files in S3 (one may be the deliverable, F-2).
 *  - compliance_task_events             — its audit trail (DR-16).
 *  - compliance_instance_workflow       — the workflow stage and reviewer of one statutory
 *                                         instance (side table, so the Inngest regeneration
 *                                         upsert of compliance_instances never touches it).
 *  - compliance_reminder_overrides      — per-occurrence changes to the six reminders (D-2.3).
 *  - compliance_reminder_log            — each reminder sent, per recipient and day.
 */
import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

export const complianceActivities = pgTable('compliance_activities', {
  /** 'ACT-001-3B', 'ACT-M08'. */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Statutory | Non-statutory | Policy-based | Configurable (DR-03). */
  kind: text('kind').notNull(),
  /** statutory | non-statutory: what the screens filter on. */
  activityGroup: text('activity_group').notNull(),
  frequency: text('frequency').notNull(),
  module: text('module').notNull(),
  area: text('area').notNull(),
  dueRule: text('due_rule').notNull().default(''),
  penalty: text('penalty').notNull().default(''),
  applies: text('applies').notNull().default(''),
  ownerRole: text('owner_role').notNull().default(''),
  reviewerRole: text('reviewer_role').notNull().default(''),
  /** Default reminder lead time in days (DR-21). */
  notifyDays: integer('notify_days').notNull(),
  /** firm | client | both. */
  visibility: text('visibility').notNull(),
  note: text('note').notNull().default(''),
  /** The open point the owner must confirm (DR-19); null when there is none. */
  confirm: text('confirm'),
  confirmedBy: uuid('confirmed_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /** master | manual. */
  source: text('source').notNull().default('master'),
  /** Master order. */
  sort: integer('sort').notNull().default(0),
  updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const complianceTasks = pgTable(
  'compliance_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** Null for "Other…". */
    activityId: text('activity_id').references(() => complianceActivities.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    periodLabel: text('period_label'),
    startDate: date('start_date').notNull(),
    dueDate: date('due_date').notNull(),
    /** Low | Medium | High | Critical. */
    urgency: text('urgency').notNull().default('Medium'),
    /** firm | client | both. */
    visibility: text('visibility').notNull().default('firm'),
    ownerId: uuid('owner_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    reviewerId: uuid('reviewer_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** One of the eight workflow stages (src/lib/compliance-tasks/model.ts). */
    stage: text('stage').notNull().default('not-started'),
    /** one-time | weekly | bi-weekly | monthly | quarterly | yearly. */
    repeats: text('repeats').notNull().default('one-time'),
    /** Days before the end date for the first reminder. */
    remindBefore: integer('remind_before').notNull().default(5),
    /** The first task of a repeating series (itself for the first one); null for a one-time task. */
    seriesId: uuid('series_id'),
    /** Set when the task stands for a board meeting (board_meetings.task_id points back). */
    boardMeetingId: uuid('board_meeting_id'),
    /** The occurrence this one was created from. */
    previousId: uuid('previous_id'),
    reviewNote: text('review_note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engDueIdx: index('compliance_tasks_engagement_due_idx').on(t.engagementId, t.dueDate),
    ownerIdx: index('compliance_tasks_owner_idx').on(t.ownerId),
    /** One occurrence per series and end date: makes the repeat job idempotent. */
    seriesDueIdx: uniqueIndex('compliance_tasks_series_due_idx').on(t.seriesId, t.dueDate),
  }),
);

export const complianceTaskChecklistItems = pgTable(
  'compliance_task_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => complianceTasks.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
    doneBy: uuid('done_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('compliance_task_checklist_items_task_idx').on(t.taskId, t.position),
  }),
);

export const complianceTaskComments = pgTable(
  'compliance_task_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => complianceTasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    /** Staff only; never sent to a client. */
    internal: boolean('internal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('compliance_task_comments_task_idx').on(t.taskId, t.createdAt),
  }),
);

export const complianceTaskAttachments = pgTable(
  'compliance_task_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => complianceTasks.id, { onDelete: 'cascade' }),
    /** Denormalised for scoping without a join. */
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** Path inside the `engagement-documents` bucket prefix (src/storage/s3.ts bucketKey). */
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    /** The file a completed task delivers (Filings F-2). */
    isDeliverable: boolean('is_deliverable').notNull().default(false),
    byClient: boolean('by_client').notNull().default(false),
    uploadedBy: uuid('uploaded_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('compliance_task_attachments_task_idx').on(t.taskId),
  }),
);

export const complianceTaskEvents = pgTable(
  'compliance_task_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => complianceTasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    label: text('label').notNull(),
    /** Staff only (a send-back reason, a reassignment); hidden from the client. */
    internal: boolean('internal').notNull().default(false),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('compliance_task_events_task_idx').on(t.taskId, t.at),
  }),
);

export const complianceInstanceWorkflow = pgTable('compliance_instance_workflow', {
  instanceId: uuid('instance_id')
    .primaryKey()
    .references(() => base.complianceInstances.id, { onDelete: 'cascade' }),
  engagementId: uuid('engagement_id')
    .notNull()
    .references(() => base.engagements.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull().default('not-started'),
  reviewerId: uuid('reviewer_id').references(() => base.profiles.id, { onDelete: 'set null' }),
  /** Per-occurrence reminder lead time; null uses the activity's notify days. */
  notifyDays: integer('notify_days'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  submittedBy: uuid('submitted_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  reviewNote: text('review_note'),
  updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const complianceReminderOverrides = pgTable(
  'compliance_reminder_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** statutory (subject_id = compliance_instances.id) | task (subject_id = compliance_tasks.id). */
    subjectKind: text('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    /** initial | due-soon | due-date | overdue | escalate-reviewer | escalate-admin. */
    reminderKey: text('reminder_key').notNull(),
    /** Days from the due date (negative = before); null keeps the default. */
    offsetDays: integer('offset_days'),
    enabled: boolean('enabled').notNull().default(true),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneEach: uniqueIndex('compliance_reminder_overrides_uq').on(t.subjectKind, t.subjectId, t.reminderKey),
  }),
);

export const complianceReminderLog = pgTable(
  'compliance_reminder_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectKind: text('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    reminderKey: text('reminder_key').notNull(),
    /** The India date the reminder went out. */
    sentOn: date('sent_on').notNull(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** The bell row it created; read means acknowledged. */
    notificationId: uuid('notification_id'),
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oncePerDay: uniqueIndex('compliance_reminder_log_uq').on(t.subjectKind, t.subjectId, t.reminderKey, t.sentOn, t.recipientId),
    subjectIdx: index('compliance_reminder_log_subject_idx').on(t.subjectKind, t.subjectId),
  }),
);
