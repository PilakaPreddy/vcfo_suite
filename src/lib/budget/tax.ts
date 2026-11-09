import { withTaxDefaults, type AssetBlock, type BudgetRow, type BudgetSettings, type CostCommon } from './model';

/**
 * INCOME TAX AND ADVANCE TAX for a cost-plus company, under the Income-tax Act 2025 (in force from
 * 1 April 2026). The engine calls `computeTax` with the budget alone for the Master Budget tax row;
 * the Finance costs and Variance tabs call it again with the approved actuals for the latest
 * estimate and the advance tax instalments.
 *
 * The computation, in order:
 *  1. Total operating cost of the Master Budget lines (approved actual or budget for each month).
 *  2. Less the GST inside the cost, the lines capitalised into an asset block, the Master Budget
 *     depreciation line and the insurance as booked; add the insurance on a prepaid basis and the
 *     Companies Act 2013 depreciation. The result is the cost base for the mark-up.
 *  3. Profit before tax is the mark-up on that base.
 *  4. Add back gratuity and leave encashment (allowed only when paid) and the Companies Act
 *     depreciation; deduct the Income-tax Act depreciation. The result is the taxable income.
 *  5. Tax for the year = taxable income x rate x (1 + surcharge) x (1 + cess).
 *
 * Simplifications the screens state: no marginal relief, no minimum alternate tax, no TDS or TCS
 * credit, no interest for late payment and no threshold for advance tax. The half-rate rule for
 * assets used for less than 180 days is applied by month: additions from October get half the rate.
 *
 * Series are in financial-year order, like the engine's.
 */

export type Series = number[];

/** What the tax needs from the engine. `BudgetResult` has all of it. */
export interface TaxSource {
  labels: string[];
  calendar: number[];
  lines: Record<string, Series>;
  headcount: { closing: Series };
  gstInCost: Series;
  rows: Record<string, { capex: Series }>;
}

/** Approved months of the Variance tab, in financial-year order. */
export interface TaxActuals {
  approved: boolean[];
  /** Actual cost by line. A blank actual in an approved month counts as 0. */
  lines: Record<string, Series>;
  headcount: (number | null)[];
  advancePaid: (number | null)[];
}

export interface BlockResult {
  id: string;
  name: string;
  itRatePct: number;
  lifeYears: number;
  cosRatePct: number;
  openingIt: number;
  openingCos: number;
  additions: Series;
  additionsTotal: number;
  itDepreciation: number;
  closingIt: number;
  cosDepreciation: Series;
  cosDepreciationTotal: number;
  closingCos: number;
  linkLineId: string;
}

export interface TaxCalc {
  on: boolean;
  /** Months that used approved actuals. */
  actualMonths: boolean[];
  opex: Series;
  gst: Series;
  capitalised: Series;
  masterDepreciation: Series;
  insuranceOn: boolean;
  insuranceBooked: Series;
  insurancePrepaid: Series;
  headcount: Series;
  cosDepreciation: Series;
  base: Series;
  gratuity: Series;
  leave: Series;
  blocks: BlockResult[];
  totals: {
    opex: number;
    gst: number;
    capitalised: number;
    masterDepreciation: number;
    insuranceBooked: number;
    insurancePrepaid: number;
    cosDepreciation: number;
    base: number;
    revenue: number;
    profitBeforeTax: number;
    gratuity: number;
    leave: number;
    itDepreciation: number;
    taxable: number;
    tax: number;
  };
  ratePct: number;
  surchargePct: number;
  cessPct: number;
  effectiveRate: number;
  /** The tax for the year spread across the months by each month's cost base. */
  monthlyTax: Series;
}

export interface Instalment {
  /** Financial-year position of the instalment month. */
  monthIndex: number;
  dueLabel: string;
  quarter: string;
  cumulativePct: number;
  basis: 'Budget' | 'Part actual' | 'Actual';
  monthsOnActuals: number;
  taxForYear: number;
  cumulativeDue: number;
  paidBefore: number;
  payable: number;
  actualPaid: number | null;
}

const zeros = (): Series => Array(12).fill(0);
const sum = (s: Series): number => s.reduce((a, b) => a + b, 0);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const rupee = (v: number): number => Math.round(v);

/** Companies Act WDV rate from the useful life, with a 5% residual value. */
export function cosRateFromLife(lifeYears: number): number {
  const life = num(lifeYears);
  return life > 0 ? (1 - Math.pow(0.05, 1 / life)) * 100 : 0;
}

/** The regular regime's surcharge for a company, by taxable income. */
export function slabSurcharge(taxable: number): number {
  if (taxable > 10_00_00_000) return 12;
  if (taxable > 1_00_00_000) return 7;
  return 0;
}

/** Split the one "Gratuity & leave provisions" line by the two percentages in Settings. */
export function gratuityShare(settings: BudgetSettings): number {
  const g = num(settings.statutory?.gratuityPct);
  const l = num(settings.statutory?.leavePct);
  return g + l > 0 ? g / (g + l) : 1;
}

