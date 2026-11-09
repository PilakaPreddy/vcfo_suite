ALTER TABLE "ask_attachments" ADD COLUMN "relative_path" text;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "ask_attachments" ADD CONSTRAINT "ask_attachments_parent_id_ask_attachments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ask_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_attachments_parent_idx" ON "ask_attachments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "ask_runs_conversation_status_idx" ON "ask_runs" USING btree ("conversation_id","status");