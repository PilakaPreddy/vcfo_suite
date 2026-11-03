-- The payroll checklist leaves the labour registers feature.
--
-- It was a standing list of the pay heads a client's payroll runs, and it gated which columns
-- a register asked for. That gating now comes from the dataset field itself: a head not every
-- employer runs is marked optional, so it is offered but never demanded, and its column prints
-- nil when nothing is mapped to it. The checklist itself is a payroll concern rather than a
-- register one and belongs in its own feature.
--
-- 0033 has been on RDS since 2 Nov 2026 (deploy 7fb6b705), so both tables exist in production.
-- Count their rows on RDS and take a snapshot before applying this migration there. It is an
-- exception to the additive-only rule, so it needs the owner's go before it runs on RDS.
DROP TABLE IF EXISTS "labour_register_checklist_ticks";
--> statement-breakpoint
DROP TABLE IF EXISTS "labour_register_checklist";
