/**
 * Work tables added on the `ui/spectrum` branch to close the prototype gaps
 * (docs/ui-port/GAPS.md). Re-exported from src/db/schema.ts so drizzle-kit and the
 * repositories see one schema.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so
 * `profiles` / `engagements` may only be touched lazily, inside
 * `.references(() => base.profiles.id)` callbacks, never at module top level.
 *
 * Several tables key a row to one work item with `item_key`, a text id that is the
 * same for every reader:
 *   - a checklist step:      `step:<engagementId>:<stepId>`
 *   - a compliance filing:   `filing:<complianceInstanceId>`
 *   - a compliance event:    `event:<complianceEventId>`
 *   - a document request:    `request:<documentRequestId>`
 *   - a task row:            `task:<taskId>`
 * `src/lib/work/item-key.ts` builds and parses these keys.
 *
 * Tables:
 *
 *  - engagement_step_events — one row each time a step's status changes, so the
 *                             app knows when a step was opened and finished
 *                             (days in step, stage durations; G-13, G-27).
 *  - work_sessions          — timed work sessions on an item (task drawer timer; G-16).
 *  - work_checklist_items   — a person's own checklist on an item (G-16).
 *  - time_blocks            — planned time on the lead's calendar (Plan my week; G-17).
 *  - item_window_requests   — a lead asks the manager to move a manager-set date
 *                             window on one item (G-17).
 *  - engagement_notes       — staff notes on a client record (G-19, G-20). Never
 *                             shown to the client.
 *  - client_messages        — client-to-lead messages and the lead's triage (G-09, G-11).
 */
import { date, index, integer, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, boolean } from 'drizzle-orm/pg-core';
import * as base from './schema';

export const engagementStepEvents = pgTable(
  'engagement_step_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    stepId: text('step_id').notNull(),
    /** The status the step moved from; null on the first recorded event. */
    fromStatus: text('from_status'),
    /** The status the step moved to, as stored in checklist_state. */
    toStatus: text('to_status').notNull(),
    /** The review state after the change (pending, approved, sent back), when the step has one. */
    reviewStatus: text('review_status'),
    /** Who holds the step after the change: client, lead, manager or sbc (client home trend lines). */
    holder: text('holder'),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engStepIdx: index('engagement_step_events_eng_step_idx').on(t.engagementId, t.stepId, t.at),
  }),
);

export const workSessions = pgTable(
  'work_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemKey: text('item_key').notNull(),
    engagementId: uuid('engagement_id').references(() => base.engagements.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null while the timer is running. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    note: text('note'),
  },
  (t) => ({
    itemIdx: index('work_sessions_item_idx').on(t.itemKey),
    userIdx: index('work_sessions_user_idx').on(t.userId, t.startedAt),
    engIdx: index('work_sessions_engagement_idx').on(t.engagementId),
  }),
);

export const workChecklistItems = pgTable(
  'work_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemKey: text('item_key').notNull(),
    engagementId: uuid('engagement_id').references(() => base.engagements.id, {
      onDelete: 'cascade',
    }),
    label: text('label').notNull(),
    done: boolean('done').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index('work_checklist_items_item_idx').on(t.itemKey),
    engIdx: index('work_checklist_items_engagement_idx').on(t.engagementId),
  }),
);

export const timeBlocks = pgTable(
  'time_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** The work item the block is for; null for a free block ("Focus", "Calls"). */
    itemKey: text('item_key'),
    engagementId: uuid('engagement_id').references(() => base.engagements.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('time_blocks_user_idx').on(t.userId, t.startsAt),
    engIdx: index('time_blocks_engagement_idx').on(t.engagementId),
  }),
);

export const itemWindowRequests = pgTable(
  'item_window_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** The window the lead asks for. */
    fromDate: date('from_date'),
    toDate: date('to_date').notNull(),
    reason: text('reason').notNull(),
    /** pending | approved | rejected | withdrawn */
    status: text('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('item_window_requests_engagement_idx').on(t.engagementId),
  }),
);

export const engagementNotes = pgTable(
  'engagement_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    engIdx: index('engagement_notes_engagement_idx').on(t.engagementId, t.createdAt),
  }),
);

export const clientMessages = pgTable(
  'client_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** client | staff */
    senderSide: text('sender_side').notNull(),
    body: text('body').notNull(),
    /** The step or filing the message is about, as an item key; optional. */
    itemKey: text('item_key'),
    /** Set when someone on the other side has read it. */
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Lead triage of a client message: new | todo | done | ignored. */
    triage: text('triage').notNull().default('new'),
    triagedBy: uuid('triaged_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('client_messages_engagement_idx').on(t.engagementId, t.createdAt),
  }),
);

/**
 * STEP FIELD STATES (S-496, S-497, S-499): the review state of one field inside a step, so a lead
 * can ask the client for one field and a manager can approve or send back one field.
 * state: asked | answered | approved | sent_back.
 */
export const stepFieldStates = pgTable(
  'step_field_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    fieldId: text('field_id').notNull(),
    state: text('state').notNull(),
    askedAt: timestamp('asked_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fieldUq: uniqueIndex('step_field_states_field_uq').on(t.engagementId, t.itemId, t.fieldId),
  }),
);

/**
 * FILING EVENTS (S-771): the dated two-sided thread on one filing period, for example
 * "Client uploaded bank statement" or "SBC filed on the portal". side: client | sbc.
 */
export const filingEvents = pgTable(
  'filing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => base.complianceInstances.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    label: text('label').notNull(),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    instanceIdx: index('filing_events_instance_idx').on(t.instanceId, t.at),
  }),
);

/**
 * COMPLIANCE CHECKLIST CHECKS (S-783, S-816): ticks on the "Before filing" list of an obligation
 * period or a registration. subjectKind: obligation | registration. subjectKey is the
 * compliance instance id or the registration item key; itemKey names the line in the list.
 */
export const complianceChecklistChecks = pgTable(
  'compliance_checklist_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    subjectKind: text('subject_kind').notNull(),
    subjectKey: text('subject_key').notNull(),
    itemKey: text('item_key').notNull(),
    checkedBy: uuid('checked_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    checkUq: uniqueIndex('compliance_checklist_checks_uq').on(
      t.engagementId,
      t.subjectKind,
      t.subjectKey,
      t.itemKey,
    ),
  }),
);

/**
 * KPI SNAPSHOTS (S-618): one stored value per month and key, so Analytics can show the change
 * against last month. scope is 'firm' or a profile id for a person-level number.
 */
export const kpiSnapshots = pgTable(
  'kpi_snapshots',
  {
    period: date('period').notNull(),
    key: text('key').notNull(),
    scope: text('scope').notNull().default('firm'),
    value: numeric('value').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.period, t.key, t.scope] }),
  }),
);
