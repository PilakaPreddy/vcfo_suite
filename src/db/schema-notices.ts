/**
 * Notice desk (docs/specs/automation/IDEAS-PLAN.md, wave 2, section C). Re-exported from
 * src/db/schema.ts; migration 0051_automation creates the table.
 *
 * Circular import note: like schema-compliance-tasks.ts, this file may only touch `base.*` lazily,
 * inside `.references(() => ...)` callbacks.
 *
 * Tables:
 *  - notice_cases — one tax, GST, TDS or MCA notice a client received, from intake to closure.
 *                   `attachments` lists the source documents filed in the client's vault.
 *                   `last_escalation` and `last_escalation_due_on` make the daily escalation job
 *                   idempotent: a stage (t7, t2, overdue) fires once per response due date.
 */
import { date, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

/** One source document of a case, filed in the vault (`engagement_documents`). */
export interface NoticeAttachment {
  documentId: string;
  fileName: string;
  /** The S3 key inside the `engagement-documents` bucket, when known. */
  objectKey?: string | null;
}

export const noticeCases = pgTable(
  'notice_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** gst | income_tax | tds | mca | other. */
    authority: text('authority').notNull(),
    /** The section the notice is issued under, for example "73" or "143(2)". */
    section: text('section'),
    /** The tax period or assessment year, as printed ("FY 2023-24", "AY 2024-25"). */
    periodLabel: text('period_label'),
    /** The document identification number printed on the notice. */
    din: text('din'),
    /** The demand in rupees, when the notice raises one. */
    demandAmount: numeric('demand_amount', { precision: 16, scale: 2 }),
    receivedOn: date('received_on'),
    responseDueOn: date('response_due_on'),
    hearingOn: date('hearing_on'),
    /** received | analysed | docs_requested | reply_drafted | submitted | closed. */
    stage: text('stage').notNull().default('received'),
    ownerId: uuid('owner_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** A two-line summary of what the notice asks. */
    summary: text('summary'),
    /** The working reply; the partner approves the final text before it is filed. */
    replyDraft: text('reply_draft'),
    /** The documents the reply needs, from the drafting step. */
    documentsNeeded: jsonb('documents_needed').$type<string[]>().notNull().default([]),
    /** The client request list opened for the documents (request_lists.id). */
    requestListId: uuid('request_list_id'),
    attachments: jsonb('attachments').$type<NoticeAttachment[]>().notNull().default([]),
    notes: text('notes'),
    /** t7 | t2 | overdue: the last escalation sent for `last_escalation_due_on`. */
    lastEscalation: text('last_escalation'),
    lastEscalationDueOn: date('last_escalation_due_on'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engagementIdx: index('notice_cases_engagement_idx').on(t.engagementId),
    dueIdx: index('notice_cases_due_idx').on(t.stage, t.responseDueOn),
  }),
);

export type NoticeCaseRow = typeof noticeCases.$inferSelect;
