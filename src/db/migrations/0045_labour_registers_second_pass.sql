CREATE TABLE "labour_register_code_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"code" text NOT NULL,
	"stage" text NOT NULL,
	"notified_on" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_register_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" text NOT NULL,
	"status" text NOT NULL,
	"against" text DEFAULT '' NOT NULL,
	"disputed_because" text DEFAULT '' NOT NULL,
	"open_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_key" text,
	"evidence_file_name" text,
	"suppressed" boolean DEFAULT false NOT NULL,
	"suppressed_reason" text DEFAULT '' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_object_key" text;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_file_name" text;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_sha256" text;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "labour_register_code_rules" ADD CONSTRAINT "labour_register_code_rules_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_verifications" ADD CONSTRAINT "labour_register_verifications_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_code_rule_idx" ON "labour_register_code_rules" USING btree ("state_code","code");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_verification_form_idx" ON "labour_register_verifications" USING btree ("form_id");