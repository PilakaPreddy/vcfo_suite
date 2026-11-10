import type { ChecklistField } from '@/data/checklist';
import { INDIAN_STATE_OPTIONS } from '@/lib/incorporation/countries';

/**
 * GST registration (`reg-4`) as the GST portal asks for it (FORM GST REG-01).
 *
 * The tabs follow the portal in its own order: Part A (the TRN), then the Part B
 * tabs, then the ARN and the certificate, then the LUT. The portal's "Goods and
 * Services" tab (HSN and SAC codes) is left out by owner decision (2026-11-09);
 * the project lead picks those codes on the portal itself.
 *
 * Who fills what: the project lead can fill every field. The client fills only
 * the fields and documents that come from the company (business details, the
 * promoters, the signatory, the premises, the bank account, the state numbers).
 * A field with `filledBy: 'intern'` is the lead's own: the client never sees it
 * (`GST_REG_LEAD_ONLY_FIELD_IDS` feeds `pre-inc-direct-flow.ts`).
 *
 * The ids `gstinNumber`, `gstRegistrationDate`, `gstCertificateUrl` and the
 * three LUT ids are read elsewhere (registration facts, the credentials workbook,
 * the compliance triggers); keep them.
 */

export const GST_REG_STEP_ID = 'reg-4';

const LEAD = 'intern' as const;

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const GENDER = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Others' },
];

const STATES = INDIAN_STATE_OPTIONS.map(({ value, label }) => ({ value, label }));

const S = {
  partA: 'Part A — New Registration',
  business: 'Business Details',
  promoters: 'Promoter / Partners',
  signatory: 'Authorized Signatory',
  representative: 'Authorized Representative',
  principal: 'Principal Place of Business',
  additional: 'Additional Places of Business',
  bank: 'Bank Accounts',
  state: 'State Specific Information',
  aadhaar: 'Aadhaar Authentication',
  verification: 'Verification',
  arn: 'ARN and Certificate',
  lut: 'LUT Filing',
} as const;

/** The portal's tab names in order (the "Goods and Services" tab is not one of them). */
export const GST_REG_SECTIONS: readonly string[] = Object.values(S);

const NATURE_OF_POSSESSION = [
  { value: 'owned', label: 'Own' },
  { value: 'leased', label: 'Leased' },
  { value: 'rented', label: 'Rented' },
  { value: 'consent', label: 'Consent' },
  { value: 'shared', label: 'Shared' },
  { value: 'others', label: 'Others' },
];

const PREMISES_PROOF = [
  { value: 'electricity_bill', label: 'Electricity Bill' },
  { value: 'legal_ownership', label: 'Legal Ownership Document' },
  { value: 'khata', label: 'Municipal Khata Copy' },
  { value: 'property_tax', label: 'Property Tax Receipt' },
  { value: 'rent_agreement', label: 'Rent / Lease Agreement' },
  { value: 'consent_letter', label: 'Consent Letter' },
  { value: 'others', label: 'Others' },
];

/** Nature of business activity being carried out at the premises (several allowed, comma separated). */
const BUSINESS_ACTIVITY_HELPER =
  'As on the portal: Factory / Manufacturing, Wholesale Business, Retail Business, Warehouse / Depot, Bonded Warehouse, Supplier of Services, Office / Sale Office, Leasing Business, Recipient of Goods or Services, EOU / STP / EHTP, Export, Import, Works Contract, Input Service Distributor (ISD), Others. Name every activity that applies.';

/** One address block in the portal's field order, for the principal and additional places. */
function addressFields(section?: string): ChecklistField[] {
  const f = (field: ChecklistField): ChecklistField => (section ? { ...field, section } : field);
  return [
    f({ id: 'pinCode', label: 'PIN Code', type: 'text', required: true, layout: 'short' }),
    f({ id: 'state', label: 'State', type: 'select', options: STATES, required: true, layout: 'short' }),
    f({ id: 'district', label: 'District', type: 'text', required: true, layout: 'short' }),
    f({ id: 'city', label: 'City / Town / Village', type: 'text', required: true, layout: 'short' }),
    f({ id: 'locality', label: 'Locality / Sub Locality', type: 'text', layout: 'short' }),
    f({ id: 'road', label: 'Road / Street', type: 'text', required: true, layout: 'short' }),
    f({ id: 'premisesName', label: 'Name of the Premises / Building', type: 'text', layout: 'short' }),
    f({ id: 'buildingNo', label: 'Building No. / Flat No.', type: 'text', required: true, layout: 'short' }),
    f({ id: 'floorNo', label: 'Floor No.', type: 'text', layout: 'short' }),
    f({ id: 'landmark', label: 'Nearby Landmark', type: 'text', layout: 'short' }),
  ];
}

