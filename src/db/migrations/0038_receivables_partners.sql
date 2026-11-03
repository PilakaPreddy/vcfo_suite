ALTER TYPE "public"."trak_role" ADD VALUE 'partner';--> statement-breakpoint
CREATE TABLE "receivable_invoice_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text DEFAULT '' NOT NULL,
	"from_sbc" boolean DEFAULT false NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "promised_on" date;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "promised_by" uuid;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "promised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "notify_on_publish" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "set_password_token_hash" text;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "set_password_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "invite_send_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_invoice_notes" ADD CONSTRAINT "receivable_invoice_notes_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoice_notes" ADD CONSTRAINT "receivable_invoice_notes_invoice_id_receivable_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."receivable_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoice_notes" ADD CONSTRAINT "receivable_invoice_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receivable_invoice_notes_invoice_idx" ON "receivable_invoice_notes" USING btree ("invoice_id","created_at");--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_promised_by_profiles_id_fk" FOREIGN KEY ("promised_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_partners" ADD CONSTRAINT "receivable_partners_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receivable_partners_profile_idx" ON "receivable_partners" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "receivable_partners_token_idx" ON "receivable_partners" USING btree ("set_password_token_hash");