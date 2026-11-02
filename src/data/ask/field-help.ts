/**
 * C3 "Why do we ask this?" — one line per client form field, keyed by
 * `<stepId>:<fieldId>` (field ids come from CLIENT_RESPONSE_FIELDS; for a
 * repeating list use the entry field id, e.g. `pre-15:din`).
 *
 * Guardrail (§9A): copy is ≤ 140 characters and shown ONLY once the firm has
 * reviewed it. Every line below is a draft. To make one appear, a reviewer runs
 * `npm run ask:topics:publish -- --field <stepId>.<fieldKey> --reviewer "Name, Role"`.
 * Keep one entry per line: the publish command edits a single line.
 */
export interface FieldHelp {
  text: string;
  reviewed: boolean;
  /** Set by `npm run ask:topics:publish -- --field …`; absent means unreviewed. */
  reviewedBy?: string;
  reviewedAt?: string;
}

export const FIELD_HELP_MAX_CHARS = 140;

export const FIELD_HELP: Readonly<Record<string, FieldHelp>> = {
  'pre-1:certificateOfIncorporationUrl': { text: "Proof that the parent company exists; it is attached to the name application.", reviewed: false },
  'pre-1:proposedName1': { text: 'Your first choice of company name. The Registrar approves it only if it is unique.', reviewed: false },
  'pre-1:proposedName2': { text: 'A back-up name in case the first choice is too close to an existing company.', reviewed: false },
  'pre-1:businessDescription': { text: "This becomes the company's objects in its charter, so describe what it will actually do.", reviewed: false },
  'pre-1:nicCode': { text: 'A government code for the main business activity; it is entered on the name application. Your project lead fills it in.', reviewed: false },
  'pre-1:additionalNicCodes': { text: 'Other business activities the company will carry on, as NIC codes. Your project lead fills these in; the board resolution lists every code.', reviewed: false },
  'pre-1:authorisedShareCapital': { text: 'The most share capital the company may issue. Government fees depend on it.', reviewed: false },
  'pre-1:paidUpShareCapital': { text: 'The share money the first shareholders will actually pay in after incorporation.', reviewed: false },
  'pre-1:directorCount': { text: 'A private company needs at least two directors, and one of them must live in India.', reviewed: false },
  'pre-1:passportUrl': { text: 'Identity proof of the person who signs the parent board resolution.', reviewed: false },
  'pre-13:equityQuantity': { text: 'How many equity shares the company starts with. This goes into the MOA.', reviewed: false },
  'pre-13:equityNominalValue': { text: 'The face value of one share, usually ₹10. Shares × value = share capital.', reviewed: false },
  'pre-14:registeredOfficeCompleteAddress': { text: "The company's official address in India. Government notices are sent here.", reviewed: false },
  'pre-14:registeredOfficeNocUrl': { text: 'The owner of the premises confirms the company may use the address.', reviewed: false },
  'pre-14:registeredOfficeUtilityBillCopyUrl': { text: 'Proof the address exists. The Registrar needs a bill no older than two months.', reviewed: false },
  'pre-15:din': { text: 'Directors who already hold a DIN reuse it; new directors get one through this filing.', reviewed: false },
  'pre-15:hasDsc': { text: 'Each director signs the forms with a digital signature. We arrange one if they have none.', reviewed: false },
  'pre-15:fatherName': { text: 'The incorporation form asks for it to identify each director; it must match their ID.', reviewed: false },
  'pre-15:notaryApostilleMethod': { text: "A foreign director's documents must be notarised or apostilled in their home country.", reviewed: false },
  'pre-15:hasOtherCompanyInterest': { text: 'Directors must disclose other companies they are involved in; it is printed on DIR-8.', reviewed: false },
  'pre-15:recentPhotographUrl': { text: 'Attached to the DIN application for each new director.', reviewed: false },
  'pre-16:shares': { text: 'How many shares this subscriber takes. It is printed on the MOA and share certificates.', reviewed: false },
  'pre-16:shareholderNominee': { text: 'A private company needs two shareholders; a nominee can hold one share for the parent.', reviewed: false },
  'pre-9:spicePartBConfirmation': { text: 'Your go-ahead to file. After filing, changes mean a resubmission and extra time.', reviewed: false },
};

/** Trailing identifier of a rendered field id (repeat entries prefix theirs). */
function baseFieldId(fieldId: string): string {
  return fieldId.match(/([A-Za-z][A-Za-z0-9]*)$/)?.[1] ?? fieldId;
}

/** Reviewed help for a field, or null (draft lines are never shown). */
export function fieldHelp(stepId: string, fieldId: string, entries: Readonly<Record<string, FieldHelp>> = FIELD_HELP): string | null {
  const entry = entries[`${stepId}:${fieldId}`] ?? entries[`${stepId}:${baseFieldId(fieldId)}`];
  return entry?.reviewed ? entry.text : null;
}
