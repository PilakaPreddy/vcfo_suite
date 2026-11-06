import { blankRow, defaultSettings, newId, type BudgetSettings, type NamedRef, type RowDataByKind, type RowKind } from '@/lib/budget/model';

/**
 * BUDGET TEMPLATES — what a new budget starts with, by client type. A template sets the tax mode,
 * the departments and a few typical rows with no amounts, so a client fills figures rather than
 * building a structure. The tax values are starting points the firm confirms for each client.
 */

export interface BudgetTemplateRow {
  kind: RowKind;
  data: Partial<RowDataByKind[RowKind]>;
}

export interface BudgetTemplate {
  key: string;
  label: string;
  description: string;
  settings: (settings: BudgetSettings) => BudgetSettings;
  rows: (departments: NamedRef[]) => BudgetTemplateRow[];
}

const departments = (names: string[]): NamedRef[] => names.map((name) => ({ id: newId('dept'), name }));

const commonCosts: BudgetTemplateRow[] = [
  { kind: 'admin_rec', data: { name: 'Office rent', lineId: 'rent', frequency: 'monthly', gstPct: 18 } },
  { kind: 'admin_rec', data: { name: 'Electricity and utilities', lineId: 'utilities', frequency: 'monthly' } },
  { kind: 'admin_rec', data: { name: 'Internet', lineId: 'internet', frequency: 'monthly', gstPct: 18 } },
  { kind: 'admin_rec', data: { name: 'Software subscriptions', lineId: 'software', frequency: 'annual', gstPct: 18 } },
  { kind: 'finance_rec', data: { name: 'Statutory audit fee', lineId: 'audit_fees', frequency: 'annual', gstPct: 18 } },
  { kind: 'finance_rec', data: { name: 'Accounting and compliance retainer', lineId: 'compliance', frequency: 'monthly', gstPct: 18 } },
  { kind: 'finance_rec', data: { name: 'Bank charges', lineId: 'bank_charges', frequency: 'monthly', gstPct: 18 } },
];

const commonBenefits: BudgetTemplateRow[] = [
  { kind: 'benefit', data: { name: 'Group health insurance', lineId: 'group_insurance', basis: 'per_employee_year' } },
  { kind: 'benefit', data: { name: 'Laptop for new joiners', lineId: 'laptops', basis: 'per_joiner' } },
  { kind: 'benefit', data: { name: 'Staff welfare', lineId: 'welfare', basis: 'per_employee_month' } },
];

/* The structure of the owner's workbook, with no client figures. */
const coeBenefits: BudgetTemplateRow[] = [
  { kind: 'benefit', data: { name: 'Group health insurance', lineId: 'group_insurance', basis: 'per_employee_year' } },
  { kind: 'benefit', data: { name: "Workmen's compensation policy", lineId: 'workers_comp', basis: 'per_employee_year' } },
  { kind: 'benefit', data: { name: 'Transportation allowance', lineId: 'transport', basis: 'per_employee_month' } },
  { kind: 'benefit', data: { name: 'Meals cost or reimbursement', lineId: 'meals', basis: 'per_employee_month' } },
  { kind: 'benefit', data: { name: 'Allowances (shift / on-call)', lineId: 'allowances', basis: 'per_employee_month' } },
  { kind: 'benefit', data: { name: 'Team engagement', lineId: 'welfare', basis: 'per_employee_quarter' } },
  { kind: 'benefit', data: { name: 'Festival gift and annual event', lineId: 'welfare', basis: 'per_employee_year', timing: '11' } },
  { kind: 'benefit', data: { name: 'Employee travel', lineId: 'travel', basis: 'per_employee_quarter', timing: 'quarter_end' } },
  { kind: 'benefit', data: { name: 'Laptop and peripherals, new joiners', lineId: 'laptops', basis: 'per_joiner' } },
  { kind: 'benefit', data: { name: 'Rewards and recognition', lineId: 'rewards', basis: 'fixed_month' } },
];

