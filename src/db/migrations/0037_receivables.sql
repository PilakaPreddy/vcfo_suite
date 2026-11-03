-- Receivables (docs/specs/receivables/PLAN.md, 3 Nov 2026).
--
-- Additive only: eight new tables for the invoice register, published versions, the change log,
-- reminders, bank credits and summary emails. No existing table changes.

CREATE TABLE "bank_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_ref" text NOT NULL,
	"value_date" date NOT NULL,
	"payer" text NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"fc_amount" numeric(14, 2),
	"inr_amount" numeric(14, 2) NOT NULL,
	"narration" text DEFAULT '' NOT NULL,
	"match_invoice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"match_note" text DEFAULT '' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"invoice_id" uuid,
	"actor_id" uuid,
	"summary" text NOT NULL,
	"field" text,
	"before" text,
	"after" text,
	"affects_page" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"version_id" uuid,
	"to_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"channel" text NOT NULL,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"invoice_month" date NOT NULL,
	"client_name" text NOT NULL,
	"invoice_no" text,
	"partner_id" uuid,
	"due_date" date NOT NULL,
	"amount_inr" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"fc_amount" numeric(14, 2),
	"fx_rate" numeric(12, 6),
	"status" text DEFAULT 'open' NOT NULL,
	"paid_on" date,
	"paid_amount" numeric(14, 2),
	"paid_via" text,
	"part_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reminders_paused_until" date,
	"pause_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "receivable_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"partner_id" uuid,
	"for_date" date NOT NULL,
	"kind" text NOT NULL,
	"days_left" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"subject_override" text,
	"body_override" text,
	"to_email" text,
	"channel" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_org_name" text NOT NULL,
	"manager_user_id" uuid,
	"public_key" text NOT NULL,
	"require_key" boolean DEFAULT true NOT NULL,
	"published_version_id" uuid,
	"reminder_rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_by" uuid,
	"published_by_name" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_credits" ADD CONSTRAINT "bank_credits_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_credits" ADD CONSTRAINT "bank_credits_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_changes" ADD CONSTRAINT "receivable_changes_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_changes" ADD CONSTRAINT "receivable_changes_invoice_id_receivable_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."receivable_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_changes" ADD CONSTRAINT "receivable_changes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_email_sends" ADD CONSTRAINT "receivable_email_sends_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_email_sends" ADD CONSTRAINT "receivable_email_sends_version_id_receivable_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."receivable_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_email_sends" ADD CONSTRAINT "receivable_email_sends_sent_by_profiles_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_partner_id_receivable_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."receivable_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD CONSTRAINT "receivable_partners_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_reminders" ADD CONSTRAINT "receivable_reminders_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_reminders" ADD CONSTRAINT "receivable_reminders_invoice_id_receivable_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."receivable_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_reminders" ADD CONSTRAINT "receivable_reminders_partner_id_receivable_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."receivable_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_sheets" ADD CONSTRAINT "receivable_sheets_manager_user_id_profiles_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_versions" ADD CONSTRAINT "receivable_versions_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_versions" ADD CONSTRAINT "receivable_versions_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_credits_sheet_ref_idx" ON "bank_credits" USING btree ("sheet_id","source","external_ref");--> statement-breakpoint
CREATE INDEX "bank_credits_sheet_status_idx" ON "bank_credits" USING btree ("sheet_id","status");--> statement-breakpoint
CREATE INDEX "receivable_changes_sheet_idx" ON "receivable_changes" USING btree ("sheet_id","created_at");--> statement-breakpoint
CREATE INDEX "receivable_email_sends_sheet_idx" ON "receivable_email_sends" USING btree ("sheet_id","sent_at");--> statement-breakpoint
CREATE INDEX "receivable_invoices_sheet_status_idx" ON "receivable_invoices" USING btree ("sheet_id","status");--> statement-breakpoint
CREATE INDEX "receivable_invoices_sheet_due_idx" ON "receivable_invoices" USING btree ("sheet_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_partners_sheet_slug_idx" ON "receivable_partners" USING btree ("sheet_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_reminders_invoice_day_idx" ON "receivable_reminders" USING btree ("invoice_id","for_date");--> statement-breakpoint
CREATE INDEX "receivable_reminders_sheet_day_idx" ON "receivable_reminders" USING btree ("sheet_id","for_date");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_sheets_public_key_idx" ON "receivable_sheets" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "receivable_sheets_manager_idx" ON "receivable_sheets" USING btree ("manager_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_versions_sheet_seq_idx" ON "receivable_versions" USING btree ("sheet_id","seq");