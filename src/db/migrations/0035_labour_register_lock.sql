ALTER TABLE "labour_register_batches" ADD COLUMN "marked_ready_by" uuid;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "marked_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "accuracy_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "readiness_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "reopened_by" uuid;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "reopened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "reopen_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD COLUMN "reopen_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD CONSTRAINT "labour_register_batches_marked_ready_by_profiles_id_fk" FOREIGN KEY ("marked_ready_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_register_batches" ADD CONSTRAINT "labour_register_batches_reopened_by_profiles_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;