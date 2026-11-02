import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  jsonb,
  boolean,
  integer,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
  customType,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * VCFO Suite database schema (Drizzle).
 *
 * Ported from the 36 Supabase SQL migrations in the original scaffold.
 * The original relied on Postgres ROW-LEVEL SECURITY for tenant/role isolation.
 * We are taking "Path A" from the replan: access control is enforced in the
 * REPOSITORY layer (src/db/repositories/*) instead of RLS policies.
 *
 * >>> The old RLS policies are the SPEC for those repository filters. <<<
 * See src/db/repositories/README.md and docs/context/notes/data-access.md for the exact rules each
 * repository query must reproduce (e.g. a client may only read an engagement
 * where client_user_id = session.userId OR client_id = session.clientId).
 *
 * RECONCILED (Phase 1) against the original SQL. Things that changed from the
 * first-pass scaffold, and are easy to get wrong again:
 *   - engagement_board_resolutions is keyed by engagement_id (one row each);
 *     the resolution DATE lives in engagements.checklist_state, not a column.
 *   - compliance_obligations.id is a TEXT slug, not a uuid.
 *   - knowledge_bank_files has no visible_to_roles column — role visibility is
 *     a repository rule (manager: all, intern: read + own upload, client: none).
 *   - engagements.progress_cc_emails is text[], and incorporation_date is date.
 *   - document_templates is keyed by its text `key`, with no version column.
 * The `tasks`/`document_requests`/`invites`/`activity`/`notifications` tables
 * below are NEW (they replace localStorage) and have no original SQL.
 */

export const roleEnum = pgEnum('trak_role', [
  'super_admin',
  'admin',
  'manager',
  'intern',
  'client',
  /** Engineering access to the developer console only; no client data (G-01). */
  'developer',
]);
export const stageEnum = pgEnum('engagement_stage', [
  'Pre-Incorporation',
  'Post-Incorporation',
  'Operational Readiness',
]);
export const healthEnum = pgEnum('engagement_health', [
  'on-track',
  'at-risk',
  'overdue',
]);
/** Per-profile WhatsApp reachability. `failed` is set by the EUM SNS delivery webhook. */
export const whatsappStatusEnum = pgEnum('whatsapp_status', [
  'unknown',
  'verified',
  'failed',
]);

/**
 * Identity + role. In the original this joined Supabase auth.users.
 * With Auth.js we own the users table, so profiles carries auth fields too.
 * `intern_id` / `client_id` are the scoping keys the RLS helpers used
 * (my_intern_id(), my_client_id()) — repositories filter on these.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Auth.js Credentials provider: bcrypt hash lives here.
  passwordHash: text('password_hash'),
  name: text('name'),
  role: roleEnum('role').notNull().default('client'),
  /** @deprecated Free-form display number. Not read by WhatsApp — see phoneE164. */
  phone: text('phone'),
  /** WhatsApp destination in E.164 (+919876543210). Null = never provided. */
  phoneE164: text('phone_e164'),
  /** Set when the person ticks the WhatsApp consent box. DPDP evidence. */
  whatsappOptInAt: timestamp('whatsapp_opt_in_at', { withTimezone: true }),
  /** Set on STOP (inbound webhook) or withdrawal from the profile surface. */
  whatsappOptOutAt: timestamp('whatsapp_opt_out_at', { withTimezone: true }),
  whatsappStatus: whatsappStatusEnum('whatsapp_status').notNull().default('unknown'),
  status: text('status').notNull().default('active'),
  /** Set when a client is replaced off their last project. People > Removed clients reads this. */
  removedAt: timestamp('removed_at', { withTimezone: true }),
  /** Human-readable trail: who replaced them, on which project. */
  removedReason: text('removed_reason'),
  // Scoping keys (mirror the original RLS helper functions).
  internId: text('intern_id'),
  clientId: text('client_id'),
  /** Project lead → Project Manager org chart (Admin Team + PM roster). */
  reportsToManagerId: uuid('reports_to_manager_id'),
  /** S3 object key for the user’s chosen photo (upload or Outlook Graph). */
  avatarObjectKey: text('avatar_object_key'),
  /** Firm Admin a Project Manager reports to (super admin's Admin column, G-20). */
  reportsToAdminId: uuid('reports_to_admin_id'),
  /** How many open items a person can carry at once; null means not set (G-14). */
  capacity: integer('capacity'),
  /** Last signed-in request, written at most every few minutes (G-14). */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  /** AES-256-GCM of the base32 TOTP secret; set while two-step sign-in is on or pending (G-25). */
  totpSecretEnc: text('totp_secret_enc'),
  /** When two-step sign-in was confirmed with a first code; null means it is off. */
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  /** Job title shown on Profile and Team, for example "Director" or "Senior associate" (P-617, C-821). */
  designation: text('designation'),
  /** ICAI or ICSI membership number for staff, shown in mono on Profile (P-617, S-653). */
  membershipNo: text('membership_no'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The central record. Mirrors EngagementRow in the original engagements-db.ts.
 * checklist_state is the same jsonb blob the domain code already understands
 * (normalizeEngagementChecklistState in src/domain/checklist-state-key.ts).
 */
export const engagements = pgTable(
  'engagements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    companyName: text('company_name').notNull(),
    companyType: text('company_type').notNull().default('domestic'), // domestic | foreign
    /** subsidiary (has a parent entity) | independent (standalone — no parent details asked). */
    ownershipType: text('ownership_type').notNull().default('subsidiary'),
    /** name_only | investing — only for subsidiary + domestic; null otherwise (drives the NOC variant). */
    parentIndianRelationship: text('parent_indian_relationship'),
    entityLegalForm: text('entity_legal_form').notNull().default('company'), // company|llp|partnership|proprietorship
    // SQL type is `date`, not timestamptz — compliance trigger math treats this
    // as a calendar date (see src/lib/compliance/fy-periods.ts).
    incorporationDate: date('incorporation_date'),
    parentEntityName: text('parent_entity_name'),
    parentEntityAddress: text('parent_entity_address'),
    parentEntityRegistrationNumber: text('parent_entity_registration_number'),
    /** India subsidiary / GCC entity — required when starting at Registration or Compliance. */
    subsidiaryLegalName: text('subsidiary_legal_name'),
    subsidiaryRegisteredAddress: text('subsidiary_registered_address'),
    clientId: text('client_id').notNull(),
    clientUserId: uuid('client_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    /** Delivery lead — nullable so admins/managers can unassign. */
    internId: text('intern_id'),
    /** Project Manager who owns this engagement (scoped access). */
    managerId: uuid('manager_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** Optional firm Admin who created/oversees (not used for day-to-day scope). */
    adminId: uuid('admin_id').references(() => profiles.id, { onDelete: 'set null' }),
    clientName: text('client_name'),
    stage: stageEnum('stage').notNull().default('Pre-Incorporation'),
    health: healthEnum('health').notNull().default('on-track'),
    checklistState: jsonb('checklist_state').notNull().default({}),
    /** Compliance questionnaire answers captured at project creation. */
    complianceQuestionnaire: jsonb('compliance_questionnaire').notNull().default({}),
    /**
     * Manager-set date windows: `{ incorporation?: Window, steps?: { [itemId]: Window } }`
     * (`src/lib/projects/schedule-windows.ts`). Its own column rather than a key inside
     * `checklist_state`, whose normaliser treats every top-level key as a step.
     */
    schedule: jsonb('schedule'),
    /** The date the firm expects the certificate of incorporation (G-13). */
    expectedCoiOn: date('expected_coi_on'),
    // SQL type is text[], not jsonb — merge-cc.ts treats it as a string array.
    progressCcEmails: text('progress_cc_emails').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete — non-null rows are hidden everywhere except the admin recycle bin. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    internIdx: index('engagements_intern_id_idx').on(t.internId),
    managerIdx: index('engagements_manager_id_idx').on(t.managerId),
    clientUserIdx: index('engagements_client_user_id_idx').on(t.clientUserId),
    clientIdx: index('engagements_client_id_idx').on(t.clientId),
  }),
);

/**
 * Additional (and primary) client users on an engagement.
 * `engagements.client_user_id` remains the primary/owner pointer for legacy
 * callers; membership here is the source of truth for multi-client access.
 */
export const engagementClients = pgTable(
  'engagement_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** owner = primary client; member = invited collaborator. */
    memberRole: text('member_role').notNull().default('member'),
    invitedBy: uuid('invited_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('engagement_clients_engagement_idx').on(t.engagementId),
    userIdx: index('engagement_clients_user_idx').on(t.userId),
    uniqueMember: uniqueIndex('engagement_clients_unique').on(t.engagementId, t.userId),
  }),
);

/**
 * Project leads (interns) on an engagement — many per project.
 * `engagements.intern_id` remains the primary/legacy pointer; membership
 * here is the source of truth for multi-lead access.
 */
export const engagementLeads = pgTable(
  'engagement_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    /** profiles.intern_id scoping key (same as engagements.intern_id). */
    internId: text('intern_id').notNull(),
    invitedBy: uuid('invited_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('engagement_leads_engagement_idx').on(t.engagementId),
    internIdx: index('engagement_leads_intern_idx').on(t.internId),
    uniqueLead: uniqueIndex('engagement_leads_unique').on(t.engagementId, t.internId),
  }),
);

