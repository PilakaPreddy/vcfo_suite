-- The payroll checklist leaves the labour registers feature.
--
-- It was a standing list of the pay heads a client's payroll runs, and it gated which columns
-- a register asked for. That gating now comes from the dataset field itself: a head not every
-- employer runs is marked optional, so it is offered but never demanded, and its column prints
-- nil when nothing is mapped to it. The checklist itself is a payroll concern rather than a
-- register one and belongs in its own feature.
--
-- Nothing in production has written to either table: 0033 has not been applied to RDS yet.
DROP TABLE IF EXISTS "labour_register_checklist_ticks";
--> statement-breakpoint
DROP TABLE IF EXISTS "labour_register_checklist";
