/**
 * Ask VCFO: the knowledge index, saved answers, attachments, the Do engine's changesets and runs,
 * and the usage roll-up. Re-exported from src/db/schema.ts.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `base.*` may only be
 * touched lazily, inside `.references(() => base.profiles.id)` callbacks.
 *
 * Tables:
 *  - ask_index_items     searchable record cards. Identity numbers are never stored here.
 *  - ask_saved_answers   document answers reused on an exact match. Never personal or live data.
 *  - ask_attachments     files and pasted sheets given to the chat, stored through S3.
 *  - ask_changesets      a proposal awaiting a person's approval.
 *  - ask_changeset_rows  one proposed value per row.
 *  - ask_runs            one durable Do run in Inngest; it can wait for approval and resume.
 *  - ask_run_steps       the trace of a run, with sensitive values masked.
 *  - ask_memories        preferences, firm playbooks and corrected mappings; never a permission.
 *  - ask_usage_daily     tokens per day, path and model across Answer, Do and Watch.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { AnswerEnvelope } from '@/data/ask/schema';
import type {
  ChangesetRecipient,
  JsonValue,
  RowCheck,
  RowSource,
} from '@/lib/ask/changeset/types';
import * as base from './schema';
import { EMBEDDING_DIMENSIONS, tsvector } from './schema-types';

export const askIndexItems = pgTable(
  'ask_index_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** What the card was built from, for example `task`, `request`, `note` or `reg_update`. */
    sourceKind: text('source_kind').notNull(),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    cardText: text('card_text').notNull(),
    href: text('href'),
    /** Scope: search filters on these first. A null engagement with no owner is firm-wide. */
    engagementId: uuid('engagement_id').references(() => base.engagements.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    /** Set for a card only one person may ever see. */
    ownerProfileId: uuid('owner_profile_id').references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** client | staff | both: internal notes stay `staff` and never reach a client. */
    audience: text('audience').notNull().default('staff'),
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('english', title || ' ' || card_text)`),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingModel: text('embedding_model'),
    /** Unchanged text keeps its vector, so a refresh costs nothing. */
    contentHash: text('content_hash').notNull(),
    effectiveFrom: date('effective_from'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    sourceUq: uniqueIndex('ask_index_items_source_uq').on(t.sourceKind, t.sourceId),
    tsvIdx: index('ask_index_items_tsv_idx').using('gin', t.tsv),
    engagementIdx: index('ask_index_items_engagement_idx').on(t.engagementId),
    ownerIdx: index('ask_index_items_owner_idx').on(t.ownerProfileId),
  }),
);

export const askSavedAnswers = pgTable(
  'ask_saved_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Normalised wording. Matching is exact: "GSTR-1 due date" and "GSTR-3B due date" must not meet. */
    questionKey: text('question_key').notNull(),
    audience: text('audience').notNull(), // client|staff
    language: text('language').notNull().default('en'),
    depth: text('depth').notNull().default('normal'),
    knowledgeVersion: text('knowledge_version').notNull(),
    answer: jsonb('answer').$type<AnswerEnvelope>().notNull(),
    sourceMessageId: uuid('source_message_id').references(() => base.askMessages.id, { onDelete: 'set null' }),
    hits: integer('hits').notNull().default(0),
    lastHitAt: timestamp('last_hit_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUq: uniqueIndex('ask_saved_answers_key_uq').on(t.questionKey, t.audience, t.language, t.depth, t.knowledgeVersion),
  }),
);

export const askRuns = pgTable(
  'ask_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Every run acts as this person. */
    profileId: uuid('profile_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => base.askConversations.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => base.askMessages.id, { onDelete: 'set null' }),
    /** The one client this run is locked to. */
    engagementId: uuid('engagement_id').references(() => base.engagements.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // fixed_workflow|agent
    /** Name of the fixed workflow, for example `data_router`. */
    workflow: text('workflow'),
    trigger: text('trigger').notNull().default('chat'), // chat|schedule
    status: text('status').notNull().default('queued'), // queued|running|waiting_reply|waiting_approval|done|failed|cancelled|over_budget
    /** The request with identity numbers masked. */
    goal: text('goal').notNull(),
    /** What a loop needs to resume after an approval. Masked like the rest of the trace. */
    state: jsonb('state').$type<JsonValue>(),
    model: text('model'),
    turns: integer('turns').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    budgetTokens: integer('budget_tokens').notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    profileIdx: index('ask_runs_profile_idx').on(t.profileId, t.createdAt),
    statusIdx: index('ask_runs_status_idx').on(t.status, t.createdAt),
    conversationIdx: index('ask_runs_conversation_idx').on(t.conversationId),
    /** A reopened chat looks up its active drop by conversation and status. */
    conversationStatusIdx: index('ask_runs_conversation_status_idx').on(t.conversationId, t.status),
    engagementIdx: index('ask_runs_engagement_idx').on(t.engagementId),
    messageIdx: index('ask_runs_message_idx').on(t.messageId),
  }),
);

export const askChangesets = pgTable(
  'ask_changesets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Who the proposal was prepared for. */
    profileId: uuid('profile_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => base.askConversations.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => base.askMessages.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => askRuns.id, { onDelete: 'set null' }),
    engagementId: uuid('engagement_id').references(() => base.engagements.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    tier: text('tier').notNull(), // T2|T3
    status: text('status').notNull().default('proposed'), // ChangesetStatus
    /** SHA-256 of the rows as shown. An approval that does not match it is refused. */
    contentHash: text('content_hash').notNull(),
    recipients: jsonb('recipients').$type<ChangesetRecipient[]>(),
    decidedById: uuid('decided_by_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index('ask_changesets_profile_idx').on(t.profileId, t.status, t.createdAt),
    engagementIdx: index('ask_changesets_engagement_idx').on(t.engagementId, t.status),
    runIdx: index('ask_changesets_run_idx').on(t.runId),
    conversationIdx: index('ask_changesets_conversation_idx').on(t.conversationId),
    messageIdx: index('ask_changesets_message_idx').on(t.messageId),
    decidedByIdx: index('ask_changesets_decided_by_idx').on(t.decidedById),
  }),
);

export const askChangesetRows = pgTable(
  'ask_changeset_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    changesetId: uuid('changeset_id')
      .notNull()
      .references(() => askChangesets.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    action: text('action').notNull(),
    target: jsonb('target').$type<Record<string, JsonValue>>().notNull(),
    label: text('label').notNull(),
    oldValue: jsonb('old_value').$type<JsonValue>(),
    newValue: jsonb('new_value').$type<JsonValue>(),
    /** What chat, logs and prompts may show. A sensitive value is masked here. */
    displayOld: text('display_old').notNull().default(''),
    displayNew: text('display_new').notNull().default(''),
    sensitive: boolean('sensitive').notNull().default(false),
    source: jsonb('source').$type<RowSource>(),
    checks: jsonb('checks').$type<RowCheck[]>().notNull().default([]),
    status: text('status').notNull().default('proposed'), // ChangesetRowStatus
    heldReason: text('held_reason'),
    error: text('error'),
    /** What `undo` needs to put the old value back. */
    undoData: jsonb('undo_data').$type<JsonValue>(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
  },
  (t) => ({
    ordinalUq: uniqueIndex('ask_changeset_rows_ordinal_uq').on(t.changesetId, t.ordinal),
  }),
);

export const askRunSteps = pgTable(
  'ask_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => askRuns.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    kind: text('kind').notNull(), // model|tool|check|approval
    name: text('name').notNull(),
    /** A label the person sees in the progress line. */
    label: text('label'),
    tier: text('tier'),
    status: text('status').notNull().default('running'), // running|done|failed|waiting
    /** Inputs and results with identity numbers masked, so a run can be replayed and audited. */
    input: jsonb('input').$type<JsonValue>(),
    output: jsonb('output').$type<JsonValue>(),
    changesetId: uuid('changeset_id').references(() => askChangesets.id, { onDelete: 'set null' }),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ordinalUq: uniqueIndex('ask_run_steps_ordinal_uq').on(t.runId, t.ordinal),
    changesetIdx: index('ask_run_steps_changeset_idx').on(t.changesetId),
  }),
);

export const askAttachments = pgTable(
  'ask_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => base.askConversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => base.askMessages.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references((): AnyPgColumn => askRuns.id, { onDelete: 'set null' }),
    engagementId: uuid('engagement_id').references(() => base.engagements.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // file|paste
    fileName: text('file_name').notNull(),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    s3Key: text('s3_key'),
    status: text('status').notNull().default('uploaded'), // uploaded|read|failed
    /** What the file was recognised as, for example `pan_card`. */
    docType: text('doc_type'),
    /** True for identity documents, which only `ASK_ID_DOC_READING` allows to be read. */
    sensitive: boolean('sensitive').notNull().default(false),
    error: text('error'),
    /** The folder path the file was dropped with, or its path inside a ZIP. Only a hint for placing it. */
    relativePath: text('relative_path'),
    /** The ZIP this file was unpacked from. Deleting the ZIP's row deletes its entries. */
    parentId: uuid('parent_id').references((): AnyPgColumn => askAttachments.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdx: index('ask_attachments_parent_idx').on(t.parentId),
    conversationIdx: index('ask_attachments_conversation_idx').on(t.conversationId, t.createdAt),
    profileIdx: index('ask_attachments_profile_idx').on(t.profileId, t.createdAt),
    engagementIdx: index('ask_attachments_engagement_idx').on(t.engagementId),
    runIdx: index('ask_attachments_run_idx').on(t.runId),
    messageIdx: index('ask_attachments_message_idx').on(t.messageId),
  }),
);

export const askMemories = pgTable(
  'ask_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(), // preference|playbook|synonym
    /** Null for a firm-wide row, the person's id for their own preference. */
    profileId: uuid('profile_id').references(() => base.profiles.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').$type<JsonValue>().notNull(),
    /** A corrected mapping stays `proposed` until staff review it. */
    status: text('status').notNull().default('approved'), // proposed|approved|rejected
    createdById: uuid('created_by_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    reviewedById: uuid('reviewed_by_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    keyUq: unique('ask_memories_key_uq').on(t.kind, t.profileId, t.key).nullsNotDistinct(),
    createdByIdx: index('ask_memories_created_by_idx').on(t.createdById),
    reviewedByIdx: index('ask_memories_reviewed_by_idx').on(t.reviewedById),
  }),
);

export const askUsageDaily = pgTable(
  'ask_usage_daily',
  {
    day: date('day').notNull(),
    path: text('path').notNull(),
    model: text('model').notNull(),
    calls: integer('calls').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.day, t.path, t.model] }),
  }),
);
