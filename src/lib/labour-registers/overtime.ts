/**
 * LABOUR REGISTERS — overtime, and the trap in it.
 *
 * The firm's existing workbook computes an overtime rate of twice the normal hourly rate for
 * every employee. That is how section 14 of the Code on Wages reads at a glance, and it is the
 * single most likely way this feature could produce a wrong register at scale.
 *
 * The research found that the doubled rate is **scoped to employees whose minimum rate of
 * wages has been fixed under the Code**. Most of a professional-services client's staff sit
 * well above any scheduled minimum wage, so applying it universally overstates the overtime
 * wages in a statutory register for the majority of the roll. The finding is web-search
 * mediated — the section text itself could not be opened — so this module does not quietly
 * decide the question either way. It refuses to compute until somebody has answered it, and it
 * records who answered.
 *
 * That is why coverage is recorded per employee: it makes the question part
 * of the monthly close rather than an assumption buried in a formula.
 */

/** Whether an employee is covered by a minimum wage fixed under the Code on Wages. */
export type MinimumWageCoverage = 'covered' | 'not-covered' | 'unknown';

export interface OvertimeInput {
  /** Hours of overtime worked in the period. */
  hours: number;
  /** Wages for the period that the ordinary rate is derived from. */
  normalWages: number;
  /** Hours the period's wages are for — working days times the daily hours. */
  normalHours: number;
  coverage: MinimumWageCoverage;
  /**
   * The multiplier to use for an employee who is not covered by a fixed minimum wage. It comes
   * from the client's own terms of employment, not from the Code, and defaults to one — the
   * ordinary rate — because paying a premium nobody agreed is as wrong as omitting one.
   */
  contractualMultiplier?: number;
}

export interface OvertimeResult {
  /** The ordinary hourly rate. */
  normalRate: number;
  /** The rate actually applied. */
  overtimeRate: number;
  /** The multiplier applied, and why. */
  multiplier: number;
  basis: 'section-14-double-rate' | 'contractual-rate' | 'undetermined';
  wages: number;
  /**
   * Set when the figure must not be printed. The register is blocked rather than filled with a
   * number the firm cannot stand behind.
   */
  blocked?: string;
}

/** Hours in a normal working day, where a client has not said otherwise. */
const DEFAULT_DAILY_HOURS = 8;

/**
 * Compute the overtime wages for one employee.
 *
 * An employee of unknown coverage produces a blocked result. Nothing about this is a judgement
 * call the software should make: the firm decides, per employee, and the decision is recorded
 * on the batch.
 */
export function computeOvertime(input: OvertimeInput): OvertimeResult {
  const normalRate = input.normalHours > 0 ? input.normalWages / input.normalHours : 0;

  if (input.coverage === 'unknown') {
    return {
      normalRate,
      overtimeRate: 0,
      multiplier: 0,
      basis: 'undetermined',
      wages: 0,
      blocked:
        'Minimum wage coverage has not been confirmed for this employee, so the overtime rate cannot be decided. Twice the ordinary rate under section 14 of the Code on Wages applies only where a minimum rate of wages has been fixed under the Code.',
    };
  }

  const multiplier = input.coverage === 'covered' ? 2 : (input.contractualMultiplier ?? 1);
  const overtimeRate = normalRate * multiplier;
  return {
    normalRate,
    overtimeRate,
    multiplier,
    basis: input.coverage === 'covered' ? 'section-14-double-rate' : 'contractual-rate',
    wages: overtimeRate * Math.max(0, input.hours),
  };
}

/** Normal hours for a period, from the days the wages cover. */
export function normalHoursFor(workingDays: number, dailyHours = DEFAULT_DAILY_HOURS): number {
  return Math.max(0, workingDays) * dailyHours;
}

/**
 * The note printed on an overtime register, so a reader knows which rate was applied and on
 * what footing. A register that does not say this is a register whose arithmetic cannot be
 * checked.
 */
export function overtimeBasisNote(result: OvertimeResult): string {
  if (result.basis === 'section-14-double-rate') {
    return 'Overtime at twice the ordinary rate — minimum rate of wages fixed under the Code on Wages, 2019, section 14.';
  }
  if (result.basis === 'contractual-rate') {
    return `Overtime at ${result.multiplier} times the ordinary rate under the terms of employment. Section 14 of the Code on Wages is not engaged, no minimum rate of wages having been fixed for this employee under the Code.`;
  }
  return 'Overtime rate undetermined — minimum wage coverage not confirmed.';
}

/** How many employees of a roll still have no coverage decision, for the close. */
export function unresolvedCoverage(rows: Array<{ coverage: MinimumWageCoverage }>): number {
  return rows.filter((r) => r.coverage === 'unknown').length;
}
