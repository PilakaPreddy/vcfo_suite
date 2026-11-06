import {
  BENEFIT_BASES,
  FREQUENCIES,
  ROW_SECTION,
  fyCalendarMonths,
  fyLabels,
  type BenefitData,
  type BudgetRow,
  type BudgetSection,
  type BudgetSettings,
  type BudgetState,
  type CostCommon,
  type OnceData,
  type RecurringData,
  type RoleData,
} from './model';

/**
 * BUDGET ENGINE — the one calculation. The screens, the exports, the frozen versions and the
 * alert job all call `computeBudget`, so a page and its Excel file cannot disagree.
 *
 * Every series it returns is in financial-year order (index 0 is the first month of the year),
 * in whole rupees. Each row is rounded month by month and totals add the rounded values, which
 * is the one rounding rule and the reason a column always adds up to its total.
 *
 * The formulas follow the owner's workbook (Budget_Linked_Template_v3). Tax is its formula, which
 * the owner confirmed: ((total cost - GST in the cost) x mark-up + gratuity and leave provisions)
 * x effective rate. It runs only when the client's tax mode is cost-plus.
 */

export type Series = number[];

export interface RowResult {
  id: string;
  /** Cost reaching the Master Budget, including non-recoverable GST and depreciation. */
  cost: Series;
  /** GST inside `cost`. */
  gst: Series;
  recoverableGst: Series;
  capex: Series;
  depreciation: Series;
  /** Money leaving the bank, after the payment lag. */
  cash: Series;
  total: number;
}

export interface RoleResult extends RowResult {
  closing: Series;
  joiners: Series;
  exits: Series;
  statutory: Series;
  gratuity: Series;
  monthlyCtc: Series;
}

export interface BudgetIssue {
  rowId: string;
  section: BudgetSection;
  severity: 'error' | 'warning';
  message: string;
}

export interface GroupResult {
  group: string;
  lineIds: string[];
  total: Series;
}

export interface BudgetResult {
  labels: string[];
  /** Calendar month number of each position. */
  calendar: number[];
  roles: Record<string, RoleResult>;
  rows: Record<string, RowResult>;
  headcount: { opening: number; joiners: Series; exits: Series; closing: Series; byDepartment: Record<string, Series> };
  salary: Series;
  lines: Record<string, Series>;
  groups: GroupResult[];
  operating: Series;
  gstInCost: Series;
  taxBase: Series;
  tax: Series;
  grandTotal: Series;
  effectiveTaxRate: number;
  costPerEmployeeMonth: number;
  byDepartment: { id: string; name: string; total: Series }[];
  byLocation: { id: string; name: string; total: Series }[];
  cash: { outflow: Series; capex: Series; recoverableGst: Series; closingBeforeFunding: Series; fundsRequest: Series; paidNextYear: number };
  /** Rows total less the Master Budget total. Anything but zero means an unmapped row. */
  reconciliation: { rowsTotal: Series; difference: Series };
  unmapped: { rowId: string; section: BudgetSection; name: string }[];
  issues: BudgetIssue[];
  payrollDifference: number | null;
}

const zeros = (): Series => Array(12).fill(0);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const rupee = (v: number): number => Math.round(v);
const addInto = (target: Series, source: Series) => source.forEach((x, i) => (target[i] += x));

export const sumSeries = (s: Series): number => s.reduce((a, b) => a + b, 0);

function positionOf(calendar: number[], month: number, fallback: number): number {
  const at = calendar.indexOf(num(month));
  return at < 0 ? fallback : at;
}

/** INR for one unit of a currency in a calendar month. Unknown currencies count as INR, with a warning raised by the caller. */
function fxRate(settings: BudgetSettings, code: string, calendarMonth: number): number {
  if (!code || code === 'INR') return 1;
  const entry = settings.fx.find((f) => f.code === code);
  if (!entry) return 1;
  return num(entry.monthly?.[calendarMonth - 1]) || num(entry.rate) || 1;
}

