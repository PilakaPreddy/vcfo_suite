CREATE TABLE "labour_register_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"state_code" text NOT NULL,
	"period_from" text NOT NULL,
	"period_to" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_register_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"head_id" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"owner" text DEFAULT 'client-hr' NOT NULL,
	"in_final_settlement" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_register_checklist_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"head_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_register_column_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"value_maps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_register_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"form_id" text NOT NULL,
	"cache_key" text NOT NULL,
	"object_key" text NOT NULL,
	"artifact_sha256" text NOT NULL,
	"byte_length" integer DEFAULT 0 NOT NULL,
	"format" text DEFAULT 'xlsx' NOT NULL,
	"template_version" text DEFAULT 'v1' NOT NULL,
	"generator_revision" text DEFAULT '' NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attested_by" uuid,
	"attested_at" timestamp with time zone,
	"attestation_method" text,
	"supersedes_id" uuid,
	"download_count" integer DEFAULT 0 NOT NULL,
	"retain_until" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_register_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"file_name" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"sheet_name" text DEFAULT '' NOT NULL,
	"header_row" integer DEFAULT 1 NOT NULL,
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"grid_detection" jsonb,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD CONSTRAINT "labour_register_batches_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD CONSTRAINT "labour_register_batches_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_checklist" ADD CONSTRAINT "labour_register_checklist_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_checklist" ADD CONSTRAINT "labour_register_checklist_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_checklist_ticks" ADD CONSTRAINT "labour_register_checklist_ticks_batch_id_labour_register_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."labour_register_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_checklist_ticks" ADD CONSTRAINT "labour_register_checklist_ticks_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_column_maps" ADD CONSTRAINT "labour_register_column_maps_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_column_maps" ADD CONSTRAINT "labour_register_column_maps_confirmed_by_profiles_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD CONSTRAINT "labour_register_documents_batch_id_labour_register_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."labour_register_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD CONSTRAINT "labour_register_documents_generated_by_profiles_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD CONSTRAINT "labour_register_documents_attested_by_profiles_id_fk" FOREIGN KEY ("attested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_uploads" ADD CONSTRAINT "labour_register_uploads_batch_id_labour_register_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."labour_register_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_uploads" ADD CONSTRAINT "labour_register_uploads_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_batch_period_idx" ON "labour_register_batches" USING btree ("engagement_id","state_code","period_from","period_to");--> statement-breakpoint
CREATE INDEX "labour_register_batch_engagement_idx" ON "labour_register_batches" USING btree ("engagement_id","period_from");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_checklist_head_idx" ON "labour_register_checklist" USING btree ("engagement_id","head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_tick_head_idx" ON "labour_register_checklist_ticks" USING btree ("batch_id","head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_map_slot_idx" ON "labour_register_column_maps" USING btree ("engagement_id","slot");--> statement-breakpoint
CREATE INDEX "labour_register_document_key_idx" ON "labour_register_documents" USING btree ("cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_document_form_idx" ON "labour_register_documents" USING btree ("batch_id","form_id","cache_key","format");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_upload_slot_idx" ON "labour_register_uploads" USING btree ("batch_id","slot");