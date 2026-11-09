/**
 * BUDGET MODEL — the shapes one annual budget is made of, shared by the engine, the repositories,
 * the API and the screens. See docs/specs/budget/PLAN.md.
 *
 * Two rules exist because the original workbook page broke without them:
 *  - Rows point at departments, locations and budget lines by id, so a rename changes one label
 *    and no figure.
 *  - Monthly values are stored by calendar month (index 0 is January), so moving the start of the
 *    financial year does not move a figure to a different month.
 *
 * Percentages are stored as typed: 18 means 18%.
 */

export const BUDGET_SECTIONS = ['hiring', 'benefits', 'admin', 'finance', 'settings'] as const;
export type BudgetSection = (typeof BUDGET_SECTIONS)[number];

export const SECTION_LABEL: Record<BudgetSection, string> = {
  hiring: 'CTC & hiring',
  benefits: 'Benefits',
  admin: 'Admin costs',
  finance: 'Finance costs',
  settings: 'Settings',
};

/** The team that fills each tab, as the firm decided for all clients. Owners are named per budget. */
export const SECTION_TEAM: Record<BudgetSection, string> = {
  hiring: 'Talent Acquisition',
  benefits: 'HR',
  admin: 'Admin',
  finance: 'Finance',
  settings: 'Finance',
};

export type RowKind = 'role' | 'benefit' | 'admin_rec' | 'admin_once' | 'finance_rec' | 'finance_once';

export const ROW_SECTION: Record<RowKind, BudgetSection> = {
  role: 'hiring',
  benefit: 'benefits',
  admin_rec: 'admin',
  admin_once: 'admin',
  finance_rec: 'finance',
  finance_once: 'finance',
};