/**
 * Project managers on an engagement — many per project.
 * `engagements.manager_id` remains the primary pointer; membership here
 * grants co-manager access for additional PMs.
 */
export const engagementManagers = pgTable(
  'engagement_managers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    invitedBy: uuid('invited_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('engagement_managers_engagement_idx').on(t.engagementId),
    managerIdx: index('engagement_managers_manager_idx').on(t.managerId),
    uniqueManager: uniqueIndex('engagement_managers_unique').on(t.engagementId, t.managerId),
  }),
);

/**
 * Draft/finalized/signed board-resolution state + template fingerprint.
 * Reconciled (Phase 1) against 20260525200000_board_resolution.sql and the
 * five ALTERs that followed it (docx, docx_required, template_fingerprint,
 * signed_upload, repair_finalized_storage).
 *
 * NOTE: `engagement_id` is the PRIMARY KEY — exactly one row per engagement.
 * The board-resolution DATE is NOT a column here; it lives in
 * engagements.checklist_state under the pre-1 responses (see the
 * is_valid_pre1_date / assert_pre1_patched_board_resolution_date functions in
 * 20260526140000_board_resolution_date.sql).
 *
 * `storage_path` / `signed_storage_path` now hold S3 object keys rather than
 * Supabase Storage paths. Column names are kept so the ported engagements-db
 * logic reads the same.
 */