/** Convert a rupee series to the report currency, month by month. Returns null without a rate. */
export function toReportCurrency(settings: BudgetSettings, series: Series): Series | null {
  const code = settings.reportCurrency;
  if (!code || !settings.fx.some((f) => f.code === code)) return null;
  const calendar = fyCalendarMonths(settings.fyStartMonth);
  return series.map((v, i) => v / fxRate(settings, code, calendar[i]));
}

function computeRole(row: BudgetRow, settings: BudgetSettings, calendar: number[]): RoleResult {
  const d = row.data as RoleData;
  const result: RoleResult = {
    id: row.id,
    cost: zeros(), gst: zeros(), recoverableGst: zeros(), capex: zeros(), depreciation: zeros(), cash: zeros(), total: 0,
    closing: zeros(), joiners: zeros(), exits: zeros(), statutory: zeros(), gratuity: zeros(), monthlyCtc: zeros(),
  };
  const incrementPct = d.incrementPct ?? settings.incrementPct;
  const incrementMonth = d.incrementMonth ?? settings.incrementMonth;
  const incrementAt = incrementMonth ? positionOf(calendar, incrementMonth, 99) : 99;
  const joinFactor = (31 - Math.min(30, Math.max(1, num(d.joinDay) || 1))) / 30;
  const st = settings.statutory;
  /* With a typed payroll the opening staff are inside that total, so a role adds only the change. */
  const baseline = settings.payrollSource === 'typed' ? num(d.opening) : 0;
  let open = num(d.opening);
  for (let i = 0; i < 12; i++) {
    const c = calendar[i] - 1;
    const hires = num(d.hires?.[c]);
    /* Named exits, plus the budget-wide attrition applied to the opening headcount. */
    const leavers = Math.min(open + hires, num(d.exits?.[c]) + (open * num(settings.attritionPct)) / 100 / 12);
    /* People who leave are paid to the end of the month; joiners from their joining day. */
    const paid = open - baseline + hires * joinFactor;
    const ctc = (num(d.ctc) / 12) * (i >= incrementAt ? 1 + num(incrementPct) / 100 : 1);
    result.monthlyCtc[i] = ctc;
    result.joiners[i] = hires;
    result.exits[i] = leavers;
    result.cost[i] = rupee(paid * ctc);
    if (st.enabled) {
      const basic = ctc * (num(st.basicSharePct) / 100);
      const pfWage = num(st.pfWageCap) > 0 ? Math.min(basic, num(st.pfWageCap)) : basic;
      const esi = ctc <= num(st.esiWageLimit) ? ctc * (num(st.esiPct) / 100) : 0;
      result.statutory[i] = rupee(paid * (pfWage * (num(st.pfPct) / 100) + esi));
      result.gratuity[i] = rupee(paid * basic * ((num(st.gratuityPct) + num(st.leavePct)) / 100));
    }
    result.cash[i] = result.cost[i] + result.statutory[i];
    open = open + hires - leavers;
    result.closing[i] = open;
  }
  result.total = sumSeries(result.cost);
  return result;
}

