/**
 * THE COMPLIANCE ACTIVITY MASTER (Developer requirement 01) — real data, not sample data.
 *
 * Sources, supplied by the owner on 29 Oct 2026 and carried over from the prototype's
 * `src/data/activity-master.ts` (main e86ce88):
 *   - SBC_TRACK_Consolidated_Compliance_Activity_Master.xlsx, sheet 'Consolidated Activity Master'
 *     (31 rows, ACT-001 to ACT-031), with the 'Deduplication Mapping' applied.
 *   - SBC_Registration_Compliance_Manual_4.docx, the due-date tables with the penalty for each.
 * Rows with `from: 'manual'` are statutory due dates the manual lists but the master does not.
 * `confirm` holds a point the owner must confirm before production reminders go live (DR-19, DR-22).
 *
 * This file seeds the `compliance_activities` table (`src/db/repositories/compliance-activities.ts`
 * `systemEnsureActivitiesSeeded`, and `scripts/seed-compliance-activities.ts`). The table is the
 * source the app reads; this file only fills it once, so an admin's later edits are kept.
 * Docs: docs/ui-port/COMPLIANCE-API.md, the prototype's docs/COMPLIANCE-MODEL.md section 3.1.
 */

export type ActivityKind = 'Statutory' | 'Non-statutory' | 'Policy-based' | 'Configurable';
export type ActivityGroup = 'statutory' | 'non-statutory';
export type ActivityFrequency =
  | 'Weekly'
  | 'Bi-weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Half-yearly'
  | 'Yearly'
  | 'Every 3 years'
  | 'Every 10 years'
  | 'One-time'
  | 'Event';
export type ActivityVisibility = 'firm' | 'client' | 'both';

export interface ActivitySeed {
  id: string;
  name: string;
  kind: ActivityKind;
  group: ActivityGroup;
  frequency: ActivityFrequency;
  module: string;
  area: string;
  dueRule: string;
  penalty: string;
  applies: string;
  ownerRole: string;
  reviewerRole: string;
  notifyDays: number;
  visibility: ActivityVisibility;
  note: string;
  confirm?: string;
  from: 'master' | 'manual';
}

/** Developer requirement 21: the default reminder lead time by frequency. */
export const NOTIFY_DAYS_BY_FREQUENCY: Record<ActivityFrequency, number> = {
  Weekly: 2,
  'Bi-weekly': 3,
  Monthly: 5,
  Quarterly: 10,
  'Half-yearly': 15,
  Yearly: 30,
  'Every 3 years': 30,
  'Every 10 years': 30,
  'One-time': 5,
  Event: 5,
};

type Row = Omit<ActivitySeed, 'group' | 'notifyDays' | 'visibility' | 'from'> & {
  notifyDays?: number;
  visibility?: ActivityVisibility;
  from?: 'master' | 'manual';
};

