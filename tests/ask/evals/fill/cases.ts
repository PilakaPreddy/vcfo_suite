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

// ---- The drop's golden set -----------------------------------------------------------------------

/**
 * One dropped file, folder entry or paste. `fixture` names a file in `fixtures/`; `paste` is text
 * the person pasted with the drop. The path is what the browser reports for a dropped folder.
 */
export interface DropEntry {
  path: string;
  fixture?: string;
  paste?: string;
}

/** A row the card must hold: the action, part of its target, and for a value its new value. */
export interface DropRowExpect {
  action: string;
  target?: Record<string, unknown>;
  newValue?: string;
  /** Text the row's display must contain, such as "(assumed from the registered office)". */
  shows?: string;
}

/**
 * A drop through the whole job (unpack, read, sort, cards, closing message) with the repositories,
 * storage and model in memory (`drop-golden.test.ts`). The two clients are Acme Technologies, which
 * already files a Karnataka register, and Routeware Solutions, which has no batch yet and whose
 * registered office is in Kerala. Routeware has an open GSTR-3B task for August 2026.
 */
export interface DropCase {
  id: string;
  instruction: string;
  entries: DropEntry[];
  /** What the mock model returns for a read whose prompt contains `match`; anything else reads as nothing. */
  model?: Array<{ match: string; reply: { docType: string; company: string | null; values: Array<{ label: string; value: string; page: number | null; person: string | null; confidence: number }> } }>;
  expect: {
    /** One entry per card, by client. `rows` lists every row unless `partial` is set. */
    cards: Array<{ client: 'acme' | 'routeware'; rows: DropRowExpect[]; partial?: boolean }>;
    /** Paths left for "Where should these go?". */
    unplaced?: string[];
    /** Paths skipped before reading, with a piece of the reason. */
    skipped?: Array<{ path: string; reason: string }>;
    /** Text that must appear nowhere the person or a log can see: the run state, steps, messages, card display. */
    never?: string[];
  };
}

/** Routeware's open GSTR-3B task for August 2026, in the golden drop's memory world. */
export const GSTR3B_TASK_ID = '3c3c3c3c-0000-4000-8000-000000000003';

const paysheetRow = (patch: Record<string, unknown> = {}): DropRowExpect => ({ action: 'labour.uploadSheet', target: { slot: 'paysheet', periodFrom: '2026-08-01', periodTo: '2026-08-31', ...patch } });

