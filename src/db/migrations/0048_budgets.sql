CREATE TABLE "budget_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"period" text NOT NULL,
	"line_id" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"reason" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"row_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size" integer DEFAULT 0 NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"section" text NOT NULL,
	"row_id" uuid,
	"row_label" text,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"actor_id" uuid,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"section" text NOT NULL,
	"row_id" uuid,
	"body" text NOT NULL,
	"author_id" uuid,
	"author_name" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_section_owners" (
	"budget_id" uuid NOT NULL,
	"section" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "budget_section_owners_budget_id_section_user_id_pk" PRIMARY KEY("budget_id","section","user_id")
);
--> statement-breakpoint
CREATE TABLE "budget_sections" (
	"budget_id" uuid NOT NULL,
	"section" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"due_date" text,
	"note" text,
	"last_reminded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_sections_budget_id_section_pk" PRIMARY KEY("budget_id","section")
);
--> statement-breakpoint
CREATE TABLE "budget_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"grand_total" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"published_by" uuid,
	"published_by_name" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_name" text,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"fy_start_year" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"settings" jsonb NOT NULL,
	"settings_version" integer DEFAULT 1 NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"approved_by" uuid,
	"approved_by_name" text,
	"approved_at" timestamp with time zone,
	"last_alert_period" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_changes" ADD CONSTRAINT "budget_changes_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_changes" ADD CONSTRAINT "budget_changes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_comments" ADD CONSTRAINT "budget_comments_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_comments" ADD CONSTRAINT "budget_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_rows" ADD CONSTRAINT "budget_rows_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_rows" ADD CONSTRAINT "budget_rows_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_section_owners" ADD CONSTRAINT "budget_section_owners_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_section_owners" ADD CONSTRAINT "budget_section_owners_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_sections" ADD CONSTRAINT "budget_sections_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_actuals_key_idx" ON "budget_actuals" USING btree ("budget_id","period","line_id");--> statement-breakpoint
CREATE INDEX "budget_attachments_row_idx" ON "budget_attachments" USING btree ("budget_id","row_id");--> statement-breakpoint
CREATE INDEX "budget_changes_budget_idx" ON "budget_changes" USING btree ("budget_id","created_at");--> statement-breakpoint
CREATE INDEX "budget_comments_budget_idx" ON "budget_comments" USING btree ("budget_id","created_at");--> statement-breakpoint
CREATE INDEX "budget_rows_budget_idx" ON "budget_rows" USING btree ("budget_id","kind","position");--> statement-breakpoint
CREATE INDEX "budget_section_owners_user_idx" ON "budget_section_owners" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_versions_budget_version_idx" ON "budget_versions" USING btree ("budget_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_engagement_year_live_idx" ON "budgets" USING btree ("engagement_id","fy_start_year") WHERE "budgets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "budgets_engagement_idx" ON "budgets" USING btree ("engagement_id");