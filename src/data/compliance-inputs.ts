/**
 * COMPLIANCE INPUTS — the fields on an obligation period or a registration (C-415, C-417,
 * C-492, S-774, S-811). Each subject has two lists:
 *  - `client`: the details the client gives in the "From the client" card and submits;
 *  - `sbc`: the values SBC records in the "Filled by SBC" card.
 * The values are stored per engagement in `compliance_subject_fields` (migration 0029); this
 * file only holds the lists. A field key must stay stable once values exist, because the
 * stored value names it.
 *
 * Obligations: a list for the obligation id when it has its own, else the list of its
 * compliance area. The reference number, tax paid and filed-by facts of a period already live
 * on `compliance_instance_details`, so they are not repeated here.
 * Registrations: a list per registration step id; documents come from the checklist item's
 * `infoRequired` and from the document requests linked to the step.
 *
 * Pure data: no imports from the database or the UI.
 */

export interface InputField {
  key: string;
  label: string;
  /** Identifiers (GSTIN, PAN, TAN, CIN) show in mono (R-28). */
  mono?: boolean;
}

export interface SubjectInputs {
  client: InputField[];
  sbc: InputField[];
}

const f = (key: string, label: string, mono?: boolean): InputField => ({ key, label, ...(mono ? { mono } : {}) });

/* --------------------------------------------------------------------------------------- */
/* Obligations                                                                              */
/* --------------------------------------------------------------------------------------- */

const GST_RETURN: SubjectInputs = {
  client: [f('sales', 'Sales for the period (INR)'), f('purchases', 'Purchases for the period (INR)'), f('changes', 'New customers or vendors this period')],
  sbc: [f('gstin', 'GSTIN', true), f('itc', 'Input tax credit claimed (INR)'), f('tax', 'Tax payable (INR)')],
};

const TDS: SubjectInputs = {
  client: [f('payments', 'Payments with TDS this period'), f('new-vendors', 'New vendors or employees')],
  sbc: [f('tan', 'TAN', true), f('deducted', 'TDS deducted (INR)'), f('challan', 'Challan number', true)],
};

const BY_OBLIGATION: Record<string, SubjectInputs> = {
  'gst-gstr-1': {
    client: [f('invoices', 'Invoices issued this period'), f('credit-notes', 'Credit notes issued'), f('exports', 'Exports or SEZ supplies')],
    sbc: [f('gstin', 'GSTIN', true), f('outward', 'Outward taxable value (INR)'), f('hsn', 'HSN codes used')],
  },
  'gst-gstr-3b': GST_RETURN,
  'gst-gstr-9': {
    client: [f('turnover', 'Turnover for the year (INR)'), f('books-final', 'Books closed for the year')],
    sbc: [f('gstin', 'GSTIN', true), f('tax-paid', 'Tax paid in the year (INR)'), f('itc', 'Input tax credit in the year (INR)')],
  },
  'it-tds-payment': TDS,
  'it-tds-return-q1': TDS,
  'it-tds-return-q2': TDS,
  'it-tds-return-q3': TDS,
  'it-tds-return-q4': TDS,
  'it-itr': {
    client: [f('turnover', 'Turnover for the year (INR)'), f('bank-accounts', 'Bank accounts held')],
    sbc: [f('pan', 'PAN', true), f('income', 'Total income (INR)'), f('tax', 'Tax payable (INR)')],
  },
  'it-form-16': {
    client: [f('employees', 'Employees paid in the year')],
    sbc: [f('tan', 'TAN', true), f('issued', 'Form 16 issued to')],
  },
  'mca-aoc-4': {
    client: [f('agm', 'AGM date'), f('auditor', 'Statutory auditor')],
    sbc: [f('cin', 'CIN', true), f('turnover', 'Turnover in the accounts (INR)'), f('net-worth', 'Net worth (INR)')],
  },
  'mca-mgt-7': {
    client: [f('agm', 'AGM date'), f('shareholders', 'Shareholders at year end')],
    sbc: [f('cin', 'CIN', true), f('meetings', 'Board meetings in the year')],
  },
  'mca-dir3-kyc': {
    client: [f('mobile', 'Director mobile number'), f('email', 'Director email')],
    sbc: [f('din', 'DIN', true)],
  },
  'mca-dpt-3': {
    client: [f('loans', 'Loans or deposits received in the year')],
    sbc: [f('cin', 'CIN', true), f('outstanding', 'Amount outstanding (INR)')],
  },
  'labour-pf-payment': {
    client: [f('headcount', 'Employees on payroll'), f('wages', 'Wages paid this month (INR)')],
    sbc: [f('pf-code', 'PF establishment code', true), f('trrn', 'TRRN', true)],
  },
  'labour-esi-return': {
    client: [f('headcount', 'Employees covered'), f('wages', 'Wages paid in the period (INR)')],
    sbc: [f('esi-code', 'ESI code', true)],
  },
  'fema-fla': {
    client: [f('foreign-assets', 'Foreign assets at 31 March'), f('foreign-liabilities', 'Foreign liabilities at 31 March')],
    sbc: [f('uin', 'FLA unique id', true)],
  },
};

