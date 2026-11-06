CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "ask_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"run_id" uuid,
	"engagement_id" uuid,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"s3_key" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"doc_type" text,
	"sensitive" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_changeset_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"changeset_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"action" text NOT NULL,
	"target" jsonb NOT NULL,
	"label" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"display_old" text DEFAULT '' NOT NULL,
	"display_new" text DEFAULT '' NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"source" jsonb,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"held_reason" text,
	"error" text,
	"undo_data" jsonb,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ask_changesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"run_id" uuid,
	"engagement_id" uuid,
	"title" text NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"content_hash" text NOT NULL,
	"recipients" jsonb,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_index_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"card_text" text NOT NULL,
	"href" text,
	"engagement_id" uuid,
	"client_id" text,
	"owner_profile_id" uuid,
	"audience" text DEFAULT 'staff' NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || card_text)) STORED,
	"embedding" vector(512),
	"embedding_model" text,
	"content_hash" text NOT NULL,
	"effective_from" date,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"profile_id" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_by_id" uuid,
	"reviewed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_memories_key_uq" UNIQUE NULLS NOT DISTINCT("kind","profile_id","key")
);
--> statement-breakpoint
CREATE TABLE "ask_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"tier" text,
	"status" text DEFAULT 'running' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"changeset_id" uuid,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"engagement_id" uuid,
	"kind" text NOT NULL,
	"workflow" text,
	"trigger" text DEFAULT 'chat' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"goal" text NOT NULL,
	"state" jsonb,
	"model" text,
	"turns" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"budget_tokens" integer NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_saved_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_key" text NOT NULL,
	"audience" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"depth" text DEFAULT 'normal' NOT NULL,
	"knowledge_version" text NOT NULL,
	"answer" jsonb NOT NULL,
	"source_message_id" uuid,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_usage_daily" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"model" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ask_usage_daily_day_path_model_pk" PRIMARY KEY("day","path","model")
);
--> statement-breakpoint
CREATE TABLE "reg_calendar_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" uuid NOT NULL,
	"obligation_id" text NOT NULL,
	"period" text NOT NULL,
	"old_due_date" date,
	"new_due_date" date NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"affected_engagement_ids" uuid[] DEFAULT '{}' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_noise_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_update_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" uuid NOT NULL,
	"source_id" uuid,
	"external_key" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"source_id" uuid,
	"intake" text NOT NULL,
	"intake_by_id" uuid,
	"s3_key" text,
	"source_text" text,
	"content_hash" text,
	"published_on" date,
	"status" text DEFAULT 'queued' NOT NULL,
	"area" text,
	"act" text,
	"change_type" text,
	"importance" text,
	"effective_date" date,
	"old_due_date" date,
	"new_due_date" date,
	"affects" text,
	"summary" text,
	"quote" text,
	"verify_problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes_update_id" uuid,
	"announcement_id" uuid,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"published_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "source_type" text DEFAULT 'feed' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "adapter" text;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "audience" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "check_every_minutes" integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "next_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_sources" ADD COLUMN "health" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "audience" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "unreviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD COLUMN "embedding" vector(512);--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD COLUMN "effective_from" date;--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD COLUMN "effective_to" date;--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD COLUMN "supersedes_chunk_id" uuid;--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ask_documents" ADD COLUMN "effective_to" date;--> statement-breakpoint