/** Calendar months of each instalment, its cumulative share and the quarter it covers. */
const INSTALMENTS = [
  { calendar: 6, pct: 15, quarter: 'Q1, Apr to Jun' },
  { calendar: 9, pct: 45, quarter: 'Q2, Jul to Sep' },
  { calendar: 12, pct: 75, quarter: 'Q3, Oct to Dec' },
  { calendar: 3, pct: 100, quarter: 'Q4, Jan to Mar' },
];

/** Calendar months whose additions get half the Income-tax rate (put to use for under 180 days). */
const HALF_RATE_MONTHS = new Set([10, 11, 12, 1, 2, 3]);

/**
 * The tax computation. With `actuals`, every approved month up to `upTo` (a financial-year
 * position) uses its actual figures; all other months use the budget.
 */
export function computeTax(settings: BudgetSettings, rowList: BudgetRow[], src: TaxSource, actuals?: TaxActuals | null, upTo = 11): TaxCalc {
  const t = withTaxDefaults(settings.tax);
  const calendar = src.calendar;
  const onActual = (m: number) => Boolean(actuals?.approved[m]) && m <= upTo;
  const actualMonths = Array.from({ length: 12 }, (_, m) => onActual(m));
  const val = (lineId: string, m: number): number => {
    if (onActual(m)) return num(actuals?.lines[lineId]?.[m]);
    return num(src.lines[lineId]?.[m]);
  };
  const lineIds = settings.lines.map((l) => l.id);
  const systemLine = (key: string) => settings.lines.find((l) => l.system === key)?.id ?? '';
  const depLine = systemLine('depreciation');
  const gratLine = systemLine('gratuity');
  const share = gratuityShare(settings);

  const opex = zeros();
  const gratuity = zeros();
  const leave = zeros();
  const headcount = zeros();
  const insuranceBooked = zeros();
  const insurancePrepaid = zeros();
  const masterDepreciation = zeros();
  const gst = src.gstInCost.map((x) => num(x));
  const premium = num(t.insuranceGroupPerYear) + num(t.insuranceWcPerYear);
  const insuranceOn = premium > 0;
  for (let m = 0; m < 12; m++) {
    opex[m] = lineIds.reduce((a, id) => a + val(id, m), 0);
    const gl = gratLine ? val(gratLine, m) : 0;
    gratuity[m] = rupee(gl * share);
    leave[m] = rupee(gl) - gratuity[m];
    const hcActual = onActual(m) ? actuals?.headcount[m] : null;
    headcount[m] = hcActual != null ? num(hcActual) : num(src.headcount.closing[m]);
    if (insuranceOn) {
      insuranceBooked[m] = t.insuranceLineIds.reduce((a, id) => a + val(id, m), 0);
      insurancePrepaid[m] = rupee((headcount[m] * premium) / 12);
    }
    masterDepreciation[m] = depLine ? val(depLine, m) : 0;
  }

  /* Capital rows reach a block through their line; rows on no linked line go to the first block. */
  const blocksIn: AssetBlock[] = t.assetBlocks;
  const linked = new Set(blocksIn.map((b) => b.linkLineId).filter(Boolean));
  const capexByBlock = blocksIn.map(() => zeros());
  for (const row of rowList) {
    const capex = src.rows[row.id]?.capex;
    if (!capex || !capex.some((x) => x)) continue;
    const lineId = (row.data as CostCommon).lineId;
    let at = blocksIn.findIndex((b) => b.linkLineId && b.linkLineId === lineId);
    if (at < 0) at = Math.max(0, blocksIn.findIndex((b) => b.linkLineId));
    if (!capexByBlock[at]) continue;
    capex.forEach((x, i) => (capexByBlock[at][i] += num(x)));
  }

  const capitalised = zeros();
  for (let m = 0; m < 12; m++) for (const id of linked) capitalised[m] += val(id, m);

  const cosDepreciation = zeros();
  const blocks: BlockResult[] = blocksIn.map((b, bi) => {
    const additions = zeros();
    for (let m = 0; m < 12; m++) {
      additions[m] = rupee(num(b.additions?.[calendar[m] - 1]) + (b.linkLineId ? val(b.linkLineId, m) : 0) + (capexByBlock[bi]?.[m] ?? 0));
    }
    const cosRatePct = cosRateFromLife(b.lifeYears);
    const cr = cosRatePct / 100;
    const cd = zeros();
    let added = 0;
    for (let m = 0; m < 12; m++) {
      added += additions[m];
      cd[m] = rupee(((num(b.openingCos) + added) * cr) / 12);
      cosDepreciation[m] += cd[m];
    }
    const ir = num(b.itRatePct) / 100;
    let full = 0;
    let half = 0;
    for (let m = 0; m < 12; m++) {
      if (HALF_RATE_MONTHS.has(calendar[m])) half += additions[m];
      else full += additions[m];
    }
    const additionsTotal = full + half;
    const itDepreciation = rupee(ir * (num(b.openingIt) + full) + (ir / 2) * half);
    const cosTotal = sum(cd);
    return {
      id: b.id,
      name: b.name,
      itRatePct: num(b.itRatePct),
      lifeYears: num(b.lifeYears),
      cosRatePct,
      openingIt: num(b.openingIt),
      openingCos: num(b.openingCos),
      additions,
      additionsTotal,
      itDepreciation,
      closingIt: num(b.openingIt) + additionsTotal - itDepreciation,
      cosDepreciation: cd,
      cosDepreciationTotal: cosTotal,
      closingCos: num(b.openingCos) + additionsTotal - cosTotal,
      linkLineId: b.linkLineId,
    };
  });

  const base = opex.map((x, m) => x - gst[m] - capitalised[m] - masterDepreciation[m] - insuranceBooked[m] + insurancePrepaid[m] + cosDepreciation[m]);
  const on = t.mode === 'cost_plus';
  const markup = num(t.markupPct) / 100;
  const baseTotal = sum(base);
  const profitBeforeTax = rupee(baseTotal * markup);
  const cosTotal = sum(cosDepreciation);
  const itTotal = blocks.reduce((a, b) => a + b.itDepreciation, 0);
  const taxable = profitBeforeTax + sum(gratuity) + sum(leave) + cosTotal - itTotal;
  const surchargePct = t.surchargeBySlab ? slabSurcharge(taxable) : num(t.surchargePct);
  const effectiveRate = on ? (num(t.ratePct) / 100) * (1 + surchargePct / 100) * (1 + num(t.cessPct) / 100) : 0;
  const tax = on ? rupee(Math.max(0, taxable) * effectiveRate) : 0;

  /* Spread by each month's share of the cost base; the last month takes the rounding. */
  const monthlyTax = zeros();
  if (tax && baseTotal > 0) {
    let given = 0;
    for (let m = 0; m < 11; m++) {
      monthlyTax[m] = rupee((tax * Math.max(0, base[m])) / baseTotal);
      given += monthlyTax[m];
    }
    monthlyTax[11] = tax - given;
  }

  return {
    on,
    actualMonths,
    opex,
    gst,
    capitalised,
    masterDepreciation,
    insuranceOn,
    insuranceBooked,
    insurancePrepaid,
    headcount,
    cosDepreciation,
    base,
    gratuity,
    leave,
    blocks,
    totals: {
      opex: sum(opex),
      gst: sum(gst),
      capitalised: sum(capitalised),
      masterDepreciation: sum(masterDepreciation),
      insuranceBooked: sum(insuranceBooked),
      insurancePrepaid: sum(insurancePrepaid),
      cosDepreciation: cosTotal,
      base: baseTotal,
      revenue: rupee(baseTotal * (1 + markup)),
      profitBeforeTax,
      gratuity: sum(gratuity),
      leave: sum(leave),
      itDepreciation: itTotal,
      taxable,
      tax,
    },
    ratePct: num(t.ratePct),
    surchargePct,
    cessPct: num(t.cessPct),
    effectiveRate,
    monthlyTax,
  };
}

