/**
 * LABOUR REGISTERS — the columns a form computes rather than reads.
 *
 * Seven of the catalogue's columns are declared `derived`, and one more (`overtimeWages`) is
 * declared as an input on some forms and has to be computed when nobody mapped it. This module
 * is all eight, each a pure function of one employee's row.
 *
 * Two rules run through the whole file:
 *
 *  1. **A mapped value always wins.** If the client's paysheet carries a figure, that figure is
 *     what the register prints. These functions are what happens when it does not. A register
 *     that silently replaces the client's own number with our arithmetic is worse than one that
 *     prints nothing, because nobody can tell it happened.
 *  2. **Nothing is guessed.** Where a value cannot be derived honestly — an overtime rate for
 *     an employee whose minimum wage coverage nobody decided, a payment date nobody supplied —
 *     the function says so and the caller blocks. The alternative is a statutory register
 *     carrying a figure the firm cannot stand behind.
 */
import { fieldByKey } from '@/data/labour-registers/fields';
import { computeOvertime, normalHoursFor, type MinimumWageCoverage } from './overtime';

/** One employee's row, as `dataset.ts` assembles it. Kept structural so this module stays pure. */
export interface DerivableEmployee {
  values: Record<string, string>;
  /** Day of the month to canonical attendance code. */
  grid: Record<number, string>;
  coverage: MinimumWageCoverage;
}

export interface DeriveContext {
  /** Position in the roll, zero-based. `serial` is this plus one. */
  index: number;
  /** The period the register covers. */
  period: { from: string; to: string };
  /** Days in the period, so a 30-day month is not treated as a 31-day one. */
  days: number[];
  /** The establishment-level values no paysheet carries. */
  master: { dateOfPayment: string };
  /** How a rate of wages is expressed in this client's payroll. */
  wageRateBasis: 'monthly' | 'daily';
  /** Hours in a normal working day, where the client has said. */
  dailyHours?: number;
  /** The multiplier for an employee not covered by a fixed minimum wage. */
  contractualMultiplier?: number;
}

/**
 * Raised when a value cannot be derived honestly. The caller turns it into a blocked form
 * rather than a printed guess.
 */
export class DerivationBlocked extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'DerivationBlocked';
    this.field = field;
  }
}

/**
 * The attendance codes that count as a day worked.
 *
 * `WOP` and `HP` are a week off and a holiday that were *worked*, so they count; `WO` and `H`
 * are the days off themselves and do not. Leave of every kind is not a day worked even when it
 * is paid — the register's "days worked" column means attendance, and a separate leave register
 * carries the rest.
 */
const WORKED_CODES = new Set(['P', 'WOP', 'HP']);

/**
 * The earnings that make up normal wages.
 *
 * Listed rather than inferred from `kind: 'money'`, because that kind covers deductions too and
 * summing a provident fund into gross pay would be a silent, serious error. Overtime is
 * deliberately absent: normal wages are what the overtime rate is derived *from*.
 */
const EARNING_FIELDS = [
  'basic',
  'dearnessAllowance',
  'hra',
  'specialAllowance',
  'conveyanceAllowance',
  'foodAllowance',
  'medicalAllowance',
  'nightShiftAllowance',
  'attendanceBonus',
  'childEducationAllowance',
  'leaveEncashment',
  'noticePay',
  'arrears',
  'referralBonus',
  'maternityBenefit',
  'otherEarnings',
] as const;

/** A cell's number, or null when it is blank or not a number. Indian digit grouping is stripped. */
export function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,\s₹]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** True when the employee's own row carries a usable figure for this field. */
function supplied(e: DerivableEmployee, field: string): number | null {
  return num(e.values[field]);
}

/** Days of the period the employee was present for, counted off the attendance grid. */
export function workedDays(e: DerivableEmployee, ctx: DeriveContext): number {
  const mapped = supplied(e, 'daysWorked');
  if (mapped !== null) return mapped;
  let n = 0;
  for (const day of ctx.days) if (WORKED_CODES.has(e.grid[day] ?? '')) n += 1;
  return n;
}

/** Whole years between two ISO dates, as an age is counted. */
export function wholeYears(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const monthDiff = to.getUTCMonth() - from.getUTCMonth();
  /* A birthday later in the year has not happened yet. */
  if (monthDiff < 0 || (monthDiff === 0 && to.getUTCDate() < from.getUTCDate())) years -= 1;
  return years >= 0 ? years : null;
}

