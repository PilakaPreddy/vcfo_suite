/**
 * LABOUR REGISTERS (2 Nov 2026). Re-exported from `src/db/schema.ts` so drizzle-kit and the
 * repositories see one schema. Additive only: no existing table changes.
 *
 * Circular import note, as in `schema-compliance-tasks.ts`: this file is evaluated BEFORE
 * `schema.ts`'s body, so `profiles` and `engagements` may only be touched lazily, inside a
 * `.references(() => base.x.id)` callback, never at module top level.
 *
 * Tables:
 *  - labour_register_checklist        — a client's standing payroll checklist: which pay heads
 *                                       and activities their payroll actually runs.
 *  - labour_register_batches          — one client, one state, one period. The unit of work.
 *  - labour_register_checklist_ticks  — the monthly tick-off against that batch.
 *  - labour_register_uploads          — the four input files, in S3, with their headers.
 *  - labour_register_column_maps      — the mapping remembered per client and slot, so the
 *                                       second month is a confirmation rather than a chore.
 *  - labour_register_documents        — one generated register, content-addressed, with its
 *                                       evidence manifest and its attestation.
 *
 * Two shapes here exist because of the research recorded in
 * `docs/context/notes/labour-registers.md`, and changing them has legal consequences:
 *
 *  - `labour_register_documents.cache_key` is the content address of a DRAFT. It carries the
 *    template version, the generator revision, the locale, the time zone and the assumption
 *    set, so a generator fix changes the address and the stale object simply stops being
 *    asked for. Nothing is invalidated by hand.
 *  - Once `attested_at` is set the row is frozen. A correction is a NEW row whose
 *    `supersedes_id` points at the old one; the old file is never replaced and never deleted.
 *    Rule 72 of the OSH (Central) Rules forbids destroying a register after its retention
 *    period unless it has been properly transferred, so there is no delete path at all.
 */
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';

/**
 * A client's standing payroll checklist. One row per head the firm has considered for this
 * client, whether or not it is on, so turning a head off is a recorded decision rather than an
 * absent row.
 */
export const labourRegisterChecklist = pgTable(
  'labour_register_checklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** A head id from `src/data/labour-registers/checklist-heads.ts`. */
    headId: text('head_id').notNull(),
    /** Whether this client's payroll runs it. Off means its columns print nil and are not asked for. */
    active: boolean('active').notNull().default(false),
    /** Who supplies the figure: client-hr | client-finance | sbc. */
    owner: text('owner').notNull().default('client-hr'),
    /** Whether it applies in the full-and-final cycle as well as the regular one. */
    inFinalSettlement: boolean('in_final_settlement').notNull().default(true),
    note: text('note').notNull().default(''),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneHeadPerEngagement: uniqueIndex('labour_register_checklist_head_idx').on(t.engagementId, t.headId),
  }),
);

/** One client, one state, one period: the unit everything else hangs off. */
export const labourRegisterBatches = pgTable(
  'labour_register_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** ISO 3166-2:IN subdivision code without the prefix: TG, KA, KL, HR. */
    stateCode: text('state_code').notNull(),
    /** First and last day covered, so a quarter and a month are the same shape. */
    periodFrom: text('period_from').notNull(),
    periodTo: text('period_to').notNull(),
    /**
     * open — inputs being gathered · mapping — columns being reconciled · ready — generatable ·
     * generated — documents exist · attested — signed off and frozen · superseded — replaced.
     */
    status: text('status').notNull().default('open'),
    /**
     * The monthly close. Marking the inputs ready locks the period: the uploads and the mapping
     * stop accepting changes and the registers are generated from exactly what was locked.
     * Nothing is generated before this, so a half-gathered month cannot produce a register that
     * looks finished.
     *
     * Reopening is the only way back, and it is recorded rather than silent, because a register
     * that changed after it was produced is a question somebody will eventually ask.
     */
    markedReadyBy: uuid('marked_ready_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    markedReadyAt: timestamp('marked_ready_at', { withTimezone: true }),
    /**
     * The preparer's own confirmation that the employee, attendance and wage data is accurate
     * for the period. It is a statement by a person, so it is stored as one and never inferred.
     */
    accuracyConfirmed: boolean('accuracy_confirmed').notNull().default(false),
    /** The readiness summary as it stood at the moment of locking: counts, and who was short. */
    readinessSnapshot: jsonb('readiness_snapshot'),
    reopenedBy: uuid('reopened_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    /** Why the period was reopened. Required: an unexplained reopen is the thing to avoid. */
    reopenReason: text('reopen_reason').notNull().default(''),
    /** How many times this period has been reopened, so the bar can say "generated · 2nd time". */
    reopenCount: integer('reopen_count').notNull().default(0),
    /**
     * How attendance was arrived at, and anything else that changes the generated bytes. Keyed
     * into every document's cache key, so an assumed month is a different document from an
     * uploaded one.
     */
    assumptions: jsonb('assumptions').notNull().default({}),
    /** The locale and time zone the documents were rendered in, kept for reproducibility. */
    locale: text('locale').notNull().default('en-IN'),
    timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onePerPeriod: uniqueIndex('labour_register_batch_period_idx').on(t.engagementId, t.stateCode, t.periodFrom, t.periodTo),
    byEngagement: index('labour_register_batch_engagement_idx').on(t.engagementId, t.periodFrom),
  }),
);