const BY_AREA: Record<string, SubjectInputs> = {
  GST: GST_RETURN,
  'Income Tax': {
    client: [f('notes', 'Anything SBC should know for this period')],
    sbc: [f('pan', 'PAN', true)],
  },
  'Companies Act, 2013': {
    client: [f('notes', 'Anything SBC should know for this filing')],
    sbc: [f('cin', 'CIN', true)],
  },
  'LLP Act': {
    client: [f('notes', 'Anything SBC should know for this filing')],
    sbc: [f('llpin', 'LLPIN', true)],
  },
  'Labour Laws': {
    client: [f('headcount', 'Employees on payroll')],
    sbc: [f('code', 'Registration code', true)],
  },
};

const GENERIC: SubjectInputs = { client: [f('notes', 'Anything SBC should know')], sbc: [] };

/** The field lists of an obligation, by id, then by compliance area. */
export function obligationInputs(obligationId: string, complianceArea?: string | null): SubjectInputs {
  return BY_OBLIGATION[obligationId] ?? (complianceArea ? BY_AREA[complianceArea] : undefined) ?? GENERIC;
}

/* --------------------------------------------------------------------------------------- */
/* Registrations                                                                            */
/* --------------------------------------------------------------------------------------- */

const BY_REGISTRATION: Record<string, SubjectInputs> = {
  'reg-1': {
    client: [f('headcount', 'Employees on payroll'), f('first-salary', 'First salary month')],
    sbc: [f('number', 'PF establishment code', true), f('arn', 'Application reference', true)],
  },
  'reg-2': { client: [], sbc: [f('pan', 'PAN', true), f('tan', 'TAN', true)] },
  'reg-3': {
    client: [f('headcount', 'Employees covered'), f('wages', 'Monthly wages (INR)')],
    sbc: [f('number', 'ESI code', true), f('arn', 'Application reference', true)],
  },
  'reg-4': {
    client: [f('business', 'Goods or services supplied'), f('place', 'Principal place of business'), f('turnover', 'Expected yearly turnover (INR)')],
    sbc: [f('number', 'GSTIN', true), f('arn', 'Application reference (ARN)', true), f('jurisdiction', 'Jurisdiction')],
  },
  'reg-5': { client: [f('witnesses', 'Names of the two witnesses')], sbc: [f('arn', 'LUT reference (ARN)', true), f('fy', 'Financial year')] },
  'reg-6': { client: [f('representative', 'Authorised representative')], sbc: [f('number', 'LEI', true), f('renewal', 'Renewal month')] },
  'reg-7': { client: [f('headcount', 'Employees in the state'), f('state', 'State')], sbc: [f('number', 'PT registration number', true)] },
  'reg-8': { client: [f('goods', 'Goods or services traded abroad')], sbc: [f('number', 'IEC', true)] },
  'reg-9': { client: [f('premises', 'Address of the premises'), f('headcount', 'Employees at the premises')], sbc: [f('number', 'Registration number', true)] },
  'reg-10': { client: [f('premises', 'Address of the premises'), f('trade', 'Trade carried on')], sbc: [f('number', 'Licence number', true)] },
  'reg-11': { client: [f('services', 'Software services exported')], sbc: [f('number', 'Registration number', true)] },
  'reg-12': { client: [f('mark', 'Mark to register'), f('classes', 'Classes of goods or services')], sbc: [f('number', 'Application number', true)] },
  'reg-13': { client: [f('contractors', 'Contractors engaged'), f('workers', 'Contract workers')], sbc: [f('number', 'Registration number', true)] },
  'reg-14': { client: [f('icc', 'Internal committee members')], sbc: [f('number', 'SHe-Box reference', true)] },
  'reg-15': { client: [f('activity', 'Main activity'), f('investment', 'Investment in plant and machinery (INR)')], sbc: [f('number', 'Udyam number', true)] },
  'reg-16': { client: [f('ports', 'Ports used')], sbc: [f('number', 'ICEGATE id', true)] },
  'reg-17': { client: [f('mark', 'Mark to renew')], sbc: [f('number', 'Registration number', true)] },
  'reg-18': { client: [f('invention', 'Title of the invention')], sbc: [f('number', 'Application number', true)] },
  'reg-19': { client: [], sbc: [f('number', 'Registration number', true)] },
  'reg-20': { client: [f('amount', 'Amount received (INR)'), f('received-on', 'Date of receipt')], sbc: [f('number', 'FC-GPR SRN', true)] },
  'reg-21': { client: [f('amount', 'Amount received (INR)')], sbc: [f('number', 'SRN', true)] },
  'reg-22': { client: [f('amount', 'Amount invested (INR)'), f('country', 'Country of investment')], sbc: [f('number', 'UIN', true)] },
  'reg-23': { client: [f('foreign-assets', 'Foreign assets at 31 March')], sbc: [f('number', 'FLA reference', true)] },
  'reg-24': { client: [f('transfer', 'Shares transferred'), f('price', 'Price per share (INR)')], sbc: [f('number', 'FC-TRS SRN', true)] },
};

/** The field lists of a registration step. Steps without a list get none. */
function registrationInputs(stepId: string): SubjectInputs {
  return BY_REGISTRATION[stepId] ?? { client: [], sbc: [] };
}

/** The field lists of any subject. */
export function subjectInputs(kind: 'obligation' | 'registration', ref: { obligationId?: string | null; complianceArea?: string | null; stepId?: string | null }): SubjectInputs {
  if (kind === 'registration') return registrationInputs(ref.stepId ?? '');
  return obligationInputs(ref.obligationId ?? '', ref.complianceArea);
}