ALTER TABLE "ask_documents" ADD COLUMN "supersedes_document_id" uuid;--> statement-breakpoint
ALTER TABLE "ask_documents" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ask_documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ask_messages" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "ask_messages" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD CONSTRAINT "ask_attachments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD CONSTRAINT "ask_attachments_conversation_id_ask_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ask_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD CONSTRAINT "ask_attachments_message_id_ask_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ask_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD CONSTRAINT "ask_attachments_run_id_ask_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ask_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD CONSTRAINT "ask_attachments_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changeset_rows" ADD CONSTRAINT "ask_changeset_rows_changeset_id_ask_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."ask_changesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changesets" ADD CONSTRAINT "ask_changesets_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changesets" ADD CONSTRAINT "ask_changesets_conversation_id_ask_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ask_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changesets" ADD CONSTRAINT "ask_changesets_message_id_ask_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ask_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changesets" ADD CONSTRAINT "ask_changesets_run_id_ask_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ask_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changesets" ADD CONSTRAINT "ask_changesets_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_changesets" ADD CONSTRAINT "ask_changesets_decided_by_id_profiles_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_index_items" ADD CONSTRAINT "ask_index_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_index_items" ADD CONSTRAINT "ask_index_items_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_memories" ADD CONSTRAINT "ask_memories_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_memories" ADD CONSTRAINT "ask_memories_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_memories" ADD CONSTRAINT "ask_memories_reviewed_by_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_run_steps" ADD CONSTRAINT "ask_run_steps_run_id_ask_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ask_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_run_steps" ADD CONSTRAINT "ask_run_steps_changeset_id_ask_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."ask_changesets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_runs" ADD CONSTRAINT "ask_runs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_runs" ADD CONSTRAINT "ask_runs_conversation_id_ask_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ask_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_runs" ADD CONSTRAINT "ask_runs_message_id_ask_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ask_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_runs" ADD CONSTRAINT "ask_runs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_saved_answers" ADD CONSTRAINT "ask_saved_answers_source_message_id_ask_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."ask_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_calendar_proposals" ADD CONSTRAINT "reg_calendar_proposals_update_id_reg_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."reg_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_calendar_proposals" ADD CONSTRAINT "reg_calendar_proposals_obligation_id_compliance_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."compliance_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_calendar_proposals" ADD CONSTRAINT "reg_calendar_proposals_decided_by_id_profiles_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_noise_log" ADD CONSTRAINT "reg_noise_log_source_id_announcement_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."announcement_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_update_links" ADD CONSTRAINT "reg_update_links_update_id_reg_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."reg_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_update_links" ADD CONSTRAINT "reg_update_links_source_id_announcement_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."announcement_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_updates" ADD CONSTRAINT "reg_updates_source_id_announcement_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."announcement_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_updates" ADD CONSTRAINT "reg_updates_intake_by_id_profiles_id_fk" FOREIGN KEY ("intake_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_updates" ADD CONSTRAINT "reg_updates_supersedes_update_id_reg_updates_id_fk" FOREIGN KEY ("supersedes_update_id") REFERENCES "public"."reg_updates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_updates" ADD CONSTRAINT "reg_updates_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_updates" ADD CONSTRAINT "reg_updates_reviewed_by_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_attachments_conversation_idx" ON "ask_attachments" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_attachments_profile_idx" ON "ask_attachments" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_attachments_engagement_idx" ON "ask_attachments" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ask_attachments_run_idx" ON "ask_attachments" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ask_attachments_message_idx" ON "ask_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_changeset_rows_ordinal_uq" ON "ask_changeset_rows" USING btree ("changeset_id","ordinal");--> statement-breakpoint
CREATE INDEX "ask_changesets_profile_idx" ON "ask_changesets" USING btree ("profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ask_changesets_engagement_idx" ON "ask_changesets" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "ask_changesets_run_idx" ON "ask_changesets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ask_changesets_conversation_idx" ON "ask_changesets" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ask_changesets_message_idx" ON "ask_changesets" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ask_changesets_decided_by_idx" ON "ask_changesets" USING btree ("decided_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_index_items_source_uq" ON "ask_index_items" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "ask_index_items_tsv_idx" ON "ask_index_items" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "ask_index_items_engagement_idx" ON "ask_index_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ask_index_items_owner_idx" ON "ask_index_items" USING btree ("owner_profile_id");--> statement-breakpoint
CREATE INDEX "ask_memories_created_by_idx" ON "ask_memories" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "ask_memories_reviewed_by_idx" ON "ask_memories" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_run_steps_ordinal_uq" ON "ask_run_steps" USING btree ("run_id","ordinal");--> statement-breakpoint
CREATE INDEX "ask_run_steps_changeset_idx" ON "ask_run_steps" USING btree ("changeset_id");--> statement-breakpoint
CREATE INDEX "ask_runs_profile_idx" ON "ask_runs" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_runs_status_idx" ON "ask_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ask_runs_conversation_idx" ON "ask_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ask_runs_engagement_idx" ON "ask_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ask_runs_message_idx" ON "ask_runs" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_saved_answers_key_uq" ON "ask_saved_answers" USING btree ("question_key","audience","language","depth","knowledge_version");--> statement-breakpoint
CREATE UNIQUE INDEX "reg_calendar_proposals_uq" ON "reg_calendar_proposals" USING btree ("update_id","obligation_id","period");--> statement-breakpoint
CREATE INDEX "reg_calendar_proposals_status_idx" ON "reg_calendar_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reg_calendar_proposals_obligation_idx" ON "reg_calendar_proposals" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "reg_calendar_proposals_decided_by_idx" ON "reg_calendar_proposals" USING btree ("decided_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reg_noise_log_source_key_uq" ON "reg_noise_log" USING btree ("source_id","external_key");--> statement-breakpoint
CREATE INDEX "reg_noise_log_created_idx" ON "reg_noise_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reg_update_links_source_key_uq" ON "reg_update_links" USING btree ("source_id","external_key");--> statement-breakpoint
CREATE INDEX "reg_update_links_update_idx" ON "reg_update_links" USING btree ("update_id");--> statement-breakpoint
CREATE INDEX "reg_updates_status_idx" ON "reg_updates" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reg_updates_published_idx" ON "reg_updates" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reg_updates_content_hash_uq" ON "reg_updates" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "reg_updates_source_idx" ON "reg_updates" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "reg_updates_area_idx" ON "reg_updates" USING btree ("area","effective_date");--> statement-breakpoint
CREATE INDEX "reg_updates_supersedes_idx" ON "reg_updates" USING btree ("supersedes_update_id");--> statement-breakpoint
CREATE INDEX "reg_updates_announcement_idx" ON "reg_updates" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "reg_updates_intake_by_idx" ON "reg_updates" USING btree ("intake_by_id");--> statement-breakpoint
CREATE INDEX "reg_updates_reviewed_by_idx" ON "reg_updates" USING btree ("reviewed_by_id");--> statement-breakpoint
ALTER TABLE "ask_chunks" ADD CONSTRAINT "ask_chunks_supersedes_chunk_id_ask_chunks_id_fk" FOREIGN KEY ("supersedes_chunk_id") REFERENCES "public"."ask_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_documents" ADD CONSTRAINT "ask_documents_supersedes_document_id_ask_documents_id_fk" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."ask_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_sources_next_check_idx" ON "announcement_sources" USING btree ("enabled","next_check_at");--> statement-breakpoint
CREATE INDEX "ask_messages_path_idx" ON "ask_messages" USING btree ("path","created_at");