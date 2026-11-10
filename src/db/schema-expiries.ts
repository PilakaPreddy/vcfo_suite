/**
 * Expiry tracker (docs/specs/automation/IDEAS-PLAN.md, wave 2, section B). Re-exported from
 * src/db/schema.ts; migration 0051_automation creates the tables.
 *
 * Circular import note: like schema-compliance-tasks.ts, this file may only touch `base.*` lazily,
 * inside `.references(() => ...)` callbacks.
 *
 * Tables:
 *  - expiry_items   — one thing that expires for a client: a director's DSC or DIR-3 KYC, or a
 *                     company registration (GST, PF, LEI, FSSAI, trade licence and so on).
 *                     `source_key` is unique per engagement, so the daily backfill from the
 *                     checklist and the registration facts is idempotent.
 *  - expiry_alerts  — one alert per item, stage (60, 30, 7, 0 days) and expiry date. The row is
 *                     claimed before the alert's side effects run, so a retried job never opens a
 *                     second renewal task for the same stage.
 */
import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

export const expiryItems = pgTable(
  'expiry_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** person | company. */
    subjectKind: text('subject_kind').notNull(),
    /** The director's name, or the company's name. */
    subjectName: text('subject_name').notNull(),
    /** dsc | dir3_kyc | gst | pf | esi | pt | shops | fssai | trade_licence | iec | msme | lei | other. */
    kind: text('kind').notNull(),
    /** "DIN 01234567", "GSTIN 36AAACX1234F1Z5", or the registration's title. */
    referenceLabel: text('reference_label'),
    expiresOn: date('expires_on').notNull(),
    /** checklist | registration | manual | ask. The backfill only updates rows it owns. */
    source: text('source').notNull(),
    /** Stable key for the backfill ("dsc:<director entry id>", "reg:reg-6"); unique per engagement. */
    sourceKey: text('source_key').notNull(),
    /** Set when staff mark it renewed without a new expiry date; the alerts then stop. */
    renewedAt: timestamp('renewed_at', { withTimezone: true }),
    renewedBy: uuid('renewed_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /** The last stage alerted for the current expiry date: null, 60, 30, 7 or 0. */
    lastAlertStage: integer('last_alert_stage'),
    /** The draft client request list opened by the first alert (request_lists.id). */
    requestListId: uuid('request_list_id'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceKeyIdx: uniqueIndex('expiry_items_source_key_uq').on(t.engagementId, t.sourceKey),
    expiresIdx: index('expiry_items_expires_idx').on(t.expiresOn),
  }),
);

export const expiryAlerts = pgTable(
  'expiry_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => expiryItems.id, { onDelete: 'cascade' }),
    /** 60, 30, 7 or 0 (the day of expiry or after it). */
    stage: integer('stage').notNull(),
    /** The expiry date the alert was for; a new date starts the stages again. */
    expiresOn: date('expires_on').notNull(),
    /** The renewal task it opened (tasks.id). */
    taskId: uuid('task_id'),
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oncePerStage: uniqueIndex('expiry_alerts_uq').on(t.itemId, t.stage, t.expiresOn),
  }),
);

export type ExpiryItemRow = typeof expiryItems.$inferSelect;
export type ExpiryAlertRow = typeof expiryAlerts.$inferSelect;
