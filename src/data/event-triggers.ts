/**
 * EVENT TRIGGERS — the MCA filings a company event starts (IDEAS-PLAN wave 2, section D).
 *
 * Pure data. `src/lib/compliance-events/plan.ts` turns one event into its due date, task title,
 * client request items and notes from this table, and the `filing.recordEvent` action shows the
 * result on a review card. The day counts follow the Companies Act, 2013 and its rules; they run
 * from the date of the event (or of the resolution, where the form says so). The firm still checks
 * the form's own instructions before filing.
 *
 * `resolution` names the board resolution generator only where one really exists: the board
 * meetings module's `resolutionDocx` (src/lib/board-meetings/resolution.ts) renders a resolution by
 * circulation from an agenda library wording (src/data/board-agenda-library.ts). The incorporation
 * board resolution generator (src/lib/board-resolution/) is for the subsidiary incorporation NOC
 * only, so no rule names it.
 */

export const COMPLIANCE_EVENT_KINDS = [
  'director_appointed',
  'director_resigned',
  'registered_office_changed',
  'auditor_appointed',
  'shares_allotted',
  'authorised_capital_increased',
  'resolution_needs_filing',
] as const;
export type ComplianceEventKind = (typeof COMPLIANCE_EVENT_KINDS)[number];

export function isComplianceEventKind(value: unknown): value is ComplianceEventKind {
  return typeof value === 'string' && (COMPLIANCE_EVENT_KINDS as readonly string[]).includes(value);
}

export type EventRequestItemKind = 'document' | 'answer' | 'confirmation';

export interface EventRequestItem {
  kind: EventRequestItemKind;
  label: string;
  help?: string;
}

export interface EventResolutionRef {
  /** The generator module and export the resolution draft uses. */
  generator: 'board-meetings/resolutionDocx';
  /** Agenda library items whose wording suits the resolution, best first. */
  agendaItemIds: readonly string[];
}

export interface EventTriggerRule {
  kind: ComplianceEventKind;
  /** What the event is, in a few words, for menus and cards. */
  label: string;
  /** The MCA form to file. */
  form: string;
  /** Days after the event by which the form is due. */
  days: number;
  legalReference: string;
  /** The task title; `{person}` is replaced with the person or firm named in the details, when given. */
  taskTitle: string;
  requestItems: readonly EventRequestItem[];
  /** Plain notes shown on the card and stored on the task checklist. */
  notes: readonly string[];
  resolution: EventResolutionRef | null;
  /** The details the card asks for, by key, for the screen form and the Ask picker. */
  detailKeys: readonly ('person' | 'din' | 'address' | 'withinCity' | 'firm' | 'shares' | 'amount' | 'resolution' | 'privatePlacement')[];
}

const MGT14_NOTE = 'If the appointment or change needed a special resolution or a board resolution listed in Section 117(3), MGT-14 is also due within 30 days.';

