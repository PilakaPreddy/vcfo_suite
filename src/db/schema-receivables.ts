/**
 * Receivables (3 Nov 2026, docs/specs/receivables/PLAN.md).
 * Re-exported from src/db/schema.ts so drizzle-kit and the repositories see one schema.
 * Additive only: new tables, no change to existing ones.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `profiles` may only be
 * touched lazily, inside `.references(() => base.profiles.id)` callbacks.
 *
 * Tables:
 *  - receivable_sheets        — one client organisation's sheet: its manager, the public link key,
 *                               the published version and the reminder rules.
 *  - receivable_partners      — the client partners (filter on the public page, reminder recipients).
 *  - receivable_invoices      — the live draft: one row per invoice.
 *  - receivable_versions      — what Update published; the public page reads only these snapshots.
 *  - receivable_changes       — one row per edit, the audit trail and the "unpublished" count.
 *  - receivable_reminders     — one row per invoice per day; the unique key stops double sends.
 *  - bank_credits             — credits from the bank feed and what they were matched to.
 *  - receivable_email_sends   — each summary email the manager sent.
 */
import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';
import type { ReminderRules, SnapshotRow, EmailRecipient } from '@/lib/receivables/model';

export const receivableSheets = pgTable(
  'receivable_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    clientOrgName: text('client_org_name').notNull(),
    /** The one staff member who edits and publishes this sheet. Firm-wide admins may also. */
    managerUserId: uuid('manager_user_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** The secret part of the public link, /receivables/k/<public_key>. Reset to revoke old links. */
    publicKey: text('public_key').notNull(),
    /** true: the plain /receivables URL shows nothing and only the key link works. */
    requireKey: boolean('require_key').notNull().default(true),
    /** The version the public page shows. No foreign key, to keep the two tables acyclic. */
    publishedVersionId: uuid('published_version_id'),
    reminderRules: jsonb('reminder_rules').$type<ReminderRules>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyIdx: uniqueIndex('receivable_sheets_public_key_idx').on(t.publicKey),
    managerIdx: index('receivable_sheets_manager_idx').on(t.managerUserId),
  }),
);

export const receivablePartners = pgTable(
  'receivable_partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    /** Short id used in ?partner=<slug> links. */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('receivable_partners_sheet_slug_idx').on(t.sheetId, t.slug),
  }),
);

export const receivableInvoices = pgTable(
  'receivable_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    /** First day of the invoice month, e.g. 2026-09-01 for the "September-26" block. */
    invoiceMonth: date('invoice_month').notNull(),
    clientName: text('client_name').notNull(),
    /** Optional: the sheet today often has no invoice number. */
    invoiceNo: text('invoice_no'),
    partnerId: uuid('partner_id').references(() => receivablePartners.id, { onDelete: 'set null' }),
    dueDate: date('due_date').notNull(),
    /** The open balance in INR. A part payment lowers it and adds to part_paid. */
    amountInr: numeric('amount_inr', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('INR'),
    fcAmount: numeric('fc_amount', { precision: 14, scale: 2 }),
    fxRate: numeric('fx_rate', { precision: 12, scale: 6 }),
    /** open | received. */
    status: text('status').notNull().default('open'),
    paidOn: date('paid_on'),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }),
    /** manual | bank. */
    paidVia: text('paid_via'),
    partPaid: numeric('part_paid', { precision: 14, scale: 2 }).notNull().default('0'),
    remindersPausedUntil: date('reminders_paused_until'),
    pauseReason: text('pause_reason'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    sheetStatusIdx: index('receivable_invoices_sheet_status_idx').on(t.sheetId, t.status),
    sheetDueIdx: index('receivable_invoices_sheet_due_idx').on(t.sheetId, t.dueDate),
  }),
);

export const receivableVersions = pgTable(
  'receivable_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    /** 1, 2, 3 … per sheet. */
    seq: integer('seq').notNull(),
    note: text('note').notNull().default(''),
    /** The invoices exactly as published, partner names included. */
    snapshot: jsonb('snapshot').$type<SnapshotRow[]>().notNull(),
    publishedBy: uuid('published_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    publishedByName: text('published_by_name').notNull().default(''),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seqIdx: uniqueIndex('receivable_versions_sheet_seq_idx').on(t.sheetId, t.seq),
  }),
);

export const receivableChanges = pgTable(
  'receivable_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => receivableInvoices.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** A short plain sentence, e.g. "Duravant SC/09/03 marked received". */
    summary: text('summary').notNull(),
    field: text('field'),
    before: text('before'),
    after: text('after'),
    /** false for changes the public page never shows (a reminder pause), so they need no Update. */
    affectsPage: boolean('affects_page').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sheetIdx: index('receivable_changes_sheet_idx').on(t.sheetId, t.createdAt),
  }),
);

export const receivableReminders = pgTable(
  'receivable_reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => receivableInvoices.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').references(() => receivablePartners.id, { onDelete: 'set null' }),
    /** The IST day the reminder is for. */
    forDate: date('for_date').notNull(),
    /** before | due | overdue (see src/lib/receivables/reminder-rule.ts). */
    kind: text('kind').notNull(),
    /** Days before the due date (positive) or after it (negative), on for_date. */
    daysLeft: integer('days_left').notNull(),
    /** queued | skipped | sent | failed. */
    status: text('status').notNull().default('queued'),
    subjectOverride: text('subject_override'),
    bodyOverride: text('body_override'),
    toEmail: text('to_email'),
    /** outlook | email (the SES/Resend fallback). */
    channel: text('channel'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onePerDayIdx: uniqueIndex('receivable_reminders_invoice_day_idx').on(t.invoiceId, t.forDate),
    sheetDayIdx: index('receivable_reminders_sheet_day_idx').on(t.sheetId, t.forDate),
  }),
);

export const bankCredits = pgTable(
  'bank_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    /** hsbc_api | alert_email | manual. */
    source: text('source').notNull(),
    /** The bank's own transaction reference; with source, the de-duplication key. */
    externalRef: text('external_ref').notNull(),
    valueDate: date('value_date').notNull(),
    payer: text('payer').notNull(),
    currency: text('currency').notNull().default('INR'),
    fcAmount: numeric('fc_amount', { precision: 14, scale: 2 }),
    inrAmount: numeric('inr_amount', { precision: 14, scale: 2 }).notNull(),
    narration: text('narration').notNull().default(''),
    /** The matched invoices (one credit may settle several invoices of one client). */
    matchInvoiceIds: jsonb('match_invoice_ids').$type<string[]>().notNull().default([]),
    /** auto | to_confirm | unmatched | confirmed | ignored. */
    status: text('status').notNull(),
    matchNote: text('match_note').notNull().default(''),
    decidedBy: uuid('decided_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refIdx: uniqueIndex('bank_credits_sheet_ref_idx').on(t.sheetId, t.source, t.externalRef),
    statusIdx: index('bank_credits_sheet_status_idx').on(t.sheetId, t.status),
  }),
);

export const receivableEmailSends = pgTable(
  'receivable_email_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => receivableSheets.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => receivableVersions.id, { onDelete: 'set null' }),
    toList: jsonb('to_list').$type<EmailRecipient[]>().notNull().default([]),
    ccList: jsonb('cc_list').$type<EmailRecipient[]>().notNull().default([]),
    bccList: jsonb('bcc_list').$type<EmailRecipient[]>().notNull().default([]),
    subject: text('subject').notNull(),
    /** outlook | email. */
    channel: text('channel').notNull(),
    sentBy: uuid('sent_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sheetIdx: index('receivable_email_sends_sheet_idx').on(t.sheetId, t.sentAt),
  }),
);
