/**
 * LABOUR REGISTERS — four uploaded sheets, one roll.
 *
 * Every register the catalogue describes is a view of the same thing: a list of employees, what
 * each was paid, and which days each worked. That list does not exist in any one upload. The
 * paysheet has the money, the attendance sheet has the days, the overtime report has the hours
 * and the employee sheet has the addresses and shift timings — four files, four shapes, four
 * sets of headings somebody else chose.
 *
 * This module joins them. What comes out is canonical: every key is a dataset field, every
 * attendance code is one of ours, and a figure that is absent is absent rather than zero.
 *
 * **The paysheet is the spine.** `readiness.ts` already blocks a close with no paysheet, so an
 * employee who is not on it is not on the roll. The other three left-join onto it. A row in a
 * secondary sheet matching nobody is dropped and *counted* — never dropped silently, because a
 * row of attendance for somebody who has left is a real thing a preparer should see, and so is
 * a typo in an employee code.
 *
 * It is deliberately separate from `project.ts`. This half is a join over messy input and needs
 * fixtures of several shapes to test; that half is a pure function of one form and one roll.
 * Together in one module, neither could be tested properly.
 */
import type { Period } from './catalogue';
import { inputFields, masterFields } from './catalogue';
import type { AssumptionSet } from './cache-key';
import type { MinimumWageCoverage } from './overtime';
import { unresolvedCoverage } from './overtime';
import type { ParsedSheet, UploadSlot } from './parse';
import { normaliseHeader } from './normalise';
import type { FormSpec } from '@/data/labour-registers/types';

/** One employee, assembled from whichever of the four sheets carried them. */
export interface DatasetEmployee {
  /** What the sheets are joined on: the mapped employee code, else the normalised name. */
  key: string;
  /** Canonical field to the cell's text, with value maps already applied. */
  values: Record<string, string>;
  /** Day of the month to a canonical attendance code. */
  grid: Record<number, string>;
  coverage: MinimumWageCoverage;
  /** Fields some applicable form prints that this employee has no value for. */
  missing: string[];
}

/**
 * The values that belong to the establishment rather than to anybody on the roll.
 *
 * Shift timings, the rest interval and the payment date are the same for everyone, so asking
 * for them per employee would be asking the client to repeat themselves two hundred times.
 */
export interface EstablishmentMaster {
  name: string;
  address: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  restInterval: string;
  /** The date wages were paid. Printed by several forms and never guessed. */
  dateOfPayment: string;
}

export const EMPTY_ESTABLISHMENT: EstablishmentMaster = {
  name: '',
  address: '',
  shiftName: '',
  shiftStart: '',
  shiftEnd: '',
  restInterval: '',
  dateOfPayment: '',
};

export interface Dataset {
  period: Period;
  /** The days of the period, 1 to 28–31. A muster roll prints one column per entry. */
  days: number[];
  employees: DatasetEmployee[];
  /** Canonical field to the heading it was taken from, for the evidence manifest. */
  mapping: Record<string, string>;
  master: EstablishmentMaster;
  assumptions: AssumptionSet;
  /** Rows in a secondary sheet that matched nobody on the paysheet. */
  orphans: Array<{ slot: UploadSlot; key: string }>;
}

/** One slot's sheet and the mapping that was confirmed for it. */
export interface SlotInput {
  sheet: ParsedSheet;
  /** Canonical field to the heading it is taken from. */
  mapping: Record<string, string>;
  /** Per field, the client's own values to ours: their `PVL` to our `PL`. */
  valueMaps?: Record<string, Record<string, string>>;
}

export interface BuildDatasetInput {
  period: Period;
  slots: Partial<Record<UploadSlot, SlotInput>>;
  master?: Partial<EstablishmentMaster>;
  assumptions: AssumptionSet;
  /** The forms this period must produce, so "missing" means something a register prints. */
  forms: FormSpec[];
}

