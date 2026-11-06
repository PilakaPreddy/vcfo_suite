import type { FieldFormat, FieldSensitivity, FieldSubject } from './types';

/**
 * What the source files do not say: which fields hold the same fact, what people call it and what
 * shape it has. `fields` names `<step>/<field>`, with `#` for a slot number and `group.field` for a
 * field on a repeating list. Any field not named here still gets an entry of its own, from its label.
 */
export interface CanonicalRule {
  key: string;
  label: string;
  format?: FieldFormat;
  sensitivity?: FieldSensitivity;
  subject: FieldSubject;
  synonyms: string[];
  fields: string[];
  /** Names used on the compliance input lists, by their `key`. */
  inputs?: string[];
  expands?: string[];
}

const person = (key: string, label: string, synonyms: string[], fields: string[], extra: Partial<CanonicalRule> = {}): CanonicalRule => ({
  key: `director.${key}`,
  label,
  subject: 'director',
  synonyms,
  fields: fields.map((f) => (f.includes('/') ? f : `pre-15/directors.${f}`)),
  ...extra,
});

export const CANONICAL_RULES: readonly CanonicalRule[] = [
  person('name', 'Director name (whole)', ['name', 'full name', 'name of director', 'director name', 'applicant name', 'name of card holder', 'holder name'], [], {
    expands: ['director.first_name', 'director.middle_name', 'director.last_name'],
  }),
  person('first_name', 'Director first name', ['first name', 'given name', 'forename'], ['firstName', 'pre-1/director#FirstName']),
  person('middle_name', 'Director middle name', ['middle name'], ['middleName', 'pre-1/director#MiddleName']),
  person('last_name', 'Director last name', ['last name', 'surname', 'family name'], ['lastName', 'pre-1/director#LastName']),
  person('gender', 'Director gender', ['gender', 'sex'], ['gender', 'pre-1/director#Gender'], { format: 'choice' }),
  person('india_resident', 'Director resident of India', ['resident of india', 'india resident', 'residential status', 'resident'], ['indiaResident', 'pre-1/director#IndiaResident'], { format: 'choice' }),
  person('nationality', 'Director nationality', ['nationality', 'citizenship', 'country of citizenship'], ['nationality'], { format: 'choice' }),
  person('din', 'Director DIN', ['din', 'din number', 'director identification number'], ['din'], { format: 'din', sensitivity: 'identity', inputs: ['din'] }),
  person('dob', 'Director date of birth', ['date of birth', 'dob', 'birth date', 'd o b', 'born on'], ['dob'], { format: 'date' }),
  person('father_name', "Director father's name", ["father's name", 'fathers name', 'father name', 'name of father'], ['fatherName']),
  person('qualification', 'Director qualification', ['qualification', 'highest qualification', 'education', 'highest educational qualification'], ['highestEducationalQualification'], { format: 'choice' }),
  person('occupation', 'Director occupation', ['occupation', 'occupation type', 'profession'], ['occupationType'], { format: 'choice' }),
  person('mobile', 'Director mobile number', ['mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'contact number'], ['mobileNumber'], { format: 'mobile', inputs: ['mobile'] }),
  person('email', 'Director personal e-mail', ['email', 'e mail', 'email id', 'personal email', 'personal e mail'], ['personalMailId'], { format: 'email', inputs: ['email'] }),
  person('email_official', 'Director official e-mail', ['official email', 'official e mail', 'work email'], ['officialMailId'], { format: 'email' }),
  person('aadhaar', 'Director Aadhaar number', ['aadhaar', 'aadhar', 'aadhaar number', 'aadhaar no', 'uid', 'uidai number'], ['aadhaarNumber'], { format: 'aadhaar', sensitivity: 'identity' }),
  person('pan', 'Director PAN', ['pan', 'pan number', 'pan no', 'permanent account number', 'income tax pan'], ['panNumber'], { format: 'pan', sensitivity: 'identity' }),
  person('passport', 'Director passport number', ['passport', 'passport number', 'passport no'], ['passportNumber'], { format: 'passport', sensitivity: 'identity' }),
  person('driving_licence', 'Director driving licence number', ['driving licence', 'driving license', 'dl number', 'licence number'], ['drivingLicenceNumber'], { sensitivity: 'identity' }),
  person('utility_bill_type', 'Director utility bill type', ['utility bill type', 'bill type'], ['utilityBillType'], { format: 'choice' }),
  person('utility_bill_number', 'Director utility bill number', ['utility bill number', 'bill number', 'consumer number', 'account number on the bill'], ['utilityBillNumber']),
  person('address', 'Director address', ['address', 'residential address', 'address as per utility bill', 'present address', 'permanent address'], ['utilityBillAddress']),
  person('pan_copy', 'Copy of PAN card', [], ['panCopyUrl'], { format: 'file' }),
  person('aadhaar_copy', 'Copy of Aadhaar card', [], ['aadhaarCopyUrl'], { format: 'file' }),
  person('passport_copy', 'Copy of passport', [], ['passportCopyUrl'], { format: 'file' }),
  person('driving_licence_copy', 'Copy of driving licence', [], ['drivingLicenceCopyUrl'], { format: 'file' }),
  person('utility_bill_copy', 'Copy of utility bill', [], ['utilityBillCopyUrl'], { format: 'file' }),

  { key: 'company.name', label: 'Company name', subject: 'company', synonyms: ['company name', 'name of the company', 'incorporated company name', 'approved company name', 'approved name'], fields: ['pre-12/incorporatedCompanyName', 'pre-5/approvedCompanyName'] },
  { key: 'company.cin', label: 'Company CIN', format: 'cin', subject: 'company', synonyms: ['cin', 'corporate identification number', 'corporate identity number', 'company cin'], fields: ['pre-12/cin'], inputs: ['cin'] },
  { key: 'company.pan', label: 'Company PAN', format: 'pan', sensitivity: 'identity', subject: 'company', synonyms: ['company pan', 'pan of the company', 'permanent account number', 'pan'], fields: ['pre-12/pan'], inputs: ['pan'] },
  { key: 'company.tan', label: 'Company TAN', format: 'tan', subject: 'company', synonyms: ['tan', 'tan number', 'tax deduction account number', 'tax deduction and collection account number'], fields: ['pre-12/tan'], inputs: ['tan'] },
  { key: 'company.gstin', label: 'Company GSTIN', format: 'gstin', subject: 'company', synonyms: ['gstin', 'gst number', 'gst registration number', 'gst no'], fields: ['reg-4/gstinNumber'], inputs: ['gstin'] },
  { key: 'company.incorporation_date', label: 'Date of incorporation', format: 'date', subject: 'company', synonyms: ['date of incorporation', 'incorporation date', 'incorporated on'], fields: ['pre-12/dateOfIncorporation'] },
  { key: 'company.pf_code', label: 'PF establishment code', subject: 'company', synonyms: ['pf code', 'pf establishment code', 'provident fund code'], fields: ['pre-12/pfCode'], inputs: ['pf-code'] },
  { key: 'company.esi_code', label: 'ESI code', subject: 'company', synonyms: ['esi code', 'esic code', 'employees state insurance code'], fields: ['pre-12/esiCode'], inputs: ['esi-code'] },
  { key: 'company.proposed_name_1', label: 'Proposed company name 1', subject: 'company', synonyms: ['proposed name 1', 'first proposed name', 'proposed company name 1'], fields: ['pre-1/proposedName1'] },
  { key: 'company.proposed_name_2', label: 'Proposed company name 2', subject: 'company', synonyms: ['proposed name 2', 'second proposed name', 'proposed company name 2'], fields: ['pre-1/proposedName2'] },
  { key: 'company.nic_code', label: 'Main NIC code', subject: 'company', synonyms: ['nic code', 'main nic code', 'nic', 'national industrial classification'], fields: ['pre-1/nicCode'] },
  { key: 'company.business_type', label: 'Business type', subject: 'company', synonyms: ['business type'], fields: ['pre-1/nicBusinessType'] },
  { key: 'company.business_description', label: 'Business description', format: 'longtext', subject: 'company', synonyms: ['business description', 'description of business', 'nature of business', 'business activity'], fields: ['pre-1/businessDescription'] },
  { key: 'capital.authorised', label: 'Authorised share capital', format: 'amount', subject: 'company', synonyms: ['authorised share capital', 'authorized share capital', 'authorised capital', 'authorized capital'], fields: ['pre-1/authorisedShareCapital'] },
  { key: 'capital.paid_up', label: 'Paid-up share capital', format: 'amount', subject: 'company', synonyms: ['paid up share capital', 'paid up capital', 'initial paid up share capital'], fields: ['pre-1/paidUpShareCapital'] },
  { key: 'capital.nominal', label: 'Nominal value per equity share', subject: 'company', synonyms: ['nominal value per equity share', 'nominal value', 'face value', 'face value per share', 'nominal value of each equity share'], fields: ['pre-1/nominalValuePerEquityShare', 'pre-13/equityNominalValue'] },
  { key: 'capital.equity_quantity', label: 'Number of equity shares', subject: 'company', synonyms: ['number of equity shares', 'equity shares', 'no of equity shares'], fields: ['pre-13/equityQuantity'] },

  { key: 'office.address', label: 'Registered office address', format: 'longtext', subject: 'office', synonyms: ['registered office', 'registered office address', 'complete address of the proposed registered office', 'office address'], fields: ['pre-14/registeredOfficeCompleteAddress'] },
  { key: 'office.state', label: 'Registered office state', format: 'choice', subject: 'office', synonyms: ['registered office state', 'state of registered office', 'state'], fields: ['pre-14/registeredOfficeState'] },
  { key: 'office.utility_bill_type', label: 'Office utility bill type', format: 'choice', subject: 'office', synonyms: ['office utility bill type', 'registered office utility bill type'], fields: ['pre-14/registeredOfficeUtilityBillType'] },
  { key: 'office.utility_bill_number', label: 'Office utility bill number', subject: 'office', synonyms: ['office utility bill number', 'registered office utility bill number'], fields: ['pre-14/registeredOfficeUtilityBillNumber'] },

  { key: 'parent.name', label: 'Foreign entity name', subject: 'parent', synonyms: ['foreign entity', 'foreign entity name', 'name of the foreign entity', 'parent company', 'parent entity', 'holding company'], fields: ['pre-1/parentEntityName'] },
  { key: 'parent.address', label: 'Foreign entity address', format: 'longtext', subject: 'parent', synonyms: ['foreign entity address', 'parent company address', 'parent entity address'], fields: ['pre-1/parentEntityAddress'] },
  { key: 'parent.country', label: 'Foreign entity country', format: 'choice', subject: 'parent', synonyms: ['country of incorporation', 'foreign entity country', 'parent country'], fields: ['pre-1/parentEntityCountry'] },
  { key: 'parent.state', label: 'Foreign entity state', subject: 'parent', synonyms: ['state of incorporation', 'foreign entity state', 'parent state'], fields: ['pre-1/parentEntityState'] },

  { key: 'signatory.first_name', label: 'Signatory first name', subject: 'signatory', synonyms: ['signatory first name', 'person signing first name'], fields: ['pre-1/signatoryFirstName'] },
  { key: 'signatory.middle_name', label: 'Signatory middle name', subject: 'signatory', synonyms: ['signatory middle name'], fields: ['pre-1/signatoryMiddleName'] },
  { key: 'signatory.last_name', label: 'Signatory last name', subject: 'signatory', synonyms: ['signatory last name', 'person signing last name'], fields: ['pre-1/signatoryLastName'] },
  { key: 'signatory.designation', label: 'Signatory designation', subject: 'signatory', synonyms: ['signatory designation', 'designation of the person signing', 'designation'], fields: ['pre-1/signatoryDesignation'] },

  { key: 'subscriber.name', label: 'Subscriber name', subject: 'subscriber', synonyms: ['subscriber', 'subscriber name', 'name of subscriber'], fields: ['pre-16/subscribers.name'] },
  { key: 'subscriber.type', label: 'Subscriber type', format: 'choice', subject: 'subscriber', synonyms: ['subscriber type'], fields: ['pre-16/subscribers.type'] },
  { key: 'subscriber.cin', label: 'Subscriber CIN', format: 'cin', subject: 'subscriber', synonyms: ['subscriber cin'], fields: ['pre-16/subscribers.cin'] },
  { key: 'subscriber.llpin', label: 'Subscriber LLPIN', format: 'llpin', subject: 'subscriber', synonyms: ['subscriber llpin', 'llpin'], fields: ['pre-16/subscribers.llpin'] },
  { key: 'subscriber.address', label: 'Subscriber address', format: 'longtext', subject: 'subscriber', synonyms: ['subscriber address', 'registered address of the body corporate'], fields: ['pre-16/subscribers.address'] },
  { key: 'subscriber.shares', label: 'Subscriber shares', subject: 'subscriber', synonyms: ['number of shares', 'shares subscribed', 'shares'], fields: ['pre-16/subscribers.shares'] },
  { key: 'subscriber.share_value', label: 'Subscriber share value', format: 'amount', subject: 'subscriber', synonyms: ['value of shares', 'subscription amount'], fields: ['pre-16/subscribers.shareValue'] },
  { key: 'subscriber.authorised_person', label: 'Subscriber authorised person', subject: 'subscriber', synonyms: ['authorised person', 'authorized person', 'authorised signatory'], fields: ['pre-16/subscribers.authorisedPerson'] },
];

/** A field whose id ends this way holds this format, even with no rule above. */
export const FORMAT_BY_FIELD_ID: ReadonlyArray<readonly [RegExp, FieldFormat]> = [
  [/gstin/i, 'gstin'],
  [/ifsc/i, 'ifsc'],
  [/llpin$/i, 'llpin'],
  [/(^|[a-z])Cin$/, 'cin'],
];

/** Workflow stamps and code-written fields: a document never fills these. */
export const NOT_WRITABLE = /(GeneratedAt|SharedAt|reviewStatus|Confirmation$|coiSignatureVerified)/;
