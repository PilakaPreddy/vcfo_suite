/**
 * Client request lists (docs/specs/automation/IDEAS-PLAN.md, wave 2, section A). Re-exported from
 * src/db/schema.ts; migration 0051_automation creates the tables.
 *
 * Circular import note: like schema-compliance-tasks.ts, this file may only touch `base.*` lazily,
 * inside `.references(() => ...)` callbacks.
 *
 * Tables:
 *  - request_lists       — one list of things the firm needs from a client for a period, with its
 *                          reminder cadence and how many reminders have gone out.
 *  - request_list_items  — one line of a list. A document line links to the `document_requests`
 *                          row created when the list is sent, so the client uploads it through the
 *                          existing request upload path. Answer and confirmation lines are answered
 *                          on the client's Requests page.
 */
import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

export const requestLists = pgTable(
  'request_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** The template it was made from (src/data/request-templates.ts), or null for a hand-made list. */
    templateId: text('template_id'),
    title: text('title').notNull(),
    periodLabel: text('period_label'),
    /** draft | sent | complete | cancelled. */
    status: text('status').notNull().default('draft'),
    dueOn: date('due_on'),
    /** Days between reminders once the list is sent. */
    cadenceDays: integer('cadence_days').notNull().default(3),
    reminderCount: integer('reminder_count').notNull().default(0),
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
    firstSentAt: timestamp('first_sent_at', { withTimezone: true }),
    /** The "call the client" task opened after the third reminder; set once. */
    callTaskId: uuid('call_task_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('request_lists_engagement_idx').on(t.engagementId, t.status),
    statusIdx: index('request_lists_status_idx').on(t.status),
  }),
);

export const requestListItems = pgTable(
  'request_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => requestLists.id, { onDelete: 'cascade' }),
    /** document | answer | confirmation. */
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    help: text('help'),
    /** pending | received | accepted | rejected. */
    status: text('status').notNull().default('pending'),
    answerText: text('answer_text'),
    /** The document request created when the list was sent (document items only). */
    documentRequestId: uuid('document_request_id').references(() => base.documentRequests.id, { onDelete: 'set null' }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    ordinal: integer('ordinal').notNull().default(0),
  },
  (t) => ({
    listIdx: index('request_list_items_list_idx').on(t.listId, t.ordinal),
    docReqIdx: index('request_list_items_doc_request_idx').on(t.documentRequestId),
  }),
);

export type RequestListRow = typeof requestLists.$inferSelect;
export type RequestListItemRow = typeof requestListItems.$inferSelect;