/**
 * The four advance tax instalments. Without `actuals` it is the budget schedule: 15%, 30%, 30% and
 * 25% of the budget tax. With `actuals`, each instalment uses the approved months up to the end of
 * its quarter, and an approved instalment month with a typed payment counts that payment as paid.
 */
export function advanceTaxSchedule(settings: BudgetSettings, rowList: BudgetRow[], src: TaxSource, actuals?: TaxActuals | null): Instalment[] {
  let paid = 0;
  const out: Instalment[] = [];
  for (const inst of INSTALMENTS) {
    const m = src.calendar.indexOf(inst.calendar);
    if (m < 0) continue;
    const calc = computeTax(settings, rowList, src, actuals, m);
    const inQuarter = [m - 2, m - 1, m].filter((i) => i >= 0 && actuals?.approved[i]).length;
    const basis: Instalment['basis'] = inQuarter === 3 ? 'Actual' : inQuarter ? 'Part actual' : 'Budget';
    const monthsOnActuals = actuals ? actuals.approved.slice(0, m + 1).filter(Boolean).length : 0;
    const cumulativeDue = rupee((calc.totals.tax * inst.pct) / 100);
    const payable = Math.max(0, cumulativeDue - paid);
    const typed = actuals?.approved[m] ? actuals.advancePaid[m] : null;
    const actualPaid = typed != null ? num(typed) : null;
    out.push({ monthIndex: m, dueLabel: `15-${src.labels[m]}`, quarter: inst.quarter, cumulativePct: inst.pct, basis, monthsOnActuals, taxForYear: calc.totals.tax, cumulativeDue, paidBefore: paid, payable, actualPaid });
    paid += actualPaid ?? payable;
  }
  return out;
}

/** The budget instalment payable in each financial-year month; 0 in months with no instalment. */
export function advanceTaxBudgetByMonth(settings: BudgetSettings, rowList: BudgetRow[], src: TaxSource): Series {
  const out = zeros();
  for (const i of advanceTaxSchedule(settings, rowList, src, null)) out[i.monthIndex] = i.payable;
  return out;
}