export const engagementBoardResolutions = pgTable('engagement_board_resolutions', {
  engagementId: uuid('engagement_id')
    .primaryKey()
    .references(() => engagements.id, { onDelete: 'cascade' }),
  content: text('content').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft|finalized
  draftedAt: timestamp('drafted_at', { withTimezone: true }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  finalizedBy: uuid('finalized_by').references(() => profiles.id, { onDelete: 'set null' }),
  templateFingerprint: text('template_fingerprint'),
  storagePath: text('storage_path'),
  signedStoragePath: text('signed_storage_path'),
  signedUploadedAt: timestamp('signed_uploaded_at', { withTimezone: true }),
  signedUploadedBy: uuid('signed_uploaded_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  /** When the finalized draft was sent to the client for signing (S-573); null until then. */
  sentToClientAt: timestamp('sent_to_client_at', { withTimezone: true }),
  sentToClientBy: uuid('sent_to_client_by').references(() => profiles.id, { onDelete: 'set null' }),
  /*
   * Board resolution (NOC) receive steps (R-52, docs/ui-port/BR-NOC-API.md). Notarised and
   * Apostilled apply to a foreign parent only; staff stamp them by ticking the matching receive
   * check. Accepted closes the document; a copy received before this build is backfilled.
   */
  notarisedAt: timestamp('notarised_at', { withTimezone: true }),
  notarisedBy: uuid('notarised_by').references(() => profiles.id, { onDelete: 'set null' }),
  apostilledAt: timestamp('apostilled_at', { withTimezone: true }),
  apostilledBy: uuid('apostilled_by').references(() => profiles.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedBy: uuid('accepted_by').references(() => profiles.id, { onDelete: 'set null' }),
  sentBackAt: timestamp('sent_back_at', { withTimezone: true }),
  sentBackBy: uuid('sent_back_by').references(() => profiles.id, { onDelete: 'set null' }),
  sentBackReason: text('sent_back_reason'),
  /** Receive checklist ticks: `{ [checkKey]: { by: profileId, at: iso } }`. Cleared by a new signed upload. */
  receiveChecks: jsonb('receive_checks').notNull().default({}),
  /** D1: SBC turned the notary and apostille steps off for this client. */
  notaryStepsOff: boolean('notary_steps_off').notNull().default(false),
  /** Staff "Change template" override (a NocVariant); null follows the project answers. */
  templateVariant: text('template_variant'),
  templateChangedAt: timestamp('template_changed_at', { withTimezone: true }),
  templateChangedBy: uuid('template_changed_by').references(() => profiles.id, { onDelete: 'set null' }),
  templateChangeReason: text('template_change_reason'),
  /** The Vault row the accepted signed copy was filed as (T6). */
  vaultDocumentId: uuid('vault_document_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per generated board resolution draft (T4 Compare versions, T3 out-of-date mark).
 * `fields` is the merge-value snapshot from `nocSnapshotFields()` (answers only, never inline
 * edits). Additive; written by the generate route through the board-resolution repository.
 */
export const engagementBoardResolutionVersions = pgTable(
  'engagement_board_resolution_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    variant: text('variant').notNull(),
    fields: jsonb('fields').notNull().default({}),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueVersion: uniqueIndex('engagement_br_versions_unique').on(t.engagementId, t.version),
  }),
);

/**
 * Uploaded .docx templates. Reconciled against
 * 20260805120000_document_templates.sql — `key` is the PRIMARY KEY (a slug
 * like 'board-resolution'), and there is no version column: uploading a new
 * template replaces the row and its object.
 */
export const documentTemplates = pgTable('document_templates', {
  key: text('key').primaryKey(),
  storagePath: text('storage_path').notNull().unique(), // S3 object key
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-engagement documents (certificates, filings, milestone attachments).
 *
 * NOTE: this table has NO counterpart in the original migrations — milestone
 * attachments there were storage-only, keyed by `{engagement_id}/...` object
 * paths and referenced from engagements.checklist_state (see
 * milestone_document_engagement_id() in
 * 20260523160000_milestone_documents_storage.sql). It is kept as the forward
 * home for a real document index, but milestone upload/download still works
 * off object paths — do not assume a row exists for every stored file.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    category: text('category'), // documents|images|reports|deliverables
    fileName: text('file_name').notNull(),
    objectKey: text('object_key').notNull(), // S3
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id),
    stepId: text('step_id'), // checklist step this belongs to, if any
    sharedWithClient: boolean('shared_with_client').notNull().default(false),
    /** none | pending | approved | changes — the vault review state (G-26). */
    reviewStatus: text('review_status').notNull().default('none'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    /** When a newer upload to the same checklist field took this file's place (vault "Replaced", P-575). */
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
    /** The documents row of the newer upload that replaced this one (no FK: rows may be removed). */
    replacedById: uuid('replaced_by_id'),
    /** Soft delete from the vault (P-596); a deleted row is hidden everywhere and Undo clears it. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** Who deleted the file from the vault. */
    deletedBy: uuid('deleted_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('documents_engagement_idx').on(t.engagementId),
  }),
);

/**
 * Nested folders for the firm Knowledge Bank (not the document vault).
 * `parent_id` null = library root. Delete refuses non-empty folders —
 * ON DELETE restrict on `parent_id` and on `knowledge_bank_files.folder_id`.
 *
 * ACCESS: same as knowledge_bank_files — admin/manager all; intern read all
 * + insert own (`created_by = self`); client none. Intern cannot delete.
 */
export const knowledgeBankFolders = pgTable(
  'knowledge_bank_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => knowledgeBankFolders.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdx: index('knowledge_bank_folders_parent_idx').on(t.parentId),
  }),
);

/**
 * Shared firm library. Reconciled against 20260529160000_knowledge_bank.sql.
 *
 * ACCESS CONTROL: the original had NO `visible_to_roles` column — visibility
 * was entirely in RLS: manager = ALL, intern = SELECT + INSERT (own uploads),
 * client = no access at all. That rule now lives in the repository, so do not
 * reintroduce a visibility column. `storage_path` holds the S3 object key.
 * `folder_id` null = library root (migration 0013).
 */
export const knowledgeBankFiles = pgTable(
  'knowledge_bank_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    storagePath: text('storage_path').notNull().unique(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    folderId: uuid('folder_id').references(() => knowledgeBankFolders.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    folderIdx: index('knowledge_bank_files_folder_idx').on(t.folderId),
  }),
);

