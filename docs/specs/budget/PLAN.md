# Budget module

An annual cost budget for each client and year. It replaces the owner's linked Excel workbook
(`Budget_Linked_Template_v3.xlsx`, kept outside the repo because it holds a real client's figures)
and the single-file "India CoE Budget" page built from it. Each team fills its own tab, each cost row
names one Master Budget line, and the Master Budget adds itself up.

## Decisions from the owner (6 Nov 2026)

| Question | Answer | What the build does |
|---|---|---|
| Q-30 Who enters the data | CTC and hiring: Talent Acquisition. Benefits: HR. Admin costs: Admin team. | `SECTION_TEAM` in `src/lib/budget/model.ts`, shown on each tab and in the owners dialog. The Finance team keeps Finance and Settings, as in the workbook. |
| Q-02 Which clients | All clients | No entitlement gate. The general "Services company" template is the default. Tax is off unless the template or Finance turns it on. |
| Q-07 Source workbook | Attached | It is the calculation reference, and it imports directly (`src/lib/budget/import-linked.ts`). |
| Q-11 Tax formula | Correct | `((total cost - GST) x mark-up + gratuity and leave) x effective rate`. It is still labelled an estimate, not tax advice. |

## Decisions the build made alone

The owner said to decide and to change them later if needed.

- Client section owners fill through the portal. SBC staff can edit any tab, and the edit is logged.
- A client sees the Master Budget only after publish, and CTC only if they own the hiring tab.
  Anyone else gets payroll as a total.
- Managers and firm-wide admins publish. A client approves or returns, or a firm-wide admin records
  it. Approval locks; a revision opens a new draft and frozen versions never change. Errors and
  unmapped rows block publish.
- Statutory calculation is off by default, because CTC normally includes employer PF and the
  workbook has no such calculation. A CA must confirm the rates before it is turned on.
- Excel import takes the module's own template or the owner's workbook, not any workbook.
- Actual cost comes from a file (Tally, Zoho, payroll exports) with a kept ledger map, not a live
  connection. Scenarios are percentage factors. Saves are per row with a conflict message, not live
  co-editing.

## Where the workbook and the engine differ

The formulas for benefits, recurring costs, one-off costs, GST and tax were read against the workbook
and match. These differ on purpose.

| Workbook | Module | Why |
|---|---|---|
| Existing salary is one typed number (1,000,000 a month) while 25 opening staff at their CTC come to about 63 lakh | `payrollSource`: from roles by default, or typed as in the workbook. The screen shows the difference. Importing the workbook selects typed, so totals follow it. | The two figures can disagree silently. |
| "Joining-month salary factor" and "Annual merit increase" are set in Settings, but no formula uses them | Joining day per role, and increments that do change cost | They had no effect in the workbook. |
| Read Me promises exits and bonuses sections on the Salary sheet, which are not there | Exits per month and an attrition rate | Headcount could only go up. |
| Rows store names | Rows store ids | Renaming a department or line dropped cost. |
| Each row rounds to the paisa | Whole rupees, month by month | One rounding rule. Totals can differ from the workbook by a few rupees. |

## Phases

1. Calculation, data model, permissions, grids, workflow, Excel export and import, navigation.
2. Joining-day salary, statutory, capital and depreciation, monthly exchange rates, cash flow,
   department and location views, quarters, reminders, comments, send back, lock and revision, copy
   from last year, templates, PDF, USD report, phone view.
3. Scenarios, attachments, actuals import, forecast, overspend alerts.

## Not built

- Connecting the budget to Ask VCFO (I-44). The unmerged `chatbot` branches rewrite the Ask tools, so
  this waits until they land.
- Cross-tenant tests (I-46) and all other tests. The owner tests this build personally and asked for
  no tests to be written or run.