function computeBenefit(
  row: BudgetRow,
  calendar: number[],
  head: { closing: Series; joiners: Series; byDepartment: Record<string, Series> },
  salary: Series,
): RowResult {
  const d = row.data as BenefitData;
  const out: RowResult = { id: row.id, cost: zeros(), gst: zeros(), recoverableGst: zeros(), capex: zeros(), depreciation: zeros(), cash: zeros(), total: 0 };
  const basis = d.basis ? BENEFIT_BASES[d.basis] : null;
  if (!d.name || !basis) return out;
  const elig = d.eligiblePct == null ? 1 : num(d.eligiblePct) / 100;
  const perUnit = basis.driver === 'salary' ? (num(d.rate) / 100) * elig : (num(d.rate) / basis.divide) * elig;
  const headcount = (key: string, i: number) => (key === 'all' ? head.closing[i] : (head.byDepartment[key]?.[i] ?? 0));
  for (let i = 0; i < 12; i++) {
    let driver = 1;
    if (basis.driver === 'headcount') {
      driver = headcount(d.appliesTo || 'all', i);
      if (d.excludeDepartmentId) driver -= headcount(d.excludeDepartmentId, i);
    } else if (basis.driver === 'joiners') driver = head.joiners[i];
    else if (basis.driver === 'salary') driver = salary[i];
    /* Joiner costs always fall in the joining month. A full-year charge in one month uses the
       headcount of that month, so its total moves when headcount moves during the year. */
    const timing = basis.driver === 'joiners' || !d.timing ? 'monthly' : d.timing;
    let factor = 1;
    if (timing === 'quarter_end') factor = (i + 1) % 3 === 0 ? 3 : 0;
    else if (timing !== 'monthly') factor = calendar[i] === Number(timing) ? 12 : 0;
    out.cost[i] = rupee(perUnit * driver * factor);
    out.cash[i] = out.cost[i];
  }
  out.total = sumSeries(out.cost);
  return out;
}

/** Turn the gross charge of one month into cost, GST, capex, depreciation and cash. */
function applyCharge(out: RowResult, d: CostCommon, i: number, base: number, gstAmount: number, paidNextYear: { value: number }) {
  const recoverable = d.gstRecoverable ? gstAmount : 0;
  const costGst = d.gstRecoverable ? 0 : gstAmount;
  let paid = base + gstAmount;
  if (d.capital) {
    /* Straight-line from the month of purchase. Non-recoverable GST is part of the asset. */
    const asset = base + costGst;
    out.capex[i] += rupee(asset);
    const perMonth = asset / (Math.max(1, num(d.lifeYears)) * 12);
    for (let m = i; m < 12; m++) out.depreciation[m] += rupee(perMonth);
  } else {
    out.cost[i] += rupee(base + costGst);
    out.gst[i] += rupee(costGst);
  }
  out.recoverableGst[i] += rupee(recoverable);
  paid = rupee(paid);
  const payAt = i + Math.max(0, Math.floor(num(d.payLagMonths)));
  if (payAt < 12) out.cash[payAt] += paid;
  else paidNextYear.value += paid;
}

function finishCost(out: RowResult): RowResult {
  addInto(out.cost, out.depreciation);
  out.total = sumSeries(out.cost);
  return out;
}

function computeRecurring(row: BudgetRow, settings: BudgetSettings, calendar: number[], paidNextYear: { value: number }): RowResult {
  const d = row.data as RecurringData;
  const out: RowResult = { id: row.id, cost: zeros(), gst: zeros(), recoverableGst: zeros(), capex: zeros(), depreciation: zeros(), cash: zeros(), total: 0 };
  const f = d.frequency ? FREQUENCIES[d.frequency] : null;
  if (!d.name || !f || !num(d.amount)) return out;
  const start = positionOf(calendar, d.startMonth, 0);
  const end = positionOf(calendar, d.endMonth, 11);
  const escalateAt = d.escalationMonth ? positionOf(calendar, d.escalationMonth, 99) : 99;
  for (let i = start; i <= end; i++) {
    if ((i - start) % f.every !== 0) continue;
    const fx = fxRate(settings, d.currency, calendar[i]);
    const base = (num(d.amount) / f.divide) * fx * (i >= escalateAt ? 1 + num(d.escalationPct) / 100 : 1);
    applyCharge(out, d, i, base, base * (num(d.gstPct) / 100), paidNextYear);
  }
  return finishCost(out);
}

