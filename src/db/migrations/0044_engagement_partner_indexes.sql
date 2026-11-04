CREATE INDEX "time_blocks_engagement_idx" ON "time_blocks" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "work_checklist_items_engagement_idx" ON "work_checklist_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "work_sessions_engagement_idx" ON "work_sessions" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "receivable_invoices_partner_idx" ON "receivable_invoices" USING btree ("partner_id");