/** The days of a period, inclusive. A February batch gets 28 or 29 entries, not 31. */
export function daysOf(period: Period): number[] {
  const from = new Date(`${period.from}T00:00:00Z`);
  const to = new Date(`${period.to}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return [];

  const out: number[] = [];
  const cursor = new Date(from);
  /* Capped so a mis-entered period cannot produce an unbounded column count. A register covers
     a month, a quarter, a half year or a year; 366 days is the widest any of them can be. */
  while (cursor <= to && out.length < 366) {
    out.push(cursor.getUTCDate());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * The join key for one row.
 *
 * An employee code is what a payroll system means by identity, so it wins. A name is the
 * fallback, normalised, because the attendance sheet from a different system routinely spells
 * it differently — "ASHA RAO", "Asha  Rao", "Rao, Asha" will not all survive this, and that is
 * what the orphan count is for.
 */
export function joinKey(values: Record<string, string>): string {
  const code = (values.employeeId ?? '').trim();
  if (code) return code.toUpperCase();
  const name = (values.name ?? '').trim();
  return name ? normaliseHeader(name) : '';
}

/** Turn one sheet's rows into canonical field-keyed records, applying the value maps. */
function canonicalise(input: SlotInput): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const row of input.sheet.rows) {
    const values: Record<string, string> = {};
    for (const [field, heading] of Object.entries(input.mapping)) {
      const raw = row[heading];
      if (raw === undefined) continue;
      const lookup = input.valueMaps?.[field];
      const text = raw.trim();
      values[field] = lookup?.[text] ?? lookup?.[text.toUpperCase()] ?? text;
    }
    out.push(values);
  }
  return out;
}

/**
 * The attendance grid for one row, as day number to canonical code.
 *
 * The grid is read by position rather than by heading — the headings are dates, and the reader
 * has already resolved which column is which day. An unmapped code is kept as it was written
 * rather than dropped: `value-map.ts` reports it as unresolved and the close blocks on it, so
 * swallowing it here would hide the thing that is meant to stop the period.
 */
function gridFor(
  row: Record<string, string>,
  sheet: ParsedSheet,
  valueMap: Record<string, string> | undefined,
): Record<number, string> {
  const grid: Record<number, string> = {};
  if (!sheet.grid?.found) return grid;

  for (const day of sheet.grid.days) {
    const heading = sheet.headers[day.index];
    if (heading === undefined) continue;
    /* `parseWorkbook` disambiguates a repeated heading by position, so try both spellings. */
    const raw = row[heading] ?? row[`${heading || 'column'}__${day.index}`];
    if (raw === undefined) continue;
    const text = raw.trim();
    if (text === '') continue;
    grid[day.day] = valueMap?.[text] ?? valueMap?.[text.toUpperCase()] ?? text.toUpperCase();
  }
  return grid;
}

/** How a client's minimum wage coverage reads, where they have said anything at all. */
function coverageOf(values: Record<string, string>): MinimumWageCoverage {
  const raw = (values.minimumWageCoverage ?? '').trim().toLowerCase();
  if (raw === 'covered' || raw === 'yes' || raw === 'y' || raw === 'true') return 'covered';
  if (raw === 'not-covered' || raw === 'not covered' || raw === 'no' || raw === 'n' || raw === 'false') {
    return 'not-covered';
  }
  return 'unknown';
}

export function buildDataset(input: BuildDatasetInput): Dataset {
  const days = daysOf(input.period);
  const orphans: Dataset['orphans'] = [];

  /* One mapping across every slot, for the manifest. A field mapped in two sheets keeps the
     paysheet's heading, because that is the sheet the roll is built from. */
  const mapping: Record<string, string> = {};
  for (const slot of ['employees', 'overtime', 'attendance', 'paysheet'] as const) {
    const s = input.slots[slot];
    if (s) Object.assign(mapping, s.mapping);
  }

  const paysheet = input.slots.paysheet;
  if (!paysheet) {
    return {
      period: input.period,
      days,
      employees: [],
      mapping,
      master: { ...EMPTY_ESTABLISHMENT, ...input.master },
      assumptions: input.assumptions,
      orphans,
    };
  }

  /* The spine. */
  const byKey = new Map<string, DatasetEmployee>();
  const order: string[] = [];
  const payRows = canonicalise(paysheet);
  for (const [i, values] of payRows.entries()) {
    const key = joinKey(values) || `row-${i + 1}`;
    if (byKey.has(key)) {
      /* The filed paysheet really does carry a code twice. Keeping both under distinct keys is
         safer than merging two people's wages into one row. */
      const unique = `${key}#${i + 1}`;
      byKey.set(unique, { key: unique, values, grid: {}, coverage: coverageOf(values), missing: [] });
      order.push(unique);
      continue;
    }
    byKey.set(key, { key, values, grid: {}, coverage: coverageOf(values), missing: [] });
    order.push(key);
  }

  /* The three that left-join onto it. */
  for (const slot of ['attendance', 'overtime', 'employees'] as const) {
    const s = input.slots[slot];
    if (!s) continue;

    for (const [i, values] of canonicalise(s).entries()) {
      const key = joinKey(values);
      const employee = key ? byKey.get(key) : undefined;
      if (!employee) {
        orphans.push({ slot, key: key || `row-${i + 1}` });
        continue;
      }
      /* The paysheet's own figures are not overwritten: it is the system of record for money,
         and a secondary sheet repeating a field is usually a stale export. */
      for (const [field, text] of Object.entries(values)) {
        if (employee.values[field] === undefined || employee.values[field] === '') {
          employee.values[field] = text;
        }
      }
      if (slot === 'attendance') {
        Object.assign(employee.grid, gridFor(s.sheet.rows[i] ?? {}, s.sheet, s.valueMaps?.attendanceGrid));
      }
      if (slot === 'employees') employee.coverage = coverageOf(employee.values);
    }
  }

  /* What is short. "Missing" means a field some applicable form prints and this employee has
     no value for — not every unmapped field, which would name columns nobody asked for. */
  const printed = new Set([...inputFields(input.forms), ...masterFields(input.forms)]);
  const employees = order.map((key) => byKey.get(key)!);
  for (const employee of employees) {
    employee.missing = [...printed].filter(
      (field) => employee.values[field] === undefined || employee.values[field] === '',
    );
  }

  return {
    period: input.period,
    days,
    employees,
    mapping,
    master: { ...EMPTY_ESTABLISHMENT, ...input.master },
    assumptions: input.assumptions,
    orphans,
  };
}

/** Employees whose minimum wage coverage nobody has decided. Feeds the close's blocker. */
export function undecidedCoverage(dataset: Dataset): number {
  return unresolvedCoverage(dataset.employees.map((e) => ({ coverage: e.coverage })));
}

/** Employees short of at least one field a register prints. Feeds the close's warning. */
export function employeesShort(dataset: Dataset): number {
  return dataset.employees.filter((e) => e.missing.length > 0).length;
}