function computeOnce(row: BudgetRow, settings: BudgetSettings, calendar: number[], paidNextYear: { value: number }): RowResult {
  const d = row.data as OnceData;
  const out: RowResult = { id: row.id, cost: zeros(), gst: zeros(), recoverableGst: zeros(), capex: zeros(), depreciation: zeros(), cash: zeros(), total: 0 };
  const gstRate = num(d.gstPct) / 100;
  for (let i = 0; i < 12; i++) {
    const gross = num(d.months?.[calendar[i] - 1]) * fxRate(settings, d.currency, calendar[i]);
    if (!gross) continue;
    const gst = (gross * gstRate) / (1 + gstRate);
    applyCharge(out, d, i, gross - gst, gst, paidNextYear);
  }
  return finishCost(out);
}

function rowName(row: BudgetRow): string {
  return ((row.data as RoleData).role ?? (row.data as CostCommon).name ?? '') || '(unnamed row)';
}

function validate(state: BudgetState, calendar: number[]): BudgetIssue[] {
  const issues: BudgetIssue[] = [];
  const known = new Set(state.settings.lines.map((l) => l.id));
  for (const row of state.rows) {
    const section = ROW_SECTION[row.kind];
    const push = (severity: BudgetIssue['severity'], message: string) => issues.push({ rowId: row.id, section, severity, message: `${rowName(row)}: ${message}` });
    if (row.kind === 'role') {
      const d = row.data as RoleData;
      if (!d.role) push('error', 'enter a role name.');
      if (num(d.ctc) < 0) push('error', 'CTC cannot be negative.');
      const people = num(d.opening) + (d.hires ?? []).reduce((a, b) => a + num(b), 0);
      if ((num(d.ctc) === 0) && people > 0) push('warning', 'this role has people but no CTC.');
      continue;
    }
    const d = row.data as CostCommon;
    if (!d.name) {
      const hasValue = row.kind === 'benefit' ? num((row.data as BenefitData).rate) !== 0 : row.kind.endsWith('_rec') ? num((row.data as RecurringData).amount) !== 0 : ((row.data as OnceData).months ?? []).some((x) => num(x));
      if (hasValue) push('error', 'enter a name, or the row stays out of the total.');
      continue;
    }
    if (!(d.capital) && (!d.lineId || !known.has(d.lineId))) push('error', 'choose a Master Budget line.');
    if (d.currency && d.currency !== 'INR' && !state.settings.fx.some((f) => f.code === d.currency)) push('error', `add an exchange rate for ${d.currency} in Settings.`);
    if (row.kind.endsWith('_rec')) {
      const r = row.data as RecurringData;
      if (num(r.amount) < 0) push('warning', 'the amount is negative.');
      if (r.startMonth && r.endMonth && positionOf(calendar, r.endMonth, 11) < positionOf(calendar, r.startMonth, 0)) push('error', 'the end month is before the start month.');
      if (!r.frequency) push('error', 'choose a frequency.');
      if (num(r.escalationPct) && !r.escalationMonth) push('warning', 'choose the month the escalation starts.');
    }
    if (d.capital && num(d.lifeYears) <= 0) push('error', 'enter the useful life of this capital item.');
  }
  return issues;
}