const coeCosts: BudgetTemplateRow[] = [
  { kind: 'admin_rec', data: { name: 'Office rent', lineId: 'rent', frequency: 'monthly', gstPct: 18 } },
  { kind: 'admin_rec', data: { name: 'HVAC additional cost', lineId: 'utilities', frequency: 'monthly', gstPct: 18 } },
  { kind: 'admin_rec', data: { name: 'Internet', lineId: 'internet', frequency: 'quarterly', gstPct: 18 } },
  { kind: 'admin_rec', data: { name: 'POSH compliance', lineId: 'compliance', frequency: 'quarterly', gstPct: 18 } },
  { kind: 'admin_rec', data: { name: 'Marketing and PR', lineId: 'marketing', frequency: 'quarterly' } },
  { kind: 'admin_rec', data: { name: 'Software charges', lineId: 'software', frequency: 'annual' } },
  { kind: 'admin_rec', data: { name: 'Sundry office expense', lineId: 'maintenance', frequency: 'annual_spread' } },
  { kind: 'admin_rec', data: { name: 'Shops and establishment', lineId: 'compliance', frequency: 'annual' } },
  { kind: 'finance_rec', data: { name: 'Audit fee', lineId: 'audit_fees', frequency: 'annual', gstPct: 18 } },
  { kind: 'finance_rec', data: { name: 'Gratuity actuarial valuation', lineId: 'audit_fees', frequency: 'annual' } },
  { kind: 'finance_rec', data: { name: 'ROC compliance', lineId: 'compliance', frequency: 'annual' } },
  { kind: 'finance_rec', data: { name: 'Bank charges', lineId: 'bank_charges', frequency: 'monthly' } },
  { kind: 'finance_once', data: { name: 'Rates and taxes', lineId: 'rates_taxes' } },
  { kind: 'finance_once', data: { name: 'TDS interest', lineId: 'finance_other' } },
  { kind: 'finance_once', data: { name: 'Forex gain or loss', lineId: 'finance_other' } },
];

/* The module is for all clients, so a general company comes first and is the default. */
export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    key: 'services',
    label: 'Services company',
    description: 'A domestic firm with staff and overheads. Tax block off, because profit is not cost plus a mark-up.',
    settings: (s) => ({ ...s, departments: departments(['Delivery', 'Sales', 'Finance & admin']) }),
    rows: () => [...commonBenefits, ...commonCosts, { kind: 'admin_rec', data: { name: 'Marketing', lineId: 'marketing', frequency: 'monthly', gstPct: 18 } }],
  },
  {
    key: 'coe',
    label: 'India CoE / captive',
    description: 'An Indian team working for a foreign parent, billed at cost plus a mark-up. USD reporting and tax on.',
    settings: (s) => ({
      ...s,
      departments: departments(['Leadership', 'Engineering', 'Customer Success', 'Sales & Marketing', 'G&A']),
      reportCurrency: 'USD',
      fx: [{ code: 'USD', rate: 0, monthly: Array(12).fill(0) }],
      tax: { ...s.tax, mode: 'cost_plus', markupPct: 18.5 },
    }),
    rows: () => [...coeBenefits, ...coeCosts],
  },
  {
    key: 'startup',
    label: 'Startup',
    description: 'A small team and few cost lines, with a cash view for runway and a funds request.',
    settings: (s) => ({ ...s, departments: departments(['Product', 'Growth', 'Operations']) }),
    rows: () => [
      { kind: 'admin_rec', data: { name: 'Co-working seats', lineId: 'rent', frequency: 'monthly', gstPct: 18 } },
      { kind: 'admin_rec', data: { name: 'Software subscriptions', lineId: 'software', frequency: 'monthly', gstPct: 18 } },
      { kind: 'finance_rec', data: { name: 'Accounting and compliance retainer', lineId: 'compliance', frequency: 'monthly', gstPct: 18 } },
    ],
  },
  {
    key: 'blank',
    label: 'Blank',
    description: 'The standard budget lines and nothing else.',
    settings: (s) => s,
    rows: () => [],
  },
];

export function buildFromTemplate(key: string, fyStartYear: number, fyStartMonth: number, company: string): { settings: BudgetSettings; rows: { kind: RowKind; data: RowDataByKind[RowKind] }[] } {
  const template = BUDGET_TEMPLATES.find((t) => t.key === key) ?? BUDGET_TEMPLATES[BUDGET_TEMPLATES.length - 1];
  const settings = template.settings({ ...defaultSettings(fyStartYear, fyStartMonth), company });
  const rows = template.rows(settings.departments).map((r) => ({ kind: r.kind, data: { ...blankRow(r.kind), ...r.data } as RowDataByKind[RowKind] }));
  return { settings, rows };
}
