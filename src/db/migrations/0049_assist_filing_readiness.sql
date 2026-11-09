CREATE TABLE "assist_filing_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_filing_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"signer_id" text NOT NULL,
	"business_user_on" date,
	"dsc_associated_on" date,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assist_filing_packets" ADD CONSTRAINT "assist_filing_packets_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_filing_packets" ADD CONSTRAINT "assist_filing_packets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_filing_signers" ADD CONSTRAINT "assist_filing_signers_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_filing_signers" ADD CONSTRAINT "assist_filing_signers_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assist_filing_packets_engagement_version_idx" ON "assist_filing_packets" USING btree ("engagement_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "assist_filing_signers_engagement_signer_idx" ON "assist_filing_signers" USING btree ("engagement_id","signer_id");