export const EVENT_TRIGGER_RULES: Readonly<Record<ComplianceEventKind, EventTriggerRule>> = {
  director_appointed: {
    kind: 'director_appointed',
    label: 'Director appointed',
    form: 'DIR-12',
    days: 30,
    legalReference: 'Section 170(2) of the Companies Act, 2013 and Rule 18 of the Companies (Appointment and Qualification of Directors) Rules, 2014',
    taskTitle: 'File DIR-12 for the appointment of {person}',
    requestItems: [
      { kind: 'document', label: 'Consent to act as director (DIR-2), signed', help: 'Signed by the new director.' },
      { kind: 'document', label: 'Declaration of non-disqualification (DIR-8), signed' },
      { kind: 'document', label: 'Disclosure of interest (MBP-1), signed' },
      { kind: 'answer', label: 'DIN of the new director', help: 'If the director has no DIN yet, say so and we will apply for one.' },
      { kind: 'document', label: 'Proof of identity and address of the new director' },
    ],
    notes: [MGT14_NOTE, 'An additional director appointed by the board holds office until the next general meeting; plan the regularisation.'],
    resolution: { generator: 'board-meetings/resolutionDocx', agendaItemIds: ['BM-025', 'BM-028', 'BM-029'] },
    detailKeys: ['person', 'din'],
  },
  director_resigned: {
    kind: 'director_resigned',
    label: 'Director resigned',
    form: 'DIR-12',
    days: 30,
    legalReference: 'Section 168(1) of the Companies Act, 2013 and Rule 15 of the Companies (Appointment and Qualification of Directors) Rules, 2014',
    taskTitle: 'File DIR-12 for the resignation of {person}',
    requestItems: [
      { kind: 'document', label: 'Resignation letter of the director, signed and dated' },
      { kind: 'document', label: 'Proof that the resignation reached the company (email or acknowledgement)' },
      { kind: 'confirmation', label: 'The board noted the resignation at its meeting or by circulation' },
    ],
    notes: [
      'The resignation takes effect on the date the company receives the notice, or a later date the director names.',
      'The director may also file DIR-11 within 30 days; tell them so.',
      'Check that the board still has the minimum number of directors and a resident director.',
    ],
    resolution: { generator: 'board-meetings/resolutionDocx', agendaItemIds: ['BM-038'] },
    detailKeys: ['person', 'din'],
  },
  registered_office_changed: {
    kind: 'registered_office_changed',
    label: 'Registered office changed',
    form: 'INC-22',
    days: 30,
    legalReference: 'Section 12(4) of the Companies Act, 2013 and Rule 27 of the Companies (Incorporation) Rules, 2014',
    taskTitle: 'File INC-22 for the new registered office',
    requestItems: [
      { kind: 'document', label: 'Proof of the new registered office (rent agreement or sale deed)' },
      { kind: 'document', label: 'No objection certificate from the owner of the premises' },
      { kind: 'document', label: 'Latest utility bill for the premises (not older than two months)' },
      { kind: 'confirmation', label: 'The new address is in the same city, town or village as the old one' },
    ],
    notes: [
      'Within the same city, town or village: a board resolution is enough, then INC-22 within 30 days.',
      'Outside the city but within the same ROC: a special resolution and MGT-14 within 30 days, then INC-22.',
      'To another ROC in the same State, or another State: INC-23 or a Regional Director approval comes first; INC-22 follows the order.',
      'Update the name board, letterhead and every registration that carries the address.',
    ],
    resolution: { generator: 'board-meetings/resolutionDocx', agendaItemIds: ['BM-144', 'BM-145', 'BM-146'] },
    detailKeys: ['address', 'withinCity'],
  },
  auditor_appointed: {
    kind: 'auditor_appointed',
    label: 'Auditor appointed',
    form: 'ADT-1',
    days: 15,
    legalReference: 'Section 139 of the Companies Act, 2013 and Rule 4(2) of the Companies (Audit and Auditors) Rules, 2014',
    taskTitle: 'File ADT-1 for the appointment of {person}',
    requestItems: [
      { kind: 'document', label: 'Consent letter from the auditor' },
      { kind: 'document', label: 'Eligibility certificate from the auditor (Section 141)' },
      { kind: 'answer', label: 'Firm registration number of the auditor' },
      { kind: 'document', label: 'Appointment letter or intimation sent to the auditor' },
    ],
    notes: ['The 15 days run from the meeting at which the auditor was appointed.', 'For a first auditor the board appoints within 30 days of incorporation.'],
    resolution: { generator: 'board-meetings/resolutionDocx', agendaItemIds: ['BM-057', 'BM-016'] },
    detailKeys: ['person', 'firm'],
  },
  shares_allotted: {
    kind: 'shares_allotted',
    label: 'Shares allotted',
    form: 'PAS-3',
    days: 15,
    legalReference: 'Section 39(4) and Section 42 of the Companies Act, 2013 and Rule 12 of the Companies (Prospectus and Allotment of Securities) Rules, 2014',
    taskTitle: 'File PAS-3 for the allotment of shares',
    requestItems: [
      { kind: 'document', label: 'Bank statement showing the share money received' },
      { kind: 'document', label: 'List of allottees with names, addresses and shares allotted' },
      { kind: 'document', label: 'Valuation report, where the shares were issued at a premium' },
      { kind: 'answer', label: 'Number of shares allotted and the price per share' },
    ],
    notes: [
      'PAS-3 is due within 15 days of the allotment (Rule 12, as amended in 2018).',
      'A private placement under Section 42 also needs the special resolution filed in MGT-14 before the offer, and PAS-4 and PAS-5 records.',
      'For a foreign allottee, FC-GPR is due within 30 days on the FIRMS portal.',
    ],
    resolution: { generator: 'board-meetings/resolutionDocx', agendaItemIds: ['BM-087', 'BM-085', 'BM-088'] },
    detailKeys: ['shares', 'amount', 'privatePlacement'],
  },
  authorised_capital_increased: {
    kind: 'authorised_capital_increased',
    label: 'Authorised capital increased',
    form: 'SH-7',
    days: 30,
    legalReference: 'Section 61 and Section 64 of the Companies Act, 2013',
    taskTitle: 'File SH-7 for the increase in authorised capital',
    requestItems: [
      { kind: 'document', label: 'Certified copy of the ordinary resolution of the members' },
      { kind: 'document', label: 'Notice of the general meeting with the explanatory statement' },
      { kind: 'answer', label: 'The new authorised capital and how it is divided into shares' },
    ],
    notes: ['File the altered Memorandum of Association with SH-7.', 'Stamp duty on the increase is paid through the MCA form and varies by State.'],
    resolution: { generator: 'board-meetings/resolutionDocx', agendaItemIds: ['BM-079'] },
    detailKeys: ['amount'],
  },
  resolution_needs_filing: {
    kind: 'resolution_needs_filing',
    label: 'Resolution needs filing',
    form: 'MGT-14',
    days: 30,
    legalReference: 'Section 117 of the Companies Act, 2013',
    taskTitle: 'File MGT-14 for the resolution',
    requestItems: [
      { kind: 'document', label: 'Certified copy of the resolution, signed' },
      { kind: 'document', label: 'Explanatory statement, where the resolution was passed at a general meeting' },
    ],
    notes: ['A private company is exempt from filing board resolutions under Section 179(3); special resolutions are still filed.'],
    resolution: null,
    detailKeys: ['resolution'],
  },
};

export function eventTriggerRule(kind: ComplianceEventKind): EventTriggerRule {
  return EVENT_TRIGGER_RULES[kind];
}
