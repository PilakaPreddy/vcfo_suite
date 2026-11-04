ALTER TABLE "receivable_email_sends" ADD COLUMN "status" text DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_email_sends" ADD COLUMN "error" text;