export function computeBudget(state: BudgetState): BudgetResult {
  const { settings } = state;
  const calendar = fyCalendarMonths(settings.fyStartMonth);
  const paidNextYear = { value: 0 };

  const roleRows = state.rows.filter((r) => r.kind === 'role');
  const roles: Record<string, RoleResult> = {};
  for (const row of roleRows) roles[row.id] = computeRole(row, settings, calendar);

  const opening = roleRows.reduce((a, r) => a + num((r.data as RoleData).opening), 0);
  const joiners = zeros();
  const exits = zeros();
  const closing = zeros();
  const salary = zeros();
  const statutory = zeros();
  const gratuityCalc = zeros();
  const byDepartmentHc: Record<string, Series> = {};
  for (const dept of settings.departments) byDepartmentHc[dept.id] = zeros();
  for (const row of roleRows) {
    const r = roles[row.id];
    addInto(joiners, r.joiners);
    addInto(exits, r.exits);
    addInto(closing, r.closing);
    addInto(salary, r.cost);
    addInto(statutory, r.statutory);
    addInto(gratuityCalc, r.gratuity);
    const dept = (row.data as RoleData).departmentId;
    if (dept && byDepartmentHc[dept]) addInto(byDepartmentHc[dept], r.closing);
  }
  /* A viewer without HR access receives roles with no CTC, and the payroll as a total. */
  const masked = state.maskedPayroll;
  if (masked) {
    addInto(salary, masked.salary);
    addInto(statutory, masked.statutory);
    addInto(gratuityCalc, masked.gratuity);
  }

  /* The typed total for existing staff, as the workbook has it. The budget-wide increment applies. */
  const typedPayroll = zeros();
  if (settings.payrollSource === 'typed' && !masked) {
    const incrementAt = settings.incrementMonth ? positionOf(calendar, settings.incrementMonth, 99) : 99;
    for (let i = 0; i < 12; i++) typedPayroll[i] = rupee(num(settings.currentMonthlyPayroll) * (i >= incrementAt ? 1 + num(settings.incrementPct) / 100 : 1));
    addInto(salary, typedPayroll);
  }

  const head = { closing, joiners, byDepartment: byDepartmentHc };
  const rows: Record<string, RowResult> = {};
  for (const row of state.rows) {
    if (row.kind === 'benefit') rows[row.id] = computeBenefit(row, calendar, head, salary);
    else if (row.kind === 'admin_rec' || row.kind === 'finance_rec') rows[row.id] = computeRecurring(row, settings, calendar, paidNextYear);
    else if (row.kind === 'admin_once' || row.kind === 'finance_once') rows[row.id] = computeOnce(row, settings, calendar, paidNextYear);
  }

  /* The Master Budget, by line. */
  const lines: Record<string, Series> = {};
  for (const l of settings.lines) lines[l.id] = zeros();
  const systemLine = (key: string) => settings.lines.find((l) => l.system === key)?.id;
  const add = (id: string | undefined, s: Series) => id && lines[id] && addInto(lines[id], s);
  add(systemLine('salaries'), salary);
  add(systemLine('statutory'), statutory);
  add(systemLine('gratuity'), gratuityCalc);

  const unmapped: BudgetResult['unmapped'] = [];
  const rowsTotal = zeros();
  addInto(rowsTotal, salary);
  addInto(rowsTotal, statutory);
  addInto(rowsTotal, gratuityCalc);
  for (const row of state.rows) {
    const r = rows[row.id];
    if (!r) continue;
    const d = row.data as CostCommon;
    addInto(rowsTotal, r.cost);
    const running = r.cost.map((x, i) => x - r.depreciation[i]);
    if (r.cost.some((x) => x !== 0) && running.some((x) => x !== 0) && !lines[d.lineId]) {
      unmapped.push({ rowId: row.id, section: ROW_SECTION[row.kind], name: rowName(row) });
    } else if (lines[d.lineId]) addInto(lines[d.lineId], running);
    add(systemLine('depreciation'), r.depreciation);
  }

  const groups: GroupResult[] = [];
  for (const l of settings.lines) {
    let g = groups.find((x) => x.group === l.group);
    if (!g) {
      g = { group: l.group, lineIds: [], total: zeros() };
      groups.push(g);
    }
    g.lineIds.push(l.id);
    addInto(g.total, lines[l.id]);
  }

  const operating = zeros();
  for (const g of groups) addInto(operating, g.total);
  const gstInCost = zeros();
  for (const r of Object.values(rows)) addInto(gstInCost, r.gst);
  const taxBase = operating.map((x, i) => x - gstInCost[i]);
  const t = settings.tax;
  const effectiveTaxRate = t.mode === 'cost_plus' ? (num(t.ratePct) / 100) * (1 + num(t.surchargePct) / 100) * (1 + num(t.cessPct) / 100) : 0;
  const gratuityLine = lines[systemLine('gratuity') ?? ''] ?? zeros();
  const tax = taxBase.map((x, i) => (t.mode === 'cost_plus' ? rupee((x * (num(t.markupPct) / 100) + gratuityLine[i]) * effectiveTaxRate) : 0));
  const grandTotal = operating.map((x, i) => x + tax[i]);
  const employeeMonths = sumSeries(closing);

  /* Cost by department and location. Benefits and untagged costs go to "Shared". */
  const tagTotals = (refs: { id: string; name: string }[], tagOf: (row: BudgetRow) => string) => {
    const buckets = refs.map((ref) => ({ id: ref.id, name: ref.name, total: zeros() }));
    const shared = { id: '', name: 'Shared', total: zeros() };
    for (const row of state.rows) {
      const r = row.kind === 'role' ? roles[row.id] : rows[row.id];
      if (!r) continue;
      const bucket = buckets.find((b) => b.id === tagOf(row)) ?? shared;
      addInto(bucket.total, r.cost);
      if (row.kind === 'role') {
        addInto(bucket.total, (r as RoleResult).statutory);
        addInto(bucket.total, (r as RoleResult).gratuity);
      }
    }
    addInto(shared.total, tax);
    addInto(shared.total, typedPayroll);
    if (masked) {
      addInto(shared.total, masked.salary);
      addInto(shared.total, masked.statutory);
      addInto(shared.total, masked.gratuity);
    }
    return [...buckets, shared];
  };
  const byDepartment = tagTotals(settings.departments, (row) => (row.kind === 'benefit' ? ((row.data as BenefitData).appliesTo === 'all' ? '' : (row.data as BenefitData).appliesTo) : (row.data as RoleData).departmentId));
  const byLocation = tagTotals(settings.locations, (row) => (row.data as RoleData).locationId);

  /* Cash flow. Provisions for gratuity and depreciation are not money leaving the bank. */
  const outflow = zeros();
  const capex = zeros();
  const recoverableGst = zeros();
  for (const row of roleRows) addInto(outflow, roles[row.id].cash);
  addInto(outflow, typedPayroll);
  if (masked) {
    addInto(outflow, masked.salary);
    addInto(outflow, masked.statutory);
  }
  for (const r of Object.values(rows)) {
    addInto(outflow, r.cash);
    addInto(capex, r.capex);
    addInto(recoverableGst, r.recoverableGst);
  }
  addInto(outflow, tax);
  const closingBeforeFunding = zeros();
  const fundsRequest = zeros();
  let balance = num(settings.openingCash);
  for (let i = 0; i < 12; i++) {
    balance -= outflow[i];
    const need = num(settings.minimumCash) - balance;
    fundsRequest[i] = need > 0 ? need : 0;
    balance += fundsRequest[i];
    closingBeforeFunding[i] = balance;
  }

  const firstMonthCalc = roleRows.reduce((a, r) => a + num((r.data as RoleData).opening) * (num((r.data as RoleData).ctc) / 12), 0);

  return {
    labels: fyLabels(settings),
    calendar,
    roles,
    rows,
    headcount: { opening, joiners, exits, closing, byDepartment: byDepartmentHc },
    salary,
    lines,
    groups,
    operating,
    gstInCost,
    taxBase,
    tax,
    grandTotal,
    effectiveTaxRate,
    costPerEmployeeMonth: employeeMonths ? sumSeries(grandTotal) / employeeMonths : 0,
    byDepartment,
    byLocation,
    cash: { outflow, capex, recoverableGst, closingBeforeFunding, fundsRequest, paidNextYear: paidNextYear.value },
    reconciliation: { rowsTotal, difference: rowsTotal.map((x, i) => x - operating[i]) },
    unmapped,
    issues: validate(state, calendar),
    payrollDifference: num(settings.currentMonthlyPayroll) ? num(settings.currentMonthlyPayroll) - rupee(firstMonthCalc) : null,
  };
}

