/**
 * Event-based compliance triggers (docs/specs/automation/IDEAS-PLAN.md, wave 2, section D).
 * Re-exported from src/db/schema.ts; migration 0051_automation creates
 * the table.
 *
 * Circular import note: like schema-compliance-tasks.ts, this file may only touch `base.*` lazily,
 * inside `.references(() => ...)` callbacks.
 *
 * Table:
 *  - company_events — one company event that starts an MCA filing (a director appointed, the
 *    registered office moved, shares allotted …). A record change or a board meeting proposes it;
 *    a person confirms it through the `filing.recordEvent` review card, which creates the task and
 *    drafts the client request, and the event is then tracked until the filing is done.
 */
import { date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

export const companyEvents = pgTable(
  'company_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** A kind from src/data/event-triggers.ts, for example 'director_appointed'. */
    kind: text('kind').notNull(),
    occurredOn: date('occurred_on').notNull(),
    /** The person's name, DIN, address and so on; a record change also keeps its `baseline`. */
    details: jsonb('details').notNull().default({}),
    /** manual | ask | record_change | board_meeting. */
    source: text('source').notNull().default('manual'),
    /** For a record change, the watched value and kind ('pre-15:directors:director_appointed'), so autosaves update one proposal. */
    sourceKey: text('source_key'),
    /** proposed | tracked | done | dismissed. */
    status: text('status').notNull().default('proposed'),
    /** The task the confirmed event created: a compliance task, or a Work board task for a lead. */
    taskId: uuid('task_id'),
    /** compliance | work, which table `task_id` points into. */
    taskKind: text('task_kind'),
    /** The draft client request list the confirmed event created. */
    requestListId: uuid('request_list_id'),
    dueOn: date('due_on'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    confirmedBy: uuid('confirmed_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('company_events_engagement_idx').on(t.engagementId, t.status),
    statusIdx: index('company_events_status_idx').on(t.status, t.dueOn),
  }),
);

export type CompanyEventRow = typeof companyEvents.$inferSelect;