/**
 * Append-only change trail behind the Audit Log view.
 * Reconciled against 20260529120000_audit_events.sql — note the actor
 * email/name are DENORMALISED onto the row so the log still reads correctly
 * after a profile is renamed or deleted, and `summary` is a required
 * human-readable sentence (formatAuditActionLabel in src/lib/audit/audit-log.ts).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    actorRole: roleEnum('actor_role').notNull(),
    actorEmail: text('actor_email'),
    actorName: text('actor_name'),
    engagementId: uuid('engagement_id').references(() => engagements.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    /** ok | failed | denied — what happened to the action (G-28). */
    result: text('result').notNull().default('ok'),
  },
  (t) => ({
    engIdx: index('audit_events_engagement_idx').on(t.engagementId),
    createdIdx: index('audit_events_created_idx').on(t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Email (DB-backed templates/bindings/send_log for checklist lifecycle mail)
// ---------------------------------------------------------------------------
// Reconciled against 20260805150000_email_templates.sql and
// 20260806120000_email_send_log_seeds.sql. Transactional welcome / intern-
// welcome mail uses the shared Resend helper in src/lib/email/send-resend.ts
// (console-skips when RESEND_API_KEY is empty). Checklist-triggered mail can
// bind to email_templates later; do not add a second Resend client.

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text'),
  // firm_default | assigned_manager
  fromIdentity: text('from_identity').notNull().default('firm_default'),
  /** Compose / outbound wrap: `sbc` (firm letterhead) or `plain`. */
  branding: text('branding').notNull().default('sbc'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Binds a template to (checklist item, lifecycle trigger). `checklist_item_id`
 * may be '*' to match any step. Recipient rules are jsonb arrays.
 */
export const emailTemplateBindings = pgTable(
  'email_template_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => emailTemplates.id, { onDelete: 'cascade' }),
    checklistItemId: text('checklist_item_id').notNull(),
    // step_entered|awaiting_client|client_submitted|manager_accepted|rejected|
    // delivered_to_client|lead_escalated|completed|overdue
    triggerEvent: text('trigger_event').notNull(),
    toRules: jsonb('to_rules').notNull().default([]),
    ccRules: jsonb('cc_rules').notNull().default([]),
    bccRules: jsonb('bcc_rules').notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePair: uniqueIndex('email_template_bindings_unique_pair').on(
      t.checklistItemId,
      t.triggerEvent,
      t.templateId,
    ),
  }),
);

/**
 * Idempotency ledger for lifecycle emails. The UNIQUE constraint is the whole
 * point: `occurrence_key` makes a retry a no-op rather than a duplicate send.
 */
export const emailSendLog = pgTable(
  'email_send_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    checklistItemId: text('checklist_item_id').notNull(),
    triggerEvent: text('trigger_event').notNull(),
    bindingId: uuid('binding_id')
      .notNull()
      .references(() => emailTemplateBindings.id, { onDelete: 'cascade' }),
    occurrenceKey: text('occurrence_key').notNull(),
    templateId: uuid('template_id').references(() => emailTemplates.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull(), // pending|sent|skipped|failed
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engCreatedIdx: index('email_send_log_engagement_created_idx').on(
      t.engagementId,
      t.createdAt,
    ),
    bindingIdx: index('email_send_log_binding_idx').on(t.bindingId),
    idempotency: uniqueIndex('email_send_log_idempotency').on(
      t.engagementId,
      t.checklistItemId,
      t.triggerEvent,
      t.bindingId,
      t.occurrenceKey,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Compliance calendar
// Reconciled (Phase 1) against the original SQL:
//   20260708120000_compliance_calendar.sql  (base tables)
//   20260805130000_compliance_v2.sql        (evidence, trigger flags, events)
//   20260805140000_compliance_v3.sql        (widened event_type set)
// Column shapes match src/lib/compliance/types.ts, which the LIFTed pure
// generation logic (generate-instances.ts, fy-periods.ts) already tests against.
// ---------------------------------------------------------------------------

/** Static obligation library. `id` is a TEXT slug (e.g. 'gst-gstr-3b'), not a uuid. */
export const complianceObligations = pgTable('compliance_obligations', {
  id: text('id').primaryKey(),
  complianceArea: text('compliance_area').notNull(),
  particular: text('particular').notNull(),
  authority: text('authority').notNull(),
  frequency: text('frequency').notNull(), // monthly|quarterly|half-yearly|annual|one-time
  triggerType: text('trigger_type').notNull(),
  dueRule: jsonb('due_rule').notNull().default({}),
  appliesTo: jsonb('applies_to')
    .notNull()
    .default({ company: true, llp: true, partnership: true, proprietorship: true }),
  applicabilityNote: text('applicability_note'),
  isConditional: boolean('is_conditional').notNull().default(false),
  penaltyRisk: text('penalty_risk').notNull().default('low'),
  /** The activity master row (compliance_activities.id) this obligation belongs to; null when the master has none (0030). */
  activityId: text('activity_id'),
});

/** One row per engagement — the anchor dates that drive instance generation. */
export const engagementComplianceTriggers = pgTable('engagement_compliance_triggers', {
  engagementId: uuid('engagement_id')
    .primaryKey()
    .references(() => engagements.id, { onDelete: 'cascade' }),
  incorporationDate: date('incorporation_date'),
  gstRegistrationDate: date('gst_registration_date'),
  tanRegistrationDate: date('tan_registration_date'),
  pfRegistrationDate: date('pf_registration_date'),
  esiRegistrationDate: date('esi_registration_date'),
  ptRegistrationDate: date('pt_registration_date'),
  tdsLiabilityStartDate: date('tds_liability_start_date'),
  agmDate: date('agm_date'),
  // v2 conditional flags
  hasForeignInvestment: boolean('has_foreign_investment').notNull().default(false),
  gstQrmp: boolean('gst_qrmp').notNull().default(false),
  sezUnit: boolean('sez_unit').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const complianceInstances = pgTable(
  'compliance_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    obligationId: text('obligation_id')
      .notNull()
      .references(() => complianceObligations.id),
    dueDate: date('due_date').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    periodLabel: text('period_label'),
    fyLabel: text('fy_label'),
    status: text('status').notNull().default('upcoming'), // upcoming|in-progress|filed|overdue
    ownerId: uuid('owner_id'),
    filedOn: date('filed_on'),
    // v2 evidence
    filedNote: text('filed_note'),
    evidenceUrl: text('evidence_url'),
    // Manager-set working window for this instance. Deliberately absent from
    // the regeneration upsert's SET clause, so the Inngest job never clears it.
    windowFrom: date('window_from'),
    windowTo: date('window_to'),
    windowSetBy: uuid('window_set_by'),
    windowSetAt: timestamp('window_set_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engDueIdx: index('compliance_instances_engagement_due_idx').on(t.engagementId, t.dueDate),
    // Mirrors UNIQUE (engagement_id, obligation_id, due_date, period_label) —
    // this is what makes regeneration idempotent.
    dedupeIdx: uniqueIndex('compliance_instances_dedupe_idx').on(
      t.engagementId,
      t.obligationId,
      t.dueDate,
      t.periodLabel,
    ),
  }),
);

/** Manual event-based filings (ROC / FEMA). Not generated — entered by hand. */
export const complianceEvents = pgTable(
  'compliance_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    // v3 set: director_appointment|share_allotment|fc_gpr|ben_2|chg_1|mgt_14|other
    eventType: text('event_type').notNull(),
    eventDate: date('event_date').notNull(),
    dueDate: date('due_date').notNull(),
    particular: text('particular').notNull(),
    status: text('status').notNull().default('upcoming'),
    notes: text('notes'),
    filedOn: date('filed_on'),
    filedNote: text('filed_note'),
    evidenceUrl: text('evidence_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engDueIdx: index('compliance_events_engagement_due_idx').on(t.engagementId, t.dueDate),
  }),
);

// ---------------------------------------------------------------------------
// NEW tables — the "localStorage last mile" from the replan.
// These held per-browser state in the original browser scaffold (vcfo.tasks, vcfo.requests, …).
// Moving them to Postgres is what makes work resumable on any machine and
// gives the compliance product a real server-side trail.
// ---------------------------------------------------------------------------
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').references(() => engagements.id, {
      onDelete: 'cascade',
    }),
    assignedTo: uuid('assigned_to').references(() => profiles.id),
    /** Who assigned the task; null for tasks a person made for themself or made before 0028 (S-217). */
    assignedBy: uuid('assigned_by').references(() => profiles.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    stepId: text('step_id'),
    deadline: timestamp('deadline', { withTimezone: true }),
    status: text('status').notNull().default('open'), // open|in-progress|done
    /**
     * The card's place in its Work board column (M6 G1); null keeps the default order.
     * Needs the migration in docs/ui-port/fixes/overnight-m6.md (not generated yet).
     */
    sortOrder: integer('sort_order'),
    /** When the task moved to done; cleared when it reopens (home trend lines). */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assigneeIdx: index('tasks_assignee_idx').on(t.assignedTo),
    engIdx: index('tasks_engagement_idx').on(t.engagementId),
  }),
);

export const documentRequests = pgTable('document_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  engagementId: uuid('engagement_id')
    .notNull()
    .references(() => engagements.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').references(() => profiles.id),
  title: text('title').notNull(),
  detail: text('detail'),
  status: text('status').notNull().default('pending'), // pending|fulfilled|cancelled
  /** When the request was fulfilled or cancelled; null while pending (home trend lines). */
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  email: text('email').notNull(),
  role: roleEnum('role').notNull().default('client'),
  engagementId: uuid('engagement_id').references(() => engagements.id, {
    onDelete: 'cascade',
  }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').references(() => engagements.id, {
      onDelete: 'cascade',
    }),
    actorId: uuid('actor_id').references(() => profiles.id),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('activity_engagement_idx').on(t.engagementId),
  }),
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('unread'), // unread|read
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Inbox hide only — history still lists the row. */
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId),
    userDismissedIdx: index('notifications_user_dismissed_idx').on(t.userId, t.dismissedAt),
  }),
);