/** The same budget with its scenario factors applied: joiners scale by one, other costs by the other. */
export function computeScenario(state: BudgetState, key: 'high' | 'low'): BudgetResult {
  const f = state.settings.scenarios[key];
  const hires = 1 + num(f.hiresPct) / 100;
  const cost = 1 + num(f.costPct) / 100;
  const rows = state.rows.map((row): BudgetRow => {
    if (row.kind === 'role') {
      const d = row.data as RoleData;
      return { ...row, data: { ...d, hires: (d.hires ?? []).map((x) => num(x) * hires) } };
    }
    if (row.kind === 'benefit') {
      const d = row.data as BenefitData;
      return { ...row, data: { ...d, rate: num(d.rate) * cost } };
    }
    if (row.kind === 'admin_rec' || row.kind === 'finance_rec') {
      const d = row.data as RecurringData;
      return { ...row, data: { ...d, amount: num(d.amount) * cost } };
    }
    const d = row.data as OnceData;
    return { ...row, data: { ...d, months: (d.months ?? []).map((x) => num(x) * cost) } };
  });
  return computeBudget({ settings: state.settings, rows, maskedPayroll: state.maskedPayroll });
}

export interface ActualEntry {
  /** `YYYY-MM`. */
  period: string;
  lineId: string;
  amount: number;
  reason?: string | null;
}

