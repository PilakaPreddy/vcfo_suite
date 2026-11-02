import { formatTimeline, type DeadlineRule } from '@/lib/projects/deadlines';

export type Bucket = 'pre-inc' | 'post-inc' | 'fema' | 'statutory';
export type StatusCode =
  | 'not-started'
  | 'in-progress'
  | 'awaiting-client'
  | 'completed'
  | 'overdue'
  | 'not-applicable';

const STATUS_CODES: StatusCode[] = [
  'not-started',
  'in-progress',
  'awaiting-client',
  'completed',
  'overdue',
  'not-applicable',
];

function isStatusCode(value: string): value is StatusCode {
  return (STATUS_CODES as readonly string[]).includes(value);
}

/** Coerce legacy / invalid jsonb status strings before UI or persistence. */
export function coerceStatusCode(value: string | undefined | null): StatusCode {
  const trimmed = value?.trim();
  return trimmed && isStatusCode(trimmed) ? trimmed : 'not-started';
}

export const STATUS_LABEL: Record<StatusCode, string> = {
  'not-started': 'Not Started',
  'in-progress': 'In Progress',
  'awaiting-client': 'Awaiting Client',
  completed: 'Completed',
  overdue: 'Overdue',
  'not-applicable': 'Not Applicable',
};

export const BUCKET_LABEL: Record<Bucket, string> = {
  'pre-inc': 'Pre-Incorporation',
  'post-inc': 'Post-Incorporation',
  fema: 'FEMA',
  statutory: 'Registration',
};

/**
 * `segmented` = a `select` rendered as the app's option pills (SegmentedPicker).
 * `repeat` = an add/remove list of entries; `entryFields` is the per-entry
 * template (ids relative to the entry), stored as
 * `responses[id] = "entryId,entryId"` + `responses[`${id}.${entryId}.${fieldId}`]`.
 * See `src/lib/checklist/checklist-repeat.ts`.
 */
type ChecklistFieldType = 'text' | 'textarea' | 'select' | 'file' | 'date' | 'segmented' | 'repeat';

/** Who owns completing this milestone (shown in UI). */
export type ChecklistResponsibleRole = 'client' | 'intern';

interface ChecklistFieldOption {
  value: string;
  label: string;
}

export interface ChecklistField {
  id: string;
  label: string;
  type: ChecklistFieldType;
  placeholder?: string;
  /** Groups fields under a section heading (e.g. pre-1 client form) */
  section?: string;
  helperText?: string;
  validationHint?: string;
  maxWords?: number;
  options?: ChecklistFieldOption[];
  /** File input accept attribute */
  accept?: string;
  required?: boolean;
  /**
   * Show this field only when another field equals a value (e.g. pre-1
   * conditional fields). `anyOf` widens the match to several values (a
   * director slot that shows for "3" or "4" directors).
   */
  showWhen?: { field: string; value: string; anyOf?: string[] };
  /** Relabel by a sibling's value — one field, two names (e.g. a subscriber's name by type). */
  labelWhen?: Array<{ field: string; value: string; label: string }>;
  /** Who fills this field; defaults to the step's responsibleRole */
  filledBy?: ChecklistResponsibleRole;
  /** Desktop density: short fields pair in a 2-col grid. Omit to infer from type. */
  layout?: 'short' | 'full';
  /** `repeat` only — the per-entry template; ids are relative to the entry. */
  entryFields?: ChecklistField[];
  /** `repeat` only — noun for one entry ("Director"), used in headings and the add button. */
  entryLabel?: string;
  /** `repeat` only — copy shown when the list is empty and empty is allowed. */
  emptyLabel?: string;
  /** `repeat` only — fewest entries the step accepts (0 = the list may be empty). */
  minEntries?: number;
  /** `repeat` only — most entries the step accepts. */
  maxEntries?: number;
}

export interface ChecklistItem {
  id: string;
  /** URL segment for admin step routes */
  slug: string;
  bucket: Bucket;
  order: number;
  title: string;
  forms: string[];
  infoRequired: string[];
  deadline: DeadlineRule;
  urgent?: boolean;
  /** Static guidance for admins; not client-submitted */
  notes?: string;
  /** Optional structured client inputs (see CLIENT_RESPONSE_FIELDS in checklist-responses.ts) */
  fields?: ChecklistField[];
  /** Primary owner for this step (Client / Intern VCFO) */
  responsibleRole?: ChecklistResponsibleRole;
  /** Short workflow description for step detail UI */
  description?: string;
  /** Per-step SLA from the incorporation playbook (working days unless noted). */
  expectedTimeline?: string;
}

