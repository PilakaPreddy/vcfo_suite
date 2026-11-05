/**
 * LABOUR REGISTERS — one roll, one form, one printable table.
 *
 * A register is a dated rendering of the canonical dataset, never a bespoke document. This is
 * the rendering step: it takes the roll `dataset.ts` assembled and projects it through one
 * form's prescribed columns, in the order the prescribed sheet prints them.
 *
 * It is pure. Given the same roll and the same form it produces the same table, which is what
 * lets a document be content-addressed: the same inputs give the same bytes, so a stored file
 * can answer instead of a rebuild.
 *
 * **A prescribed column is never removed.** That is the rule the whole module is arranged
 * around. A form carries its columns whatever the client pays, and the research behind this
 * catalogue found that an electronic register may change its layout but not its "integrity,
 * serial number and column contents". So an optional column nobody mapped prints its heading
 * with nothing under it, and the fact is reported three ways — on the column, in a footnote,
 * and in the evidence manifest — rather than being quietly dropped.
 */
import { fieldByKey, type FieldKind } from '@/data/labour-registers/fields';
import type { ColumnSource, FormColumn, FormSpec } from '@/data/labour-registers/types';
import { nilColumns } from './catalogue';
import type { Dataset, DatasetEmployee } from './dataset';
import { AGGREGATORS, headCountNote } from './aggregate';
import { DERIVERS, DerivationBlocked, deriveValue, num, type DeriveContext } from './derive';

/** One column of the table, after the day grid has been expanded. */
export interface ProjectedColumn {
  field: string;
  /** The heading the prescribed form uses, verbatim. */
  heading: string;
  ordinal: number;
  source: ColumnSource;
  kind: FieldKind;
  /** True when an optional column had nothing mapped: the heading prints, the cells are blank. */
  nil: boolean;
  /** Set on a column expanded out of the day grid. */
  day?: number;
  /** The heading of the band this column sits under, for an expanded grid. */
  band?: string;
}

export interface ProjectedTable {
  form: FormSpec;
  columns: ProjectedColumn[];
  /** One array per employee, in column order. `null` is a blank cell, not a zero. */
  rows: Array<Array<string | number | null>>;
  /** Columns that printed with nothing under them, for the footnote and the manifest. */
  nil: Array<{ heading: string; field: string }>;
  /** Anything the preparer should be told, printed under the table. */
  notes: string[];
}

/**
 * Raised when a form cannot be produced honestly.
 *
 * The generate route turns this into a blocked entry rather than a failure: twenty-eight
 * registers that can be built should be built, and the one that cannot should say why.
 */
export class ProjectionError extends Error {
  readonly formId: string;
  /** Required columns nobody mapped. Readiness should have blocked first; this is the backstop. */
  readonly missingRequired: string[];
  /** Values that could not be derived honestly — an undecided overtime rate, most often. */
  readonly blocked: string[];

  constructor(formId: string, missingRequired: string[], blocked: string[]) {
    const parts = [
      missingRequired.length ? `${missingRequired.length} required columns are unmapped` : '',
      blocked.length ? blocked.join(' ') : '',
    ].filter(Boolean);
    super(`Form ${formId} cannot be produced: ${parts.join('; ')}`);
    this.name = 'ProjectionError';
    this.formId = formId;
    this.missingRequired = missingRequired;
    this.blocked = blocked;
  }
}

/**
 * How a value is written into the sheet.
 *
 * Numbers stay numbers so the spreadsheet can total a column and the writer can apply a number
 * format; everything else is text. A blank is `null` rather than `0` or `''` — the difference
 * between "nobody paid this" and "this is zero" is one an inspector may ask about.
 */
function format(kind: FieldKind, raw: string | number | null | undefined): string | number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const text = raw.trim();
  if (text === '') return null;
  if (kind === 'money' || kind === 'number' || kind === 'hours' || kind === 'days') {
    const n = num(text);
    return n === null ? text : n;
  }
  return text;
}

/**
 * The code an assumed month prints for one day.
 *
 * A month stated fully present is not thirty days worked: the weekly off is still a weekly
 * off, and printing `P` across it would overstate the days-worked total on the same sheet — a
 * muster roll that contradicts itself. So the week-off rule recorded with the assumption is
 * applied, and only the remaining days read as present.
 */
export type WeekOffRule = 'none' | 'sun' | 'sat-sun' | 'alt-sat-sun';

const WEEK_OFF_RULES: WeekOffRule[] = ['none', 'sun', 'sat-sun', 'alt-sat-sun'];

/**
 * The week-off rule a stated-present month is printed under.
 *
 * Unrecognised and absent both mean `none`, and that is the whole reason this function exists
 * rather than two `if` chains. The grid and the footnote used to read the raw value separately:
 * the grid fell through to `P` for anything it did not know, while the footnote fell through to
 * "Sundays are shown as the weekly off". A value of `'Sunday'` — the word rather than the key —
 * produced a muster roll with `P` on every Sunday and a note underneath saying those Sundays
 * were off. A register contradicting itself in its own footnote is worse than one that says
 * plainly that every day is marked present.
 */