const ROWS: Row[] = [
  // ---- Statutory, from the master ----
  { id: "ACT-001-1", name: "GSTR-1", kind: "Statutory", frequency: "Monthly", module: "GST / Tax", area: "GST", dueRule: "11th of the next month (QRMP: 13th after the quarter)", penalty: "₹50 a day, up to ₹10,000", applies: "Every GST-registered person; monthly above ₹5 crore turnover", ownerRole: "GST Analyst", reviewerRole: "Finance / Tax Manager", note: "GSTR-1 variants merged. Separate task instances where filing dates differ." },
  { id: "ACT-001-3B", name: "GSTR-3B", kind: "Statutory", frequency: "Monthly", module: "GST / Tax", area: "GST", dueRule: "20th of the next month", penalty: "18% interest on the tax due, from the due date to the date of filing", applies: "Every GST-registered person", ownerRole: "GST Analyst", reviewerRole: "Finance / Tax Manager", note: "GSTR-3B variants merged." },
  { id: "ACT-002", name: "TDS payment", kind: "Statutory", frequency: "Monthly", module: "Direct Tax", area: "Income tax", dueRule: "7th of the next month", penalty: "1.5% a month or part of a month", applies: "Based on the nature of transactions and payments", ownerRole: "Tax Analyst", reviewerRole: "Finance Manager", note: "TDS payment entries consolidated." },
  { id: "ACT-011", name: "Advance tax payment", kind: "Statutory", frequency: "Quarterly", module: "Direct Tax", area: "Income tax", dueRule: "15 Jun, 15 Sep, 15 Dec, 15 Mar", penalty: "Interest u/s 234A/B/C at 1% a month", applies: "Estimated tax for the year of ₹10,000 or more", ownerRole: "Tax Analyst", reviewerRole: "Tax / Finance Manager", note: "Advance tax variants merged.", confirm: "The manual gives Q4 as 31 Mar; the Income-tax Act sets 15 Mar. The prototype uses 15 Mar." },
  { id: "ACT-012", name: "TDS return (Form 26Q) and vendor TDS certificates", kind: "Statutory", frequency: "Quarterly", module: "Direct Tax", area: "Income tax", dueRule: "Q1 31 Jul · Q2 31 Oct · Q3 31 Jan · Q4 31 May", penalty: "₹200 a day until filed", applies: "Based on the nature of transactions and payments", ownerRole: "Tax Analyst", reviewerRole: "Tax Manager", note: "TDS return, Form 26Q and vendor certificates merged.", confirm: "The manual gives Q2 as 30 Oct; the rule is 31 Oct. Confirm \"Form 131\" wording." },
  { id: "ACT-014", name: "MSME Form I (MSME-1)", kind: "Statutory", frequency: "Half-yearly", module: "MCA / Corporate Compliance", area: "MCA", dueRule: "H1 (Oct–Mar) by 30 Apr · H2 (Apr–Sep) by 31 Oct", penalty: "Up to ₹20,000, plus ₹1,000 a day while it continues (up to ₹3 lakh), for the company and each officer in default", applies: "When MSME vendors are unpaid for more than 45 days", ownerRole: "Company Secretary / Compliance Analyst", reviewerRole: "Compliance Manager", note: "MSME-1 variants merged." },
  { id: "ACT-015-AOC4", name: "AOC-4 (financial statements)", kind: "Statutory", frequency: "Yearly", module: "MCA / Corporate Compliance", area: "MCA", dueRule: "Within 30 days of the AGM", penalty: "₹100 a day until filed", applies: "Every company", ownerRole: "Company Secretary / Compliance Analyst", reviewerRole: "Compliance Manager / Director", note: "Split from the master's combined annual MCA row." },
  { id: "ACT-015-MGT7", name: "MGT-7 / MGT-7A (annual return)", kind: "Statutory", frequency: "Yearly", module: "MCA / Corporate Compliance", area: "MCA", dueRule: "Within 60 days of the AGM", penalty: "₹100 a day until filed", applies: "Every company (MGT-7A for small companies and OPCs)", ownerRole: "Company Secretary / Compliance Analyst", reviewerRole: "Compliance Manager / Director", note: "Split from the master's combined annual MCA row." },
  { id: "ACT-016", name: "Annual financial statements", kind: "Statutory", frequency: "Yearly", module: "Financial Reporting / Audit", area: "MCA", dueRule: "Before the AGM (by 30 Sep)", penalty: "", applies: "Every company", ownerRole: "Finance Analyst", reviewerRole: "Finance Manager / CFO / Auditor", note: "Financials and preparation of statements merged." },
  { id: "ACT-017", name: "FLA return", kind: "Statutory", frequency: "Yearly", module: "FEMA / RBI Reporting", area: "FEMA", dueRule: "15 Jul", penalty: "Up to 300% of the amount, or ₹2 lakh where not quantifiable; ₹5,000 a day while it continues", applies: "Entities with foreign assets or liabilities (unaudited figures)", ownerRole: "FEMA Compliance Analyst", reviewerRole: "Compliance Manager / Finance Head", note: "FLA variants merged." },
  { id: "ACT-018", name: "Income tax return", kind: "Statutory", frequency: "Yearly", module: "Direct Tax", area: "Income tax", dueRule: "31 Oct (audit cases) · 30 Nov (transfer pricing cases, ITR-5/6)", penalty: "₹1,000 if no income; 1% a month on late advance tax; 1.5% a month on the shortfall", applies: "Every company", ownerRole: "Tax Analyst", reviewerRole: "Tax / Finance Manager", note: "Capitalisation variants merged." },
  { id: "ACT-019", name: "Transfer pricing report (Form 3CEB)", kind: "Statutory", frequency: "Yearly", module: "Transfer Pricing", area: "Income tax", dueRule: "31 Oct", penalty: "2% of the value of international transactions or SDT", applies: "Entities with international or specified domestic transactions", ownerRole: "Transfer Pricing / Tax Analyst", reviewerRole: "Tax Manager / TP Reviewer", note: "TP report and TP filings merged; use subtasks." },
  { id: "ACT-020", name: "POSH quarterly committee meeting", kind: "Policy-based", frequency: "Quarterly", module: "HR / POSH", area: "Labour", dueRule: "Once a quarter, on a date the client sets", penalty: "", applies: "Organisations with 10 or more employees", ownerRole: "HR / POSH Coordinator", reviewerRole: "Presiding Officer / HR Head", note: "Meeting cadence from the source. Validate per entity." },
  { id: "ACT-021", name: "POSH annual return", kind: "Statutory", frequency: "Yearly", module: "HR / POSH", area: "Labour", dueRule: "Before 31 Jan", penalty: "₹50,000", applies: "Organisations with 10 or more employees", ownerRole: "HR / POSH Coordinator", reviewerRole: "Presiding Officer / HR Head", note: "Capitalisation variants merged." },
  { id: "ACT-022", name: "APR (annual performance report)", kind: "Configurable", frequency: "Yearly", module: "FEMA / Related-Party Reporting", area: "FEMA", dueRule: "30 Jun (as in the master)", penalty: "", applies: "Per entity", ownerRole: "Compliance Analyst", reviewerRole: "Compliance Manager", note: "The acronym is not expanded in the source.", confirm: "Confirm what APR means and when it applies (Developer requirement 19)." },
  { id: "ACT-024", name: "PF return (ECR)", kind: "Statutory", frequency: "Monthly", module: "Payroll / Labour", area: "Payroll", dueRule: "15th of the next month", penalty: "Damages: 5% a year for 0–2 months late, 10% for 2–4 months, 15% for 4–6 months", applies: "Entities with more than 20 employees", ownerRole: "Payroll Compliance Analyst", reviewerRole: "Payroll / Compliance Manager", note: "Kept separate from the PF payment." },
  { id: "ACT-025", name: "Professional tax return", kind: "Statutory", frequency: "Monthly", module: "Payroll / Labour", area: "Payroll", dueRule: "10th of the next month · yearly by 30 Apr", penalty: "1.5% a month", applies: "Every entity; limits vary by state", ownerRole: "Payroll Compliance Analyst", reviewerRole: "Payroll / Compliance Manager", note: "Frequency varies by state." },
  { id: "ACT-026", name: "Labour registers", kind: "Policy-based", frequency: "Monthly", module: "Labour Compliance", area: "Labour", dueRule: "30th of every month (internal)", penalty: "Varies by state", applies: "Every entity with employees", ownerRole: "HR / Compliance Analyst", reviewerRole: "HR / Compliance Manager", note: "Registers depend on the state and establishment." },
  { id: "ACT-027", name: "PF and PT payments", kind: "Statutory", frequency: "Monthly", module: "Payroll / Labour", area: "Payroll", dueRule: "PF 15th · PT 10th of the next month", penalty: "As for the PF and PT returns", applies: "As for the PF and PT returns", ownerRole: "Payroll Compliance Analyst", reviewerRole: "Payroll / Compliance Manager", note: "Combined payment task; subtasks where dates differ." },
  { id: "ACT-028", name: "PAS-6 (share capital reconciliation)", kind: "Statutory", frequency: "Half-yearly", module: "MCA / Share Capital", area: "MCA", dueRule: "Within 60 days of each half-year end (29 May, 29 Nov)", penalty: "", applies: "Unlisted public companies", ownerRole: "Company Secretary / Compliance Analyst", reviewerRole: "Compliance Manager", note: "The master says yearly.", confirm: "The master lists PAS-6 as yearly; the rule is half-yearly. The prototype uses half-yearly. Confirm applicability." },
  { id: "ACT-029", name: "Tax audit report", kind: "Statutory", frequency: "Yearly", module: "Direct Tax / Audit", area: "Income tax", dueRule: "31 Oct (TP cases)", penalty: "The lesser of 0.5% of turnover or ₹1,50,000", applies: "Companies where TP applies", ownerRole: "Tax Analyst / External Auditor", reviewerRole: "Tax Manager / CFO", note: "Annual." },
  { id: "ACT-030", name: "Audit and directors' report", kind: "Statutory", frequency: "Yearly", module: "Financial Reporting / MCA", area: "MCA", dueRule: "Before the AGM (by 30 Sep)", penalty: "", applies: "Every company", ownerRole: "Finance Analyst / Company Secretary", reviewerRole: "CFO / Director / Compliance Manager", note: "Use subtasks for audit, approval and signing." },
  // ---- Statutory, from the manual only ----
  { id: "ACT-M01", name: "ECB-2 return", kind: "Statutory", frequency: "Monthly", module: "FEMA / RBI Reporting", area: "FEMA", dueRule: "Within 7 working days after each month", penalty: "Depends on the consequence", applies: "Companies with loans from foreign lenders", ownerRole: "FEMA Compliance Analyst", reviewerRole: "Compliance Manager", note: "From the manual's monthly table.", from: "manual" },
  { id: "ACT-M02", name: "Softex form", kind: "Statutory", frequency: "Monthly", module: "FEMA / STPI", area: "FEMA", dueRule: "Within 30 days of the last invoice of the month", penalty: "The bank account can be frozen", applies: "Exporters of software", ownerRole: "Compliance Analyst", reviewerRole: "Compliance Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M03", name: "Master file intimation (Form 3CEAB)", kind: "Statutory", frequency: "Yearly", module: "Transfer Pricing", area: "Income tax", dueRule: "31 Oct", penalty: "₹5,00,000 for not furnishing", applies: "Constituent entities of an international group", ownerRole: "Transfer Pricing Analyst", reviewerRole: "Tax Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M04", name: "Master file (Form 3CEAA)", kind: "Statutory", frequency: "Yearly", module: "Transfer Pricing", area: "Income tax", dueRule: "30 Nov", penalty: "₹5,00,000 for not furnishing", applies: "Constituent entities above the threshold", ownerRole: "Transfer Pricing Analyst", reviewerRole: "Tax Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M05", name: "LUT renewal", kind: "Statutory", frequency: "Yearly", module: "GST / Tax", area: "GST", dueRule: "31 Mar, before the new financial year", penalty: "Tax is paid on exports and claimed as a refund later", applies: "Exporters", ownerRole: "GST Analyst", reviewerRole: "Tax Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M06", name: "IEC annual update", kind: "Statutory", frequency: "Yearly", module: "DGFT", area: "FEMA", dueRule: "30 Jun", penalty: "₹200", applies: "Importers and exporters", ownerRole: "Compliance Analyst", reviewerRole: "Compliance Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M07", name: "DPT-3 (return of deposits)", kind: "Statutory", frequency: "Yearly", module: "MCA / Corporate Compliance", area: "MCA", dueRule: "30 Jun", penalty: "2× the fee within 30 days, rising to 12× beyond 180 days", applies: "Every company", ownerRole: "Company Secretary", reviewerRole: "Compliance Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M08", name: "DIR-3 KYC", kind: "Statutory", frequency: "Every 3 years", module: "MCA / Corporate Compliance", area: "MCA", dueRule: "30 Sep, every 3 years", penalty: "₹5,000 to reactivate the DIN", applies: "Every director", ownerRole: "Company Secretary", reviewerRole: "Compliance Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M09", name: "Shops and Establishment renewal", kind: "Statutory", frequency: "Yearly", module: "Labour Compliance", area: "Labour", dueRule: "Before 1 Dec", penalty: "25% from 1 to 31 Dec; 50% after 31 Dec", applies: "Every establishment", ownerRole: "HR / Compliance Analyst", reviewerRole: "HR / Compliance Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M10", name: "Trade licence renewal", kind: "Statutory", frequency: "Yearly", module: "Municipal", area: "Labour", dueRule: "Before 31 Dec", penalty: "25% of the fee within 3 months; 50% after", applies: "Every entity; rules vary by state", ownerRole: "Legal / Compliance Analyst", reviewerRole: "Compliance Manager", note: "From the manual.", from: "manual" },
  { id: "ACT-M11", name: "Trademark renewal", kind: "Statutory", frequency: "Every 10 years", module: "IP", area: "MCA", dueRule: "Every 10 years from filing", penalty: "The mark lapses", applies: "Registered trademarks", ownerRole: "Legal / Secretarial", reviewerRole: "Compliance Manager", note: "From the manual.", from: "manual" },
  // ---- Non-statutory, from the master ----
  { id: "ACT-003", name: "Cash flow budget / funds request", kind: "Non-statutory", frequency: "Monthly", module: "Finance Planning", area: "Internal", dueRule: "Set per client (monthly or quarterly)", penalty: "", applies: "Per client", ownerRole: "Finance Analyst", reviewerRole: "Finance Manager / CFO", note: "Monthly and quarterly variants; set frequency per client.", visibility: "both" },
  { id: "ACT-004", name: "Accounting entries and month-end adjustments", kind: "Non-statutory", frequency: "Monthly", module: "Accounting / Month-end close", area: "Internal", dueRule: "Month-end, set per client", penalty: "", applies: "Per client", ownerRole: "Accountant / Finance Analyst", reviewerRole: "Finance Manager", note: "Checklist: vendors, payroll, sales, expenses, salaries, closure, reimbursements, TDS receivables." },
  { id: "ACT-005", name: "Books closure and cost-plus workings", kind: "Non-statutory", frequency: "Monthly", module: "Accounting / Intercompany", area: "Internal", dueRule: "Month-end, set per client", penalty: "", applies: "Per client", ownerRole: "Finance Analyst", reviewerRole: "Finance / Tax Manager", note: "Keep separate checklist items." },
  { id: "ACT-006", name: "Payroll inputs, validation and manual workings", kind: "Non-statutory", frequency: "Monthly", module: "Payroll", area: "Internal", dueRule: "Depends on the payroll date", penalty: "", applies: "Per client", ownerRole: "Payroll Analyst / HR Ops", reviewerRole: "Payroll / Finance Manager", note: "All payroll input variants merged.", visibility: "both" },
  { id: "ACT-007", name: "Insurance and depreciation workings", kind: "Non-statutory", frequency: "Monthly", module: "Fixed assets / Insurance", area: "Internal", dueRule: "Month-end, set per client", penalty: "", applies: "Per client", ownerRole: "Finance Analyst", reviewerRole: "Finance Manager", note: "Confirm the client's frequency." },
  { id: "ACT-008", name: "Vendor payments and reimbursements", kind: "Non-statutory", frequency: "Weekly", module: "Accounts payable", area: "Internal", dueRule: "Weekly, bi-weekly or monthly, set per client", penalty: "", applies: "Per client", ownerRole: "Accounts Payable Analyst", reviewerRole: "Finance Manager / Approver", note: "Frequency configurable per entity.", visibility: "both" },
  { id: "ACT-009", name: "EDF and MPR reporting", kind: "Non-statutory", frequency: "Monthly", module: "Management reporting", area: "Internal", dueRule: "Set per client", penalty: "", applies: "Per client", ownerRole: "Finance Analyst", reviewerRole: "Finance Manager / CFO", note: "EDF&MPR variants merged.", visibility: "both", confirm: "Confirm what EDF and MPR stand for (Developer requirement 19)." },
  { id: "ACT-010", name: "Weekly client call and PPT", kind: "Non-statutory", frequency: "Weekly", module: "Client reporting", area: "Internal", dueRule: "Every Monday", penalty: "", applies: "Per client", ownerRole: "Analyst / Account Manager", reviewerRole: "Manager", note: "Weekly call and deck.", visibility: "both" },
  { id: "ACT-031", name: "Receivables update", kind: "Non-statutory", frequency: "Weekly", module: "Accounts receivable", area: "Internal", dueRule: "Every Monday", penalty: "", applies: "Per client", ownerRole: "Accounts Receivable Analyst", reviewerRole: "Finance Manager", note: "Weekly receivables tracking.", visibility: "both" },
  { id: "ACT-013", name: "One-time activity", kind: "Configurable", frequency: "One-time", module: "General task management", area: "Internal", dueRule: "Set when created", penalty: "", applies: "Per client", ownerRole: "Task creator / owner", reviewerRole: "Assigned reviewer / Manager", note: "Generic bucket. Prefer a named activity with its own owner, due date and checklist." },
];

