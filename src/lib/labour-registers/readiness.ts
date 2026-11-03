/**
 * LABOUR REGISTERS — is this period ready to close?
 *
 * The monthly close is one decision: mark the inputs ready, and the registers are generated
 * from exactly what was locked. Everything before it is gathering; nothing is generated until
 * it happens. That ordering matters more than it looks — without it, a half-gathered month
 * produces a register that looks finished, and the only way to tell is to open the file.
 *
 * So this module answers the question the confirmation asks: what is complete, what is short,
 * and is anything actually blocking. It is pure: the caller supplies the batch's state, and
 * gets back a summary to show and a verdict to act on.
 *
 * The summary is also stored on the batch at the moment of locking, because what the preparer
 * was told when they confirmed is part of the record.
 */
import { fieldByKey } from '@/data/labour-registers/fields';
import type { FormSpec } from '@/data/labour-registers/types';
import { formsNeedingAttendance } from './catalogue';
import type { UploadSlot } from './parse';

/** One line of the readiness summary. */
export interface ReadinessLine {
  /** `ok` is a tick, `short` is a warning with something to go and fix, `blocked` stops the close. */
  kind: 'ok' | 'short' | 'blocked';
  text: string;
  /** Where to go and fix it, when there is somewhere. */
  fix?: { label: string; to: 'uploads' | 'mapping' | 'employees' };
  /** How many rows or employees the line is about, where it counts something. */
  count?: number;
}

export interface ReadinessSummary {
  /** True when nothing is blocking. Short lines do not block; they are judgement calls. */
  canClose: boolean;
  lines: ReadinessLine[];
  /** The headline counts the confirmation repeats back. */
  employees: number;
  employeesComplete: number;
  employeesShort: number;
  /** Registers that would be produced, and the acts they fall under. */
  registers: number;
  acts: number;
}

export interface ReadinessInput {
  /** The forms that apply to this client, state and period. */
  forms: FormSpec[];
  /** Which of the four inputs have been supplied. */
  uploads: Partial<Record<UploadSlot, { rowCount: number; fileName: string }>>;
  /** True when the month was marked fully present instead of uploaded. */
  attendanceAssumed?: boolean;
  /** Canonical fields the forms need, and which of them are mapped. */
  requiredFields: string[];
  mappedFields: string[];
  /** Distinct source values in an enumerated column that nobody has resolved yet. */
  unresolvedValues: number;
  /** Employees on the roll, and how many are missing a field a register prints. */
  employees: number;
  employeesShort: number;
  /**
   * Optional fields nobody mapped. Their columns stay on the form and print nil, so this is
   * reported rather than blocking — not every payroll runs a night shift allowance.
   */
  optionalUnmapped?: string[];
  /** Employees whose minimum wage coverage has not been decided, where overtime was worked. */
  overtimeCoverageUnresolved: number;
}