/** Human-readable timeline for a step — playbook SLA when set, else statutory deadline rule. */
export function getChecklistStepTimelineLabel(item: ChecklistItem): string {
  return item.expectedTimeline ?? formatTimeline(item.deadline);
}

/** Playbook SLA duration copy intern UI must not show. */
export function copyMentionsWorkingDaysSla(text: string): boolean {
  return /\bworking days?\b/i.test(text);
}

export interface ChecklistPhaseGroup {
  id: string;
  title: string;
  subtitle?: string;
  itemIds: string[];
}

// ---------- PRE-INCORPORATION (6) ----------
const preInc: ChecklistItem[] = [
  {
    id: 'pre-1',
    slug: 'name-application',
    bucket: 'pre-inc',
    order: 1,
    title: 'Client Details',
    responsibleRole: 'client',
    description:
      'Client provides the business description, two proposed names, foreign entity details, proposed directors, proposed share capital and the person signing the board resolution. The project lead adds the NIC codes.',
    forms: ['RUN', 'Spice Part A'],
    infoRequired: [
      'Business Description — up to 100 words',
      'Proposed Company Names — 2 names ending "India Private Limited"',
      'Foreign Entity Details — Name, Address, Country and State of incorporation; Certificate of Incorporation (attachment)',
      'Proposed Directors — 2/3/4; First name + Last name (+ optional middle), Gender and India residency each; at least one India resident',
      'Proposed Share Capital Structure — Authorized and Initial Paid-up (INR), nominal value per equity share (e.g. 10,00,000 / 1,00,000 / INR 10)',
      'Person Signing the Board Resolution — Name, Designation; KYC of the person signing (attachment)',
      'NIC Codes — filled by the project lead',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [1, 2] },
    expectedTimeline: '2–3 working days',
    notes: 'Client completes this form before the project lead drafts the board resolution.',
  },
  {
    id: 'pre-2',
    slug: 'board-resolution-draft',
    bucket: 'pre-inc',
    order: 2,
    title: 'Draft Board Resolution',
    responsibleRole: 'intern',
    description:
      'Project lead receives the draft board resolution from the tool, reviews it, and shares the finalized draft with the client.',
    forms: ['Board Resolution'],
    infoRequired: [
      'Draft board resolution generated from Pre-1 client data',
      'Project lead review and edits in the board resolution editor',
      'Finalize and release draft to the client portal',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [1, 2] },
    expectedTimeline: '1–2 working days',
    notes: 'Open the board resolution editor from this step after Pre-1 is submitted.',
  },
  {
    id: 'pre-3',
    slug: 'board-resolution-execution',
    bucket: 'pre-inc',
    order: 3,
    title: 'Signed Board Resolution',
    responsibleRole: 'client',
    description:
      'Client signs the board resolution on letterhead and uploads the signed copy for the project lead.',
    forms: ['Signed Board Resolution'],
    infoRequired: [
      'Download finalized board resolution from the client portal',
      'Sign on company letterhead',
      'Upload signed copy for the engagement team',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [2, 3] },
    expectedTimeline: '3–4 working days',
  },
  {
    id: 'pre-4',
    slug: 'name-application-filing',
    bucket: 'pre-inc',
    order: 4,
    title: 'Name Application',
    responsibleRole: 'intern',
    description:
      'Project lead reviews the signed board resolution, files the name application with ROC, and shares the filing acknowledgement with the client.',
    forms: [],
    infoRequired: [],
    deadline: { kind: 'estimated-weeks', weeks: [2, 3] },
    expectedTimeline: '1–2 working days',
  },
  {
    id: 'pre-5',
    slug: 'mca-name-approval',
    bucket: 'pre-inc',
    order: 5,
    title: 'Name Approval',
    responsibleRole: 'intern',
    description:
      'Within 4 to 5 working days, project lead delivers the approved name, approval date, expiry date (20-day validity), and MCA approval letter to the client.',
    forms: [],
    infoRequired: [],
    deadline: { kind: 'estimated-weeks', weeks: [4, 5] },
    expectedTimeline: '5–7 working days',
    notes:
      'MCA name approval typically arrives within 4 to 5 working days from the date of filing. Your Project Lead will share the approved name and approval letter here.',
  },
  {
    // LEGACY (removed from SPICe+ Part B 2026-09-16 — director KYC now lives on
    // each entry of `pre-15` Proposed directors, the registered office on
    // `pre-14`). Kept in the catalog, like `reg-2`, so saved responses, vault
    // labels and audit rows for older engagements still resolve. Not in any
    // phase's `itemIds`, so it never renders or gates.
    id: 'pre-6',
    slug: 'director-kyc-details',
    bucket: 'pre-inc',
    order: 6,
    title: 'Director KYC',
    responsibleRole: 'client',
    description:
      'Client submits KYC details for non-resident and resident directors, plus shareholder nominees for Spice Part B and INC-35 Agile-Pro-S.',
    forms: ['Spice Part B', 'INC-35 Agile-Pro-S'],
    infoRequired: [
      'Non-Resident Director Details',
      'Resident Director Details',
      'Shareholder Details',
      'Registered Office Details',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [5, 6] },
    expectedTimeline: '4–5 working days',
    notes:
      'Collect complete KYC details and supporting files before filing incorporation forms. Send email to each director for DSC creation time slots when they do not have a valid DSC token.',
  },
  {
    id: 'pre-13',
    slug: 'capital-structure',
    bucket: 'pre-inc',
    order: 13,
    title: 'Capital Structure',
    responsibleRole: 'client',
    description:
      'Share classes the company issues at incorporation — equity and/or preference — with the number of shares and the nominal value per share. The total for each class is worked out for you.',
    forms: ['Spice Part B'],
    infoRequired: ['Share classes', 'Number of shares', 'Nominal value per share'],
    deadline: { kind: 'estimated-weeks', weeks: [5, 6] },
    expectedTimeline: '1 working day',
  },
  {
    id: 'pre-14',
    slug: 'registered-office-address',
    bucket: 'pre-inc',
    order: 14,
    title: 'Registered Office Address',
    responsibleRole: 'client',
    description:
      'The proposed registered office, with the owner’s NOC and a utility bill as proof of address (INC-22 / AGILE-PRO-S). Pre-filled from project setup where that address is already known; correct it here if it changed.',
    forms: ['Spice Part B', 'INC-22'],
    infoRequired: ['Registered office address', 'NOC from owner', 'Utility bill'],
    deadline: { kind: 'estimated-weeks', weeks: [5, 6] },
    expectedTimeline: '1 working day',
  },
  {
    id: 'pre-15',
    slug: 'proposed-directors',
    bucket: 'pre-inc',
    order: 15,
    title: 'Proposed Directors',
    responsibleRole: 'client',
    description:
      'One entry per proposed director: name, residency, DIN and DSC status, plus the KYC the incorporation forms need (identity, address, contact, photograph).',
    forms: ['Spice Part B', 'DIR-2', 'DIR-8', 'INC-9'],
    infoRequired: ['Director details', 'Director KYC documents'],
    deadline: { kind: 'estimated-weeks', weeks: [5, 6] },
    expectedTimeline: '4–5 working days',
  },
  {
    id: 'pre-16',
    slug: 'subscriber-details',
    bucket: 'pre-inc',
    order: 16,
    title: 'Subscriber Details',
    responsibleRole: 'client',
    description:
      'Every subscriber to the memorandum — proposed directors who subscribe, other individuals, bodies corporate or LLPs — with the shares each takes. A group company whose parent is the only subscriber can submit with none.',
    forms: ['Spice Part B', 'INC-33', 'INC-34', 'INC-35'],
    infoRequired: ['Subscribers and shares', 'INC-35 nominee'],
    deadline: { kind: 'estimated-weeks', weeks: [5, 6] },
    expectedTimeline: '1 working day',
  },
  {
    id: 'pre-7',
    slug: 'kyc-review-and-dsc-creation',
    bucket: 'pre-inc',
    order: 7,
    title: 'KYC Review & DSC',
    responsibleRole: 'intern',
    description:
      'Intern reviews submitted KYC data and initiates DSC with eMudhra. The incorporation documents are generated on the document pack page.',
    forms: ['DSC workflow'],
    infoRequired: [
      'KYC review notes and correction requests (if any)',
      'DSC success proof for each director (attachment)',
      'Signing date and place, and the subscription-sheet witness',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [6, 7] },
    expectedTimeline: '2–3 working days',
  },
  {
    // LEGACY (removed from SPICe+ Part B 2026-09-26). Kept in the catalog, like
    // `pre-6`, so signed uploads, vault labels and audit rows on older
    // engagements still resolve. Not in any phase's `itemIds`, so it never
    // renders or gates.
    id: 'pre-8',
    slug: 'execution-of-incorporation-documents',
    bucket: 'pre-inc',
    order: 8,
    title: 'Document Execution',
    responsibleRole: 'client',
    description:
      'Client uploads apostilled/notarized and signed incorporation documents for directors and foreign entity records.',
    forms: ['Executed DIR-2', 'Executed DIR-8', 'Executed INC-9', 'INC-33', 'INC-34', 'INC-35'],
    infoRequired: [
      'Signed/apostilled KYC and incorporation documents for each director',
      'Signed certificate and authorisation set from foreign entity',
      'Signed board resolution, INC-33 MOA subscription sheet, INC-34 AOA subscription sheet, INC-35 AGILE-PRO-S',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [7, 9] },
    expectedTimeline: '7–10 working days',
  },
  {
    id: 'pre-9',
    slug: 'spice-part-b-confirmation',
    bucket: 'pre-inc',
    order: 9,
    title: 'SPICe+ Confirmation',
    responsibleRole: 'client',
    description:
      'Client reviews the shared SPICe+ Part B application, recommends changes if required, and confirms for filing.',
    forms: ['SPICe+ Part B'],
    infoRequired: [
      'Review of shared SPICe+ Part B application',
      'Confirmation or recommended changes',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [9, 10] },
    expectedTimeline: '2–3 working days',
    notes:
      'Project Lead reviews executed documents and shares draft SPICe+ Part B and AGILE-PRO-S (typically 3–4 working days) before client confirmation here.',
  },
  {
    id: 'pre-10',
    slug: 'incorporation-filing',
    bucket: 'pre-inc',
    order: 10,
    title: 'SPICe+ Filing',
    responsibleRole: 'intern',
    description:
      'Project lead fills and submits SPICe+ Part B and AGILE-PRO-S forms on the MCA portal.',
    forms: ['SPICe+ Part B', 'AGILE-PRO-S'],
    infoRequired: ['SPICe+ Part B and AGILE-PRO-S filed on MCA portal'],
    deadline: { kind: 'estimated-weeks', weeks: [10, 11] },
    expectedTimeline: '1–2 working days',
    notes: 'Filing typically completed within 1–2 working days after client confirmation.',
  },
  {
    id: 'pre-11',
    slug: 'mca-remarks-resubmissions',
    bucket: 'pre-inc',
    order: 11,
    title: 'MCA Remarks',
    responsibleRole: 'intern',
    description:
      'Project lead reviews MCA portal remarks, requests client information or documents if needed, and resubmits with a clarification letter.',
    forms: ['Clarification Letter'],
    infoRequired: [
      'MCA remarks summary',
      'Client information or documents requested (if any)',
      'Clarification letter (attachment)',
      'Resubmission notes',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [11, 12] },
    expectedTimeline: '5–7 working days',
    notes:
      'Remarks review and resubmission typically take 5–7 working days. Handled by Manager and Project Lead; client may track MCA portal review separately.',
  },
  {
    id: 'pre-12',
    slug: 'certificate-of-incorporation-sharing',
    bucket: 'pre-inc',
    order: 12,
    title: 'Certificate of Incorporation',
    responsibleRole: 'intern',
    description:
      'Project lead shares MCA-approved company identifiers and incorporation documents with the client.',
    forms: ['Certificate of Incorporation'],
    infoRequired: [
      'Company name, date of incorporation, Corporate Identification Number (CIN), Permanent Account Number (PAN), Tax Deduction and Collection Account Number (TAN), Provident Fund Establishment Code (PF), Employees\' State Insurance Code (ESI)',
      'Certificate of Incorporation signature verified by MCA (Yes/No), Certificate of Incorporation, Permanent Account Number (PAN) card, and Tax Deduction and Collection Account Number (TAN) card (attachments)',
    ],
    deadline: { kind: 'estimated-weeks', weeks: [12, 14] },
    expectedTimeline: '14–15 working days from filing (Phase 2 Step 6)',
    notes:
      'MCA approval and certificate delivery typically take 14–15 working days from filing (Phase 2 Step 6). Send email to the client when the certificate package is ready.',
  },
];