/** Statutory and Policy-based count as statutory; Non-statutory and Configurable as non-statutory. */
function groupOfKind(kind: ActivityKind): ActivityGroup {
  return kind === 'Statutory' || kind === 'Policy-based' ? 'statutory' : 'non-statutory';
}

/** The 43 activities in master order. */
export const ACTIVITY_SEED: ActivitySeed[] = ROWS.map((r) => ({
  ...r,
  group: groupOfKind(r.kind),
  notifyDays: r.notifyDays ?? NOTIFY_DAYS_BY_FREQUENCY[r.frequency],
  visibility: r.visibility ?? (groupOfKind(r.kind) === 'statutory' ? 'both' : 'firm'),
  from: r.from ?? 'master',
}));

/**
 * The register's obligations (`src/lib/compliance/obligations-seed.ts`) linked to their activity.
 * An obligation without an entry has no row in the master (GSTR-9, LLP Form 11 and LLP Form 8); its
 * detail page falls back to the obligation's own rule text. Form 16 is the TDS certificate of the
 * 24Q return, so it sits under ACT-012 as the prototype's `tds-24q` row does.
 */
export const OBLIGATION_ACTIVITY: Record<string, string> = {
  'it-advance-tax-q1': 'ACT-011',
  'it-advance-tax-q2': 'ACT-011',
  'it-advance-tax-q3': 'ACT-011',
  'it-advance-tax-q4': 'ACT-011',
  'it-tds-payment': 'ACT-002',
  'it-tds-return-q1': 'ACT-012',
  'it-tds-return-q2': 'ACT-012',
  'it-tds-return-q3': 'ACT-012',
  'it-tds-return-q4': 'ACT-012',
  'it-itr': 'ACT-018',
  'it-form-16': 'ACT-012',
  'gst-gstr-1': 'ACT-001-1',
  'gst-gstr-3b': 'ACT-001-3B',
  'mca-dir3-kyc': 'ACT-M08',
  'mca-dpt-3': 'ACT-M07',
  'mca-msme-1-apr': 'ACT-014',
  'mca-msme-1-oct': 'ACT-014',
  'mca-aoc-4': 'ACT-015-AOC4',
  'mca-mgt-7': 'ACT-015-MGT7',
  'llp-partner-kyc': 'ACT-M08',
  'labour-pf-payment': 'ACT-024',
  'labour-esi-return': 'ACT-027',
  'fema-fla': 'ACT-017',
};
