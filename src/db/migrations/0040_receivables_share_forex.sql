CREATE TABLE "receivable_fx_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"direction" text NOT NULL,
	"threshold" numeric(12, 6) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_fx_forwards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"bank" text DEFAULT '' NOT NULL,
	"contract_no" text,
	"amount_fc" numeric(14, 2) NOT NULL,
	"forward_rate" numeric(12, 6) NOT NULL,
	"booked_on" date NOT NULL,
	"maturity_on" date NOT NULL,
	"utilised_fc" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"visibility" text NOT NULL,
	"allowed_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_download" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_share_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"viewer_id" uuid,
	"viewer_email" text,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receivable_fx_alerts" ADD CONSTRAINT "receivable_fx_alerts_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_fx_alerts" ADD CONSTRAINT "receivable_fx_alerts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_fx_forwards" ADD CONSTRAINT "receivable_fx_forwards_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_fx_forwards" ADD CONSTRAINT "receivable_fx_forwards_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_share_links" ADD CONSTRAINT "receivable_share_links_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_share_links" ADD CONSTRAINT "receivable_share_links_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_share_views" ADD CONSTRAINT "receivable_share_views_link_id_receivable_share_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."receivable_share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_share_views" ADD CONSTRAINT "receivable_share_views_viewer_id_profiles_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receivable_fx_alerts_sheet_idx" ON "receivable_fx_alerts" USING btree ("sheet_id","active");--> statement-breakpoint
CREATE INDEX "receivable_fx_forwards_sheet_idx" ON "receivable_fx_forwards" USING btree ("sheet_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_share_links_token_idx" ON "receivable_share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "receivable_share_links_sheet_idx" ON "receivable_share_links" USING btree ("sheet_id");--> statement-breakpoint
CREATE INDEX "receivable_share_views_link_idx" ON "receivable_share_views" USING btree ("link_id","viewed_at");