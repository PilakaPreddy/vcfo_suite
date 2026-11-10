CREATE TABLE "request_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"help" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"answer_text" text,
	"document_request_id" uuid,
	"received_at" timestamp with time zone,
	"ordinal" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"template_id" text,
	"title" text NOT NULL,
	"period_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_on" date,
	"cadence_days" integer DEFAULT 3 NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminded_at" timestamp with time zone,
	"first_sent_at" timestamp with time zone,
	"call_task_id" uuid,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expiry_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"stage" integer NOT NULL,
	"expires_on" date NOT NULL,
	"task_id" uuid,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expiry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_name" text NOT NULL,
	"kind" text NOT NULL,
	"reference_label" text,
	"expires_on" date NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"renewed_at" timestamp with time zone,
	"renewed_by" uuid,
	"notes" text,
	"last_alert_stage" integer,
	"request_list_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"authority" text NOT NULL,
	"section" text,
	"period_label" text,
	"din" text,
	"demand_amount" numeric(16, 2),
	"received_on" date,
	"response_due_on" date,
	"hearing_on" date,
	"stage" text DEFAULT 'received' NOT NULL,
	"owner_id" uuid,
	"summary" text,
	"reply_draft" text,
	"documents_needed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_list_id" uuid,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"last_escalation" text,
	"last_escalation_due_on" date,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"task_id" uuid,
	"task_kind" text,
	"request_list_id" uuid,
	"due_on" date,
	"created_by" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_health_scores" (
	"engagement_id" uuid PRIMARY KEY NOT NULL,
	"score" integer NOT NULL,
	"band" text NOT NULL,
	"signals" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"override_band" text,
	"override_reason" text,
	"override_by" uuid,
	"override_at" timestamp with time zone,
	"previous_band" text,
	"check_in_task_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sla_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"stage_label" text NOT NULL,
	"level" text NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_list_items" ADD CONSTRAINT "request_list_items_list_id_request_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."request_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_list_items" ADD CONSTRAINT "request_list_items_document_request_id_document_requests_id_fk" FOREIGN KEY ("document_request_id") REFERENCES "public"."document_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lists" ADD CONSTRAINT "request_lists_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lists" ADD CONSTRAINT "request_lists_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_item_id_expiry_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."expiry_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_items" ADD CONSTRAINT "expiry_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_items" ADD CONSTRAINT "expiry_items_renewed_by_profiles_id_fk" FOREIGN KEY ("renewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_items" ADD CONSTRAINT "expiry_items_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_items" ADD CONSTRAINT "expiry_items_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_cases" ADD CONSTRAINT "notice_cases_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_cases" ADD CONSTRAINT "notice_cases_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_cases" ADD CONSTRAINT "notice_cases_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_cases" ADD CONSTRAINT "notice_cases_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_confirmed_by_profiles_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_scores" ADD CONSTRAINT "client_health_scores_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_scores" ADD CONSTRAINT "client_health_scores_override_by_profiles_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_escalations" ADD CONSTRAINT "sla_escalations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_list_items_list_idx" ON "request_list_items" USING btree ("list_id","ordinal");--> statement-breakpoint
CREATE INDEX "request_list_items_doc_request_idx" ON "request_list_items" USING btree ("document_request_id");--> statement-breakpoint
CREATE INDEX "request_lists_engagement_idx" ON "request_lists" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "request_lists_status_idx" ON "request_lists" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "expiry_alerts_uq" ON "expiry_alerts" USING btree ("item_id","stage","expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "expiry_items_source_key_uq" ON "expiry_items" USING btree ("engagement_id","source_key");--> statement-breakpoint
CREATE INDEX "expiry_items_expires_idx" ON "expiry_items" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "notice_cases_engagement_idx" ON "notice_cases" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "notice_cases_due_idx" ON "notice_cases" USING btree ("stage","response_due_on");--> statement-breakpoint
CREATE INDEX "company_events_engagement_idx" ON "company_events" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "company_events_status_idx" ON "company_events" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "client_health_scores_band_idx" ON "client_health_scores" USING btree ("band");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_escalations_once_idx" ON "sla_escalations" USING btree ("engagement_id","item_key","stage_label","level");--> statement-breakpoint
CREATE INDEX "sla_escalations_engagement_idx" ON "sla_escalations" USING btree ("engagement_id");