export type Deriver = (e: DerivableEmployee, ctx: DeriveContext) => string | number | null;

export const DERIVERS: Record<string, Deriver> = {
  serial: (_e, ctx) => ctx.index + 1,

  /**
   * Age at the end of the period, not age today.
   *
   * That distinction is load-bearing rather than pedantic: a document is content-addressed, so
   * a value that moves with the wall clock would make a stored register go stale on somebody's
   * birthday and be rebuilt for no reason. Everything here must be a pure function of the
   * inputs and the period.
   */
  age: (e, ctx) => {
    const dob = e.values.dateOfBirth;
    if (!dob) return null;
    return wholeYears(dob, ctx.period.to);
  },

  daysWorked: (e, ctx) => workedDays(e, ctx),

  normalHours: (e, ctx) => normalHoursFor(workedDays(e, ctx), ctx.dailyHours),

  /**
   * What the employee earned for ordinary work, before any overtime.
   *
   * Preferred route is gross minus overtime, because gross is a figure the payroll itself
   * produced. Summing the heads is the fallback, and it is only as complete as what was mapped.
   */
  normalWagesEarned: (e) => {
    const own = num(e.values.normalWagesEarned);
    if (own !== null) return own;

    const gross = num(e.values.grossEarnings);
    const ot = num(e.values.overtimeWages);
    if (gross !== null) return gross - (ot ?? 0);

    let total = 0;
    let any = false;
    for (const field of EARNING_FIELDS) {
      const v = num(e.values[field]);
      if (v !== null) {
        total += v;
        any = true;
      }
    }
    return any ? total : null;
  },

  /**
   * The rate of wages the form prints.
   *
   * Whether that means a month's wages or a day's is a property of the client's payroll, not
   * something to infer from the numbers, so it is an assumption carried on the batch and keyed
   * into every document.
   */
  wageRate: (e, ctx) => {
    const own = num(e.values.wageRate);
    if (own !== null) return own;

    const normal = DERIVERS.normalWagesEarned(e, ctx);
    if (typeof normal !== 'number') return null;
    if (ctx.wageRateBasis === 'monthly') return normal;

    const days = workedDays(e, ctx);
    return days > 0 ? normal / days : null;
  },

  /**
   * Overtime wages, when the payroll did not supply them.
   *
   * Section 14 of the Code on Wages applies twice the ordinary rate to an employee whose
   * minimum rate of wages is fixed under the Code — not to everyone. An employee whose coverage
   * nobody has decided blocks, because the workbook this feature replaces applied 2× to the
   * whole roll and that is the error worth not repeating.
   */
  overtimeWages: (e, ctx) => {
    const own = num(e.values.overtimeWages);
    if (own !== null) return own;

    const hours = num(e.values.overtimeHours) ?? 0;
    if (hours <= 0) return 0;

    const normal = DERIVERS.normalWagesEarned(e, ctx);
    const result = computeOvertime({
      hours,
      normalWages: typeof normal === 'number' ? normal : 0,
      normalHours: normalHoursFor(workedDays(e, ctx), ctx.dailyHours),
      coverage: e.coverage,
      contractualMultiplier: ctx.contractualMultiplier,
    });
    if (result.blocked) throw new DerivationBlocked('overtimeWages', result.blocked);
    return result.wages;
  },

  /** Never guessed. A payment date nobody supplied is a blank, not today's date. */
  dateOfPayment: (e, ctx) => e.values.dateOfPayment || ctx.master.dateOfPayment || null,
};

/**
 * Derive one column's value.
 *
 * An unknown key returns null rather than throwing: the catalogue may grow a derived column
 * before this module does, and a blank cell in a register is recoverable where a 500 on the
 * generate route is not. `project.ts` reports it as a nil column, so it is visible.
 */
export function deriveValue(field: string, e: DerivableEmployee, ctx: DeriveContext): string | number | null {
  const deriver = DERIVERS[field];
  if (!deriver) return null;
  return deriver(e, ctx);
}

/** Every derived column this module knows how to produce. */
function derivableFields(): string[] {
  return Object.keys(DERIVERS);
}

/** True when the catalogue declares a derived column that nothing here can produce. */
function underivedFields(fields: Iterable<string>): string[] {
  return [...fields].filter((f) => !DERIVERS[f] && fieldByKey(f) !== undefined);
}