/** A person block (promoter or signatory) as the portal asks it; ids are relative to the entry. */
function personFields(kind: 'promoter' | 'signatory'): ChecklistField[] {
  return [
    // Personal information.
    { id: 'firstName', label: 'First Name', type: 'text', required: true, layout: 'short' },
    { id: 'middleName', label: 'Middle Name', type: 'text', layout: 'short' },
    { id: 'lastName', label: 'Last Name', type: 'text', required: true, layout: 'short' },
    { id: 'fatherFirstName', label: "Father's First Name", type: 'text', required: true, layout: 'short' },
    { id: 'fatherMiddleName', label: "Father's Middle Name", type: 'text', layout: 'short' },
    { id: 'fatherLastName', label: "Father's Last Name", type: 'text', required: true, layout: 'short' },
    { id: 'dob', label: 'Date of Birth', type: 'date', required: true },
    { id: 'mobile', label: 'Mobile Number', type: 'text', required: true, layout: 'short' },
    { id: 'email', label: 'Email Address', type: 'text', required: true, layout: 'short' },
    { id: 'gender', label: 'Gender', type: 'segmented', options: GENDER, required: true },
    { id: 'telephone', label: 'Telephone Number (with STD code)', type: 'text', layout: 'short' },
    // Identity information.
    { id: 'designation', label: 'Designation / Status', type: 'text', required: true, placeholder: 'e.g. Director', layout: 'short' },
    { id: 'din', label: 'Director Identification Number (DIN)', type: 'text', layout: 'short' },
    { id: 'citizenOfIndia', label: 'Are you a citizen of India?', type: 'segmented', options: YES_NO, required: true },
    { id: 'pan', label: 'Permanent Account Number (PAN)', type: 'text', required: true, showWhen: { field: 'citizenOfIndia', value: 'yes' }, layout: 'short' },
    { id: 'passportNumber', label: 'Passport Number (in case of foreigner)', type: 'text', required: true, showWhen: { field: 'citizenOfIndia', value: 'no' }, layout: 'short' },
    { id: 'aadhaar', label: 'Aadhaar Number', type: 'text', showWhen: { field: 'citizenOfIndia', value: 'yes' }, layout: 'short' },
    // Residential address.
    { id: 'residentialAddress', label: 'Residential Address (building, road, locality, city, district, state, PIN)', type: 'textarea', required: true },
    // Documents.
    { id: 'photoUrl', label: 'Photograph (JPEG, up to 100 KB)', type: 'file', accept: 'image/jpeg,image/png', required: true },
    { id: 'panCopyUrl', label: 'Copy of PAN', type: 'file', accept: '.pdf,image/*', showWhen: { field: 'citizenOfIndia', value: 'yes' } },
    { id: 'passportCopyUrl', label: 'Copy of Passport', type: 'file', accept: '.pdf,image/*', required: true, showWhen: { field: 'citizenOfIndia', value: 'no' } },
    ...(kind === 'promoter'
      ? ([{ id: 'alsoSignatory', label: 'Also Authorized Signatory', type: 'segmented', options: YES_NO }] satisfies ChecklistField[])
      : ([
          { id: 'primarySignatory', label: 'Primary Authorized Signatory', type: 'segmented', options: YES_NO, required: true },
          {
            id: 'proofOfAppointmentUrl',
            label: 'Proof of details of Authorized Signatory (Board Resolution / Letter of Authorisation)',
            type: 'file',
            accept: '.pdf,image/*',
            required: true,
          },
        ] satisfies ChecklistField[])),
  ];
}

