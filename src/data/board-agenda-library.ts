/**
 * BOARD MEETING AGENDA LIBRARY — the SBC master list of standard agenda items.
 *
 * Source: Board_Meeting_Agenda_Master_Library.xlsx (sheet "Agenda Master", 224 rows, and
 * "Topic Index"), shared by the owner on 2 Nov 2026. Pure data: the repository seeds the
 * `agenda_library_items` table from it once, and admins edit the table afterwards
 * (Firm settings › Agenda library). The wording is the default notice wording; square
 * brackets mark fields the lead must fill before the notice is sent for approval.
 */

export interface AgendaLibrarySeedItem {
  id: string;
  topic: string;
  scenario: string;
  wording: string;
  law: string;
  applicability: string;
  action: string;
  notes: string;
}

export interface AgendaTopic {
  topic: string;
  hint: string;
}

export const AGENDA_TOPICS: AgendaTopic[] = [
  {
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "hint": "Choose the relevant appointment type, resignation, cessation, designation or remuneration scenario."
  },
  {
    "topic": "Board Committees and Governance",
    "hint": "Constitution, composition, terms of reference and review of Board Committees."
  },
  {
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "hint": "Business operations, offices, assets, contracts, authorisations, risk and IT matters."
  },
  {
    "topic": "Corporate Social Responsibility",
    "hint": "CSR applicability, committee, policy, action plan, projects and expenditure."
  },
  {
    "topic": "Finance, Accounts, Audit and Banking",
    "hint": "Financial statements, audit, banking, borrowings, budgets, investments and treasury matters."
  },
  {
    "topic": "First Board Meeting and Incorporation",
    "hint": "One-time matters for a newly incorporated company and its first Board Meeting."
  },
  {
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "hint": "FDI, ODI, foreign remittances, intercompany arrangements and transfer pricing."
  },
  {
    "topic": "General Meetings and Annual General Meeting",
    "hint": "Convening AGM/EGM, notices, explanatory statements and matters for members."
  },
  {
    "topic": "Governance, Ethics, Risk and Other Matters",
    "hint": "Board evaluation, ethics, whistleblower, data protection, business continuity and other governance matters."
  },
  {
    "topic": "Human Resources, Policies and Workplace Matters",
    "hint": "HR policies, POSH, employee benefits, senior management and employee matters."
  },
  {
    "topic": "Listed Entity and SEBI-Specific Matters",
    "hint": "Agenda items specifically relevant to listed entities under SEBI regulations."
  },
  {
    "topic": "Opening and Procedural Matters",
    "hint": "Routine meeting formalities and items usually considered at each Board Meeting."
  },
  {
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "hint": "RPT approvals, interested director matters, loans, guarantees, investments and contracts."
  },
  {
    "topic": "Restructuring, Conversion, Merger and Closure",
    "hint": "Mergers, acquisitions, conversion, strike-off and liquidation-related matters."
  },
  {
    "topic": "Share Capital, Securities and Shareholder Matters",
    "hint": "Capital changes, issue/allotment/transfer of securities, buy-back, dividend and shareholder matters."
  },
  {
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "hint": "Periodic compliance reviews, audit reports, regulatory notices, filings and litigation."
  }
];

