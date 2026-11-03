CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" text NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"source" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"number" text,
	"issued_on" date NOT NULL,
	"amount_inr" numeric(14, 2) NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_firas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"invoice_id" uuid,
	"bank_credit_id" uuid,
	"status" text DEFAULT 'awaited' NOT NULL,
	"fira_no" text,
	"issued_on" date,
	"currency" text DEFAULT 'USD' NOT NULL,
	"fc_amount" numeric(14, 2),
	"inr_amount" numeric(14, 2),
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "invoice_date" date;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "received_fc" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "tds_inr" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "tds_certificate_on" date;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "disputed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "dispute_reason" text;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD COLUMN "dispute_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_set_by_profiles_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_credit_notes" ADD CONSTRAINT "receivable_credit_notes_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_credit_notes" ADD CONSTRAINT "receivable_credit_notes_invoice_id_receivable_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."receivable_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_credit_notes" ADD CONSTRAINT "receivable_credit_notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_firas" ADD CONSTRAINT "receivable_firas_sheet_id_receivable_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."receivable_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_firas" ADD CONSTRAINT "receivable_firas_invoice_id_receivable_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."receivable_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_firas" ADD CONSTRAINT "receivable_firas_bank_credit_id_bank_credits_id_fk" FOREIGN KEY ("bank_credit_id") REFERENCES "public"."bank_credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_currency_day_source_idx" ON "fx_rates" USING btree ("currency","rate_date","source");--> statement-breakpoint
CREATE INDEX "receivable_credit_notes_invoice_idx" ON "receivable_credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "receivable_firas_sheet_status_idx" ON "receivable_firas" USING btree ("sheet_id","status");--> statement-breakpoint
CREATE INDEX "receivable_firas_invoice_idx" ON "receivable_firas" USING btree ("invoice_id");