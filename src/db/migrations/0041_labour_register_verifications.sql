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
ALTER TABLE "labour_register_verifications" ADD CONSTRAINT "labour_register_verifications_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labour_register_verification_form_idx" ON "labour_register_verifications" USING btree ("form_id");