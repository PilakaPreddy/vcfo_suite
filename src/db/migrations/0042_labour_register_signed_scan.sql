ALTER TABLE "labour_register_documents" ADD COLUMN "signed_object_key" text;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_file_name" text;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_sha256" text;--> statement-breakpoint
ALTER TABLE "labour_register_documents" ADD COLUMN "signed_by_name" text DEFAULT '' NOT NULL;