export interface VarianceRow {
  lineId: string;
  name: string;
  group: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  /** Actual so far, plus the remaining months of budget. */
  forecast: number;
  fullYearBudget: number;
  overLimit: boolean;
}

/** Budget against actual cost to date, by line, for every month that has an actual. */
export function budgetVsActual(state: BudgetState, result: BudgetResult, actuals: ActualEntry[], indexOf: (period: string) => number): { rows: VarianceRow[]; monthsClosed: number; totals: Pick<VarianceRow, 'budget' | 'actual' | 'variance' | 'forecast' | 'fullYearBudget'> } {
  const byLine = new Map<string, Series>();
  let lastIndex = -1;
  for (const a of actuals) {
    const i = indexOf(a.period);
    if (i < 0) continue;
    const series = byLine.get(a.lineId) ?? zeros();
    series[i] += num(a.amount);
    byLine.set(a.lineId, series);
    if (i > lastIndex) lastIndex = i;
  }
  const monthsClosed = lastIndex + 1;
  const limit = num(state.settings.overspendAlertPct);
  const rows = state.settings.lines.map((l): VarianceRow => {
    const planned = result.lines[l.id] ?? zeros();
    const got = byLine.get(l.id) ?? zeros();
    const budget = sumSeries(planned.slice(0, monthsClosed));
    const actual = sumSeries(got.slice(0, monthsClosed));
    const variance = actual - budget;
    const variancePct = budget ? (variance / budget) * 100 : null;
    return {
      lineId: l.id,
      name: l.name,
      group: l.group,
      budget,
      actual,
      variance,
      variancePct,
      forecast: actual + sumSeries(planned.slice(monthsClosed)),
      fullYearBudget: sumSeries(planned),
      overLimit: limit > 0 && budget > 0 && (variance / budget) * 100 > limit,
    };
  });
  const total = (key: 'budget' | 'actual' | 'variance' | 'forecast' | 'fullYearBudget') => rows.reduce((a, r) => a + r[key], 0);
  return { rows, monthsClosed, totals: { budget: total('budget'), actual: total('actual'), variance: total('variance'), forecast: total('forecast'), fullYearBudget: total('fullYearBudget') } };
}

/** Add a series up by quarter (3 periods per value) or half-year (6). */
export function rollUp(series: Series, size: 3 | 6): Series {
  const out: Series = [];
  for (let i = 0; i < 12; i += size) out.push(sumSeries(series.slice(i, i + size)));
  return out;
}
