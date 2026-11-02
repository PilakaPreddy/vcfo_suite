CREATE TABLE "agenda_library_items" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"scenario" text NOT NULL,
	"wording" text NOT NULL,
	"law" text DEFAULT '' NOT NULL,
	"applicability" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid,
	"name" text NOT NULL,
	"meeting_type" text NOT NULL,
	"agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_meeting_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"resolution_date" date,
	"changes_item" text,
	"reason" text,
	"signer_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_key" text,
	"file_name" text,
	"signed_key" text,
	"signed_name" text,
	"sent_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"final_sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_meeting_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"actor_id" uuid,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_meeting_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"director_id" uuid NOT NULL,
	"reply" text NOT NULL,
	"note" text,
	"replied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_meeting_signature_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"director_id" uuid,
	"event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_meeting_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"kind" text DEFAULT 'board' NOT NULL,
	"meeting_type" text DEFAULT 'quarterly' NOT NULL,
	"seq" integer NOT NULL,
	"meeting_no" text NOT NULL,
	"meeting_date" date NOT NULL,
	"meeting_time" text NOT NULL,
	"second_zone_label" text,
	"second_zone_time" text,
	"mode" text DEFAULT 'vc' NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_override" jsonb,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signatory_director_id" uuid,
	"teams_link" text,
	"teams_event_id" text,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"post_inc" boolean DEFAULT false NOT NULL,
	"notice_on" date,
	"short_notice" boolean DEFAULT false NOT NULL,
	"review_note" text,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"sent_at" timestamp with time zone,
	"rescheduled_from" date,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"locked_at" timestamp with time zone,
	"task_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_directors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"din" text,
	"email" text,
	"phone" text,
	"designation" text DEFAULT 'Director' NOT NULL,
	"appointed_on" date,
	"ceased_on" date,
	"cease_reason" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_tasks" ADD COLUMN "board_meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda_library_items" ADD CONSTRAINT "agenda_library_items_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_templates" ADD CONSTRAINT "agenda_templates_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_templates" ADD CONSTRAINT "agenda_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_documents" ADD CONSTRAINT "board_meeting_documents_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_documents" ADD CONSTRAINT "board_meeting_documents_locked_by_profiles_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_documents" ADD CONSTRAINT "board_meeting_documents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_events" ADD CONSTRAINT "board_meeting_events_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_events" ADD CONSTRAINT "board_meeting_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_replies" ADD CONSTRAINT "board_meeting_replies_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_replies" ADD CONSTRAINT "board_meeting_replies_director_id_company_directors_id_fk" FOREIGN KEY ("director_id") REFERENCES "public"."company_directors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_signature_events" ADD CONSTRAINT "board_meeting_signature_events_document_id_board_meeting_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."board_meeting_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_signature_events" ADD CONSTRAINT "board_meeting_signature_events_director_id_company_directors_id_fk" FOREIGN KEY ("director_id") REFERENCES "public"."company_directors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_versions" ADD CONSTRAINT "board_meeting_versions_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meeting_versions" ADD CONSTRAINT "board_meeting_versions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_signatory_director_id_company_directors_id_fk" FOREIGN KEY ("signatory_director_id") REFERENCES "public"."company_directors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_directors" ADD CONSTRAINT "company_directors_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_directors" ADD CONSTRAINT "company_directors_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_templates_engagement_idx" ON "agenda_templates" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "board_meeting_documents_meeting_idx" ON "board_meeting_documents" USING btree ("meeting_id","kind");--> statement-breakpoint
CREATE INDEX "board_meeting_events_meeting_idx" ON "board_meeting_events" USING btree ("meeting_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "board_meeting_replies_meeting_director_idx" ON "board_meeting_replies" USING btree ("meeting_id","director_id");--> statement-breakpoint
CREATE INDEX "board_meeting_signature_events_doc_idx" ON "board_meeting_signature_events" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "board_meeting_versions_meeting_version_idx" ON "board_meeting_versions" USING btree ("meeting_id","version");--> statement-breakpoint
CREATE INDEX "board_meetings_engagement_date_idx" ON "board_meetings" USING btree ("engagement_id","meeting_date");--> statement-breakpoint
CREATE UNIQUE INDEX "board_meetings_engagement_no_idx" ON "board_meetings" USING btree ("engagement_id","meeting_no");--> statement-breakpoint
CREATE INDEX "company_directors_engagement_idx" ON "company_directors" USING btree ("engagement_id");