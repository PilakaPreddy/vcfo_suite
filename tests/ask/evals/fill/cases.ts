/**
 * The data router's golden set: synthetic documents only (`make-fixtures.mjs` writes them), each
 * with the fields a person would expect on the card. `model` holds what the mock provider returns in
 * the code-only run; the live run ignores it and asks the real model.
 */
export interface FillCase {
  id: string;
  file?: string;
  paste?: string;
  /** What the person typed with it. */
  instruction?: string;
  /** `step/field` and value, in the shape the screen stores. Case does not matter. */
  expected: Array<[string, string]>;
  /** The document names another client: no row may be proposed for this engagement. */
  otherClient?: boolean;
  /** Fails unless reading is refused (identity documents with the flag off are tested separately). */
  model?: { docType: string; company: string | null; values: Array<{ label: string; value: string; page: number | null; person: string | null; confidence: number }> };
  /** The key the mock picks for a label that code cannot place. */
  picks?: Record<string, string>;
}

const value = (label: string, val: string, person: string | null = null, confidence = 0.95) => ({ label, value: val, page: 1, person, confidence });

export const FILL_CASES: FillCase[] = [
  {
    id: 'director-form-pdf',
    file: 'director-form.pdf',
    expected: [
      ['pre-15/firstName', 'Asha'],
      ['pre-15/middleName', 'Kamala'],
      ['pre-15/lastName', 'Rao'],
      ['pre-15/fatherName', 'Ramesh Rao'],
      ['pre-15/panNumber', 'ABCPR1234F'],
      ['pre-15/din', '01234567'],
      ['pre-15/dob', '1985-04-03'],
      ['pre-15/mobileNumber', '9876543210'],
      ['pre-15/personalMailId', 'asha.rao@example.com'],
      ['pre-15/firstName', 'Ravi'],
      ['pre-15/lastName', 'Menon'],
      ['pre-15/panNumber', 'DEFPM5678K'],
      ['pre-15/din', '07654321'],
      ['pre-15/dob', '1979-08-21'],
    ],
  },
  {
    id: 'directors-csv',
    file: 'directors.csv',
    expected: [
      ['pre-15/firstName', 'Asha'],
      ['pre-15/middleName', 'Kamala'],
      ['pre-15/lastName', 'Rao'],
      ['pre-15/panNumber', 'ABCPR1234F'],
      ['pre-15/din', '01234567'],
      ['pre-15/dob', '1985-04-03'],
      ['pre-15/firstName', 'Ravi'],
      ['pre-15/lastName', 'Menon'],
      ['pre-15/panNumber', 'DEFPM5678K'],
      ['pre-15/din', '07654321'],
      ['pre-15/dob', '1979-08-21'],
    ],
  },
  {
    id: 'capital-xlsx',
    file: 'capital.xlsx',
    expected: [
      ['pre-1/authorisedShareCapital', '100000'],
      ['pre-1/paidUpShareCapital', '50000'],
      ['pre-13/equityQuantity', '5000'],
      ['pre-1/nominalValuePerEquityShare', '10'],
    ],
  },
  {
    id: 'subscriber-docx',
    file: 'subscriber.docx',
    instruction: 'Add this as a subscriber',
    expected: [
      ['pre-16/name', 'Bluewater Holdings Limited'],
      ['pre-16/cin', 'U65100MH2011PLC234567'],
      ['pre-16/shares', '2500'],
    ],
  },
  {
    id: 'paste-labelled',
    paste: 'Add this as director 2\nName: Farah Khan\nDIN: 03456789\nDate of birth: 15/06/1988',
    expected: [
      ['pre-15/firstName', 'Farah'],
      ['pre-15/lastName', 'Khan'],
      ['pre-15/din', '03456789'],
      ['pre-15/dob', '1988-06-15'],
    ],
  },
  {
    id: 'pan-card-image',
    file: 'pan-card.png',
    expected: [
      ['pre-15/firstName', 'Asha'],
      ['pre-15/middleName', 'Kamala'],
      ['pre-15/lastName', 'Rao'],
      ['pre-15/fatherName', 'Ramesh Rao'],
      ['pre-15/panNumber', 'ABCPR1234F'],
      ['pre-15/dob', '1985-04-03'],
    ],
    model: {
      docType: 'pan_card',
      company: null,
      values: [
        value('Name', 'ASHA KAMALA RAO', 'ASHA KAMALA RAO'),
        value("Father's Name", 'RAMESH RAO', 'ASHA KAMALA RAO'),
        value('Permanent Account Number', 'ABCPR1234F', 'ASHA KAMALA RAO'),
        value('Date of Birth', '03/04/1985', 'ASHA KAMALA RAO'),
      ],
    },
  },
  {
    id: 'aadhaar-card-image',
    file: 'aadhaar-card.png',
    expected: [
      ['pre-15/firstName', 'Asha'],
      ['pre-15/middleName', 'Kamala'],
      ['pre-15/lastName', 'Rao'],
      ['pre-15/dob', '1985-04-03'],
      ['pre-15/gender', 'female'],
      ['pre-15/aadhaarNumber', '234567890123'],
    ],
    model: {
      docType: 'aadhaar_card',
      company: null,
      values: [
        value('Name', 'Asha Kamala Rao', 'Asha Kamala Rao'),
        value('DOB', '03/04/1985', 'Asha Kamala Rao'),
        value('Gender', 'FEMALE', 'Asha Kamala Rao'),
        value('Aadhaar number', '2345 6789 0123', 'Asha Kamala Rao'),
      ],
    },
  },
  {
    id: 'incorporation-certificate-prose',
    file: 'incorporation-certificate.pdf',
    expected: [
      ['pre-12/cin', 'U40100KA2026PTC123456'],
      ['pre-12/pan', 'AAACS1234F'],
      ['pre-12/tan', 'BLRS12345A'],
      ['pre-12/dateOfIncorporation', '2026-02-14'],
      ['pre-12/incorporatedCompanyName', 'Solstice Energy Private Limited'],
    ],
    model: {
      docType: 'incorporation_certificate',
      company: 'Solstice Energy Private Limited',
      values: [
        value('Corporate Identity Number', 'U40100KA2026PTC123456'),
        value('Permanent Account Number', 'IDTOKEN1X'),
        value('Tax Deduction Account Number', 'BLRS12345A'),
        value('Date of incorporation', '14/02/2026'),
      ],
    },
  },
  {
    id: 'intro-letter-prose',
    file: 'intro-letter.pdf',
    instruction: 'Add her as a new director',
    expected: [
      ['pre-15/firstName', 'Meera'],
      ['pre-15/lastName', 'Iyer'],
      ['pre-15/fatherName', 'Suresh Iyer'],
      ['pre-15/panNumber', 'GHIPI9012L'],
      ['pre-15/dob', '1990-09-12'],
      ['pre-15/mobileNumber', '9812345678'],
      ['pre-15/personalMailId', 'meera.iyer@example.com'],
    ],
    model: {
      docType: 'company_letter',
      company: 'Solstice Energy',
      values: [
        value('Name', 'Meera Iyer', 'Meera Iyer'),
        value('Date of birth', '12/09/1990', 'Meera Iyer'),
        value('Father', 'Suresh Iyer', 'Meera Iyer'),
        value('Permanent account number', 'IDTOKEN1X', 'Meera Iyer'),
        value('Mobile', '9812345678', 'Meera Iyer'),
        value('Email', 'meera.iyer@example.com', 'Meera Iyer'),
      ],
    },
    picks: { Father: 'director.father_name' },
  },
  {
    id: 'gst-certificate-no-place',
    file: 'gst-certificate.pdf',
    expected: [],
  },
  {
    id: 'injection-in-document',
    file: 'injection.pdf',
    instruction: 'Add him as a new director',
    expected: [
      ['pre-15/firstName', 'Vikram'],
      ['pre-15/lastName', 'Shah'],
      ['pre-15/dob', '1982-11-05'],
    ],
    model: {
      docType: 'company_letter',
      company: 'Solstice Energy',
      values: [value('Name', 'Vikram Shah', 'Vikram Shah'), value('Date of birth', '05/11/1982', 'Vikram Shah')],
    },
  },
  {
    id: 'wrong-company',
    file: 'wrong-company.pdf',
    otherClient: true,
    expected: [],
  },
];