/** A readable list: "Form X, Form XXIII and 2 more". */
function names(list: string[], max = 2): string {
  if (list.length === 0) return '';
  if (list.length <= max) return list.join(' and ');
  return `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
}

/**
 * Work out whether the period can be closed, and what to tell the person closing it.
 *
 * Only three things block: a missing input that a form cannot be produced without, a required
 * column nobody mapped, and an unresolved attendance code. Everything else is reported and
 * left to the preparer — a client genuinely may have two employees with no PAN on file, and
 * the firm closes the month anyway with that on the record.
 */
export function assessReadiness(input: ReadinessInput): ReadinessSummary {
  const lines: ReadinessLine[] = [];
  const acts = new Set(input.forms.map((f) => f.act));

  /* Employees. */
  const complete = Math.max(0, input.employees - input.employeesShort);
  if (complete > 0) {
    lines.push({ kind: 'ok', count: complete, text: `${complete} employees with complete data` });
  }
  if (input.employeesShort > 0) {
    lines.push({
      kind: 'short',
      count: input.employeesShort,
      text: `${input.employeesShort} employees missing a field a register prints`,
      fix: { label: 'Review', to: 'employees' },
    });
  }

  /* The four inputs. A muster roll cannot be produced without a day grid, so a missing
     attendance sheet blocks unless the month was explicitly marked fully present. */
  const needsGrid = formsNeedingAttendance(input.forms);
  const haveAttendance = Boolean(input.uploads.attendance) || Boolean(input.attendanceAssumed);
  if (needsGrid.length > 0 && !haveAttendance) {
    lines.push({
      kind: 'blocked',
      count: needsGrid.length,
      text: `No attendance for ${needsGrid.length} forms that carry a day grid — ${names(needsGrid.map((f) => `Form ${f.formNumber}`))}`,
      fix: { label: 'Decide', to: 'uploads' },
    });
  } else if (input.attendanceAssumed) {
    lines.push({ kind: 'short', text: 'Attendance assumed full for the month, not uploaded' });
  }
  if (!input.uploads.paysheet) {
    lines.push({ kind: 'blocked', text: 'No paysheet — every wage register needs one', fix: { label: 'Upload', to: 'uploads' } });
  }

  /* Mapping. */
  const mapped = new Set(input.mappedFields);
  const missing = input.requiredFields.filter((f) => !mapped.has(f));
  if (missing.length === 0 && input.requiredFields.length > 0) {
    lines.push({ kind: 'ok', count: input.requiredFields.length, text: `${input.requiredFields.length} register columns mapped` });
  } else if (missing.length > 0) {
    lines.push({
      kind: 'blocked',
      count: missing.length,
      text: `${missing.length} required columns not mapped`,
      fix: { label: 'Map', to: 'mapping' },
    });
  }
  if (input.unresolvedValues > 0) {
    lines.push({
      kind: 'blocked',
      count: input.unresolvedValues,
      text: `${input.unresolvedValues} attendance codes not matched to ours`,
      fix: { label: 'Resolve', to: 'mapping' },
    });
  }

  /* An optional column nobody mapped prints nil. That is a judgement call rather than a
     block: the firm may close a month with no referral bonus because nobody was paid one.
     What it must not do is go out silently, so it is said. */
  const unmapped = input.optionalUnmapped ?? [];
  if (unmapped.length > 0) {
    const labels = unmapped.map((key) => fieldByKey(key)?.label ?? key);
    lines.push({
      kind: 'short',
      count: unmapped.length,
      text: `${unmapped.length} optional columns will print nil — ${names(labels)}`,
      fix: { label: 'Map', to: 'mapping' },
    });
  }

  /* Overtime at twice the ordinary rate applies only where a minimum wage is fixed under the
     Code. An undecided employee would put a figure in a statutory register that the firm
     cannot stand behind, so this blocks. The count is zero when no overtime was worked, so
     nothing more is needed to scope it. */
  if (input.overtimeCoverageUnresolved > 0) {
    lines.push({
      kind: 'blocked',
      count: input.overtimeCoverageUnresolved,
      text: `${input.overtimeCoverageUnresolved} employees have no minimum wage coverage decision, so their overtime rate cannot be set`,
      fix: { label: 'Decide', to: 'employees' },
    });
  }

  return {
    canClose: !lines.some((l) => l.kind === 'blocked'),
    lines,
    employees: input.employees,
    employeesComplete: complete,
    employeesShort: input.employeesShort,
    registers: input.forms.length,
    acts: acts.size,
  };
}

/**
 * The sentence the confirmation leads with, so the preparer knows exactly what they are
 * locking before they tick the box.
 */
export function closeSentence(summary: ReadinessSummary, period: { from: string; to: string }): string {
  return `Inputs for ${period.from} to ${period.to} will be locked, and ${summary.registers} registers under ${summary.acts} acts will be generated for ${summary.employees} employees.`;
}