/**
 * One row per outbound notification attempt, per channel, per recipient.
 *
 * Written for SENDS AND SKIPS alike — a `skipped` row with a `skip_reason` is
 * how staff can tell "the client has no number" apart from "we never tried".
 *
 * `event_type`, `channel` and `status` are text, NOT pgEnum, on purpose:
 * adding a seventh event must stay a single-file change in
 * `src/lib/notify/types.ts` plus a template SID, with no migration.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').references(() => engagements.id, {
      onDelete: 'cascade',
    }),
    recipientProfileId: uuid('recipient_profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    /** NotifyEvent — see src/lib/notify/types.ts. */
    eventType: text('event_type').notNull(),
    /** email | whatsapp */
    channel: text('channel').notNull(),
    /** The phone or email actually used (empty when skipped before resolution). */
    toAddress: text('to_address'),
    templateSid: text('template_sid'),
    providerMessageId: text('provider_message_id'),
    /** queued | sent | delivered | read | failed | skipped */
    status: text('status').notNull().default('queued'),
    /** no_phone | no_consent | opted_out | no_template | disabled */
    skipReason: text('skip_reason'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('notification_deliveries_engagement_idx').on(t.engagementId),
    recipientIdx: index('notification_deliveries_recipient_idx').on(t.recipientProfileId),
    // Status webhooks arrive keyed only by the provider id.
    providerIdx: index('notification_deliveries_provider_idx').on(t.providerMessageId),
  }),
);