export const GST_REG_FIELDS: ChecklistField[] = [
  // ---------- Part A: the TRN (the lead runs this on the portal) ----------
  {
    id: 'gstPartAState',
    label: 'State / UT',
    type: 'select',
    section: S.partA,
    options: STATES,
    filledBy: LEAD,
    required: true,
    helperText: 'New Registration — I am a: Taxpayer.',
    layout: 'short',
  },
  { id: 'gstPartADistrict', label: 'District', type: 'text', section: S.partA, filledBy: LEAD, required: true, layout: 'short' },
  {
    id: 'gstLegalName',
    label: 'Legal Name of the Business (as mentioned in PAN)',
    type: 'text',
    section: S.partA,
    filledBy: LEAD,
    required: true,
  },
  { id: 'gstCompanyPan', label: 'Permanent Account Number (PAN) of the company', type: 'text', section: S.partA, filledBy: LEAD, required: true, layout: 'short' },
  {
    id: 'gstPartAEmail',
    label: 'Email Address (verified on the portal)',
    type: 'text',
    section: S.partA,
    filledBy: LEAD,
    required: true,
    layout: 'short',
  },
  {
    id: 'gstPartAMobile',
    label: 'Mobile Number (verified on the portal)',
    type: 'text',
    section: S.partA,
    filledBy: LEAD,
    required: true,
    layout: 'short',
  },
  {
    id: 'gstTrn',
    label: 'Temporary Reference Number (TRN)',
    type: 'text',
    section: S.partA,
    filledBy: LEAD,
    required: true,
    helperText: 'Shown once the email and mobile are verified. Part B must be submitted within 15 days of this date.',
    layout: 'short',
  },
  { id: 'gstTrnDate', label: 'TRN generated on', type: 'date', section: S.partA, filledBy: LEAD, required: true },

  // ---------- Part B: Business Details ----------
  { id: 'gstTradeName', label: 'Trade Name', type: 'text', section: S.business, helperText: 'Leave blank if it is the same as the legal name.' },
  {
    id: 'gstConstitution',
    label: 'Constitution of Business',
    type: 'select',
    section: S.business,
    filledBy: LEAD,
    required: true,
    options: [
      { value: 'private_limited', label: 'Private Limited Company' },
      { value: 'public_limited', label: 'Public Limited Company' },
      { value: 'llp', label: 'Limited Liability Partnership' },
      { value: 'foreign_company', label: 'Foreign Company' },
      { value: 'others', label: 'Others' },
    ],
    layout: 'short',
  },
  {
    id: 'gstStateJurisdiction',
    label: 'State Jurisdiction (Sector / Circle / Ward / Charge / Unit)',
    type: 'text',
    section: S.business,
    filledBy: LEAD,
    required: true,
    helperText: 'Pick it on the portal from the principal place of business; copy it here.',
  },
  {
    id: 'gstCentreJurisdiction',
    label: 'Centre Jurisdiction (Commissionerate / Division / Range)',
    type: 'text',
    section: S.business,
    filledBy: LEAD,
    required: true,
  },
  {
    id: 'gstCompositionOption',
    label: 'Option for Composition',
    type: 'segmented',
    section: S.business,
    filledBy: LEAD,
    options: YES_NO,
    required: true,
  },
  {
    id: 'gstRule14A',
    label: 'Option for registration under Rule 14A (output tax up to ₹2.5 lakh a month)',
    type: 'segmented',
    section: S.business,
    filledBy: LEAD,
    options: YES_NO,
    required: true,
  },
  {
    id: 'gstReason',
    label: 'Reason to obtain registration',
    type: 'select',
    section: S.business,
    required: true,
    options: [
      { value: 'voluntary', label: 'Voluntary Basis' },
      { value: 'crossing_threshold', label: 'Crossing the Threshold' },
      { value: 'inter_state_supply', label: 'Inter-State Supply' },
      { value: 'ecommerce', label: 'Supplies through E-Commerce Operator' },
      { value: 'input_service_distributor', label: 'Input Service Distributor only' },
      { value: 'reverse_charge', label: 'Liability to pay as recipient of goods or services' },
      { value: 'others', label: 'Others (not listed above)' },
    ],
  },
  { id: 'gstCommencementDate', label: 'Date of commencement of Business', type: 'date', section: S.business, required: true },
  { id: 'gstLiabilityDate', label: 'Date on which liability to register arises', type: 'date', section: S.business },
  {
    id: 'gstCasualTaxable',
    label: 'Are you applying for registration as a casual taxable person?',
    type: 'segmented',
    section: S.business,
    filledBy: LEAD,
    options: YES_NO,
    required: true,
  },
  {
    id: 'gstExistingRegistrations',
    label: 'Existing Registrations (type, number, date)',
    type: 'textarea',
    section: S.business,
    filledBy: LEAD,
    placeholder: 'e.g. Corporate Identity Number (CIN) U62099KA2026PTC000000, 02/11/2026',
  },
  {
    id: 'gstConstitutionProofUrl',
    label: 'Proof of Constitution of Business (Certificate of Incorporation)',
    type: 'file',
    section: S.business,
    filledBy: LEAD,
    accept: '.pdf,image/*',
    required: true,
  },

  // ---------- Part B: Promoter / Partners ----------
  {
    id: 'gstPromoters',
    label: 'Promoters / Directors',
    type: 'repeat',
    section: S.promoters,
    entryLabel: 'Promoter',
    minEntries: 1,
    maxEntries: 15,
    required: true,
    helperText: 'Every director of the company, as on the portal. The photograph and the PAN of each are uploaded here.',
    entryFields: personFields('promoter'),
  },

  // ---------- Part B: Authorized Signatory ----------
  {
    id: 'gstSignatories',
    label: 'Authorized Signatories',
    type: 'repeat',
    section: S.signatory,
    entryLabel: 'Authorized Signatory',
    minEntries: 1,
    maxEntries: 10,
    required: true,
    helperText: 'At least one, marked as the primary authorized signatory. The board resolution appointing them is the proof.',
    entryFields: personFields('signatory'),
  },

  // ---------- Part B: Authorized Representative ----------
  {
    id: 'gstHasRepresentative',
    label: 'Do you have any Authorized Representative?',
    type: 'segmented',
    section: S.representative,
    filledBy: LEAD,
    options: YES_NO,
    required: true,
  },
  {
    id: 'gstRepresentativeType',
    label: 'Type of Authorized Representative',
    type: 'segmented',
    section: S.representative,
    filledBy: LEAD,
    options: [
      { value: 'gst_practitioner', label: 'GST Practitioner' },
      { value: 'other', label: 'Other' },
    ],
    required: true,
    showWhen: { field: 'gstHasRepresentative', value: 'yes' },
  },
  {
    id: 'gstRepresentativeEnrolmentId',
    label: 'Enrolment ID of the GST Practitioner',
    type: 'text',
    section: S.representative,
    filledBy: LEAD,
    showWhen: { field: 'gstRepresentativeType', value: 'gst_practitioner' },
  },
  {
    id: 'gstRepresentativeDetails',
    label: 'Name, designation, mobile, email and PAN of the representative',
    type: 'textarea',
    section: S.representative,
    filledBy: LEAD,
    showWhen: { field: 'gstRepresentativeType', value: 'other' },
  },

  // ---------- Part B: Principal Place of Business ----------
  ...addressFields(S.principal).map((field) => ({ ...field, id: `gstPpob${field.id[0]!.toUpperCase()}${field.id.slice(1)}` })),
  { id: 'gstPpobOfficeEmail', label: 'Office Email Address', type: 'text', section: S.principal, required: true, layout: 'short' },
  { id: 'gstPpobOfficeTelephone', label: 'Office Telephone Number (with STD code)', type: 'text', section: S.principal, layout: 'short' },
  { id: 'gstPpobMobile', label: 'Mobile Number', type: 'text', section: S.principal, required: true, layout: 'short' },
  { id: 'gstPpobFax', label: 'Office FAX Number (with STD code)', type: 'text', section: S.principal, layout: 'short' },
  {
    id: 'gstPpobPossession',
    label: 'Nature of possession of premises',
    type: 'select',
    section: S.principal,
    options: NATURE_OF_POSSESSION,
    required: true,
    layout: 'short',
  },
  {
    id: 'gstPpobProofType',
    label: 'Document type for proof of Principal Place of Business',
    type: 'select',
    section: S.principal,
    options: PREMISES_PROOF,
    required: true,
    layout: 'short',
  },
  {
    id: 'gstPpobProofUrl',
    label: 'Proof of Principal Place of Business (PDF or JPEG, up to 1 MB)',
    type: 'file',
    section: S.principal,
    accept: '.pdf,image/jpeg',
    required: true,
  },
  {
    id: 'gstPpobElectricityBillUrl',
    label: 'Latest Electricity Bill of the premises',
    type: 'file',
    section: S.principal,
    accept: '.pdf,image/*',
    helperText: 'Upload it with the rent agreement or the consent letter; the GST officer asks for both.',
  },
  {
    id: 'gstPpobNocUrl',
    label: 'No Objection Certificate / Consent Letter from the owner',
    type: 'file',
    section: S.principal,
    accept: '.pdf,image/*',
    required: true,
    showWhen: { field: 'gstPpobPossession', value: 'consent', anyOf: ['shared'] },
  },
  {
    id: 'gstPpobActivities',
    label: 'Nature of Business Activity being carried out at above mentioned premises',
    type: 'textarea',
    section: S.principal,
    required: true,
    helperText: BUSINESS_ACTIVITY_HELPER,
    placeholder: 'e.g. Supplier of Services, Office / Sale Office, Export',
  },
  {
    id: 'gstHasAdditionalPlaces',
    label: 'Have Additional Place of Business',
    type: 'segmented',
    section: S.principal,
    options: YES_NO,
    required: true,
  },

  // ---------- Part B: Additional Places of Business ----------
  {
    id: 'gstAdditionalPlaces',
    label: 'Additional Places of Business',
    type: 'repeat',
    section: S.additional,
    entryLabel: 'Additional Place',
    minEntries: 0,
    maxEntries: 20,
    emptyLabel: 'No additional places of business.',
    showWhen: { field: 'gstHasAdditionalPlaces', value: 'yes' },
    entryFields: [
      ...addressFields(),
      { id: 'officeEmail', label: 'Office Email Address', type: 'text', layout: 'short' },
      { id: 'mobile', label: 'Mobile Number', type: 'text', layout: 'short' },
      { id: 'possession', label: 'Nature of possession of premises', type: 'select', options: NATURE_OF_POSSESSION, required: true, layout: 'short' },
      { id: 'proofType', label: 'Document type for proof of Additional Place of Business', type: 'select', options: PREMISES_PROOF, required: true, layout: 'short' },
      { id: 'proofUrl', label: 'Proof of Additional Place of Business', type: 'file', accept: '.pdf,image/jpeg', required: true },
      { id: 'activities', label: 'Nature of Business Activity being carried out at above mentioned premises', type: 'textarea', required: true },
    ],
  },

  // ---------- Part B: Bank Accounts ----------
  {
    id: 'gstBankAccounts',
    label: 'Bank Accounts',
    type: 'repeat',
    section: S.bank,
    entryLabel: 'Bank Account',
    minEntries: 0,
    maxEntries: 10,
    emptyLabel: 'No bank account yet. The portal lets the account be added after registration (non-core amendment).',
    entryFields: [
      { id: 'accountNumber', label: 'Account Number', type: 'text', required: true, layout: 'short' },
      {
        id: 'accountType',
        label: 'Type of Account',
        type: 'select',
        required: true,
        options: [
          { value: 'current', label: 'Current Account' },
          { value: 'savings', label: 'Savings Account' },
          { value: 'cash_credit', label: 'Cash Credit Account' },
          { value: 'overdraft', label: 'Overdraft Account' },
          { value: 'nre', label: 'Non Resident Account' },
          { value: 'other', label: 'Others' },
        ],
        layout: 'short',
      },
      { id: 'ifsc', label: 'IFSC', type: 'text', required: true, layout: 'short' },
      { id: 'bankName', label: 'Name of the Bank', type: 'text', layout: 'short' },
      { id: 'branchAddress', label: 'Branch Address', type: 'text' },
      {
        id: 'proofType',
        label: 'Document type',
        type: 'select',
        required: true,
        options: [
          { value: 'statement', label: 'Bank Statement' },
          { value: 'passbook', label: 'Bank Passbook (first page)' },
          { value: 'cheque', label: 'Cancelled Cheque' },
        ],
        layout: 'short',
      },
      { id: 'proofUrl', label: 'Proof of Bank Account (PDF or JPEG, up to 1 MB)', type: 'file', accept: '.pdf,image/jpeg', required: true },
    ],
  },

  // ---------- Part B: State Specific Information ----------
  { id: 'gstPtEcNumber', label: 'Professional Tax Employee Code (EC) No.', type: 'text', section: S.state, layout: 'short' },
  { id: 'gstPtRcNumber', label: 'Professional Tax Registration Certificate (RC) No.', type: 'text', section: S.state, layout: 'short' },
  { id: 'gstExciseLicence', label: 'State Excise License No.', type: 'text', section: S.state, layout: 'short' },
  { id: 'gstExciseLicenceHolder', label: 'Name of the person in whose name Excise License is held', type: 'text', section: S.state, layout: 'short' },

  // ---------- Part B: Aadhaar Authentication ----------
  {
    id: 'gstAadhaarAuth',
    label: 'Opt for Aadhaar Authentication?',
    type: 'segmented',
    section: S.aadhaar,
    filledBy: LEAD,
    options: YES_NO,
    required: true,
    helperText:
      'Yes: the portal mails an authentication link to the promoter and the primary signatory after submission. No: a site verification or a visit to a GST Suvidha Kendra follows.',
  },
  {
    id: 'gstAadhaarAuthPersons',
    label: 'Persons selected for authentication',
    type: 'text',
    section: S.aadhaar,
    filledBy: LEAD,
    showWhen: { field: 'gstAadhaarAuth', value: 'yes' },
  },
  {
    id: 'gstAadhaarAuthStatus',
    label: 'Authentication status',
    type: 'segmented',
    section: S.aadhaar,
    filledBy: LEAD,
    options: [
      { value: 'pending', label: 'Link sent' },
      { value: 'done', label: 'Authenticated' },
      { value: 'biometric', label: 'Biometric at GSK' },
    ],
    showWhen: { field: 'gstAadhaarAuth', value: 'yes' },
  },

  // ---------- Part B: Verification ----------
  {
    id: 'gstVerificationSignatory',
    label: 'Name of Authorized Signatory',
    type: 'text',
    section: S.verification,
    filledBy: LEAD,
    required: true,
    helperText:
      'I hereby solemnly affirm and declare that the information given herein above is true and correct to the best of my knowledge and belief and nothing has been concealed therefrom.',
    layout: 'short',
  },
  { id: 'gstVerificationPlace', label: 'Place', type: 'text', section: S.verification, filledBy: LEAD, required: true, layout: 'short' },
  { id: 'gstVerificationDesignation', label: 'Designation / Status', type: 'text', section: S.verification, filledBy: LEAD, required: true, layout: 'short' },
  {
    id: 'gstSubmitMode',
    label: 'Submitted with',
    type: 'segmented',
    section: S.verification,
    filledBy: LEAD,
    options: [
      { value: 'dsc', label: 'DSC' },
      { value: 'evc', label: 'EVC' },
      { value: 'esign', label: 'E-Signature' },
    ],
    required: true,
  },

  // ---------- After submission: ARN, clarifications, certificate ----------
  { id: 'gstArn', label: 'Application Reference Number (ARN)', type: 'text', section: S.arn, filledBy: LEAD, required: true, layout: 'short' },
  { id: 'gstArnDate', label: 'ARN generated on', type: 'date', section: S.arn, filledBy: LEAD, required: true },
  {
    id: 'gstApplicationStatus',
    label: 'Application status',
    type: 'select',
    section: S.arn,
    filledBy: LEAD,
    options: [
      { value: 'pending_processing', label: 'Pending for Processing' },
      { value: 'clarification', label: 'Pending for Clarification (REG-03)' },
      { value: 'clarification_filed', label: 'Clarification filed (REG-04)' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
    ],
    required: true,
    layout: 'short',
  },
  {
    id: 'gstClarificationNotes',
    label: 'Notice and clarification (REG-03 / REG-04)',
    type: 'textarea',
    section: S.arn,
    filledBy: LEAD,
    showWhen: { field: 'gstApplicationStatus', value: 'clarification', anyOf: ['clarification_filed'] },
  },
  {
    id: 'gstinNumber',
    label: 'GSTIN',
    type: 'text',
    section: S.arn,
    filledBy: LEAD,
    placeholder: 'e.g. 29AABCS1429B1Z1',
    required: true,
    layout: 'short',
  },
  { id: 'gstRegistrationDate', label: 'GST Registration Date', type: 'date', section: S.arn, filledBy: LEAD, required: true },
  {
    id: 'gstCertificateUrl',
    label: 'GST Certificate (REG-06)',
    type: 'file',
    section: S.arn,
    filledBy: LEAD,
    accept: '.pdf,image/*',
    required: true,
  },

  // ---------- LUT (RFD-11) ----------
  { id: 'lutFilingDate', label: 'LUT Filing Date', type: 'date', section: S.lut, filledBy: LEAD },
  {
    id: 'lutArn',
    label: 'LUT ARN / Acknowledgement',
    type: 'text',
    section: S.lut,
    filledBy: LEAD,
    placeholder: 'Application Reference Number',
  },
  {
    id: 'lutNotes',
    label: 'LUT notes (optional)',
    type: 'textarea',
    section: S.lut,
    filledBy: LEAD,
    placeholder: 'Witness KYC status, portal remarks…',
  },
];

/** The lead's own fields on `reg-4`; the client never sees or writes them. */
export const GST_REG_LEAD_ONLY_FIELD_IDS: readonly string[] = GST_REG_FIELDS.filter((f) => f.filledBy === LEAD).map((f) => f.id);

/** Part B is due 15 days after the TRN (the date the portal prints on the TRN page). */
export function gstPartBDueDate(trnDate: string | undefined | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((trnDate ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 15));
  return d.toISOString().slice(0, 10);
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PIN_RE = /^[1-9]\d{5}$/;
const MOBILE_RE = /^(\+?91[\s-]?)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Format checks the portal itself runs, so a typo is caught here and not on the
 * portal. Only filled fields are checked; the required check is separate. The
 * Part B deadline (15 days after the TRN) is a warning, never a block.
 */
export function gstRegFormatChecks(
  responses: Record<string, string>,
  today: string = new Date().toISOString().slice(0, 10),
): { errors: Record<string, string>; warnings: Record<string, string> } {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const v = (id: string) => (responses[id] ?? '').trim();
  const check = (id: string, re: RegExp, message: string, upper = false) => {
    const value = upper ? v(id).toUpperCase() : v(id);
    if (value && !re.test(value)) errors[id] = message;
  };
  check('gstCompanyPan', PAN_RE, 'Enter a valid PAN (for example AABCS1429B).', true);
  check('gstinNumber', GSTIN_RE, 'Enter a valid 15-character GSTIN.', true);
  check('gstPpobPinCode', PIN_RE, 'Enter a 6-digit PIN code.');
  check('gstPartAMobile', MOBILE_RE, 'Enter a 10-digit Indian mobile number.');
  check('gstPpobMobile', MOBILE_RE, 'Enter a 10-digit Indian mobile number.');
  check('gstPartAEmail', EMAIL_RE, 'Enter a valid email address.');
  check('gstPpobOfficeEmail', EMAIL_RE, 'Enter a valid email address.');

  const pan = v('gstCompanyPan').toUpperCase();
  const gstin = v('gstinNumber').toUpperCase();
  if (pan && gstin && !errors.gstinNumber && !errors.gstCompanyPan && gstin.slice(2, 12) !== pan) {
    errors.gstinNumber = 'The GSTIN does not contain the company PAN entered in Part A.';
  }

  const due = gstPartBDueDate(v('gstTrnDate'));
  if (due && !v('gstArn')) {
    warnings.gstTrn = due < today ? `Part B was due by ${due}; the TRN has expired. Start Part A again.` : `Part B is due by ${due}.`;
  }
  return { errors, warnings };
}