const PRE_INC_PHASES: ChecklistPhaseGroup[] = [
  {
    id: 'pre-inc-phase-1',
    title: 'Phase 1 — Name Application',
    subtitle: 'Steps 1-5',
    itemIds: ['pre-1', 'pre-2', 'pre-3', 'pre-4', 'pre-5'],
  },
  {
    id: 'pre-inc-phase-2',
    title: 'Phase 2 — Incorporation',
    subtitle: 'Steps 1–6',
    itemIds: ['pre-13', 'pre-14', 'pre-15', 'pre-16', 'pre-7', 'pre-9', 'pre-10', 'pre-11', 'pre-12'],
  },
];

// ---------- POST-INCORPORATION — Phase 3 (11) — sheet order ----------
const postInc: ChecklistItem[] = [
  {
    id: 'post-1',
    slug: 'first-board-meeting',
    bucket: 'post-inc',
    order: 1,
    title: 'First Board Meeting',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['Agenda of the meeting', 'Minutes', 'Resolutions'],
    deadline: { kind: 'days-from-incorporation', days: 30 },
  },
  {
    id: 'post-9',
    slug: 'letterhead-preparation',
    bucket: 'post-inc',
    order: 2,
    title: 'Company Letterhead',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'Company letterhead with name, CIN, registered office address, email, phone',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
    notes:
      'Statutory letterhead must include company name, CIN, registered office address, email, and phone.',
  },
  {
    id: 'post-3',
    slug: 'bank-account-opening-hdfc',
    bucket: 'post-inc',
    order: 3,
    title: 'Bank Account Opening',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'Self-attested COI, PAN, rental deed',
      'Board resolution for bank account opening',
      'KYC of authorised signatories',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'post-4',
    slug: 'share-capital-infusion',
    bucket: 'post-inc',
    order: 4,
    title: 'Share Capital Infusion',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['Bank statement showing capital infused from shareholders'],
    deadline: { kind: 'days-from-incorporation', days: 180 },
    notes: 'Send email to the Director when share capital infusion is ready to proceed.',
  },
  {
    id: 'post-5',
    slug: 'share-certificates-sh-1',
    bucket: 'post-inc',
    order: 5,
    title: 'Share Certificates (SH-1)',
    responsibleRole: 'intern',
    forms: ['SH-1'],
    infoRequired: ['Details of the allottees'],
    deadline: { kind: 'days-from-incorporation', days: 60 },
  },
  {
    id: 'post-6',
    slug: 'commencement-of-business-inc-20a',
    bucket: 'post-inc',
    order: 6,
    title: 'Commencement (INC-20A)',
    responsibleRole: 'intern',
    forms: ['INC-20A'],
    infoRequired: ['Declaration of commencement of business', 'Bank statement evidence'],
    deadline: { kind: 'days-from-incorporation', days: 180 },
  },
  {
    id: 'post-2',
    slug: 'auditor-appointment-adt-1',
    bucket: 'post-inc',
    order: 7,
    title: 'Auditor Appointment (ADT-1)',
    responsibleRole: 'intern',
    forms: ['ADT-1'],
    infoRequired: [
      'Board Resolution for auditor appointment',
      'Offer letter to auditor',
      'Eligibility & consent letters from auditor',
      'Intimation of first-auditor appointment',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
  },
  {
    id: 'post-7',
    slug: 'fcgpr-filing-rbi',
    bucket: 'post-inc',
    order: 8,
    title: 'FC-GPR Filing',
    responsibleRole: 'intern',
    forms: ['FCGPR'],
    infoRequired: [
      'Foreign inward remittance details',
      'FIRC copies',
      'FIRMS portal registration',
      'Foreign investor details (name, address, country, constitution)',
      'Remittance: AD bank, mode of payment, date, amount, FIRC #',
      'Board Resolution for allotment + list of allottees',
      'Share certificates',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
    notes: 'File FC-GPR with RBI within 30 days of issue of shares (FDI cases).',
  },
  {
    id: 'post-8',
    slug: 'nominee-shareholder-mgt-4-5-6',
    bucket: 'post-inc',
    order: 9,
    title: 'Nominee Shareholder (MGT-4/5/6)',
    responsibleRole: 'intern',
    forms: ['MGT-4', 'MGT-5', 'MGT-6'],
    infoRequired: [
      'Nominee shareholder declaration',
      'Beneficial owner details',
      'ROC filing acknowledgements',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
  },
  {
    id: 'post-11',
    slug: 'change-registered-office-inc-22',
    bucket: 'post-inc',
    order: 10,
    title: 'Registered Office (INC-22)',
    responsibleRole: 'intern',
    forms: ['INC-22'],
    infoRequired: [
      'Updated registered office address',
      'Proof of address',
      'Proof of occupancy',
      'Board resolution for change of registered office (if applicable)',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
    notes:
      'File INC-22 with ROC within 30 days of any change in the registered office address.',
  },
  {
    id: 'post-10',
    slug: 'display-name-board-registered-office',
    bucket: 'post-inc',
    order: 11,
    title: 'Name Board',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'Name board with company name, CIN, registered office address',
      'Photo evidence of display at registered office',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
  },
];

const POST_INC_PHASES: ChecklistPhaseGroup[] = [
  {
    id: 'post-inc-phase-3',
    title: 'Phase 3 — Post-Incorporation',
    subtitle: 'Steps 1–11',
    itemIds: [
      'post-1',
      'post-9',
      'post-3',
      'post-4',
      'post-5',
      'post-6',
      'post-2',
      'post-7',
      'post-8',
      'post-11',
      'post-10',
    ],
  },
];

// ---------- REGISTRATION — Phase 4 (23 active; reg-2 legacy-only) ----------
const KYC_CORE = [
  'Self-attested COI',
  'PAN',
  'Board Resolution',
  'Authorisation Letter',
  'MOA',
  'AOA',
  'Rental Deed',
  'Bank Details',
  "Directors' KYC",
];

const registration: ChecklistItem[] = [
  {
    id: 'reg-1',
    slug: 'pf-dsc-esign-registration',
    bucket: 'statutory',
    order: 2,
    title: 'PF Registration',
    responsibleRole: 'intern',
    forms: ['PF registration'],
    infoRequired: [...KYC_CORE, 'List of employees', 'Active DSC / e-sign credentials'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-2',
    slug: 'pan-and-tan',
    bucket: 'statutory',
    order: 98,
    title: 'PAN and TAN',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['PAN card', 'TAN allotment letter / certificate'],
    deadline: { kind: 'days-from-incorporation', days: 30 },
    notes:
      'Covered under Pre-Incorporation delivery (pre-12). Kept for legacy checklist_state only — not shown on the registration phase.',
  },
  {
    id: 'reg-3',
    slug: 'esi-registration',
    bucket: 'statutory',
    order: 3,
    title: 'ESI Registration',
    responsibleRole: 'intern',
    forms: ['ESI registration'],
    infoRequired: [...KYC_CORE, 'List of employees'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-4',
    slug: 'gst-registration',
    bucket: 'statutory',
    order: 1,
    title: 'GST Registration',
    responsibleRole: 'intern',
    forms: ['GST REG-01', 'GST RFD-11'],
    infoRequired: [
      ...KYC_CORE,
      'List of services / goods traded',
      'Rental agreement',
      'KYC of 2 witnesses (for LUT)',
    ],
    deadline: { kind: 'fixed-window-weeks', weeks: 2 },
    urgent: true,
    notes:
      'Within 2 weeks after incorporation and before raising invoice or incurring expenditure. LUT Filing is a separate Customs step.',
  },
  {
    id: 'reg-5',
    slug: 'letter-of-undertaking',
    bucket: 'statutory',
    order: 9,
    title: 'LUT Filing',
    responsibleRole: 'intern',
    forms: ['GST RFD-11'],
    infoRequired: ['KYC of 2 witnesses'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-6',
    slug: 'legal-entity-identifier',
    bucket: 'statutory',
    order: 5,
    title: 'LEI Registration',
    responsibleRole: 'intern',
    forms: ['Form 1 — LEI'],
    infoRequired: [
      'Certificate of Incorporation',
      'PAN of company',
      'GST certificate',
      'Authorised representative details',
      'Details of all directors (name, father, DIN, address)',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-7',
    slug: 'pt-registration',
    bucket: 'statutory',
    order: 4,
    title: 'PT Registration',
    responsibleRole: 'intern',
    forms: ['Form 1 — PT'],
    infoRequired: [...KYC_CORE, 'TAN', 'List of employees'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-8',
    slug: 'iec-import-export-code',
    bucket: 'statutory',
    order: 8,
    title: 'IEC Registration',
    responsibleRole: 'intern',
    forms: ['Form 1 — IEC'],
    infoRequired: [...KYC_CORE, 'Goods & services exported / imported'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-9',
    slug: 'shops-establishments-registration',
    bucket: 'statutory',
    order: 11,
    title: 'Shops & Establishment',
    responsibleRole: 'intern',
    forms: ['Form 1 — S&E', 'Form No-I'],
    infoRequired: [
      'Name board in Telugu & English',
      'List of employees',
      'Rental deed of office space',
      'Employer (MD) ID proof + 2 passport photos',
      'COI, MOA, AOA',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-10',
    slug: 'trade-license',
    bucket: 'statutory',
    order: 14,
    title: 'Trade Licence',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'Address proof of business',
      'ID proof of applicant + Aadhaar of authorised person',
      'PAN, MOA, AOA, COI',
      'Latest municipal property-tax receipt',
      'Certified layout plan of office',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-11',
    slug: 'non-stpi-unit',
    bucket: 'statutory',
    order: 10,
    title: 'Non-STPI Compliance',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'MOA & AOA',
      'Board Resolution authorising signatory',
      'PAN of company',
      'PAN / Passport of all directors',
      'IEC code',
      'DIR-12, INC-22',
      'GST registration',
      "Banker's certificate",
      'Sale deed / lease agreement',
      'Project report (next 5 years)',
      'Master service agreement with parent entity',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-12',
    slug: 'trademark-registration',
    bucket: 'statutory',
    order: 15,
    title: 'Trademark Registration',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['Power of Attorney', 'Affidavit', 'MSME certificate & applications'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-13',
    slug: 'clra-registration',
    bucket: 'statutory',
    order: 12,
    title: 'CLRA Registration',
    responsibleRole: 'intern',
    forms: ['CLRA registration'],
    infoRequired: [
      ...KYC_CORE,
      'Details of contract labour / contractors (if applicable)',
      'Nature of work and establishment particulars',
    ],
    deadline: { kind: 'no-statutory-limit' },
    notes:
      'Contract Labour (Regulation and Abolition) Act registration — applicable where contract labour is engaged.',
  },
  {
    id: 'reg-14',
    slug: 'posh-she-box-registration',
    bucket: 'statutory',
    order: 13,
    title: 'POSH / SHE Box',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'Internal Complaints Committee (ICC) constitution details',
      'SHE Box / POSH portal registration acknowledgement',
      'Workplace POSH policy (if available)',
    ],
    deadline: { kind: 'no-statutory-limit' },
    notes: 'Prevention of Sexual Harassment (POSH) — SHE Box registration for the workplace.',
  },
  {
    id: 'reg-15',
    slug: 'msme-registration',
    bucket: 'statutory',
    order: 6,
    title: 'MSME Registration',
    responsibleRole: 'intern',
    forms: ['Udyam Registration'],
    infoRequired: [
      'Aadhaar of authorised signatory',
      'PAN of company',
      'GSTIN (if registered)',
      'Bank account details',
      'NIC / activity codes',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-16',
    slug: 'icegate-registrations',
    bucket: 'statutory',
    order: 7,
    title: 'ICEGATE Registrations',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [...KYC_CORE, 'IEC code', 'Authorised signatory DSC'],
    deadline: { kind: 'no-statutory-limit' },
    notes: 'Indian Customs Electronic Gateway (ICEGATE) registration for customs filings.',
  },
  {
    id: 'reg-17',
    slug: 'trademark-renewal',
    bucket: 'statutory',
    order: 16,
    title: 'Trademark Renewal',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['Trademark registration certificate', 'Renewal application particulars'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-18',
    slug: 'patent-registration',
    bucket: 'statutory',
    order: 17,
    title: 'Patent Registration',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: [
      'Invention / specification details',
      'Applicant and inventor particulars',
      'Power of Attorney (if filed through agent)',
    ],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-19',
    slug: 'icdr-registration',
    bucket: 'statutory',
    order: 18,
    title: 'ICDR Registration',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['Issuer / applicant particulars', 'Offer or listing path details (if applicable)'],
    deadline: { kind: 'no-statutory-limit' },
    notes:
      'SEBI ICDR (Issue of Capital and Disclosure Requirements) — applicable where a public issue or listing path applies.',
  },
  {
    id: 'reg-20',
    slug: 'fcgpr-filing',
    bucket: 'statutory',
    order: 19,
    title: 'FCGPR Filing',
    responsibleRole: 'intern',
    forms: ['FCGPR'],
    infoRequired: [
      'Foreign inward remittance details',
      'FIRC copies',
      'FIRMS portal registration',
      'Foreign investor particulars',
    ],
    deadline: { kind: 'days-from-incorporation', days: 30 },
    notes: 'File FCGPR with RBI (FIRMS) for inward FDI allotment.',
  },
  {
    id: 'reg-21',
    slug: 'fdi-reporting',
    bucket: 'statutory',
    order: 20,
    title: 'FDI Reporting',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['FDI transaction particulars', 'Investor and investee details', 'FIRMS acknowledgements'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-22',
    slug: 'odi-reporting',
    bucket: 'statutory',
    order: 21,
    title: 'ODI Reporting',
    responsibleRole: 'intern',
    forms: [],
    infoRequired: ['Overseas investment particulars', 'Indian party and foreign entity details'],
    deadline: { kind: 'no-statutory-limit' },
  },
  {
    id: 'reg-23',
    slug: 'fla-return',
    bucket: 'statutory',
    order: 22,
    title: 'FLA Return',
    responsibleRole: 'intern',
    forms: ['FLA'],
    infoRequired: ['Audited / unaudited financials as applicable', 'Foreign liabilities and assets particulars'],
    deadline: { kind: 'no-statutory-limit' },
    notes: 'Annual Foreign Liabilities and Assets (FLA) return to RBI.',
  },
  {
    id: 'reg-24',
    slug: 'fctrs-filing',
    bucket: 'statutory',
    order: 23,
    title: 'FCTRS Filing',
    responsibleRole: 'intern',
    forms: ['FC-TRS'],
    infoRequired: ['Transfer of shares particulars', 'Buyer and seller details', 'Consideration and FIRC if applicable'],
    deadline: { kind: 'no-statutory-limit' },
    notes: 'Form FC-TRS for transfer of shares between resident and non-resident.',
  },
];

const REGISTRATION_PHASES: ChecklistPhaseGroup[] = [
  {
    id: 'registration-phase-4',
    title: 'Phase 4 — Registration',
    subtitle: 'Steps 1–23',
    itemIds: [
      'reg-4',
      'reg-1',
      'reg-3',
      'reg-7',
      'reg-6',
      'reg-15',
      'reg-16',
      'reg-8',
      'reg-5',
      'reg-11',
      'reg-9',
      'reg-13',
      'reg-14',
      'reg-10',
      'reg-12',
      'reg-17',
      'reg-18',
      'reg-19',
      'reg-20',
      'reg-21',
      'reg-22',
      'reg-23',
      'reg-24',
    ],
  },
];

function phasesWithItems(
  phases: ChecklistPhaseGroup[],
  items: ChecklistItem[],
): Array<ChecklistPhaseGroup & { items: ChecklistItem[] }> {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  return phases.map((phase) => ({
    ...phase,
    items: phase.itemIds
      .map((itemId) => byId.get(itemId))
      .filter((item): item is ChecklistItem => Boolean(item)),
  }));
}

function phaseStepForItem(
  phases: ChecklistPhaseGroup[],
  itemId: string,
): { phaseId: string; stepNumber: number } | null {
  const stepByItemId = new Map<string, { phaseId: string; stepNumber: number }>();
  for (const phase of phases) {
    phase.itemIds.forEach((id, index) => {
      stepByItemId.set(id, { phaseId: phase.id, stepNumber: index + 1 });
    });
  }
  return stepByItemId.get(itemId) ?? null;
}

export const checklist: ChecklistItem[] = [...preInc, ...postInc, ...registration];

export function itemsByBucket(b: Bucket): ChecklistItem[] {
  return checklist.filter((i) => i.bucket === b).sort((a, b) => a.order - b.order);
}

export function getItem(id: string): ChecklistItem | undefined {
  return checklist.find((i) => i.id === id);
}

export function getPreIncPhases(): Array<ChecklistPhaseGroup & { items: ChecklistItem[] }> {
  return phasesWithItems(PRE_INC_PHASES, preInc);
}

export function getPostIncPhases(): Array<ChecklistPhaseGroup & { items: ChecklistItem[] }> {
  return phasesWithItems(POST_INC_PHASES, postInc);
}

export function getRegistrationPhases(): Array<ChecklistPhaseGroup & { items: ChecklistItem[] }> {
  return phasesWithItems(REGISTRATION_PHASES, registration);
}

/** Active phase items only (excludes legacy catalog rows not in phase itemIds). */
export function getPhaseItems(
  phases: Array<ChecklistPhaseGroup & { items: ChecklistItem[] }>,
): ChecklistItem[] {
  return phases.flatMap((phase) => phase.items);
}

/** All incorporation phases (1–4) for client progress and admin phase maps. */
export function getIncorporationPhases(): Array<ChecklistPhaseGroup & { items: ChecklistItem[] }> {
  return [...getPreIncPhases(), ...getPostIncPhases(), ...getRegistrationPhases()];
}

/** Ordered active catalog (phase itemIds). Excludes legacy rows not in a phase. */
export function getActiveCatalogItems(): ChecklistItem[] {
  return getPhaseItems(getIncorporationPhases());
}

export function getPreIncPhaseStep(itemId: string): { phaseId: string; stepNumber: number } | null {
  return phaseStepForItem(PRE_INC_PHASES, itemId);
}

export function getPostIncPhaseStep(itemId: string): { phaseId: string; stepNumber: number } | null {
  return phaseStepForItem(POST_INC_PHASES, itemId);
}

export function getRegistrationPhaseStep(
  itemId: string,
): { phaseId: string; stepNumber: number } | null {
  return phaseStepForItem(REGISTRATION_PHASES, itemId);
}