/** The monthly tick-off of the checklist against one batch. */
export const labourRegisterChecklistTicks = pgTable(
  'labour_register_checklist_ticks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => labourRegisterBatches.id, { onDelete: 'cascade' }),
    headId: text('head_id').notNull(),
    /** pending — expected, not yet in · received — figure is in · off — not applicable this period. */
    state: text('state').notNull().default('pending'),
    note: text('note').notNull().default(''),
    updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneTickPerHead: uniqueIndex('labour_register_tick_head_idx').on(t.batchId, t.headId),
  }),
);

/** One uploaded input file. */
export const labourRegisterUploads = pgTable(
  'labour_register_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => labourRegisterBatches.id, { onDelete: 'cascade' }),
    /** paysheet | attendance | overtime | employees. */
    slot: text('slot').notNull(),
    fileName: text('file_name').notNull(),
    /** The S3 key. The bytes never pass through the database. */
    objectKey: text('object_key').notNull(),
    /** Digest of the uploaded file, so a re-upload of the same bytes is recognised as such. */
    sha256: text('sha256').notNull(),
    /** The sheet within the workbook the headers were read from. */
    sheetName: text('sheet_name').notNull().default(''),
    /** Which row the headings were on. Real exports use row 2, 3 or 4, so it is detected and stored. */
    headerRow: integer('header_row').notNull().default(1),
    /** The headings as uploaded, in sheet order. Kept so next month's shape diff has something to compare. */
    headers: jsonb('headers').notNull().default([]),
    rowCount: integer('row_count').notNull().default(0),
    /** The detected per-day attendance block, when there is one. */
    gridDetection: jsonb('grid_detection'),
    uploadedBy: uuid('uploaded_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneFilePerSlot: uniqueIndex('labour_register_upload_slot_idx').on(t.batchId, t.slot),
  }),
);

/**
 * The mapping remembered for a client and a slot. Scoped to the engagement, never to a browser:
 * the research found Flatfile's Portal 2.0 kept remembered mappings in `localStorage`, which is
 * the wrong model for a firm where several project leads touch one client.
 */
export const labourRegisterColumnMaps = pgTable(
  'labour_register_column_maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    /** Canonical dataset field to normalised heading. */
    mapping: jsonb('mapping').notNull().default({}),
    /** Per field, the client's own values to ours: their `PVL` to our `PL`. */
    valueMaps: jsonb('value_maps').notNull().default({}),
    /** The headings the mapping was last confirmed against, for the shape diff. */
    lastHeaders: jsonb('last_headers').notNull().default([]),
    confirmedBy: uuid('confirmed_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneMapPerSlot: uniqueIndex('labour_register_map_slot_idx').on(t.engagementId, t.slot),
  }),
);

/** One generated register. */
export const labourRegisterDocuments = pgTable(
  'labour_register_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => labourRegisterBatches.id, { onDelete: 'cascade' }),
    /** The catalogue id of the form, never its number: a form number is not an identity. */
    formId: text('form_id').notNull(),
    /**
     * The content address of a draft, from `draftKey()`. A request whose key matches an
     * existing row is a download, not a build. Not unique on its own: an attested document
     * keeps its row when the key moves on.
     */
    cacheKey: text('cache_key').notNull(),
    objectKey: text('object_key').notNull(),
    /** Digest of the produced file itself. Named separately because the evidence certificate needs it. */
    artifactSha256: text('artifact_sha256').notNull(),
    byteLength: integer('byte_length').notNull().default(0),
    /** xlsx | pdf. The print bundle is a first-class output, not a convenience. */
    format: text('format').notNull().default('xlsx'),
    templateVersion: text('template_version').notNull().default('v1'),
    /** The generator revision that produced it, so a stale object is identifiable after the fact. */
    generatorRevision: text('generator_revision').notNull().default(''),
    /** Who produced it, from what, under which mapping and assumptions. */
    manifest: jsonb('manifest').notNull().default({}),
    /** draft | attested | superseded. */
    status: text('status').notNull().default('draft'),
    generatedBy: uuid('generated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set once a person signs off. After this the row is frozen and the file is never replaced. */
    attestedBy: uuid('attested_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    attestedAt: timestamp('attested_at', { withTimezone: true }),
    /** printed-wet-signature | dsc | aadhaar-esign. */
    attestationMethod: text('attestation_method'),
    /** The attested document this one replaces, when a correction had to be issued. */
    supersedesId: uuid('supersedes_id'),
    /** How many times the stored file has been served, so the saving is observable. */
    downloadCount: integer('download_count').notNull().default(0),
    /** The year the retention period runs to. Drives a review prompt; nothing is ever deleted. */
    retainUntil: text('retain_until').notNull().default(''),
  },
  (t) => ({
    byKey: index('labour_register_document_key_idx').on(t.cacheKey),
    oneDraftPerForm: uniqueIndex('labour_register_document_form_idx').on(t.batchId, t.formId, t.cacheKey, t.format),
  }),
);
