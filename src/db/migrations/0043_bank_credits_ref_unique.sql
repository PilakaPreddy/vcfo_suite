-- Audit finding 3: one bank credit per sheet by its bank reference, whatever the source.
-- This fails if a sheet already holds the same external_ref twice; check first with
-- select sheet_id, external_ref, count(*) from bank_credits group by 1, 2 having count(*) > 1;
DROP INDEX "bank_credits_sheet_ref_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bank_credits_sheet_ref_idx" ON "bank_credits" USING btree ("sheet_id","external_ref");