export function weekOffRule(weekOff: string | undefined): WeekOffRule {
  return WEEK_OFF_RULES.includes(weekOff as WeekOffRule) ? (weekOff as WeekOffRule) : 'none';
}

/** What the footnote says about that rule. One wording, derived from the same value. */
export function weekOffNote(weekOff: string | undefined): string {
  switch (weekOffRule(weekOff)) {
    case 'sun':
      return ' Sundays are shown as the weekly off.';
    case 'sat-sun':
      return ' Saturdays and Sundays are shown as the weekly off.';
    case 'alt-sat-sun':
      return ' Sundays and alternate Saturdays are shown as the weekly off.';
    default:
      return ' No weekly off was recorded, so every day is marked present.';
  }
}

export function assumedCode(period: { from: string }, day: number, weekOff: string | undefined): string {
  const rule = weekOffRule(weekOff);
  if (rule === 'none') return 'P';

  const date = new Date(`${period.from.slice(0, 8)}${String(day).padStart(2, '0')}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'P';
  const dow = date.getUTCDay();

  if (rule === 'sun') return dow === 0 ? 'WO' : 'P';
  if (rule === 'sat-sun') return dow === 0 || dow === 6 ? 'WO' : 'P';
  if (rule === 'alt-sat-sun') {
    if (dow === 0) return 'WO';
    /* The second and fourth Saturday, which is the common Indian office rule. */
    if (dow === 6) return Math.ceil(day / 7) % 2 === 0 ? 'WO' : 'P';
    return 'P';
  }
  return 'P';
}

/** The per-establishment master values, which are the same for everybody on the roll. */
const ESTABLISHMENT_FIELDS = new Set(['shiftName', 'shiftStart', 'shiftEnd', 'restInterval']);

function masterValue(field: string, employee: DatasetEmployee, dataset: Dataset): string {
  if (ESTABLISHMENT_FIELDS.has(field)) {
    return (dataset.master as unknown as Record<string, string>)[field] ?? '';
  }
  /* Everything else is per-employee and comes from the employees sheet, which `dataset.ts`
     has already merged into the row. */
  return employee.values[field] ?? '';
}

/** Expand a `grid` column into one column per day of the period. */
function expandGrid(col: FormColumn, dataset: Dataset, ordinal: number): ProjectedColumn[] {
  return dataset.days.map((day) => ({
    field: 'attendanceGrid',
    heading: String(day),
    ordinal,
    source: 'grid' as const,
    kind: 'text' as const,
    nil: false,
    day,
    band: col.heading,
  }));
}

export function projectForm(form: FormSpec, dataset: Dataset): ProjectedTable {
  /* A layout nobody has seen cannot be produced. Telangana Form XXVII is the case: its
     columns are recorded as `[1]` to `[7]`, and a sheet with seven columns headed that way is
     worse than no sheet — it looks filed and says nothing. */
  if (form.layoutPlaceholder) {
    throw new ProjectionError(form.id, [], [
      'the prescribed column layout is not known, so the form is not produced; record it on the verification screen',
    ]);
  }

  const mapped = new Set(Object.keys(dataset.mapping));
  const nilFields = new Set(nilColumns(form, mapped).map((c) => c.field));

  const missingRequired: string[] = [];
  const columns: ProjectedColumn[] = [];

  /* The prescribed order. `ordinal` is what the form itself prints; the catalogue's own order
     is the fallback for a form that does not number its columns. */
  const ordered = [...form.columns].sort((a, b) => {
    const ao = a.ordinal ?? Number.MAX_SAFE_INTEGER;
    const bo = b.ordinal ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return form.columns.indexOf(a) - form.columns.indexOf(b);
  });

  for (const [i, col] of ordered.entries()) {
    const ordinal = col.ordinal ?? i + 1;

    if (col.source === 'grid') {
      columns.push(...expandGrid(col, dataset, ordinal));
      continue;
    }

    const spec = fieldByKey(col.field);

    /*
     * An optional column nobody mapped normally prints nil — but not if we can work it out.
     *
     * Form IV declares overtime wages as an *input* column, so an unmapped one would print
     * blank even for an employee with six hours of overtime on the row. A statutory register
     * that silently understates wages is a worse outcome than one that refuses to be built,
     * so a column with a deriver behind it is derived instead, and blocks if it cannot be.
     * A column with no deriver — a night shift allowance — still prints nil.
     */
    /* An aggregate is a figure about the establishment, not a column of anybody's row, so
       none of the mapping rules below apply to it. */
    if (col.source === 'aggregate') {
      columns.push({
        field: col.field,
        heading: col.heading,
        ordinal,
        source: 'aggregate',
        kind: col.field.startsWith('count') ? 'number' : 'money',
        nil: false,
      });
      continue;
    }

    const derivable = col.source === 'input' && !mapped.has(col.field) && DERIVERS[col.field] !== undefined;
    const isNil = nilFields.has(col.field) && !derivable;

    /* A required input column nobody mapped is a backstop failure: `assessReadiness` blocks on
       exactly this and should have stopped the close. Reaching here means something bypassed
       it, so the form is refused rather than printed short. */
    if (col.source === 'input' && !mapped.has(col.field) && !spec?.optional) {
      missingRequired.push(col.field);
    }

    columns.push({
      field: col.field,
      heading: col.heading,
      ordinal,
      source: derivable ? 'derived' : col.source,
      kind: spec?.kind ?? 'text',
      nil: isNil,
    });
  }

  const ctx: Omit<DeriveContext, 'index'> = {
    period: dataset.period,
    days: dataset.days,
    master: { dateOfPayment: dataset.master.dateOfPayment },
    wageRateBasis: dataset.assumptions.wageRateBasis ?? 'monthly',
    dailyHours: dataset.assumptions.dailyHours,
  };

  const blocked = new Set<string>();
  const rows: ProjectedTable['rows'] = [];

  /*
   * A return is one row about an establishment; a register is many rows about people.
   *
   * So a periodic return does not iterate the roll at all. Its aggregate columns are figures
   * over the whole dataset, and its non-aggregate columns — Form D's "category of workers" —
   * take the first row's value, because a return filed per category is filed once per
   * category and this product produces one.
   */
  if (form.archetype === 'periodicReturn') {
    const aggCtx = { period: dataset.period, days: dataset.days };
    const first = dataset.employees[0];
    rows.push(
      columns.map((col) => {
        if (col.source === 'aggregate') {
          const fn = AGGREGATORS[col.field];
          return fn ? fn(dataset.employees, aggCtx) : null;
        }
        if (col.source === 'signature') return null;
        if (!first) return null;
        if (col.source === 'master') return format(col.kind, masterValue(col.field, first, dataset));
        return format(col.kind, first.values[col.field]);
      }),
    );

    const notes = noteLines(columns, dataset);
    const count = headCountNote(dataset.employees);
    if (count) notes.push(count);
    return {
      form,
      columns,
      rows,
      nil: columns.filter((c) => c.nil).map((c) => ({ heading: c.heading, field: c.field })),
      notes,
    };
  }

  for (const [index, employee] of dataset.employees.entries()) {
    const row: Array<string | number | null> = [];

    for (const col of columns) {
      if (col.nil) {
        row.push(null);
        continue;
      }

      switch (col.source) {
        case 'signature':
          /* The column, its width and its border print. Nothing is written in it. */
          row.push(null);
          break;

        case 'grid': {
          const code = employee.grid[col.day!];
          /* A month stated fully present prints present on the working days and the weekly
             off on the rest. The assumption is keyed, so uploading a real sheet later rebuilds
             these rather than leaving a file that looks the same. */
          row.push(
            code ??
              (dataset.assumptions.fullAttendanceAssumed
                ? assumedCode(dataset.period, col.day!, dataset.assumptions.weekOff)
                : null),
          );
          break;
        }

        case 'master':
          row.push(format(col.kind, masterValue(col.field, employee, dataset)));
          break;

        case 'derived':
          try {
            row.push(format(col.kind, deriveValue(col.field, employee, { ...ctx, index })));
          } catch (e) {
            if (e instanceof DerivationBlocked) {
              blocked.add(e.message);
              row.push(null);
              break;
            }
            throw e;
          }
          break;

        default:
          row.push(format(col.kind, employee.values[col.field]));
      }
    }

    rows.push(row);
  }

  if (missingRequired.length > 0 || blocked.size > 0) {
    throw new ProjectionError(form.id, [...new Set(missingRequired)], [...blocked]);
  }

  /* What actually went out blank, after the derivable columns were worked out. */
  const nil = columns
    .filter((c) => c.nil)
    .map((c) => ({ heading: c.heading, field: c.field }));

  return { form, columns, rows, nil, notes: noteLines(columns, dataset) };
}

/**
 * What is printed under the table, whatever shape the form is.
 *
 * Shared by the register path and the return path, because a return printed under an assumed
 * month should say so exactly as a muster roll does.
 */
function noteLines(columns: ProjectedColumn[], dataset: Dataset): string[] {
  const notes: string[] = [];
  const nil = columns.filter((c) => c.nil);
  if (nil.length > 0) {
    notes.push(
      `Printed nil for this period: ${nil.map((c) => c.heading).join(', ')}. The column is prescribed and is not removed.`,
    );
  }
  if (dataset.assumptions.fullAttendanceAssumed) {
    notes.push(
      `Attendance was stated fully present for the period rather than uploaded.${weekOffNote(dataset.assumptions.weekOff)}`,
    );
  }
  return notes;
}

/** Project every form, keeping what succeeded and reporting what could not be produced. */
export function projectForms(
  forms: FormSpec[],
  dataset: Dataset,
): { tables: ProjectedTable[]; blocked: Array<{ formId: string; reason: string }> } {
  const tables: ProjectedTable[] = [];
  const blocked: Array<{ formId: string; reason: string }> = [];

  for (const form of forms) {
    try {
      tables.push(projectForm(form, dataset));
    } catch (e) {
      if (e instanceof ProjectionError) {
        blocked.push({ formId: form.id, reason: e.message });
        continue;
      }
      throw e;
    }
  }
  return { tables, blocked };
}
