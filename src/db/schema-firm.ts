/**
 * Firm-level tables added on the `ui/spectrum` branch to close the prototype gaps
 * (docs/ui-port/GAPS.md). Re-exported from src/db/schema.ts so drizzle-kit and the
 * repositories see one schema.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so
 * `profiles` / `engagements` may only be touched lazily, inside
 * `.references(() => base.profiles.id)` callbacks, never at module top level.
 *
 * Tables:
 *
 *  - firm_settings       — one row (`id = 'firm'`): firm name, logo, working days,
 *                          holidays and default reminder days (G-02). Admin and super
 *                          admin write; every staff role reads.
 *  - user_sessions       — one row per signed-in device. The JWT carries the row id
 *                          (`sid`); a revoked row signs that device out (G-25).
 *  - escalations         — an engagement raised to the super admin or an admin, with
 *                          who raised it, why, and when it was resolved (G-20).
 *  - prospects           — the Growth sales pipeline (G-21). Super admin only.
 *  - saved_reports       — a report definition with an optional email schedule (G-21).
 *  - demo_requests       — the public "Book a demo" form (G-30). Insert-only from the
 *                          public route; super admin reads.
 *  - mail_groups         — named recipient groups for Email (G-23), with
 *  - mail_group_members  — one row per address in a group.
 *  - rate_limits         — fixed-window attempt counters shared by every App Runner
 *                          instance (sign-in and the two-step pre-check, audit finding 2).
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import * as base from './schema';

export const firmSettings = pgTable('firm_settings', {
  /** Always 'firm'. A text key keeps the one-row table simple to upsert. */
  id: text('id').primaryKey().default('firm'),
  firmName: text('firm_name'),
  /** S3 object key of the uploaded logo. */
  logoObjectKey: text('logo_object_key'),
  /** Working days as ISO weekday numbers, 1 = Monday to 7 = Sunday. */
  workingDays: jsonb('working_days').$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6]),
  /** Firm holidays: [{ date: 'YYYY-MM-DD', label }]. */
  holidays: jsonb('holidays').$type<{ date: string; label: string }[]>().notNull().default([]),
  /** Days before a due date when the default reminders go out, for example [7, 3, 1]. */
  reminderDays: jsonb('reminder_days').$type<number[]>().notNull().default([7, 3, 1]),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  /** Reply-to and footer details for outbound client mail. */
  supportEmail: text('support_email'),
  supportPhone: text('support_phone'),
  address: text('address'),
  /** Service targets: { daysToCoi, fileDaysAhead, replyHours, escalateAfterDays, partnerReportDay }, each a number or null (P-238). */
  serviceTargets: jsonb('service_targets').$type<Record<string, number | null>>().notNull().default({}),
  /** Role permissions set by the super admin: { admin|manager|intern: { view, edit, approve } } (P-236). Empty means the code defaults. */
  rolePermissions: jsonb('role_permissions').$type<Record<string, Record<string, boolean>>>().notNull().default({}),
  updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    /** Sign-in city from the CDN geo headers (C-851); null when no geo header came with the sign-in. */
    city: text('city'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('user_sessions_user_idx').on(t.userId),
  }),
);

/**
 * WhatsApp verification codes (C-868): one row per code sent to a person's WhatsApp number
 * before the number is turned on. Only a hash of the code is kept.
 */
export const whatsappVerifyCodes = pgTable(
  'whatsapp_verify_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The person verifying their own number. */
    userId: uuid('user_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** The number the code was sent to, E.164. */
    phoneE164: text('phone_e164').notNull(),
    /** SHA-256 of the row id, the code and the auth secret; never the code itself. */
    codeHash: text('code_hash').notNull(),
    /** Wrong guesses so far; the code locks at five. */
    attempts: integer('attempts').notNull().default(0),
    /** The code stops working after this time (ten minutes after sending). */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the right code was entered; a used code never works again. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** When the code was sent. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('whatsapp_verify_codes_user_idx').on(t.userId, t.createdAt),
  }),
);

export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    raisedBy: uuid('raised_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** Who should act: an admin or the super admin. Null means the super admin. */
    assignedTo: uuid('assigned_to').references(() => base.profiles.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    /** open | resolved */
    status: text('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('escalations_engagement_idx').on(t.engagementId),
    statusIdx: index('escalations_status_idx').on(t.status),
  }),
);

