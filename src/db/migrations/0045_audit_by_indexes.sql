CREATE INDEX "document_requests_requested_by_idx" ON "document_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "document_templates_uploaded_by_idx" ON "document_templates" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "documents_uploaded_by_idx" ON "documents" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "email_templates_created_by_idx" ON "email_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "email_templates_updated_by_idx" ON "email_templates" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "knowledge_bank_files_uploaded_by_idx" ON "knowledge_bank_files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "knowledge_bank_folders_created_by_idx" ON "knowledge_bank_folders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "item_window_requests_requested_by_idx" ON "item_window_requests" USING btree ("requested_by");