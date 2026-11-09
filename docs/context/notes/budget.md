# Budget notes

- `computeBudget` in `src/lib/budget/engine.ts` is the only calculation. Screens, exports, frozen
  versions and the alert job all call it. Do not add a second sum anywhere.
- Monthly arrays are indexed by calendar month (0 is January). Series out of the engine are in
  financial-year order, so a screen maps with `result.calendar`.
- Percentages are stored as typed (18 means 18%). The owner's workbook holds fractions, and
  `import-linked.ts` converts them.
- A viewer without CTC access gets `maskedPayroll` and roles with no CTC. The engine adds the masked
  totals, so its totals still match. A typed payroll is turned off for that viewer in `maskForViewer`.
- Bell rows and emails link to `/budgets/[id]`, which redirects by role, because a message does not
  know its reader's shell.
- The owner's workbook holds a real client's figures. Keep it out of the repo.
- The budget migration is `0048_budgets`. It was first written as `0047_budgets` and renumbered
  when `main` took `0047_ask_foundation`. A local database that already applied the old name
  must drop the budget tables, or be rebuilt, before it migrates again.
- The client portal reverts Tailwind's reset outside a `.cp-tw` island, so a budget page under `app/app/client` must sit inside one or its layout collapses.

## Variance tab and advance tax

- Actual cost has one store, `budget_actuals`. The Variance tab, the Actuals tab and the accounts
  import all write there. `saveActuals` refuses a month that is submitted or approved on the
  Variance tab (`month_locked`), so a locked month changes only after a manager reopens it.
- The Variance tab writes a typed 0 as a row and a blank as no row. `saveActuals` (the Actuals tab)
  still deletes a 0 with no reason, so do not route Variance saves through it.
- `budget_variance_months` holds status, headcount, advance tax paid and, on approval, the month's
  budget figures (`budget_snapshot`). An approved month shows that snapshot, so a later revision or
  tax change does not move a locked month. Reopen clears the snapshot.
- The tab shows when the budget is approved, or any frozen version was approved. A revision clears
  `budgets.approved_at`, so the check reads `budget_versions.approved_at`.
- Who enters: `intern` (the project lead). A manager enters only when the client has no lead
  (`engagements.intern_id` empty and no `engagement_leads` row). Managers and firm admins approve.
- Submit and Approve both re-run `checkMonth` on the server: every line with a budget needs an
  actual, every difference that is not 0 after rounding needs a reason, and the headcount is
  required. The advance tax line needs an actual only in an instalment month.
- All tax maths is in `src/lib/budget/tax.ts`. `computeBudget` calls it with the budget alone for the
  Master Budget tax row (the yearly figure spread by each month's cost base). The Finance costs tab
  and the Excel export call it again with `taxActualsOf(...)` for the latest estimate.
- Tax settings saved before 9 Nov lack the new fields. Always read them through `withTaxDefaults`.
- The single "Gratuity & leave provisions" line is split for tax by the gratuity % and leave % in
  Settings. With leave at 0 the whole line counts as gratuity.
- Insurance on a prepaid basis applies only when a premium per employee is above 0; otherwise the
  insurance as booked stays in the cost base.
- Capital rows reach the asset block whose linked line matches the row's line; rows on no linked
  line go to the first linked block. The Master Budget depreciation line leaves the cost base and
  the Companies Act depreciation takes its place.
- Text names the Income-tax Act 2025 (in force from 1 April 2026). Presets: concessional 22% with a
  flat 10% surcharge; regular 25% or 30% with the slab surcharge (0, 7, 12%). No marginal relief,
  MAT, TDS or TCS credit, or interest is modelled.