export const prospects = pgTable(
  'prospects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    company: text('company'),
    email: text('email'),
    phone: text('phone'),
    /** referral | website | event | partner | demo_request | other */
    source: text('source').notNull().default('other'),
    /** lead | contacted | proposal | won | lost */
    stage: text('stage').notNull().default('lead'),
    /** The service asked for: incorporation | compliance | registration | other. */
    service: text('service'),
    ownerId: uuid('owner_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    notes: text('notes'),
    nextStepOn: date('next_step_on'),
    /** Set when the stage becomes won or lost. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** The engagement created when the prospect was won, if any. */
    engagementId: uuid('engagement_id').references(() => base.engagements.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stageIdx: index('prospects_stage_idx').on(t.stage),
  }),
);

export const savedReports = pgTable('saved_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => base.profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** The report kind, for example portfolio | filings | risks | team | growth. */
  kind: text('kind').notNull(),
  /** Filters for the report (date range, practice area, manager). */
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  /** none | weekly | monthly */
  schedule: text('schedule').notNull().default('none'),
  recipients: text('recipients').array().notNull().default([]),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const demoRequests = pgTable('demo_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  phone: text('phone'),
  message: text('message'),
  /** Set when a super admin turns the request into a prospect. */
  prospectId: uuid('prospect_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mailGroups = pgTable('mail_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** A firm-wide group every staff member can use; otherwise only the owner sees it. */
  shared: boolean('shared').notNull().default(false),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => base.profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mailGroupMembers = pgTable(
  'mail_group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => mailGroups.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    position: integer('position').notNull().default(0),
  },
  (t) => ({
    groupEmailUq: uniqueIndex('mail_group_members_group_email_uq').on(t.groupId, t.email),
  }),
);

/**
 * Developer console (round X). One row per live check of an outside service ("Test" on
 * Connections, or a scheduled check). Uptime, p95, incidents and "Last check" are read from
 * these rows. Developer and super admin only (`src/db/repositories/dev-checks.ts`).
 */
export const devServiceChecks = pgTable(
  'dev_service_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The service id from `src/lib/dev/env-status.ts`, for example 'email' or 'storage'. */
    service: text('service').notNull(),
    /** True when the service answered as expected. */
    ok: boolean('ok').notNull(),
    /** How long the check took, in milliseconds. */
    latencyMs: integer('latency_ms').notNull(),
    /** A short, scrubbed line: what was checked, or why it failed. Never a secret. */
    detail: text('detail'),
    /** Who ran the check; null for a scheduled check. */
    checkedBy: uuid('checked_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** When the check ran. */
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    serviceAtIdx: index('dev_service_checks_service_at_idx').on(t.service, t.checkedAt),
  }),
);

/**
 * Developer console switches, one row per key (for example 'jobs.paused'). Developer and
 * super admin write; the jobs and the console read (`src/db/repositories/dev-settings.ts`).
 */
export const devSettings = pgTable('dev_settings', {
  /** The setting name, for example 'jobs.paused'. */
  key: text('key').primaryKey(),
  /** The value as JSON, for example { "on": true }. */
  value: jsonb('value').notNull().default({}),
  /** Who changed it last. */
  updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  /** When it was changed last. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every App Runner image identifier the console has seen the production service run, so
 * "Roll back" can offer an earlier one (App Runner keeps no image history).
 */
export const devDeployImages = pgTable('dev_deploy_images', {
  /** The full image identifier App Runner names, for example '<repo>:<tag>'. */
  image: text('image').primaryKey(),
  /** When the console first saw the service run this image. */
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  /** When the console last saw the service run this image. */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Personal API tokens for the developer console (Access › Secrets and API keys). A token
 * reads the `/api/dev/*` GET routes as the developer who made it; it cannot write. Only the
 * SHA-256 hash is stored; the token is shown once when it is made.
 */
export const devApiTokens = pgTable(
  'dev_api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** A name the developer gives it, for example "Grafana". */
    name: text('name').notNull(),
    /** SHA-256 of the token, hex. The token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    /** The first characters of the token, to tell tokens apart on screen. */
    prefix: text('prefix').notNull(),
    /** Who made it; the token acts as this person and only while they are a developer. */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** When it was made. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** When it stops working. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** When it last read a route. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    /** When it was revoked; null while it works. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    hashUq: uniqueIndex('dev_api_tokens_hash_uq').on(t.tokenHash),
  }),
);

/**
 * Outbound mail that FAILED, kept for 30 days so the developer console can send it again
 * (Messages › Retry). Written by `src/lib/email/send-email.ts` only when the provider refused
 * the mail; a successful mail is never stored, and a successful retry deletes the row.
 */
export const failedEmails = pgTable(
  'failed_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Recipients as given to sendEmail. */
    toAddresses: jsonb('to_addresses').$type<string[]>().notNull(),
    /** Copy recipients. */
    ccAddresses: jsonb('cc_addresses').$type<string[]>().notNull().default([]),
    /** Reply-To addresses. */
    replyTo: jsonb('reply_to').$type<string[]>().notNull().default([]),
    /** The From override, when the caller gave one. */
    fromAddress: text('from_address'),
    /** Subject line. */
    subject: text('subject').notNull(),
    /** The template key: sendEmail's `purpose`, for example 'welcome'. */
    templateKey: text('template_key'),
    /** The rendered mail (render data): HTML body. */
    html: text('html').notNull(),
    /** The rendered mail: plain-text body. */
    textBody: text('text_body').notNull(),
    /** True when the mail had attachments; they are not stored, so it cannot be retried. */
    hadAttachments: boolean('had_attachments').notNull().default(false),
    /** The provider's error, short. */
    error: text('error'),
    /** How many sends were tried, the first one included. */
    attempts: integer('attempts').notNull().default(1),
    /** When it first failed. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** When the last try ran. */
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('failed_emails_created_idx').on(t.createdAt),
  }),
);

/**
 * One row per file the app exported (audit log CSV, vault ZIP, partner report PDF or CSV,
 * client audit CSV). The file is kept in S3 under `exports/` for 30 days. Listed on the
 * developer console (Data and costs › Exports).
 */
export const exportFiles = pgTable(
  'export_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** What was exported: 'audit_log' | 'vault_zip' | 'partner_report' | 'client_audit' | 'client_vault_zip'. */
    kind: text('kind').notNull(),
    /** 'csv' | 'zip' | 'pdf'. */
    format: text('format').notNull(),
    /** The file name the person received. */
    fileName: text('file_name').notNull(),
    /** Size in bytes. */
    sizeBytes: integer('size_bytes').notNull().default(0),
    /** Who made it. */
    madeBy: uuid('made_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** S3 key under exports/, or null when the copy was not kept (too large, or the upload failed). */
    objectKey: text('object_key'),
    /** When it was made. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('export_files_created_idx').on(t.createdAt),
  }),
);

/**
 * A staff profile's link to an outside sign-in (S-650): today only Microsoft Entra ID. Made on the
 * first Microsoft sign-in whose email matches an existing active profile; Microsoft sign-in never
 * creates a profile. The owner reads and removes their own link (`src/db/repositories/sign-in-links.ts`).
 */
export const signInLinks = pgTable(
  'sign_in_links',
  {
    /** Row id. */
    id: uuid('id').primaryKey().defaultRandom(),
    /** The VCFO profile this outside identity signs in as. */
    profileId: uuid('profile_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** The Auth.js provider id, for example 'microsoft-entra-id'. */
    provider: text('provider').notNull(),
    /** The provider's stable subject for the person (the OIDC `sub`). */
    subject: text('subject').notNull(),
    /** The email the provider gave when the link was made. */
    email: text('email').notNull(),
    /** When the link was made (the first sign-in). */
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    /** The last sign-in through this link. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    providerSubjectUidx: uniqueIndex('sign_in_links_provider_subject_uidx').on(t.provider, t.subject),
    profileProviderUidx: uniqueIndex('sign_in_links_profile_provider_uidx').on(t.profileId, t.provider),
  }),
);

/**
 * One fixed-window counter per key (for example `sign-in:email:a@b.co`). Postgres holds it so
 * the limit is the same on every App Runner instance. Rows past `reset_at` are dead and are
 * swept by `systemTakeRateLimit`.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    resetIdx: index('rate_limits_reset_idx').on(t.resetAt),
  }),
);
