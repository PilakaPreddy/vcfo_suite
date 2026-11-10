/**
 * Request list templates (docs/specs/automation/IDEAS-PLAN.md, wave 2, section A). Pure data: a
 * template is the list of things the firm usually needs from a client for one kind of period. A
 * staff member creates a draft list from one, edits it, and sends it through a review card.
 *
 *  - document      the client uploads a file (a document request is created when the list is sent);
 *  - answer        the client types a short answer;
 *  - confirmation  the client confirms a statement with one click (or explains why not).
 */

export const REQUEST_ITEM_KINDS = ['document', 'answer', 'confirmation'] as const;
export type RequestItemKind = (typeof REQUEST_ITEM_KINDS)[number];

export interface RequestTemplateItem {
  kind: RequestItemKind;
  label: string;
  help?: string;
}

export interface RequestTemplate {
  id: string;
  title: string;
  /** One line for the picker. */
  summary: string;
  /** How the period label is usually written, for the create form's placeholder. */
  periodHint: string;
  /** Days between reminders. */
  cadenceDays: number;
  /** Days after creation that the list is usually due, used when no due date is given. */
  dueInDays: number;
  items: RequestTemplateItem[];
}

export const REQUEST_TEMPLATES: readonly RequestTemplate[] = [
  {
    id: 'gst-monthly',
    title: 'GST monthly data',
    summary: 'Sales, purchases and credit notes for GSTR-1 and GSTR-3B.',
    periodHint: 'Oct 2026',
    cadenceDays: 2,
    dueInDays: 7,
    items: [
      { kind: 'document', label: 'Sales register (all invoices issued in the month)', help: 'Excel export from Tally, Zoho Books or your billing software.' },
      { kind: 'document', label: 'Purchase register with supplier GSTINs', help: 'Include invoice number, date, taxable value and tax for each bill.' },
      { kind: 'document', label: 'Credit and debit notes issued or received', help: 'Upload a blank sheet with "none" if there were none.' },
      { kind: 'document', label: 'E-way bills generated in the month' },
      { kind: 'answer', label: 'Any advance received against supplies not yet invoiced? Amount and customer.', help: 'Advances attract GST on receipt for services.' },
      { kind: 'answer', label: 'Any purchases under reverse charge (legal fees, GTA, imports of services)?' },
      { kind: 'confirmation', label: 'All supplier invoices for the month are reflected in GSTR-2B or have been flagged to us.' },
    ],
  },
  {
    id: 'tds-quarterly',
    title: 'TDS quarterly return data',
    summary: 'Deductions, challans and PANs for Form 24Q and 26Q.',
    periodHint: 'Q2 FY 2026-27',
    cadenceDays: 3,
    dueInDays: 10,
    items: [
      { kind: 'document', label: 'Salary register for the quarter (24Q)', help: 'Employee PAN, gross salary, TDS deducted per month.' },
      { kind: 'document', label: 'Vendor payment ledger with TDS sections (26Q)', help: 'Sections 194C, 194J, 194I, 194H and 194Q as applicable.' },
      { kind: 'document', label: 'TDS challans (ITNS 281) paid for the quarter' },
      { kind: 'document', label: 'Lower deduction certificates received from vendors, if any' },
      { kind: 'answer', label: 'New deductees this quarter without a PAN on file (names)', help: 'TDS at 20% applies without a valid PAN.' },
      { kind: 'confirmation', label: 'All TDS deducted in the quarter has been deposited by the 7th of the following month.' },
    ],
  },
  {
    id: 'roc-annual',
    title: 'ROC annual filing',
    summary: 'Board report, financial statements and shareholding for AOC-4 and MGT-7.',
    periodHint: 'FY 2025-26',
    cadenceDays: 4,
    dueInDays: 21,
    items: [
      { kind: 'document', label: 'Signed audited financial statements with the auditor’s report' },
      { kind: 'document', label: 'Signed Board’s report and annexures' },
      { kind: 'document', label: 'Shareholding pattern as on 31 March', help: 'List of shareholders with number of shares and folio.' },
      { kind: 'document', label: 'Minutes of the AGM and the attendance register' },
      { kind: 'answer', label: 'Date the AGM was held (or is planned)' },
      { kind: 'answer', label: 'Any change in directors or key managerial personnel during the year?' },
      { kind: 'confirmation', label: 'Every director has completed DIR-3 KYC for this year.' },
      { kind: 'confirmation', label: 'No deposits were accepted from the public during the year.' },
    ],
  },
  {
    id: 'audit-pbc',
    title: 'Statutory audit PBC list',
    summary: 'Prepared-by-client schedules the auditor needs to start fieldwork.',
    periodHint: 'FY 2025-26',
    cadenceDays: 3,
    dueInDays: 14,
    items: [
      { kind: 'document', label: 'Trial balance as on 31 March (final, after closing entries)' },
      { kind: 'document', label: 'Bank statements for every account for the full year' },
      { kind: 'document', label: 'Bank reconciliation statements as on 31 March' },
      { kind: 'document', label: 'Fixed asset register with additions and disposals', help: 'Include invoices for additions above ₹1 lakh.' },
      { kind: 'document', label: 'Ageing of trade receivables and trade payables', help: 'Split MSME payables separately for Schedule III.' },
      { kind: 'document', label: 'Loan agreements and sanction letters' },
      { kind: 'document', label: 'Form 26AS and AIS for the year' },
      { kind: 'answer', label: 'Inventory valuation method and the date of the physical count' },
      { kind: 'answer', label: 'Related party transactions during the year (party, nature, amount)' },
      { kind: 'confirmation', label: 'There are no pending litigations or contingent liabilities other than those disclosed to us.' },
    ],
  },
  {
    id: 'incorporation-docs',
    title: 'Incorporation documents',
    summary: 'Identity, address and office proofs for SPICe+.',
    periodHint: 'Incorporation',
    cadenceDays: 2,
    dueInDays: 5,
    items: [
      { kind: 'document', label: 'PAN card of every director and subscriber' },
      { kind: 'document', label: 'Aadhaar, passport or voter ID of every director and subscriber' },
      { kind: 'document', label: 'Latest bank statement or utility bill of every director (not older than two months)' },
      { kind: 'document', label: 'Passport-size photograph of every director' },
      { kind: 'document', label: 'Utility bill for the registered office (not older than two months)' },
      { kind: 'document', label: 'Rent agreement or ownership proof for the registered office' },
      { kind: 'document', label: 'No-objection certificate from the owner of the registered office' },
      { kind: 'answer', label: 'Two or three proposed company names in order of preference' },
      { kind: 'answer', label: 'Main business activity in one or two lines' },
      { kind: 'confirmation', label: 'Every director has a mobile number and email they can receive OTPs on.' },
    ],
  },
];

export function getRequestTemplate(id: string): RequestTemplate | null {
  return REQUEST_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** The title a new list from this template gets: "GST monthly data · Oct 2026". */
export function templateListTitle(template: RequestTemplate, periodLabel?: string | null): string {
  const period = periodLabel?.trim();
  return period ? `${template.title} · ${period}` : template.title;
}
