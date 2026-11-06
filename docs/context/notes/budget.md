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
