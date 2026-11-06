CREATE TABLE "assist_filing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"form" text NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer,
	"sha256" text NOT NULL,
	"text_hash" text,
	"signers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"check" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"form" text NOT NULL,
	"state" text DEFAULT 'data_ready' NOT NULL,
	"srn" text,
	"srn_at" timestamp with time zone,
	"name_approved_at" timestamp with time zone,
	"signed_uploaded_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"last_remark" text,
	"remarks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"signature_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alerted_on" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assist_filing_documents" ADD CONSTRAINT "assist_filing_documents_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_filing_documents" ADD CONSTRAINT "assist_filing_documents_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_filings" ADD CONSTRAINT "assist_filings_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_filings" ADD CONSTRAINT "assist_filings_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assist_filing_documents_form_idx" ON "assist_filing_documents" USING btree ("engagement_id","form","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assist_filings_engagement_form_idx" ON "assist_filings" USING btree ("engagement_id","form");--> statement-breakpoint
CREATE INDEX "assist_filings_state_idx" ON "assist_filings" USING btree ("state");