export const DROP_CASES: DropCase[] = [
  {
    id: 'two-clients-in-one-zip',
    instruction: 'Fill this in',
    entries: [{ path: 'month-end.zip', fixture: 'drop-two-clients.zip' }],
    model: [{ match: 'GSTR-3B', reply: { docType: 'form', company: 'Routeware Solutions LLP', values: [] } }],
    expect: {
      cards: [
        { client: 'acme', rows: [paysheetRow({ stateCode: 'KA' })] },
        { client: 'routeware', rows: [{ action: 'compliance.attachEvidence', target: { taskId: GSTR3B_TASK_ID } }] },
      ],
    },
  },
  {
    id: 'acme-payroll-folder',
    instruction: 'Fill this in',
    entries: [
      { path: 'Acme/Payroll/Aug-2026/paysheet.xlsx', fixture: 'drop-paysheet.xlsx' },
      { path: 'Acme/Payroll/Aug-2026/attendance.xlsx', fixture: 'drop-attendance.xlsx' },
    ],
    expect: {
      cards: [
        {
          client: 'acme',
          rows: [
            { ...paysheetRow({ stateCode: 'KA' }), shows: '3 rows' },
            { action: 'labour.uploadSheet', target: { slot: 'attendance', stateCode: 'KA', periodFrom: '2026-08-01', periodTo: '2026-08-31' } },
          ],
        },
      ],
    },
  },
  {
    id: 'sheet-with-no-state',
    instruction: 'Fill this in',
    entries: [{ path: 'Routeware/Payroll/Aug-2026/paysheet.xlsx', fixture: 'drop-paysheet.xlsx' }],
    expect: {
      cards: [{ client: 'routeware', rows: [{ ...paysheetRow({ stateCode: 'KL', stateAssumed: true }), shows: '(assumed from the registered office)' }] }],
    },
  },
  {
    id: 'pasted-email-prose',
    instruction: 'Fill this in',
    entries: [
      {
        path: 'Pasted text',
        paste:
          'Hi team, Acme Technologies is adding a new director. She is Meera Iyer, born on 12/09/1990. Her father is Suresh Iyer. Her PAN is GHIPI9012L and you can reach her on 9812345678. Thanks, the promoters.',
      },
    ],
    model: [
      {
        match: 'Meera Iyer',
        reply: {
          docType: 'company_letter',
          company: 'Acme Technologies',
          values: [
            { label: 'Name', value: 'Meera Iyer', page: null, person: 'Meera Iyer', confidence: 0.95 },
            { label: 'Date of birth', value: '12/09/1990', page: null, person: 'Meera Iyer', confidence: 0.95 },
            { label: "Father's name", value: 'Suresh Iyer', page: null, person: 'Meera Iyer', confidence: 0.95 },
            { label: 'PAN', value: 'IDTOKEN1X', page: null, person: 'Meera Iyer', confidence: 0.95 },
            { label: 'Mobile', value: '9812345678', page: null, person: 'Meera Iyer', confidence: 0.95 },
          ],
        },
      },
    ],
    expect: {
      cards: [
        {
          client: 'acme',
          partial: true,
          rows: [
            { action: 'checklist.setResponse', target: { stepId: 'pre-15', fieldId: 'firstName' }, newValue: 'Meera' },
            { action: 'checklist.setResponse', target: { stepId: 'pre-15', fieldId: 'lastName' }, newValue: 'Iyer' },
            { action: 'checklist.setResponse', target: { stepId: 'pre-15', fieldId: 'panNumber' }, newValue: 'GHIPI9012L' },
            { action: 'checklist.setResponse', target: { stepId: 'pre-15', fieldId: 'dob' }, newValue: '1990-09-12' },
          ],
        },
      ],
      never: ['GHIPI9012L'],
    },
  },
  {
    id: 'scanned-pan-masked',
    instruction: 'Fill this in',
    entries: [{ path: 'Acme/KYC/pan-card.png', fixture: 'pan-card.png' }],
    model: [
      {
        match: '"type":"image"',
        reply: {
          docType: 'pan_card',
          company: null,
          values: [
            { label: 'Name', value: 'ASHA KAMALA RAO', page: 1, person: 'ASHA KAMALA RAO', confidence: 0.95 },
            { label: 'Permanent Account Number', value: 'ABCPR1234F', page: 1, person: 'ASHA KAMALA RAO', confidence: 0.95 },
            { label: 'Date of Birth', value: '03/04/1985', page: 1, person: 'ASHA KAMALA RAO', confidence: 0.95 },
          ],
        },
      },
    ],
    expect: {
      cards: [
        {
          client: 'acme',
          partial: true,
          rows: [
            { action: 'checklist.setResponse', target: { stepId: 'pre-15', fieldId: 'panNumber' }, newValue: 'ABCPR1234F' },
            { action: 'checklist.attachFile', target: { stepId: 'pre-15', fieldId: 'panCopyUrl' } },
          ],
        },
      ],
      never: ['ABCPR1234F'],
    },
  },
  {
    id: 'gst-return-to-compliance-evidence',
    instruction: 'Fill this in',
    entries: [{ path: 'Routeware/GSTR-3B Aug-2026.pdf', fixture: 'drop-gstr3b.pdf' }],
    model: [{ match: 'GSTR-3B', reply: { docType: 'form', company: 'Routeware Solutions LLP', values: [] } }],
    expect: { cards: [{ client: 'routeware', rows: [{ action: 'compliance.attachEvidence', target: { taskId: GSTR3B_TASK_ID }, shows: 'GSTR-3B (Aug 2026)' }] }] },
  },
  {
    id: 'contract-to-vault',
    instruction: 'File these',
    entries: [{ path: 'Acme/Contracts/office licence.pdf', fixture: 'drop-lease.pdf' }],
    model: [{ match: 'Leave and licence', reply: { docType: 'rent_agreement', company: 'Acme Technologies Private Limited', values: [] } }],
    expect: { cards: [{ client: 'acme', rows: [{ action: 'documents.fileToVault', target: { category: 'Contracts' } }] }] },
  },
  {
    id: 'instruction-hidden-in-file',
    instruction: 'Fill this in',
    entries: [{ path: 'Acme/Board/minutes note.pdf', fixture: 'drop-injection.pdf' }],
    // The model keeps to its rules: it names the client and lists nothing from the note.
    model: [{ match: 'SYSTEM NOTE', reply: { docType: 'company_letter', company: 'Acme Technologies', values: [] } }],
    expect: {
      cards: [{ client: 'acme', rows: [{ action: 'documents.fileToVault', target: { category: 'Letters' } }] }],
      never: ['ZZZZZ9999Z'],
    },
  },
  {
    id: 'xls-skipped',
    instruction: 'Fill this in',
    entries: [
      { path: 'Acme/Payroll/Aug-2026/old payroll.xls', fixture: 'drop-old.xls' },
      { path: 'Acme/Payroll/Aug-2026/paysheet.xlsx', fixture: 'drop-paysheet.xlsx' },
    ],
    expect: {
      cards: [{ client: 'acme', rows: [paysheetRow({ stateCode: 'KA' })] }],
      skipped: [{ path: 'Acme/Payroll/Aug-2026/old payroll.xls', reason: 'save it as .xlsx' }],
    },
  },
];