/**
 * Linked Microsoft mailbox for Graph Mail.Send (lead → client).
 * Not an app login — Credentials remain the only Auth.js provider.
 */
export const outlookConnections = pgTable('outlook_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  msEmail: text('ms_email').notNull(),
  msUserId: text('ms_user_id'),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Add the signature below to every message sent from the app (K-40, G-23). */
  signatureEnabled: boolean('signature_enabled').notNull().default(false),
  /** The signature as plain text; line breaks are kept. */
  signatureText: text('signature_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Firm-wide news (Finance Act, circulars, process notes).
 * Distinct from `notifications` (per-user work alerts).
 * Read: every signed-in role. Write: super_admin / admin / manager.
 */
export const announcementSources = pgTable(
  'announcement_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    feedUrl: text('feed_url').notNull(),
    homepageUrl: text('homepage_url'),
    enabled: boolean('enabled').notNull().default(true),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdById: uuid('created_by_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    feedUrlUidx: uniqueIndex('announcement_sources_feed_url_uidx').on(t.feedUrl),
  }),
);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    origin: text('origin').notNull().default('manual'), // manual | feed
    kind: text('kind').notNull().default('general'),
    sourceId: uuid('source_id').references(() => announcementSources.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    sourceUrl: text('source_url'),
    /** In-app client portal page the announcement points to (`/app/client/...`); drives the detail "Open" button (C-741). */
    linkPath: text('link_path'),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    authorRole: text('author_role'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    publishedIdx: index('announcements_published_idx').on(t.publishedAt),
    sourceExternalUidx: uniqueIndex('announcements_source_external_uidx').on(
      t.sourceId,
      t.externalId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Project change requests — manager asks, admin approves
// ---------------------------------------------------------------------------
// Managers edit low-risk project fields directly on their own projects. The
// high-risk ones (delete, swap the client, reassign the project manager) land
// here instead: the manager submits the proposed payload, an admin sees the
// before/after diff, and approving APPLIES the change. The payload is what gets
// executed, so an approval can never write values the admin did not see.

export const engagementChangeRequests = pgTable(
  'engagement_change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    /** delete_project | change_client | change_manager */
    kind: text('kind').notNull(),
    /** pending | approved | rejected | cancelled */
    status: text('status').notNull().default('pending'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    requestedByName: text('requested_by_name'),
    reason: text('reason'),
    /** The change to execute on approval — shape depends on `kind`. */
    payload: jsonb('payload').notNull().default({}),
    /** Human-readable before/after, frozen at request time for the admin diff. */
    preview: jsonb('preview').notNull().default({}),
    decidedBy: uuid('decided_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    decidedByName: text('decided_by_name'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('engagement_change_requests_engagement_idx').on(t.engagementId),
    statusIdx: index('engagement_change_requests_status_idx').on(t.status),
    requesterIdx: index('engagement_change_requests_requester_idx').on(t.requestedBy),
  }),
);

// ---------------------------------------------------------------------------
// Ask VCFO — in-app assistant (ASK-VCFO-CONTEXT.md §4).
// Access is repository-scoped like everything else: conversations and library
// items are private to their profile; knowledge sources are admin / super only.
// ---------------------------------------------------------------------------

/** Postgres full-text vector; drizzle has no built-in column type for it. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const askConversations = pgTable(
  'ask_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Role at creation — a later role change does not rewrite history. */
    role: text('role').notNull(),
    shell: text('shell').notNull(), // client|admin|super
    engagementId: uuid('engagement_id').references(() => engagements.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index('ask_conversations_profile_idx').on(t.profileId, t.lastMessageAt),
  }),
);

export const askMessages = pgTable(
  'ask_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => askConversations.id, { onDelete: 'cascade' }),
    sender: text('sender').notNull(), // user|assistant
    text: text('text').notNull(),
    answer: jsonb('answer'),
    origin: text('origin'), // reviewed|generated|deterministic|refusal
    guard: jsonb('guard'),
    retrievedChunkIds: uuid('retrieved_chunk_ids').array().notNull().default([]),
    /** Tool names + arguments only — never the rows a tool returned. */
    toolCalls: jsonb('tool_calls').notNull().default([]),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('ask_messages_conversation_idx').on(t.conversationId, t.createdAt),
  }),
);

