import type { DatasetEmployee } from './dataset';

/**
 * LABOUR REGISTERS — the figures a periodic return states about an establishment.
 *
 * A register is many rows about people. A return is one row about a place: how many adults it
 * employs, how many of them are women, what it paid out in the half year. Everything else in
 * this feature projects per employee, so the returns needed their own shape rather than a
 * column type bolted onto the row projection.
 *
 * The three in the catalogue today were bound to `serial` — the row-number deriver — so a
 * half-yearly return under Karnataka Form 21 would have printed 1, 2, 3 under three headings
 * asking for head counts. That is the kind of error nobody finds by reading the code: it
 * compiles, it produces a file, and the file is wrong in a way only somebody who knows what
 * the form is for would notice.
 *
 * **Sex is read, never guessed.** An employee whose sex was not mapped is counted in the total
 * and in neither of the two columns, and the difference is reported as a note on the return
 * rather than quietly absorbed into one side. A head count that does not add up is a question
 * somebody can answer; a head count silently balanced is not.
 */

export interface AggregateContext {
  period: { from: string; to: string };
  days: number[];
}

export type Aggregator = (employees: DatasetEmployee[], ctx: AggregateContext) => string | number | null;

/** 'f', 'female', 'w' and 'woman' all mean the same thing on a filed sheet. */
function sexOf(employee: DatasetEmployee): 'male' | 'female' | 'unknown' {
  const raw = (employee.values.sex ?? '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (/^(f|female|w|woman|women)\b/.test(raw)) return 'female';
  if (/^(m|male|man|men)\b/.test(raw)) return 'male';
  return 'unknown';
}

function sum(employees: DatasetEmployee[], field: string): number {
  return employees.reduce((total, e) => {
    const n = Number(String(e.values[field] ?? '').replace(/[^0-9.-]/g, ''));
    return total + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export const AGGREGATORS: Record<string, Aggregator> = {
  countEmployees: (employees) => employees.length,
  countMen: (employees) => employees.filter((e) => sexOf(e) === 'male').length,
  countWomen: (employees) => employees.filter((e) => sexOf(e) === 'female').length,
  /** Counted so that a total which does not add up can be explained rather than hidden. */
  countSexUnknown: (employees) => employees.filter((e) => sexOf(e) === 'unknown').length,
  totalGrossWages: (employees) => sum(employees, 'grossEarnings'),
  totalNetWages: (employees) => sum(employees, 'netPay'),
  totalDeductions: (employees) => sum(employees, 'totalDeductions'),
  totalOvertimeHours: (employees) => sum(employees, 'overtimeHours'),
  totalLeaveAvailed: (employees) => sum(employees, 'leavesAvailed'),
};

/**
 * The note a return carries when its head count does not add up.
 *
 * Empty when it does. The alternative — putting the unknowns into one column — would make the
 * arithmetic work on a statutory return by stating something nobody checked.
 */
export function headCountNote(employees: DatasetEmployee[]): string {
  const unknown = employees.filter((e) => sexOf(e) === 'unknown').length;
  if (unknown === 0) return '';
  return `${unknown} of ${employees.length} employees have no sex recorded, so they are counted in the total and in neither column. Map that column, or the return will not add up.`;
}