export const AGENDA_LIBRARY_SEED: AgendaLibrarySeedItem[] = [
  {
    "id": "BM-001",
    "topic": "Opening and Procedural Matters",
    "scenario": "Election / appointment of Chairperson",
    "wording": "To elect / appoint the Chairperson of the Meeting.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "As required",
    "action": "Elect / appoint",
    "notes": "Follow the Articles of Association and SS-1."
  },
  {
    "id": "BM-002",
    "topic": "Opening and Procedural Matters",
    "scenario": "Ascertainment of quorum",
    "wording": "To ascertain and confirm the presence of the requisite quorum for the Meeting.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "Every meeting",
    "action": "Take note",
    "notes": "Quorum under Section 174, subject to applicable exemptions and Articles."
  },
  {
    "id": "BM-003",
    "topic": "Opening and Procedural Matters",
    "scenario": "Leave of absence",
    "wording": "To consider and grant leave of absence to Directors who are unable to attend the Meeting.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "As required",
    "action": "Approve",
    "notes": "Record requests received and reasons, where provided."
  },
  {
    "id": "BM-004",
    "topic": "Opening and Procedural Matters",
    "scenario": "Notice of meeting",
    "wording": "To take note of the Notice convening the Meeting and the agenda circulated to the Directors.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "Every meeting",
    "action": "Take note",
    "notes": "Notice and agenda circulation to comply with Section 173 and SS-1."
  },
  {
    "id": "BM-005",
    "topic": "Opening and Procedural Matters",
    "scenario": "Confirmation of previous minutes",
    "wording": "To confirm the Minutes of the previous Meeting of the Board of Directors.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "As required",
    "action": "Confirm",
    "notes": "Minutes are noted/confirmed in accordance with SS-1; do not treat as a substitute for signing/entry requirements."
  },
  {
    "id": "BM-006",
    "topic": "Opening and Procedural Matters",
    "scenario": "Committee minutes",
    "wording": "To take note of the Minutes of the [name of Committee] Meeting held on [date].",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "If committee constituted",
    "action": "Take note",
    "notes": "Insert committee name and meeting date."
  },
  {
    "id": "BM-007",
    "topic": "Opening and Procedural Matters",
    "scenario": "Resolutions by circulation",
    "wording": "To take note of the resolutions passed by circulation since the previous Meeting of the Board.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "If applicable",
    "action": "Take note",
    "notes": "Section 175 and SS-1."
  },
  {
    "id": "BM-008",
    "topic": "Opening and Procedural Matters",
    "scenario": "General disclosures of interest",
    "wording": "To take note of the disclosures of interest received from the Directors in Form MBP-1.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "Annual / upon change",
    "action": "Take note",
    "notes": "Section 184(1), Rule 9 of the Companies (Meetings of Board and its Powers) Rules, 2014."
  },
  {
    "id": "BM-009",
    "topic": "Opening and Procedural Matters",
    "scenario": "Declaration of non-disqualification",
    "wording": "To take note of the declarations received from the Directors in Form DIR-8 regarding their eligibility and non-disqualification.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "Annual / upon change",
    "action": "Take note",
    "notes": "Section 164(2), Rule 14 of the Companies (Appointment and Qualification of Directors) Rules, 2014."
  },
  {
    "id": "BM-010",
    "topic": "Opening and Procedural Matters",
    "scenario": "Attendance and participation",
    "wording": "To take note of the attendance and mode of participation of the Directors at the Meeting.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "Every meeting",
    "action": "Take note",
    "notes": "Record physical / video-conferencing participation as applicable."
  },
  {
    "id": "BM-011",
    "topic": "Opening and Procedural Matters",
    "scenario": "Any other business",
    "wording": "To consider any other item of business with the permission of the Chairperson.",
    "law": "SS-1; Sections 173, 174, 175, 184, as applicable",
    "applicability": "As required",
    "action": "As permitted",
    "notes": "Use only in accordance with SS-1 and applicable notice/agenda requirements."
  },
  {
    "id": "BM-012",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Certificate of Incorporation",
    "wording": "To take note of the Certificate of Incorporation issued by the Registrar of Companies.",
    "law": "Companies Act, 2013; incorporation provisions",
    "applicability": "First Board Meeting",
    "action": "Take note",
    "notes": "Verify company name, CIN and date of incorporation."
  },
  {
    "id": "BM-013",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "MOA and AOA",
    "wording": "To take note of the Memorandum of Association and Articles of Association of the Company.",
    "law": "Sections 4 and 5",
    "applicability": "First Board Meeting",
    "action": "Take note",
    "notes": ""
  },
  {
    "id": "BM-014",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Registered office",
    "wording": "To take note of the registered office of the Company and approve the situation of the registered office, as applicable.",
    "law": "Sections 12 and 13; relevant rules",
    "applicability": "First Board Meeting / change",
    "action": "Take note / approve",
    "notes": "Distinguish taking note of registered office from approval of a change."
  },
  {
    "id": "BM-015",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "First Directors",
    "wording": "To take note of the appointment of the first Directors of the Company.",
    "law": "Section 152 and incorporation documents",
    "applicability": "First Board Meeting",
    "action": "Take note",
    "notes": "Check subscriber / articles / incorporation documents."
  },
  {
    "id": "BM-016",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Appointment of first auditor",
    "wording": "To appoint the first Statutory Auditor of the Company and fix the terms of appointment and remuneration.",
    "law": "Section 139(6)",
    "applicability": "First Board Meeting",
    "action": "Approve",
    "notes": "Appointment by Board within 30 days of registration; if Board fails, members appoint at EGM within 90 days."
  },
  {
    "id": "BM-017",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Bank account",
    "wording": "To consider and approve the opening of a bank account in the name of the Company and authorise the operation thereof.",
    "law": "Board powers; banking authorisations",
    "applicability": "First Board Meeting / event-based",
    "action": "Approve",
    "notes": "Capture bank, account type and authorised signatories."
  },
  {
    "id": "BM-018",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Common seal",
    "wording": "To consider and approve adoption / use of a common seal, if any.",
    "law": "Section 9; Articles",
    "applicability": "Optional",
    "action": "Approve",
    "notes": "Common seal is optional under the Companies Act."
  },
  {
    "id": "BM-019",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Share certificates to subscribers",
    "wording": "To consider and approve the issue of share certificates to the subscribers to the Memorandum of Association.",
    "law": "Sections 46 and 56; Share Capital and Debentures Rules",
    "applicability": "First Board Meeting / post-subscription",
    "action": "Approve",
    "notes": "Check stamp duty, certificate execution and timelines."
  },
  {
    "id": "BM-020",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Receipt of subscription money",
    "wording": "To take note of receipt of subscription money from the subscribers to the Memorandum of Association.",
    "law": "Sections 10A / 39, as applicable",
    "applicability": "First Board Meeting / after receipt",
    "action": "Take note",
    "notes": "Reconcile bank credit with subscriber commitments."
  },
  {
    "id": "BM-021",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Preliminary expenses",
    "wording": "To consider and approve the preliminary expenses incurred in connection with the incorporation of the Company.",
    "law": "Accounting / Board powers",
    "applicability": "If applicable",
    "action": "Approve / ratify",
    "notes": "Check supporting invoices and accounting treatment."
  },
  {
    "id": "BM-022",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "INC-20A authorisation",
    "wording": "To authorise a Director to sign and file Form INC-20A with the Registrar of Companies.",
    "law": "Section 10A; relevant rules",
    "applicability": "If applicable",
    "action": "Authorise",
    "notes": "Applicable to companies having share capital, subject to statutory conditions and exemptions."
  },
  {
    "id": "BM-023",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Statutory registers and records",
    "wording": "To authorise the maintenance of statutory registers, books and records of the Company.",
    "law": "Sections 88, n/a; relevant rules",
    "applicability": "First Board Meeting",
    "action": "Authorise",
    "notes": "Identify registers applicable to company type and transactions."
  },
  {
    "id": "BM-024",
    "topic": "First Board Meeting and Incorporation",
    "scenario": "Auditor appointment reporting",
    "wording": "To authorise filing of the requisite e-form(s) with the Registrar of Companies in connection with appointment of the Statutory Auditor.",
    "law": "Section 139; Rule 4",
    "applicability": "First Board Meeting",
    "action": "Authorise",
    "notes": "ADT-1 filing requirements should be checked for the relevant appointment."
  },
  {
    "id": "BM-025",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Additional Director",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as an Additional Director of the Company.",
    "law": "Section 161(1); Articles of Association",
    "applicability": "If Articles authorise; until next AGM / due date",
    "action": "Approve",
    "notes": "Check DIN, consent in DIR-2, DIR-8, eligibility, Board strength and subsequent regularisation."
  },
  {
    "id": "BM-026",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Nominee Director",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as a Nominee Director of the Company, pursuant to the nomination received from [nominating institution / investor].",
    "law": "Section 161(3); applicable agreement / Articles",
    "applicability": "If nomination right exists",
    "action": "Approve / take note",
    "notes": "Review nomination instrument, Articles, consent and eligibility."
  },
  {
    "id": "BM-027",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Alternate Director",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as an Alternate Director in place of Mr./Ms. [Original Director].",
    "law": "Section 161(2)",
    "applicability": "If statutory conditions met",
    "action": "Approve",
    "notes": "Original Director's absence from India for at least 3 months; check tenure and eligibility."
  },
  {
    "id": "BM-028",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Director to fill casual vacancy",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as a Director to fill the casual vacancy caused by the resignation / cessation of Mr./Ms. [Name].",
    "law": "Section 161(4)",
    "applicability": "Public company; subject to Articles",
    "action": "Approve",
    "notes": "Board appointment subject to approval at immediate next general meeting or statutory timeline."
  },
  {
    "id": "BM-029",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Director by shareholders",
    "wording": "To consider and recommend the appointment of Mr./Ms. [Name] as a Director of the Company, subject to approval of the members.",
    "law": "Sections 152 and 160, as applicable",
    "applicability": "If members' approval required",
    "action": "Recommend / approve notice",
    "notes": "Check candidature notice under Section 160, exemptions and consent."
  },
  {
    "id": "BM-030",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment / reappointment of Managing Director",
    "wording": "To consider and approve the appointment / reappointment of Mr./Ms. [Name] as the Managing Director of the Company, subject to such approvals as may be required.",
    "law": "Sections 196, 197, 203; Schedule V",
    "applicability": "If applicable",
    "action": "Approve / recommend",
    "notes": "Check term, age, disqualifications, remuneration, limits and members' approval."
  },
  {
    "id": "BM-031",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment / reappointment of Whole-time Director",
    "wording": "To consider and approve the appointment / reappointment of Mr./Ms. [Name] as a Whole-time Director of the Company, subject to such approvals as may be required.",
    "law": "Sections 196, 197, 203; Schedule V",
    "applicability": "If applicable",
    "action": "Approve / recommend",
    "notes": ""
  },
  {
    "id": "BM-032",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Independent Director",
    "wording": "To consider and recommend the appointment of Mr./Ms. [Name] as an Independent Director of the Company, subject to approval of the members, wherever required.",
    "law": "Sections 149, 150 and Schedule IV",
    "applicability": "Applicable classes of companies / voluntary",
    "action": "Recommend / approve",
    "notes": "Check databank, proficiency test exemption, independence declaration and tenure."
  },
  {
    "id": "BM-033",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Woman Director",
    "wording": "To consider and approve / recommend the appointment of Ms. [Name] as a Woman Director of the Company.",
    "law": "Section 149(1); applicable rules",
    "applicability": "Prescribed classes of companies",
    "action": "Approve / recommend",
    "notes": "Check paid-up capital / turnover thresholds and vacancy timeline."
  },
  {
    "id": "BM-034",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Small Shareholders' Director",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as a Small Shareholders' Director, if applicable.",
    "law": "Section 151; applicable rules",
    "applicability": "Listed company, subject to conditions",
    "action": "Approve / recommend",
    "notes": ""
  },
  {
    "id": "BM-035",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Resident Director",
    "wording": "To take note of / consider the appointment of Mr./Ms. [Name] as a Director satisfying the resident director requirement.",
    "law": "Section 149(3)",
    "applicability": "Every company",
    "action": "Take note / approve as applicable",
    "notes": "At least one director must satisfy the prescribed stay in India test."
  },
  {
    "id": "BM-036",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Regularisation of Additional Director",
    "wording": "To consider and recommend the appointment of Mr./Ms. [Name], Additional Director, as a Director of the Company, subject to approval of the members.",
    "law": "Sections 152 and 161(1)",
    "applicability": "At general meeting",
    "action": "Recommend",
    "notes": "Include in AGM/EGM notice and check Articles."
  },
  {
    "id": "BM-037",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Reappointment of retiring director",
    "wording": "To consider and recommend the reappointment of Mr./Ms. [Name], retiring by rotation, as a Director of the Company.",
    "law": "Section 152(6)",
    "applicability": "Applicable companies",
    "action": "Recommend",
    "notes": "Check rotational retirement calculation and member approval."
  },
  {
    "id": "BM-038",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Resignation of Director",
    "wording": "To take note of the resignation tendered by Mr./Ms. [Name] from the office of Director of the Company with effect from [date].",
    "law": "Section 168; applicable rules",
    "applicability": "On resignation",
    "action": "Take note",
    "notes": "Check resignation letter, effective date and DIR-12 filing."
  },
  {
    "id": "BM-039",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Resignation of Managing Director / WTD",
    "wording": "To take note of the resignation of Mr./Ms. [Name] from the office of Managing Director / Whole-time Director of the Company.",
    "law": "Sections 168 and 203",
    "applicability": "On resignation",
    "action": "Take note",
    "notes": "Consider consequential KMP vacancy and replacement."
  },
  {
    "id": "BM-040",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Removal of Director",
    "wording": "To consider and approve the proposal to convene a general meeting to seek members' approval for removal of Mr./Ms. [Name] as a Director.",
    "law": "Section 169",
    "applicability": "If proposed",
    "action": "Approve calling meeting / recommend",
    "notes": "Special notice, representation rights and statutory procedure apply."
  },
  {
    "id": "BM-041",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Vacation of office",
    "wording": "To take note of the vacation of office by Mr./Ms. [Name] as a Director of the Company under the applicable provisions of the Companies Act, 2013.",
    "law": "Section 167",
    "applicability": "If event occurs",
    "action": "Take note",
    "notes": "Record the specific statutory ground and effective date."
  },
  {
    "id": "BM-042",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Change in designation",
    "wording": "To consider and approve the change in designation of Mr./Ms. [Name] from [existing designation] to [proposed designation].",
    "law": "Sections 152, 161, 196, 203, as applicable",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": "Check whether change triggers member approval / statutory filing."
  },
  {
    "id": "BM-043",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Change in terms of appointment",
    "wording": "To consider and approve the revision of the terms and conditions of appointment of Mr./Ms. [Name] as [designation].",
    "law": "Sections 196 and 197, as applicable",
    "applicability": "If applicable",
    "action": "Approve / recommend",
    "notes": ""
  },
  {
    "id": "BM-044",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Remuneration of Director / KMP",
    "wording": "To consider and approve the remuneration payable to Mr./Ms. [Name] in the capacity of [designation], subject to applicable approvals.",
    "law": "Sections 197, 198, 203; Schedule V",
    "applicability": "If applicable",
    "action": "Approve / recommend",
    "notes": "Check limits, approvals, disclosures and effective date."
  },
  {
    "id": "BM-045",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Sitting fees",
    "wording": "To consider and approve the payment of sitting fees to Non-Executive Directors for attending meetings of the Board and its Committees.",
    "law": "Section 197(5); applicable rules",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-046",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of CEO",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as the Chief Executive Officer of the Company.",
    "law": "Sections 2(18), 203; applicable rules",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": "CEO may be KMP depending on statutory definition and role."
  },
  {
    "id": "BM-047",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of CFO",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as the Chief Financial Officer of the Company.",
    "law": "Section 203; applicable rules",
    "applicability": "Prescribed classes of companies",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-048",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Company Secretary",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as the Company Secretary of the Company.",
    "law": "Sections 2(24), 203; applicable rules",
    "applicability": "Prescribed classes of companies",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-049",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Resignation / cessation of KMP",
    "wording": "To take note of the resignation / cessation of Mr./Ms. [Name] from the position of [KMP designation] and consider appointment of a successor, if required.",
    "law": "Section 203; applicable rules",
    "applicability": "On event / prescribed classes",
    "action": "Take note / approve",
    "notes": "Fill vacancy within statutory timeline where applicable."
  },
  {
    "id": "BM-050",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Appointment of Senior Management Personnel",
    "wording": "To consider and approve the appointment of Mr./Ms. [Name] as [designation] forming part of the senior management of the Company.",
    "law": "SEBI LODR, where applicable; Board powers",
    "applicability": "Listed entity / as per governance framework",
    "action": "Approve",
    "notes": "For listed entities, check definition and disclosure requirements."
  },
  {
    "id": "BM-051",
    "topic": "Appointment, Resignation and Changes in Directors / KMP",
    "scenario": "Annual declarations and disclosures",
    "wording": "To take note of declarations and disclosures received from Directors, including Form DIR-8 and Form MBP-1, as applicable.",
    "law": "Sections 164 and 184; relevant rules",
    "applicability": "Annual / upon change",
    "action": "Take note",
    "notes": "Separate agenda items may be used for each form / disclosure."
  },
  {
    "id": "BM-052",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Review of management accounts",
    "wording": "To review the unaudited management accounts and financial performance of the Company for the period ended [date].",
    "law": "Board oversight; Section 134, as applicable",
    "applicability": "Periodic",
    "action": "Review / take note",
    "notes": ""
  },
  {
    "id": "BM-053",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Quarterly financial results",
    "wording": "To consider and approve the unaudited financial results of the Company for the quarter / period ended [date].",
    "law": "SEBI LODR Regulation 33, for listed entities",
    "applicability": "Listed entities / as applicable",
    "action": "Approve",
    "notes": "Include audit committee recommendation and limited review report where applicable."
  },
  {
    "id": "BM-054",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Annual financial statements",
    "wording": "To consider and approve the standalone / consolidated financial statements of the Company for the financial year ended [date].",
    "law": "Sections 129, 134",
    "applicability": "Annual",
    "action": "Approve",
    "notes": "Board approval precedes signing and laying before members."
  },
  {
    "id": "BM-055",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Board's Report",
    "wording": "To consider and approve the Board's Report together with its annexures for the financial year ended [date].",
    "law": "Section 134; relevant rules",
    "applicability": "Annual",
    "action": "Approve",
    "notes": "Check applicable disclosures and annexures."
  },
  {
    "id": "BM-056",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Auditor's report",
    "wording": "To take note of the Statutory Auditors' Report on the financial statements for the financial year ended [date].",
    "law": "Sections 143 and 134",
    "applicability": "Annual",
    "action": "Take note",
    "notes": "Consider qualifications, observations and management responses."
  },
  {
    "id": "BM-057",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Appointment of Statutory Auditor",
    "wording": "To consider and recommend the appointment / reappointment of [Firm Name] as Statutory Auditors of the Company and fix their remuneration, subject to members' approval, where required.",
    "law": "Section 139",
    "applicability": "As applicable",
    "action": "Recommend / approve",
    "notes": "Appointment framework differs for first auditor, subsequent auditor and casual vacancy."
  },
  {
    "id": "BM-058",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Appointment of Internal Auditor",
    "wording": "To consider and approve the appointment of [Name / Firm] as Internal Auditor of the Company and approve the scope and remuneration.",
    "law": "Section 138; Rule 13",
    "applicability": "Prescribed classes",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-059",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Appointment of Cost Auditor",
    "wording": "To consider and approve the appointment of [Name / Firm] as Cost Auditor of the Company and recommend remuneration for ratification by members, where required.",
    "law": "Section 148; Cost Records and Audit Rules",
    "applicability": "If cost audit applicable",
    "action": "Approve / recommend",
    "notes": ""
  },
  {
    "id": "BM-060",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Appointment of Secretarial Auditor",
    "wording": "To consider and approve / recommend the appointment of [Name / Firm] as Secretarial Auditor of the Company.",
    "law": "Section 204; applicable rules",
    "applicability": "Prescribed classes",
    "action": "Approve / recommend",
    "notes": "Check current statutory appointment and approval requirements."
  },
  {
    "id": "BM-061",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Internal audit report",
    "wording": "To review the Internal Audit Report for the period ended [date] and consider the management action plan.",
    "law": "Section 138; Audit Committee provisions",
    "applicability": "If applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-062",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Statutory audit observations",
    "wording": "To review the observations and qualifications, if any, in the Statutory Auditors' Report and the management's response thereto.",
    "law": "Sections 134 and 143",
    "applicability": "Annual / if applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-063",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Budget and business plan",
    "wording": "To consider and approve the annual budget and business plan of the Company for the financial year [year].",
    "law": "Board powers / governance",
    "applicability": "Annual / as required",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-064",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Capital expenditure",
    "wording": "To consider and approve the proposed capital expenditure for [purpose / project] amounting to INR [amount].",
    "law": "Board powers; Section 179, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check delegated authority and borrowing / investment implications."
  },
  {
    "id": "BM-065",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Borrowing facilities",
    "wording": "To consider and approve the availing of borrowing facilities from [Bank / Financial Institution] up to INR [amount] and authorise execution of necessary documents.",
    "law": "Sections 179(3)(d), 180, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Section 180 approval may be needed for specified borrowings by public companies."
  },
  {
    "id": "BM-066",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Creation of security / charge",
    "wording": "To consider and approve the creation of charge / security over the assets of the Company in favour of [Lender] to secure the facilities granted.",
    "law": "Sections 77, 179 and 180, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check shareholder approval, lender documents and CHG filings."
  },
  {
    "id": "BM-067",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Opening of bank account",
    "wording": "To consider and approve the opening of a current / savings / other bank account with [Bank] and authorise its operation.",
    "law": "Board powers",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-068",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Change in bank signatories",
    "wording": "To consider and approve the addition / deletion / modification of authorised signatories for the Company's bank account(s).",
    "law": "Board powers / bank mandate",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-069",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Closure of bank account",
    "wording": "To consider and approve the closure of the Company's bank account maintained with [Bank].",
    "law": "Board powers",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-070",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Write-off of bad debts",
    "wording": "To consider and approve the write-off of identified irrecoverable debts amounting to INR [amount].",
    "law": "Board powers / accounting standards",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check delegation, tax and audit trail."
  },
  {
    "id": "BM-071",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Waiver / settlement of dues",
    "wording": "To consider and approve the settlement / waiver / restructuring of outstanding dues receivable from / payable to [party].",
    "law": "Board powers; related provisions as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Assess Section 188, Section 186, tax and accounting implications."
  },
  {
    "id": "BM-072",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Dividend recommendation",
    "wording": "To consider and recommend the declaration of dividend for the financial year ended [date].",
    "law": "Sections 123 and 134",
    "applicability": "Annual / as applicable",
    "action": "Recommend",
    "notes": "Final dividend is recommended by Board and declared by members; interim dividend is Board-declared."
  },
  {
    "id": "BM-073",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Interim dividend",
    "wording": "To consider and declare an interim dividend for the financial year [year].",
    "law": "Section 123",
    "applicability": "If proposed",
    "action": "Approve",
    "notes": "Check profits, reserves, loss restrictions and payment timeline."
  },
  {
    "id": "BM-074",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Investment of surplus funds",
    "wording": "To consider and approve the investment of surplus funds of the Company in [instrument / entity] up to INR [amount].",
    "law": "Sections 179 and 186, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check limits, approvals and permitted instruments."
  },
  {
    "id": "BM-075",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Foreign currency / treasury arrangements",
    "wording": "To consider and approve the Company's foreign exchange and treasury arrangements with [bank / counterparty].",
    "law": "FEMA / Board powers, as applicable",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": "Check FEMA, AD bank and hedging policy requirements."
  },
  {
    "id": "BM-076",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Financial assistance / loans",
    "wording": "To consider and approve the grant of loan / financial assistance to [entity] amounting to INR [amount].",
    "law": "Sections 185 and 186",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check prohibitions, exemptions, limits and special resolution requirements."
  },
  {
    "id": "BM-077",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Guarantee / security",
    "wording": "To consider and approve the provision of guarantee / security in connection with a loan to [borrower].",
    "law": "Sections 179 and 186",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check Section 185 and Section 186 limits / approvals."
  },
  {
    "id": "BM-078",
    "topic": "Finance, Accounts, Audit and Banking",
    "scenario": "Financial controls",
    "wording": "To review the adequacy and effectiveness of internal financial controls and risk management systems.",
    "law": "Section 134(5)(e), where applicable; governance",
    "applicability": "Periodic / annual",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-079",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Increase in authorised share capital",
    "wording": "To consider and approve the increase in the authorised share capital of the Company from INR [existing] to INR [proposed], subject to members' approval.",
    "law": "Sections 61 and 64",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Alteration of Capital Clause and SH-7 filing."
  },
  {
    "id": "BM-080",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Alteration of MOA – capital clause",
    "wording": "To consider and approve the alteration of the Capital Clause of the Memorandum of Association, subject to members' approval.",
    "law": "Sections 13 and 61",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": ""
  },
  {
    "id": "BM-081",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Alteration of AOA",
    "wording": "To consider and approve the alteration of the Articles of Association of the Company, subject to members' approval.",
    "law": "Section 14",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Special resolution generally required."
  },
  {
    "id": "BM-082",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Alteration of MOA – other clauses",
    "wording": "To consider and approve the alteration of the [name / object / situation / other] clause of the Memorandum of Association, subject to applicable approvals.",
    "law": "Section 13",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Check special resolution, name approval and regulatory approvals as relevant."
  },
  {
    "id": "BM-083",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Rights issue",
    "wording": "To consider and approve the offer and issue of equity shares on a rights basis to the existing shareholders of the Company.",
    "law": "Section 62(1)(a); relevant rules",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check offer period, renunciation, dispatch and allotment requirements."
  },
  {
    "id": "BM-084",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Private placement",
    "wording": "To consider and approve the offer and issue of [equity / preference] shares on a private placement basis to identified persons.",
    "law": "Section 42; relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Check special resolution, PAS-4, PAS-5, separate bank account, allotment and PAS-3 timelines."
  },
  {
    "id": "BM-085",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Preferential allotment",
    "wording": "To consider and approve the proposed preferential issue of [securities] to [proposed allottees], subject to members' and regulatory approvals.",
    "law": "Section 62(1)(c); Rule 13; applicable SEBI rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "For listed entities, SEBI ICDR requirements apply."
  },
  {
    "id": "BM-086",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Bonus issue",
    "wording": "To consider and approve the proposal for issue of bonus equity shares to the members of the Company, subject to members' approval, where required.",
    "law": "Section 63",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Check sources, partly-paid shares and statutory restrictions."
  },
  {
    "id": "BM-087",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Allotment of equity shares",
    "wording": "To consider and approve the allotment of [number] equity shares of INR [face value] each to [allottee(s)].",
    "law": "Sections 39, 42 or 62, as applicable",
    "applicability": "Post-issue",
    "action": "Approve",
    "notes": "Specify issue route, consideration, allottee details and filing."
  },
  {
    "id": "BM-088",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Allotment of preference shares",
    "wording": "To consider and approve the allotment of [number] preference shares of INR [face value] each to [allottee(s)].",
    "law": "Sections 42, 55 and 62, as applicable",
    "applicability": "Post-issue",
    "action": "Approve",
    "notes": "Check terms, redemption and issue approvals."
  },
  {
    "id": "BM-089",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Issue of debentures",
    "wording": "To consider and approve the issue of [secured / unsecured / convertible] debentures on the terms placed before the Board.",
    "law": "Sections 42, 71 and relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Check debenture trustee, security, DRR and member approvals, as applicable."
  },
  {
    "id": "BM-090",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Transfer of shares",
    "wording": "To consider and approve the registration of transfer of [number] shares from [transferor] to [transferee].",
    "law": "Sections 56 and 58; Articles",
    "applicability": "On transfer request",
    "action": "Approve / register",
    "notes": "Check instrument / depository transfer, stamp duty, restrictions and timelines."
  },
  {
    "id": "BM-091",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Transmission of shares",
    "wording": "To consider and approve the transmission of shares held by [deceased / insolvent holder] in favour of [claimant].",
    "law": "Section 56; relevant rules; Articles",
    "applicability": "On event",
    "action": "Approve / register",
    "notes": "Check succession documents, indemnities and applicable procedure."
  },
  {
    "id": "BM-092",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Duplicate share certificate",
    "wording": "To consider and approve the issue of duplicate share certificate(s) in lieu of original certificate(s) reported lost / destroyed.",
    "law": "Section 46; Share Capital and Debentures Rules",
    "applicability": "On request",
    "action": "Approve",
    "notes": "Check affidavit, indemnity, newspaper notice where applicable and register entries."
  },
  {
    "id": "BM-093",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Share certificate execution",
    "wording": "To consider and approve the issue and execution of share certificate(s) pursuant to the allotment / transfer of shares.",
    "law": "Sections 46 and 56; relevant rules",
    "applicability": "Post-issue / transfer",
    "action": "Approve",
    "notes": "Check timelines, stamp duty and authorised signatories."
  },
  {
    "id": "BM-094",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Buy-back of securities",
    "wording": "To consider and approve the proposal for buy-back of the Company's securities, subject to applicable approvals.",
    "law": "Section 68; relevant rules; SEBI regulations if listed",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Check limits, sources, solvency, special resolution and filing requirements."
  },
  {
    "id": "BM-095",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Redemption of preference shares",
    "wording": "To consider and approve the redemption of [number] preference shares in accordance with their terms of issue.",
    "law": "Section 55",
    "applicability": "At maturity / as per terms",
    "action": "Approve",
    "notes": "Check fully paid status, profits / fresh issue and CRR requirements."
  },
  {
    "id": "BM-096",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Conversion of securities",
    "wording": "To consider and approve the conversion of [security type] into [equity / other securities] in accordance with the terms of issue.",
    "law": "Applicable provisions and issue terms",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-097",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "ESOP grant",
    "wording": "To consider and approve the grant of stock options to eligible employees under the Company's Employee Stock Option Scheme.",
    "law": "Section 62(1)(b); Share Capital and Debentures Rules",
    "applicability": "If scheme adopted",
    "action": "Approve",
    "notes": "Check scheme approval, vesting, exercise and register."
  },
  {
    "id": "BM-098",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Issue of securities in dematerialised form",
    "wording": "To consider and approve arrangements for issue / dematerialisation of securities and appointment of relevant intermediaries.",
    "law": "Section 29; applicable rules",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": "Check applicability of demat requirements to private companies and prescribed classes."
  },
  {
    "id": "BM-099",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Change in shareholding / beneficial ownership",
    "wording": "To take note of changes in the shareholding pattern and declarations / filings relating to beneficial ownership, as applicable.",
    "law": "Sections 89 and 90; relevant rules",
    "applicability": "On event / periodic",
    "action": "Take note",
    "notes": "Check MGT-4/5/6 and BEN filings, where applicable."
  },
  {
    "id": "BM-100",
    "topic": "Share Capital, Securities and Shareholder Matters",
    "scenario": "Dividend payment arrangements",
    "wording": "To consider and approve the arrangements for payment of dividend to eligible members.",
    "law": "Sections 123 and 124",
    "applicability": "If dividend declared",
    "action": "Approve",
    "notes": "Check separate bank account, payment timeline and unpaid dividend requirements."
  },
  {
    "id": "BM-101",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Register of contracts",
    "wording": "To take note of the entries made in the Register of Contracts or Arrangements in which Directors are interested.",
    "law": "Section 189; relevant rules",
    "applicability": "Periodic / as required",
    "action": "Take note",
    "notes": ""
  },
  {
    "id": "BM-102",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Related party transaction approval",
    "wording": "To consider and approve the proposed contract / arrangement with [related party] for [nature of transaction] on the terms placed before the Board.",
    "law": "Section 188; applicable rules",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check ordinary course, arm's-length basis, thresholds, Audit Committee and member approval."
  },
  {
    "id": "BM-103",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "RPT with holding company",
    "wording": "To consider and approve the proposed transaction with the holding company, [name], for [nature of transaction].",
    "law": "Sections 177 and 188; applicable rules",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check applicable exemptions and Audit Committee requirements."
  },
  {
    "id": "BM-104",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "RPT with subsidiary",
    "wording": "To consider and approve the proposed transaction with the subsidiary company, [name], for [nature of transaction].",
    "law": "Sections 177 and 188; applicable rules",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-105",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "RPT with associate company",
    "wording": "To consider and approve the proposed transaction with the associate company, [name], for [nature of transaction].",
    "law": "Sections 177 and 188; applicable rules",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-106",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Omnibus RPT approval",
    "wording": "To consider and approve omnibus approval for proposed related party transactions for the financial year [year].",
    "law": "Section 177; applicable rules; SEBI LODR, if applicable",
    "applicability": "Annual / as applicable",
    "action": "Approve",
    "notes": "Audit Committee approval is relevant; Board agenda wording should reflect applicable governance structure."
  },
  {
    "id": "BM-107",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Loans to directors / interested entities",
    "wording": "To consider the permissibility and, where legally permitted, approve the proposed loan / guarantee / security involving [director / entity].",
    "law": "Section 185",
    "applicability": "Event-based",
    "action": "Approve / consider",
    "notes": "Section 185 contains prohibitions and conditional permissions; do not use as a blanket approval."
  },
  {
    "id": "BM-108",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Loans / investments / guarantees under Section 186",
    "wording": "To consider and approve the proposed loan / investment / guarantee / security under Section 186 of the Companies Act, 2013.",
    "law": "Section 186",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check limits, unanimous Board meeting approval, special resolution and disclosure."
  },
  {
    "id": "BM-109",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Contract with entity in which director is interested",
    "wording": "To consider and approve the proposed contract with [entity] in which [Director] is interested, subject to applicable provisions and approvals.",
    "law": "Sections 184 and 188",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Interested Director participation / disclosure restrictions must be assessed."
  },
  {
    "id": "BM-110",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Inter-corporate deposits",
    "wording": "To consider and approve the placement / acceptance of an inter-corporate deposit with / from [entity].",
    "law": "Sections 179, 185 and 186, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Assess deposit rules, lending restrictions and tax implications."
  },
  {
    "id": "BM-111",
    "topic": "Related Party Transactions, Loans, Investments and Contracts",
    "scenario": "Related party policy",
    "wording": "To consider and approve / review the policy on materiality of related party transactions and dealing with related party transactions.",
    "law": "Section 188; SEBI LODR, if applicable",
    "applicability": "If applicable",
    "action": "Approve / review",
    "notes": "Listed entity requirements differ from unlisted company requirements."
  },
  {
    "id": "BM-112",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Compliance status review",
    "wording": "To review the status of statutory and regulatory compliances applicable to the Company for the period ended [date].",
    "law": "Applicable laws; Section 134",
    "applicability": "Periodic",
    "action": "Review",
    "notes": "Use a compliance certificate / dashboard as supporting paper."
  },
  {
    "id": "BM-113",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Secretarial Audit Report",
    "wording": "To take note of the Secretarial Audit Report issued by the Secretarial Auditor for the financial year ended [date].",
    "law": "Section 204; Rule 9",
    "applicability": "Prescribed classes",
    "action": "Take note",
    "notes": "Board's Report response to qualifications / observations, if any."
  },
  {
    "id": "BM-114",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Annual Secretarial Compliance Report",
    "wording": "To take note of the Annual Secretarial Compliance Report for the financial year ended [date].",
    "law": "SEBI LODR Regulation 24A",
    "applicability": "Listed entities, as applicable",
    "action": "Take note",
    "notes": ""
  },
  {
    "id": "BM-115",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "ROC filing status",
    "wording": "To review the status of statutory filings made / pending with the Registrar of Companies.",
    "law": "Companies Act and Rules",
    "applicability": "Periodic",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-116",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Income-tax compliance",
    "wording": "To review the status of income-tax returns, tax audit, tax payments, withholding tax and other direct tax compliances.",
    "law": "Income-tax law",
    "applicability": "Periodic / as required",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-117",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "GST compliance",
    "wording": "To review the status of GST registrations, returns, payments, reconciliations and notices.",
    "law": "GST laws",
    "applicability": "Periodic / as required",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-118",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "FEMA compliance",
    "wording": "To review the status of applicable FEMA compliances, including foreign investment, overseas remittances and reporting requirements.",
    "law": "FEMA and rules / regulations",
    "applicability": "If cross-border transactions",
    "action": "Review",
    "notes": "Consider FDI / ODI / ECB / export-import and RBI reporting."
  },
  {
    "id": "BM-119",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Labour law compliance",
    "wording": "To review the status of applicable labour law compliances, including EPF, ESI, professional tax and Shops and Establishments requirements.",
    "law": "Applicable labour laws",
    "applicability": "Periodic / as required",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-120",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Regulatory notices",
    "wording": "To take note of notices, show-cause notices, inspection observations or communications received from regulatory authorities.",
    "law": "Relevant statute / regulator",
    "applicability": "On receipt",
    "action": "Take note",
    "notes": "Identify authority, response deadline, risk and responsible officer."
  },
  {
    "id": "BM-121",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Response to regulatory notice",
    "wording": "To consider and approve the proposed response to the notice received from [authority] dated [date].",
    "law": "Relevant statute / regulator",
    "applicability": "On receipt",
    "action": "Approve / authorise",
    "notes": "Check legal review and authorisation."
  },
  {
    "id": "BM-122",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Appointment of authorised representative",
    "wording": "To authorise [name / designation] to represent the Company before [authority / department] and sign and submit documents.",
    "law": "Board powers / relevant statute",
    "applicability": "Event-based",
    "action": "Authorise",
    "notes": ""
  },
  {
    "id": "BM-123",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Statutory register review",
    "wording": "To review / take note of the statutory registers and records maintained by the Company.",
    "law": "Relevant provisions and rules",
    "applicability": "Periodic / as applicable",
    "action": "Review / take note",
    "notes": "Identify registers actually applicable."
  },
  {
    "id": "BM-124",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Litigation update",
    "wording": "To review the status of material litigations, claims, disputes and contingent liabilities involving the Company.",
    "law": "Section 134 and accounting standards, as applicable",
    "applicability": "Periodic / event-based",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-125",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Legal proceedings / settlement",
    "wording": "To consider and approve the proposed institution, defence, settlement or withdrawal of proceedings involving the Company.",
    "law": "Board powers / relevant law",
    "applicability": "Event-based",
    "action": "Approve / authorise",
    "notes": "Check materiality, delegated authority and related party aspects."
  },
  {
    "id": "BM-126",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Compliance officer / authorised signatory",
    "wording": "To appoint / designate [name] as the authorised signatory / compliance officer for [statutory purpose].",
    "law": "Relevant statute / regulations",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-127",
    "topic": "Statutory, Secretarial, Tax and Regulatory Compliance",
    "scenario": "Filing of forms with ROC",
    "wording": "To authorise [Director / CS] to sign and file the requisite e-forms and documents with the Registrar of Companies in connection with the matters approved by the Board.",
    "law": "Companies Act and Rules",
    "applicability": "Event-based",
    "action": "Authorise",
    "notes": "Use specific form and filing details where known."
  },
  {
    "id": "BM-128",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "HR policy",
    "wording": "To consider and approve the Human Resources Policy of the Company.",
    "law": "Board powers / applicable law",
    "applicability": "If adopted / revised",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-129",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Code of conduct",
    "wording": "To consider and approve / review the Code of Conduct applicable to Directors and employees.",
    "law": "Section 178 / SEBI LODR, where applicable; governance",
    "applicability": "If applicable",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-130",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "POSH Internal Committee",
    "wording": "To take note of / approve the constitution or reconstitution of the Internal Committee under the POSH Act, 2013.",
    "law": "POSH Act, 2013",
    "applicability": "As applicable",
    "action": "Approve / take note",
    "notes": "Employer obligations apply based on establishment and statutory criteria."
  },
  {
    "id": "BM-131",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "POSH policy",
    "wording": "To consider and approve / review the Policy for Prevention, Prohibition and Redressal of Sexual Harassment at the Workplace.",
    "law": "POSH Act, 2013",
    "applicability": "As applicable",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-132",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Employee stock option scheme",
    "wording": "To consider and approve the Employee Stock Option Scheme for eligible employees, subject to members' approval.",
    "law": "Section 62(1)(b); relevant rules",
    "applicability": "If proposed",
    "action": "Approve / recommend",
    "notes": "Cross-reference share capital agenda."
  },
  {
    "id": "BM-133",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Employee benefit plans",
    "wording": "To consider and approve the employee benefit / welfare schemes proposed to be implemented by the Company.",
    "law": "Board powers; applicable labour laws",
    "applicability": "If proposed",
    "action": "Approve",
    "notes": "Assess tax, labour and accounting treatment."
  },
  {
    "id": "BM-134",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Gratuity / leave policy",
    "wording": "To consider and approve / review the Company's gratuity, leave and leave encashment policies.",
    "law": "Payment of Gratuity Act / applicable labour law",
    "applicability": "If adopted / revised",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-135",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Senior management organisation structure",
    "wording": "To review and approve the proposed organisation structure and key reporting changes.",
    "law": "Board powers / SEBI LODR, if applicable",
    "applicability": "As required",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-136",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Manpower and compensation budget",
    "wording": "To review and approve the manpower plan and employee compensation budget for the financial year [year].",
    "law": "Board powers / governance",
    "applicability": "Annual / as required",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-137",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Whistle blower / vigil mechanism",
    "wording": "To consider and approve / review the Whistle Blower Policy and Vigil Mechanism.",
    "law": "Section 177; applicable rules; SEBI LODR, if applicable",
    "applicability": "Prescribed classes / listed entities",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-138",
    "topic": "Human Resources, Policies and Workplace Matters",
    "scenario": "Employee misconduct / investigation",
    "wording": "To review the report on material employee misconduct / internal investigation and consider the actions proposed.",
    "law": "Board powers / governance",
    "applicability": "Event-based",
    "action": "Review / approve",
    "notes": "Protect confidentiality and comply with employment law."
  },
  {
    "id": "BM-139",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Business performance review",
    "wording": "To review the operational and business performance of the Company for the period ended [date].",
    "law": "Board oversight",
    "applicability": "Periodic",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-140",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "New business activity",
    "wording": "To consider and approve the commencement of [description] as a business activity of the Company, subject to applicable approvals.",
    "law": "MOA; Board powers; sectoral law",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check objects clause and regulatory licences."
  },
  {
    "id": "BM-141",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Business expansion",
    "wording": "To consider and approve the proposed expansion of the Company's business operations into [location / business segment].",
    "law": "Board powers / MOA",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-142",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Opening of branch office",
    "wording": "To consider and approve the opening of a branch office at [address / location].",
    "law": "Board powers; relevant local laws",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check ROC / tax / labour registrations as applicable."
  },
  {
    "id": "BM-143",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Closure of branch office",
    "wording": "To consider and approve the closure of the branch office situated at [address].",
    "law": "Board powers; relevant laws",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-144",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Registered office within local limits",
    "wording": "To consider and approve the shifting of the registered office of the Company from [old address] to [new address] within the local limits of the same city, town or village.",
    "law": "Section 12; relevant rules",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check Board authority under Articles and INC-22 filing."
  },
  {
    "id": "BM-145",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Registered office between ROC jurisdictions in same State",
    "wording": "To consider and approve the shifting of the registered office from the jurisdiction of one Registrar of Companies to another within the same State, subject to prescribed approvals.",
    "law": "Section 12(5); relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Regional Director approval and filings may be required."
  },
  {
    "id": "BM-146",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Registered office from one State to another",
    "wording": "To consider and approve the proposal to shift the registered office of the Company from the State of [A] to the State of [B], subject to members' and regulatory approvals.",
    "law": "Sections 12 and 13; relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Special resolution and Regional Director process generally apply."
  },
  {
    "id": "BM-147",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Purchase of immovable property",
    "wording": "To consider and approve the purchase of immovable property situated at [address] for a consideration of INR [amount].",
    "law": "Board powers; Section 179, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check borrowing, related party, stamp duty and title diligence."
  },
  {
    "id": "BM-148",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Sale / disposal of assets",
    "wording": "To consider and approve the sale / disposal of [asset] to [buyer] for a consideration of INR [amount].",
    "law": "Board powers; Section 180(1)(a), as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check undertaking / substantially whole undertaking and shareholder approval."
  },
  {
    "id": "BM-149",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Lease / licence of premises",
    "wording": "To consider and approve the execution / renewal of the lease / leave and licence agreement for premises situated at [address].",
    "law": "Board powers; Section 188, if related party",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-150",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Material contract / agreement",
    "wording": "To consider and approve the execution of the [name / description] agreement with [counterparty] on the terms placed before the Board.",
    "law": "Board powers; Section 188, if related party",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check delegation, stamp duty, RPT and regulatory implications."
  },
  {
    "id": "BM-151",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Power of Attorney",
    "wording": "To consider and approve the execution of a Power of Attorney in favour of [name] for [purpose].",
    "law": "Board powers; applicable law",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Define scope, duration and revocation."
  },
  {
    "id": "BM-152",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Authorisation to sign documents",
    "wording": "To authorise [name / designation] to execute and sign agreements, applications, declarations and other documents on behalf of the Company for [purpose].",
    "law": "Board powers",
    "applicability": "Event-based",
    "action": "Authorise",
    "notes": "Avoid overly broad authorisation; specify scope."
  },
  {
    "id": "BM-153",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Insurance coverage",
    "wording": "To review and approve the insurance coverage proposed for the Company's assets, business and personnel.",
    "law": "Board oversight",
    "applicability": "Annual / event-based",
    "action": "Review / approve",
    "notes": ""
  },
  {
    "id": "BM-154",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Risk management",
    "wording": "To review the risk management framework, key risks and mitigation measures of the Company.",
    "law": "Section 134; SEBI LODR, where applicable",
    "applicability": "Periodic",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-155",
    "topic": "Business Operations, Assets, Agreements and Authorisations",
    "scenario": "Cybersecurity and IT",
    "wording": "To review the Company's information technology, data protection and cybersecurity framework and material incidents, if any.",
    "law": "Applicable data protection / IT laws; governance",
    "applicability": "Periodic / event-based",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-156",
    "topic": "Board Committees and Governance",
    "scenario": "Constitution of Audit Committee",
    "wording": "To consider and approve the constitution of the Audit Committee and appointment of its members.",
    "law": "Section 177; applicable rules; SEBI LODR, if applicable",
    "applicability": "Prescribed classes / listed entities",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-157",
    "topic": "Board Committees and Governance",
    "scenario": "Constitution of NRC",
    "wording": "To consider and approve the constitution of the Nomination and Remuneration Committee and appointment of its members.",
    "law": "Section 178; applicable rules",
    "applicability": "Prescribed classes / listed entities",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-158",
    "topic": "Board Committees and Governance",
    "scenario": "Constitution of Stakeholders Relationship Committee",
    "wording": "To consider and approve the constitution of the Stakeholders Relationship Committee and appointment of its members.",
    "law": "Section 178; applicable rules",
    "applicability": "Prescribed classes / listed entities",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-159",
    "topic": "Board Committees and Governance",
    "scenario": "Constitution of CSR Committee",
    "wording": "To consider and approve the constitution of the Corporate Social Responsibility Committee and appointment of its members.",
    "law": "Section 135; CSR Rules",
    "applicability": "Companies meeting CSR criteria",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-160",
    "topic": "Board Committees and Governance",
    "scenario": "Constitution of Risk Management Committee",
    "wording": "To consider and approve the constitution of the Risk Management Committee and appointment of its members.",
    "law": "SEBI LODR Regulation 21, where applicable",
    "applicability": "Specified listed entities",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-161",
    "topic": "Board Committees and Governance",
    "scenario": "Change in committee composition",
    "wording": "To consider and approve the appointment / cessation / replacement of members of the [name] Committee.",
    "law": "Relevant section / rules / SEBI LODR",
    "applicability": "If committee constituted",
    "action": "Approve",
    "notes": "Check prescribed composition and independence criteria."
  },
  {
    "id": "BM-162",
    "topic": "Board Committees and Governance",
    "scenario": "Terms of reference",
    "wording": "To consider and approve the terms of reference of the [name] Committee.",
    "law": "Relevant section / rules / SEBI LODR",
    "applicability": "If committee constituted",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-163",
    "topic": "Board Committees and Governance",
    "scenario": "Committee recommendations",
    "wording": "To consider the recommendations made by the [name] Committee at its meeting held on [date].",
    "law": "Relevant section / rules / governance",
    "applicability": "If applicable",
    "action": "Consider / approve",
    "notes": ""
  },
  {
    "id": "BM-164",
    "topic": "Board Committees and Governance",
    "scenario": "Committee performance evaluation",
    "wording": "To review the performance and effectiveness of the Board Committees.",
    "law": "Sections 134 and 178; SEBI LODR, where applicable",
    "applicability": "As applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-165",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Convening AGM",
    "wording": "To consider and approve the convening of the Annual General Meeting of the members of the Company and approve the draft Notice thereof.",
    "law": "Sections 96, 101 and 102",
    "applicability": "Annual",
    "action": "Approve",
    "notes": "Check due date, shorter notice consent, venue / VC framework and statutory exemptions."
  },
  {
    "id": "BM-166",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Convening EGM",
    "wording": "To consider and approve the convening of an Extraordinary General Meeting of the members of the Company and approve the draft Notice thereof.",
    "law": "Sections 100, 101 and 102",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-167",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Approval of AGM date / time / venue",
    "wording": "To consider and approve the date, time and venue of the Annual General Meeting of the Company.",
    "law": "Sections 96 and 101",
    "applicability": "Annual",
    "action": "Approve",
    "notes": "Check statutory requirements and Articles."
  },
  {
    "id": "BM-168",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Approval of EGM date / time / venue",
    "wording": "To consider and approve the date, time and venue of the Extraordinary General Meeting of the Company.",
    "law": "Sections 100 and 101",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-169",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Approval of explanatory statement",
    "wording": "To consider and approve the explanatory statement pursuant to Section 102 of the Companies Act, 2013, in respect of the special business proposed to be transacted at the general meeting.",
    "law": "Section 102",
    "applicability": "If special business",
    "action": "Approve",
    "notes": "Ensure all material facts, interests and other prescribed disclosures."
  },
  {
    "id": "BM-170",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Appointment / reappointment of auditor at AGM",
    "wording": "To consider and recommend the appointment / reappointment of the Statutory Auditors, subject to members' approval, where required.",
    "law": "Section 139",
    "applicability": "As applicable",
    "action": "Recommend",
    "notes": ""
  },
  {
    "id": "BM-171",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Director retiring by rotation",
    "wording": "To consider and recommend the reappointment of the Director retiring by rotation at the ensuing AGM.",
    "law": "Section 152(6)",
    "applicability": "As applicable",
    "action": "Recommend",
    "notes": ""
  },
  {
    "id": "BM-172",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Approval of financial statements",
    "wording": "To approve the financial statements and Board's Report for placing before the members at the AGM.",
    "law": "Sections 129 and 134",
    "applicability": "Annual",
    "action": "Approve",
    "notes": "Separate from member adoption."
  },
  {
    "id": "BM-173",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Dividend recommendation for AGM",
    "wording": "To recommend a final dividend of INR [amount] per equity share for the financial year ended [date], subject to members' approval.",
    "law": "Section 123",
    "applicability": "Annual / if proposed",
    "action": "Recommend",
    "notes": ""
  },
  {
    "id": "BM-174",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Members' approval for remuneration",
    "wording": "To consider and approve the proposal to seek members' approval for the remuneration payable to [Director / KMP].",
    "law": "Sections 197 and 198; Schedule V",
    "applicability": "If required",
    "action": "Recommend",
    "notes": ""
  },
  {
    "id": "BM-175",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Postal ballot / e-voting",
    "wording": "To consider and approve the conduct of [postal ballot / e-voting] for obtaining members' approval on the matters set out in the draft notice.",
    "law": "Sections 108 and 110; applicable rules",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": "Check company class, prescribed procedure and exemptions."
  },
  {
    "id": "BM-176",
    "topic": "General Meetings and Annual General Meeting",
    "scenario": "Appointment of scrutiniser",
    "wording": "To consider and approve the appointment of [Name] as Scrutiniser for the [AGM / EGM / postal ballot].",
    "law": "Sections 108 and 110; relevant rules",
    "applicability": "If applicable",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-177",
    "topic": "Corporate Social Responsibility",
    "scenario": "CSR applicability review",
    "wording": "To review and determine the applicability of the Corporate Social Responsibility provisions to the Company for the financial year [year].",
    "law": "Section 135; CSR Rules",
    "applicability": "Annual",
    "action": "Review / take note",
    "notes": "Check net worth, turnover and net profit thresholds."
  },
  {
    "id": "BM-178",
    "topic": "Corporate Social Responsibility",
    "scenario": "CSR Committee constitution",
    "wording": "To consider and approve the constitution / reconstitution of the CSR Committee and appointment of its members.",
    "law": "Section 135; CSR Rules",
    "applicability": "If CSR applicable",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-179",
    "topic": "Corporate Social Responsibility",
    "scenario": "CSR Policy",
    "wording": "To consider and approve / review the Corporate Social Responsibility Policy of the Company.",
    "law": "Section 135; CSR Rules",
    "applicability": "If CSR applicable",
    "action": "Approve / review",
    "notes": ""
  },
  {
    "id": "BM-180",
    "topic": "Corporate Social Responsibility",
    "scenario": "Annual Action Plan",
    "wording": "To consider and approve the Annual Action Plan for CSR activities for the financial year [year].",
    "law": "CSR Rules",
    "applicability": "If CSR applicable",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-181",
    "topic": "Corporate Social Responsibility",
    "scenario": "CSR project approval",
    "wording": "To consider and approve the CSR project(s) / programme(s) proposed to be undertaken by the Company during [period].",
    "law": "Section 135; Schedule VII; CSR Rules",
    "applicability": "If CSR applicable",
    "action": "Approve",
    "notes": "Check Schedule VII eligibility and implementing agency registration."
  },
  {
    "id": "BM-182",
    "topic": "Corporate Social Responsibility",
    "scenario": "CSR expenditure review",
    "wording": "To review the CSR expenditure incurred and progress of CSR projects during the period ended [date].",
    "law": "Section 135; CSR Rules",
    "applicability": "If CSR applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-183",
    "topic": "Corporate Social Responsibility",
    "scenario": "Unspent CSR amount",
    "wording": "To review the unspent CSR amount, if any, and approve the action required under Section 135 of the Companies Act, 2013.",
    "law": "Section 135(5) and (6)",
    "applicability": "If unspent",
    "action": "Approve / authorise",
    "notes": "Distinguish ongoing project from other than ongoing project."
  },
  {
    "id": "BM-184",
    "topic": "Corporate Social Responsibility",
    "scenario": "Impact assessment",
    "wording": "To consider and take note of the impact assessment report of the CSR project(s), where applicable.",
    "law": "CSR Rules",
    "applicability": "If applicable",
    "action": "Take note",
    "notes": ""
  },
  {
    "id": "BM-185",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Quarterly corporate governance compliance",
    "wording": "To review the Company's compliance with the corporate governance requirements under the SEBI (Listing Obligations and Disclosure Requirements) Regulations, 2015.",
    "law": "SEBI LODR",
    "applicability": "Listed entities",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-186",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Investor grievances",
    "wording": "To review the status of investor complaints and their redressal during the quarter ended [date].",
    "law": "SEBI LODR Regulations 13 and 20, as applicable",
    "applicability": "Listed entities",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-187",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Shareholding pattern",
    "wording": "To take note of the shareholding pattern of the Company for the quarter ended [date].",
    "law": "SEBI LODR Regulation 31",
    "applicability": "Listed entities",
    "action": "Take note",
    "notes": ""
  },
  {
    "id": "BM-188",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Statement of deviation / variation",
    "wording": "To review the statement of deviation(s) or variation(s) in utilisation of issue proceeds, if any.",
    "law": "SEBI LODR Regulation 32",
    "applicability": "If applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-189",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Related party transactions – audit committee",
    "wording": "To consider and approve the related party transaction(s) placed before the Audit Committee / Board, as applicable.",
    "law": "SEBI LODR Regulation 23",
    "applicability": "Listed entities",
    "action": "Approve",
    "notes": "Use correct approving body and materiality threshold."
  },
  {
    "id": "BM-190",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Annual secretarial compliance",
    "wording": "To review the annual secretarial compliance report and action taken on observations, if any.",
    "law": "SEBI LODR Regulation 24A",
    "applicability": "Listed entities",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-191",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Business responsibility and sustainability report",
    "wording": "To consider and approve the Business Responsibility and Sustainability Report for inclusion in the Annual Report, where applicable.",
    "law": "SEBI LODR Regulation 34",
    "applicability": "Applicable listed entities",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-192",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Analyst / investor presentation",
    "wording": "To consider and approve the investor presentation / earnings release proposed to be disseminated to the stock exchanges.",
    "law": "SEBI LODR Regulations 30 and 46, as applicable",
    "applicability": "Listed entities",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-193",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Material event disclosure",
    "wording": "To consider and approve the disclosure of [event / information] to the stock exchanges under the applicable disclosure requirements.",
    "law": "SEBI LODR Regulation 30",
    "applicability": "Listed entities",
    "action": "Approve / authorise",
    "notes": "Check materiality policy and disclosure timelines."
  },
  {
    "id": "BM-194",
    "topic": "Listed Entity and SEBI-Specific Matters",
    "scenario": "Dividend / record date",
    "wording": "To consider and approve the recommendation / declaration of dividend and fixation of record date, as applicable.",
    "law": "SEBI LODR; Section 123",
    "applicability": "Listed entities / as applicable",
    "action": "Approve / recommend",
    "notes": ""
  },
  {
    "id": "BM-195",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Receipt of foreign investment",
    "wording": "To take note of the receipt of foreign investment from [foreign investor] and consider the consequential allotment and reporting requirements.",
    "law": "FEMA NDI Rules; RBI reporting framework",
    "applicability": "On foreign investment",
    "action": "Take note / approve",
    "notes": "Check sectoral cap, entry route, pricing, KYC and FIRMS reporting."
  },
  {
    "id": "BM-196",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Issue of shares to non-resident",
    "wording": "To consider and approve the issue and allotment of equity shares to [non-resident investor] against the foreign inward remittance received.",
    "law": "FEMA NDI Rules; Companies Act",
    "applicability": "On foreign investment",
    "action": "Approve",
    "notes": "Check valuation, pricing guidelines, sectoral conditions and FC-GPR."
  },
  {
    "id": "BM-197",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Transfer of shares to / from non-resident",
    "wording": "To consider and approve the transfer of shares between [resident / non-resident transferor] and [resident / non-resident transferee], subject to applicable approvals.",
    "law": "FEMA NDI Rules",
    "applicability": "On transfer",
    "action": "Approve",
    "notes": "Check pricing, reporting, tax and sectoral conditions."
  },
  {
    "id": "BM-198",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "FEMA reporting authorisation",
    "wording": "To authorise [name] to make the prescribed filings / reports with the Reserve Bank of India / authorised dealer bank in connection with the foreign investment transaction.",
    "law": "FEMA and RBI directions",
    "applicability": "On cross-border transaction",
    "action": "Authorise",
    "notes": "Identify exact reporting form and due date."
  },
  {
    "id": "BM-199",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Overseas direct investment",
    "wording": "To consider and approve the proposed overseas investment in [foreign entity], subject to compliance with the applicable FEMA Overseas Investment Rules and Regulations.",
    "law": "FEMA Overseas Investment Rules / Regulations",
    "applicability": "If ODI proposed",
    "action": "Approve",
    "notes": "Check eligibility, financial commitment, control, valuation, UIN and reporting."
  },
  {
    "id": "BM-200",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Intercompany service agreement",
    "wording": "To consider and approve the execution / renewal of the intercompany services agreement with [group entity].",
    "law": "Board powers; Sections 177 / 188; FEMA / TP, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check RPT, transfer pricing, withholding tax and FEMA."
  },
  {
    "id": "BM-201",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Intercompany loan / guarantee",
    "wording": "To consider and approve the proposed intercompany loan / guarantee / security arrangement with [group entity], subject to applicable law.",
    "law": "Sections 185 / 186; FEMA; ECB framework, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check resident/non-resident direction, ECB / ODI / FDI rules and approvals."
  },
  {
    "id": "BM-202",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Foreign currency remittance",
    "wording": "To consider and approve the proposed remittance of [amount / currency] to [beneficiary] towards [purpose].",
    "law": "FEMA; tax withholding provisions",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check purpose code, Form 15CA/CB, withholding and AD bank documents."
  },
  {
    "id": "BM-203",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Transfer pricing review",
    "wording": "To review the transfer pricing arrangements and related party cross-border transactions of the Company for the financial year [year].",
    "law": "Income-tax Act; transfer pricing provisions",
    "applicability": "If international transactions",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-204",
    "topic": "Foreign Investment, FEMA and Cross-Border Matters",
    "scenario": "Foreign subsidiary / group reporting",
    "wording": "To review the performance, financial position and compliance status of the Company's foreign subsidiary / group entities.",
    "law": "Board oversight",
    "applicability": "If applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-205",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Merger / amalgamation",
    "wording": "To consider and approve the proposal for merger / amalgamation of [transferor company] with [transferee company], subject to applicable approvals.",
    "law": "Sections 230–232; relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Scheme, valuation, auditor certificate, creditor/member and tribunal process."
  },
  {
    "id": "BM-206",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Acquisition of business / undertaking",
    "wording": "To consider and approve the acquisition of [business / undertaking / shares] of [target] on the terms placed before the Board.",
    "law": "Board powers; Sections 180 / 186 / 188, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Check thresholds, approvals, due diligence and competition law."
  },
  {
    "id": "BM-207",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Slump sale / business transfer",
    "wording": "To consider and approve the proposed transfer / acquisition of [business undertaking] by way of slump sale / business transfer agreement.",
    "law": "Board powers; Section 180, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Assess whether substantially whole undertaking and shareholder approval are involved."
  },
  {
    "id": "BM-208",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Conversion of private company into public company",
    "wording": "To consider and approve the proposal for conversion of the Company from a private limited company into a public limited company, subject to members' and regulatory approvals.",
    "law": "Sections 14 and 18; relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Alter AOA and obtain special resolution; check filings."
  },
  {
    "id": "BM-209",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Conversion of public company into private company",
    "wording": "To consider and approve the proposal for conversion of the Company from a public limited company into a private limited company, subject to members' and regulatory approvals.",
    "law": "Sections 14 and 18; relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Regional Director approval is generally required."
  },
  {
    "id": "BM-210",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Conversion into OPC",
    "wording": "To consider and approve the proposal for conversion of the Company into a One Person Company, subject to eligibility and applicable approvals.",
    "law": "Section 18; relevant rules",
    "applicability": "If eligible",
    "action": "Approve / recommend",
    "notes": "Check eligibility and prescribed process."
  },
  {
    "id": "BM-211",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Conversion into Section 8 company",
    "wording": "To consider and approve the proposal for conversion of the Company into a Section 8 company, subject to applicable approvals.",
    "law": "Section 8; relevant rules",
    "applicability": "Event-based",
    "action": "Approve / recommend",
    "notes": "Licence and regulatory approval required."
  },
  {
    "id": "BM-212",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Application for strike-off",
    "wording": "To consider and approve the proposal to make an application for removal of the Company's name from the Register of Companies, subject to statutory conditions.",
    "law": "Section 248; relevant rules",
    "applicability": "If eligible",
    "action": "Approve / recommend",
    "notes": "Check liabilities, special resolution / member consent, pending proceedings and attachments."
  },
  {
    "id": "BM-213",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Voluntary liquidation",
    "wording": "To consider and approve the proposal to initiate voluntary liquidation of the Company, subject to the Insolvency and Bankruptcy Code and applicable regulations.",
    "law": "Section 59, IBC; regulations",
    "applicability": "If solvent and eligible",
    "action": "Approve / recommend",
    "notes": "Solvency declaration and member / creditor approvals required."
  },
  {
    "id": "BM-214",
    "topic": "Restructuring, Conversion, Merger and Closure",
    "scenario": "Winding up / insolvency proceedings",
    "wording": "To consider and take note of / approve actions in relation to winding-up or insolvency proceedings involving the Company.",
    "law": "IBC / Companies Act, as applicable",
    "applicability": "If event occurs",
    "action": "Take note / authorise",
    "notes": "Carefully distinguish voluntary liquidation, tribunal winding up and CIRP."
  },
  {
    "id": "BM-215",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Board evaluation",
    "wording": "To review the performance of the Board, its Committees and individual Directors in accordance with the applicable evaluation framework.",
    "law": "Sections 134 and 178; Schedule IV; SEBI LODR",
    "applicability": "As applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-216",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Familiarisation programme",
    "wording": "To review the familiarisation programme for Independent Directors.",
    "law": "Schedule IV; SEBI LODR, where applicable",
    "applicability": "If Independent Directors appointed",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-217",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Succession planning",
    "wording": "To review the succession plan for the Board, KMP and senior management personnel.",
    "law": "Governance / SEBI LODR, where applicable",
    "applicability": "As applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-218",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Code of conduct compliance",
    "wording": "To review the annual affirmation / compliance with the Code of Conduct by Directors and senior management.",
    "law": "SEBI LODR, where applicable",
    "applicability": "Listed entities",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-219",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Fraud / whistleblower report",
    "wording": "To review significant fraud reports, whistleblower complaints and investigation outcomes placed before the Board / Committee.",
    "law": "Section 177; governance",
    "applicability": "If applicable",
    "action": "Review",
    "notes": "Preserve confidentiality and escalate to Audit Committee where required."
  },
  {
    "id": "BM-220",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Data protection and privacy",
    "wording": "To review the Company's data protection, privacy and information security compliance framework.",
    "law": "Applicable data protection laws",
    "applicability": "As applicable",
    "action": "Review",
    "notes": ""
  },
  {
    "id": "BM-221",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Business continuity plan",
    "wording": "To review and approve the Business Continuity Plan and disaster recovery arrangements.",
    "law": "Governance / risk management",
    "applicability": "As applicable",
    "action": "Review / approve",
    "notes": ""
  },
  {
    "id": "BM-222",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Insurance of Directors and Officers",
    "wording": "To consider and approve Directors and Officers liability insurance, where appropriate.",
    "law": "Board powers / SEBI LODR, where applicable",
    "applicability": "As applicable",
    "action": "Approve",
    "notes": ""
  },
  {
    "id": "BM-223",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Donation / contribution",
    "wording": "To consider and approve the proposed donation / contribution of INR [amount] to [recipient] for [purpose].",
    "law": "Board powers; CSR / tax law, as applicable",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Determine whether CSR or business expenditure and check related party aspects."
  },
  {
    "id": "BM-224",
    "topic": "Governance, Ethics, Risk and Other Matters",
    "scenario": "Any matter requiring Board approval",
    "wording": "To consider and approve such other matter(s) as may be placed before the Board in accordance with the Companies Act, 2013, the Articles of Association and applicable law.",
    "law": "Relevant provision",
    "applicability": "Event-based",
    "action": "Approve",
    "notes": "Use a specific agenda item wherever possible; avoid using this as a substitute for proper notice."
  }
];