export const clientLibraryItems = pgTable(
  'client_library_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    topicSlug: text('topic_slug'),
    messageId: uuid('message_id').references(() => askMessages.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: text('category').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    sourceVersion: integer('source_version'),
    /** Column exists for the later team-sharing toggle; v1 never sets it. */
    sharedWithTeam: boolean('shared_with_team').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index('client_library_items_profile_idx').on(t.profileId, t.createdAt),
    /** Saving the same topic twice updates the existing item. */
    profileTopicUq: uniqueIndex('client_library_items_profile_topic_uq')
      .on(t.profileId, t.engagementId, t.topicSlug)
      .where(sql`${t.topicSlug} is not null`),
  }),
);

export const askDocuments = pgTable('ask_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(), // govt|firm_pdf|firm_note
  sourceUrl: text('source_url'),
  s3Key: text('s3_key'),
  effectiveFrom: date('effective_from'),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  ownerProfileId: uuid('owner_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('processing'), // processing|ready|failed|archived
  audience: text('audience').notNull().default('staff'), // client|staff|both
  /** Last ingestion failure, shown on the sources page with a retry. */
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * No `embedding` column in v1: local Postgres has no pgvector (Phase 0), and
 * retrieval is full-text only (OD2). Adding a nullable vector later is additive.
 */
export const askChunks = pgTable(
  'ask_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => askDocuments.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    contextPrefix: text('context_prefix'),
    tsv: tsvector('tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(context_prefix, '') || ' ' || text)`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentOrdinalUq: uniqueIndex('ask_chunks_document_ordinal_uq').on(t.documentId, t.ordinal),
    tsvIdx: index('ask_chunks_tsv_idx').using('gin', t.tsv),
  }),
);

/**
 * Ask VCFO C1 (daily nudge): one row per client profile. Created in Phase 9;
 * only the owner reads or writes it.
 */
export const askClientPrefs = pgTable('ask_client_prefs', {
  profileId: uuid('profile_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  lastNudgeAt: timestamp('last_nudge_at', { withTimezone: true }),
  dismissedUntil: timestamp('dismissed_until', { withTimezone: true }),
});

/**
 * CLIENT PORTAL PREFERENCES (client portal v7). One row per client profile,
 * read and written only by its owner (`ctx.userId`).
 *
 * - `viewState`: the Before / After incorporation pill. `auto` follows the
 *   real COI state; `before` / `after` keep the other layout on screen.
 * - `theme`: light, dark ("True black") or follow the system.
 * - `navOpen`: which sidebar groups are expanded.
 * - `introSeenAt`: the entry animation plays once per client.
 * - `docGrouping`: Documents grouping ("step" or "category"), remembered.
 * - `botNoteSeenAt`: first-visit Ask VCFO note, once per client.
 */
export const clientPortalPrefs = pgTable('client_portal_prefs', {
  profileId: uuid('profile_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  viewState: text('view_state').notNull().default('auto'),
  theme: text('theme').notNull().default('light'),
  navOpen: jsonb('nav_open').$type<Record<string, boolean>>().notNull().default({}),
  introSeenAt: timestamp('intro_seen_at', { withTimezone: true }),
  docGrouping: text('doc_grouping').notNull().default('step'),
  botNoteSeenAt: timestamp('bot_note_seen_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ANNOUNCEMENT READS (client portal v7): which announcements a person has
 * opened. Announcements are firm-wide; the read mark is per profile and only
 * ever written for `ctx.userId`.
 */
export const announcementReads = pgTable(
  'announcement_reads',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.profileId, t.announcementId] }),
  }),
);
/**
 * ASK VCFO ANSWER FEEDBACK (client portal v7, 👍/👎 under chat answers — DECISIONS:
 * keep). Covers model answers (`message_id`) and the portal's quick answers
 * (no message row: the question + answer text are kept). Owner-only.
 */
export const askAnswerFeedback = pgTable(
  'ask_answer_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => askMessages.id, { onDelete: 'set null' }),
    question: text('question').notNull().default(''),
    answer: text('answer').notNull().default(''),
    vote: text('vote').notNull(), // up | down
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index('ask_answer_feedback_profile_idx').on(t.profileId, t.createdAt),
  }),
);

export * from './schema-portal-home';
export * from './schema-portal-incorporation';
export * from './schema-portal-compliances';
export * from './schema-portal-documents';
export * from './schema-portal-team';
export * from './schema-portal-credentials';
export * from './schema-firm';
export * from './schema-work';
export * from './schema-compliance-tasks';

export * from './schema-labour-registers';