export const BUDGET_STATUSES = ['draft', 'published', 'approved'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const SECTION_STATUSES = ['not_started', 'in_progress', 'done', 'sent_back'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD', 'CAD', 'CHF'] as const;

/** Twelve values by calendar month: index 0 is January. */
export type Months12 = number[];

export const zero12 = (): Months12 => Array(12).fill(0);

export interface NamedRef {
  id: string;
  name: string;
}

/** `system` marks the lines the engine writes to itself, so they cannot be removed. */
export type SystemLine = 'salaries' | 'statutory' | 'gratuity' | 'depreciation';

export interface BudgetLine {
  id: string;
  group: string;
  name: string;
  system?: SystemLine;
}

export interface FxRate {
  code: string;
  /** INR for one unit, used for every month without its own rate. */
  rate: number;
  /** Optional rate per calendar month; 0 means use `rate`. */
  monthly: Months12;
}

/**
 * One block of assets for depreciation. The Income-tax Act depreciates a block on written-down
 * value at its rate; the Companies Act 2013 uses a written-down-value rate worked out from the
 * useful life in Schedule II with a 5% residual value.
 */
export interface AssetBlock {
  id: string;
  name: string;
  itRatePct: number;
  lifeYears: number;
  /** Written-down value on the first day of the year, under each Act. */
  openingIt: number;
  openingCos: number;
  /** A budget line whose cost is capitalised into this block (for example Laptops). Empty for none. */
  linkLineId: string;
  /** Further additions by calendar month, typed by hand. */
  additions: Months12;
}

export interface TaxSettings {
  /** `none` hides the whole block: not every client is a cost-plus company. */
  mode: 'none' | 'cost_plus';
  /** The preset last chosen; empty once a rate is typed by hand. */
  preset?: string;
  markupPct: number;
  ratePct: number;
  /** Used when `surchargeBySlab` is off. */
  surchargePct: number;
  /** The regular regime: 0% up to 1 crore of taxable income, 7% up to 10 crore, 12% above. */
  surchargeBySlab?: boolean;
  cessPct: number;
  /** Premium per employee per year. When either is above 0, insurance is taken on a prepaid basis. */
  insuranceGroupPerYear?: number;
  insuranceWcPerYear?: number;
  /** The budget lines that hold the insurance as booked or paid. */
  insuranceLineIds?: string[];
  assetBlocks?: AssetBlock[];
}

export interface StatutorySettings {
  enabled: boolean;
  /** Share of CTC treated as basic pay. */
  basicSharePct: number;
  pfPct: number;
  /** Monthly wage ceiling for employer PF; 0 means no ceiling. */
  pfWageCap: number;
  esiPct: number;
  /** ESI applies when monthly pay is at or under this figure. */
  esiWageLimit: number;
  gratuityPct: number;
  leavePct: number;
}

export interface ScenarioFactor {
  hiresPct: number;
  costPct: number;
}

export interface BudgetSettings {
  company: string;
  title: string;
  fyStartMonth: number;
  fyStartYear: number;
  asOf: string;
  /** Currency of the second reporting column; empty means INR only. */
  reportCurrency: string;
  fx: FxRate[];
  departments: NamedRef[];
  locations: NamedRef[];
  lines: BudgetLine[];
  /** Applied to every role that has no increase of its own. */
  incrementPct: number;
  incrementMonth: number;
  attritionPct: number;
  /** The payroll the client quotes today, compared with roles x CTC. 0 means not given. */
  currentMonthlyPayroll: number;
  /** `roles` works out existing salary from CTC and opening headcount; `typed` uses the total above. */
  payrollSource?: 'roles' | 'typed';
  statutory: StatutorySettings;
  tax: TaxSettings;
  openingCash: number;
  minimumCash: number;
  scenarios: { high: ScenarioFactor; low: ScenarioFactor };
  /** A line over budget by more than this share raises an alert. */
  overspendAlertPct: number;
  /** Ledger name (lower case) in an accounts export to budget line id, kept between imports. */
  ledgerMap: Record<string, string>;
}

export interface RoleData {
  role: string;
  departmentId: string;
  locationId: string;
  ctc: number;
  opening: number;
  /** The day of the month people join; 1 charges the first month in full. */
  joinDay: number;
  hires: Months12;
  exits: Months12;
  /** Null takes the budget-wide increase. */
  incrementPct: number | null;
  incrementMonth: number | null;
  notes: string;
}

export const BENEFIT_BASES = {
  per_employee_month: { label: 'Per employee per month', driver: 'headcount', divide: 1 },
  per_employee_quarter: { label: 'Per employee per quarter', driver: 'headcount', divide: 3 },
  per_employee_year: { label: 'Per employee per year', driver: 'headcount', divide: 12 },
  per_joiner: { label: 'Per new joiner (one-time)', driver: 'joiners', divide: 1 },
  fixed_month: { label: 'Fixed amount per month', driver: 'fixed', divide: 1 },
  fixed_year: { label: 'Fixed amount per year', driver: 'fixed', divide: 12 },
  pct_salary: { label: '% of salary', driver: 'salary', divide: 1 },
} as const;
export type BenefitBasis = keyof typeof BENEFIT_BASES;

export interface BenefitData {
  name: string;
  lineId: string;
  basis: BenefitBasis | '';
  rate: number;
  /** `all` or a department id. */
  appliesTo: string;
  excludeDepartmentId: string;
  /** Null means everyone is eligible. */
  eligiblePct: number | null;
  /** `monthly`, `quarter_end`, or a calendar month number as text ("11" is November). */
  timing: string;
  locationId: string;
  notes: string;
}

export const FREQUENCIES = {
  monthly: { label: 'Monthly', every: 1, divide: 1 },
  quarterly: { label: 'Quarterly', every: 3, divide: 1 },
  half_yearly: { label: 'Half-yearly', every: 6, divide: 1 },
  annual: { label: 'Annually, in the start month', every: 12, divide: 1 },
  annual_spread: { label: 'Annually, spread monthly', every: 1, divide: 12 },
} as const;
export type Frequency = keyof typeof FREQUENCIES;

/** What recurring and one-off cost rows have in common. */
export interface CostCommon {
  name: string;
  lineId: string;
  /** Empty means INR. */
  currency: string;
  gstPct: number;
  /** Recoverable GST leaves the cost and shows only in the cash flow. */
  gstRecoverable: boolean;
  /** A capital item reaches the cost as depreciation, and the cash flow as capex. */
  capital: boolean;
  lifeYears: number;
  /** Months between the cost and its payment. */
  payLagMonths: number;
  departmentId: string;
  locationId: string;
  notes: string;
}

export interface RecurringData extends CostCommon {
  amount: number;
  frequency: Frequency | '';
  /** Calendar month numbers, 1 to 12; 0 means the first or last month of the year. */
  startMonth: number;
  endMonth: number;
  escalationPct: number;
  escalationMonth: number;
}

export interface OnceData extends CostCommon {
  /** Amounts by calendar month, including any GST. */
  months: Months12;
}

export type RowDataByKind = {
  role: RoleData;
  benefit: BenefitData;
  admin_rec: RecurringData;
  admin_once: OnceData;
  finance_rec: RecurringData;
  finance_once: OnceData;
};

export interface BudgetRow<K extends RowKind = RowKind> {
  id: string;
  kind: K;
  position: number;
  version: number;
  data: RowDataByKind[K];
}

/** The payroll as monthly totals, in financial-year order, for a viewer who cannot see CTC. */
export interface MaskedPayroll {
  salary: number[];
  statutory: number[];
  gratuity: number[];
}

export interface BudgetState {
  settings: BudgetSettings;
  rows: BudgetRow[];
  maskedPayroll?: MaskedPayroll | null;
}

export const newId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function blankRow(kind: RowKind): RowDataByKind[RowKind] {
  const cost: CostCommon = {
    name: '',
    lineId: '',
    currency: '',
    gstPct: 0,
    gstRecoverable: false,
    capital: false,
    lifeYears: 3,
    payLagMonths: 0,
    departmentId: '',
    locationId: '',
    notes: '',
  };
  switch (kind) {
    case 'role':
      return { role: '', departmentId: '', locationId: '', ctc: 0, opening: 0, joinDay: 1, hires: zero12(), exits: zero12(), incrementPct: null, incrementMonth: null, notes: '' };
    case 'benefit':
      return { name: '', lineId: '', basis: 'per_employee_month', rate: 0, appliesTo: 'all', excludeDepartmentId: '', eligiblePct: null, timing: 'monthly', locationId: '', notes: '' };
    case 'admin_rec':
    case 'finance_rec':
      return { ...cost, amount: 0, frequency: 'monthly', startMonth: 0, endMonth: 0, escalationPct: 0, escalationMonth: 0 };
    default:
      return { ...cost, months: zero12() };
  }
}

/** The lines every budget starts from. Clients may add, rename or remove their own. */
const line = (id: string, group: string, name: string, system?: SystemLine): BudgetLine => ({ id, group, name, ...(system ? { system } : {}) });

export const DEFAULT_LINES: BudgetLine[] = [
  line('salaries', 'Payroll costs', 'Salaries', 'salaries'),
  line('bonus', 'Payroll costs', 'Bonuses & incentives'),
  line('allowances', 'Payroll costs', 'Allowances (shift / on-call)'),
  line('comp_adjustments', 'Payroll costs', 'Comp adjustments'),
  line('statutory', 'Employee benefits', 'Employer PF & ESI', 'statutory'),
  line('group_insurance', 'Employee benefits', 'Group insurance'),
  line('workers_comp', 'Employee benefits', 'Workers comp insurance'),
  line('transport', 'Employee benefits', 'Transportation'),
  line('meals', 'Employee benefits', 'Meals'),
  line('gratuity', 'Employee benefits', 'Gratuity & leave provisions', 'gratuity'),
  line('other_benefits', 'Employee benefits', 'Other employee benefits'),
  line('welfare', 'Staff welfare & travel', 'Staff welfare & engagement'),
  line('rewards', 'Staff welfare & travel', 'Rewards & recognition'),
  line('travel', 'Staff welfare & travel', 'Employee travel'),
  line('rent', 'Facilities costs', 'Rent'),
  line('utilities', 'Facilities costs', 'Utilities / HVAC'),
  line('maintenance', 'Facilities costs', 'Office maintenance & sundry'),
  line('laptops', 'IT costs', 'Laptops & peripherals'),
  line('internet', 'IT costs', 'Internet & connectivity'),
  line('software', 'IT costs', 'Software & subscriptions'),
  line('depreciation', 'IT costs', 'Depreciation', 'depreciation'),
  line('compliance', 'Other costs', 'Compliance & licences'),
  line('marketing', 'Other costs', 'Marketing & brand'),
  line('audit_fees', 'Other costs', 'Audit & professional fees'),
  line('bank_charges', 'Other costs', 'Bank charges'),
  line('rates_taxes', 'Other costs', 'Rates & taxes'),
  line('finance_other', 'Other costs', 'Other finance costs'),
  line('admin_other', 'Other costs', 'Other admin costs'),
];

export function defaultSettings(fyStartYear: number, fyStartMonth = 4): BudgetSettings {
  return {
    company: '',
    title: 'Annual budget',
    fyStartMonth,
    fyStartYear,
    asOf: '',
    reportCurrency: '',
    fx: [],
    departments: [],
    locations: [],
    lines: DEFAULT_LINES.map((l) => ({ ...l })),
    incrementPct: 0,
    incrementMonth: 0,
    attritionPct: 0,
    currentMonthlyPayroll: 0,
    payrollSource: 'roles',
    statutory: { enabled: false, basicSharePct: 40, pfPct: 12, pfWageCap: 15000, esiPct: 3.25, esiWageLimit: 21000, gratuityPct: 4.81, leavePct: 0 },
    tax: withTaxDefaults({ mode: 'none', preset: 'concessional_22', markupPct: 0, ratePct: 22, surchargePct: 10, cessPct: 4 }),
    openingCash: 0,
    minimumCash: 0,
    scenarios: { high: { hiresPct: 20, costPct: 10 }, low: { hiresPct: -20, costPct: -5 } },
    overspendAlertPct: 10,
    ledgerMap: {},
  };
}

/**
 * Starting values for the tax block under the Income-tax Act 2025 (in force from 1 April 2026).
 * The firm must confirm these for each client. The concessional regime has a flat 10% surcharge;
 * the regular regime takes its surcharge from the slab of taxable income.
 */
export const TAX_PRESETS = [
  { key: 'concessional_22', label: 'Concessional regime (22%)', ratePct: 22, surchargePct: 10, surchargeBySlab: false, cessPct: 4 },
  { key: 'regular_25', label: 'Regular regime, smaller company (25%)', ratePct: 25, surchargePct: 0, surchargeBySlab: true, cessPct: 4 },
  { key: 'regular_30', label: 'Regular regime (30%)', ratePct: 30, surchargePct: 0, surchargeBySlab: true, cessPct: 4 },
] as const;

/** The blocks a budget starts with. Software sits in the computers block at 40%. */
export function defaultAssetBlocks(): AssetBlock[] {
  return [
    { id: 'blk_computers', name: 'Computers and software', itRatePct: 40, lifeYears: 3, openingIt: 0, openingCos: 0, linkLineId: 'laptops', additions: zero12() },
    { id: 'blk_furniture', name: 'Furniture and fittings', itRatePct: 10, lifeYears: 10, openingIt: 0, openingCos: 0, linkLineId: '', additions: zero12() },
    { id: 'blk_office', name: 'Office equipment', itRatePct: 15, lifeYears: 5, openingIt: 0, openingCos: 0, linkLineId: '', additions: zero12() },
  ];
}

export const DEFAULT_INSURANCE_LINES = ['group_insurance', 'workers_comp'];

/** Tax settings with every newer field filled, for budgets saved before those fields existed. */
export function withTaxDefaults(t: Partial<TaxSettings> | undefined): Required<TaxSettings> {
  return {
    mode: t?.mode ?? 'none',
    preset: t?.preset ?? '',
    markupPct: t?.markupPct ?? 0,
    ratePct: t?.ratePct ?? 22,
    surchargePct: t?.surchargePct ?? 10,
    surchargeBySlab: t?.surchargeBySlab ?? false,
    cessPct: t?.cessPct ?? 4,
    insuranceGroupPerYear: t?.insuranceGroupPerYear ?? 0,
    insuranceWcPerYear: t?.insuranceWcPerYear ?? 0,
    insuranceLineIds: t?.insuranceLineIds ?? [...DEFAULT_INSURANCE_LINES],
    assetBlocks: t?.assetBlocks?.length ? t.assetBlocks : defaultAssetBlocks(),
  };
}

/** Calendar month number (1 to 12) of each financial-year position. */
export function fyCalendarMonths(fyStartMonth: number): number[] {
  const start = Math.min(12, Math.max(1, Math.floor(fyStartMonth) || 1));
  return Array.from({ length: 12 }, (_, i) => ((start - 1 + i) % 12) + 1);
}

/** "Apr-27" style labels in financial-year order. */
export function fyLabels(settings: Pick<BudgetSettings, 'fyStartMonth' | 'fyStartYear'>): string[] {
  const start = Math.min(12, Math.max(1, Math.floor(settings.fyStartMonth) || 1)) - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const m = (start + i) % 12;
    const y = settings.fyStartYear + Math.floor((start + i) / 12);
    return `${MONTHS[m]}-${String(y).slice(-2)}`;
  });
}

export function fyName(settings: Pick<BudgetSettings, 'fyStartMonth' | 'fyStartYear'>): string {
  if (settings.fyStartMonth === 1) return `FY ${settings.fyStartYear}`;
  return `FY ${settings.fyStartYear}-${String(settings.fyStartYear + 1).slice(-2)}`;
}

/** The financial-year position (0 to 11) of a `YYYY-MM` period, or -1 outside the year. */
export function fyIndexOfPeriod(settings: Pick<BudgetSettings, 'fyStartMonth' | 'fyStartYear'>, period: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return -1;
  const months = Number(match[1]) * 12 + Number(match[2]) - 1 - (settings.fyStartYear * 12 + settings.fyStartMonth - 1);
  return months >= 0 && months < 12 ? months : -1;
}

/** `YYYY-MM` of a financial-year position. */
export function periodOfFyIndex(settings: Pick<BudgetSettings, 'fyStartMonth' | 'fyStartYear'>, index: number): string {
  const total = settings.fyStartYear * 12 + settings.fyStartMonth - 1 + index;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
