/**
 * LABOUR REGISTERS — one renderer per archetype.
 *
 * Each is a named function rather than a branch inside the writer, so an archetype that later
 * needs genuinely different body logic has somewhere to grow. Today they all delegate to the
 * same scaffold, because having measured all twenty-nine forms the differences really are only
 * the values in `layouts.ts`.
 *
 * What is *not* an archetype difference, and must not become one: whether a form has a day
 * grid. `in-mw-muster` is a muster roll with none. The scaffold asks the projected table.
 */
import type { ProjectedTable } from '../project';
import { isBuilt, ArchetypeNotBuilt } from './layouts';
import { writeRegisterWorkbook, type WorkbookMeta } from './scaffold';
import { writeWageSlipWorkbook } from './wage-slip';

export type RegisterRenderer = (table: ProjectedTable, meta: WorkbookMeta) => Promise<Buffer>;

/** One row per employee, earnings and deductions across the columns. */
export const renderWages: RegisterRenderer = (table, meta) => writeRegisterWorkbook(table, meta);

/** An identity block then, usually, one column per day of the period. */
export const renderMusterRoll: RegisterRenderer = (table, meta) => writeRegisterWorkbook(table, meta);

/** A muster roll and a wage register on one sheet. The widest form in the catalogue. */
export const renderCombinedWages: RegisterRenderer = (table, meta) => writeRegisterWorkbook(table, meta);

/** Leave earned, availed and carried. */
export const renderLeave: RegisterRenderer = (table, meta) => writeRegisterWorkbook(table, meta);

/** Who is employed, with hours, shift and rest interval. */
export const renderEmployment: RegisterRenderer = (table, meta) => writeRegisterWorkbook(table, meta);

/**
 * One slip per employee, transposed: labels down, values beside them.
 *
 * The one archetype that does not delegate to the scaffold, and the reason the renderers were
 * kept as five named functions rather than one branch. A slip is handed to the person it is
 * about, so it is a document per employee rather than a row in a table of everybody.
 */
export const renderWageSlip: RegisterRenderer = (table, meta) => writeWageSlipWorkbook(table, meta);

/**
 * One row of figures about an establishment.
 *
 * It does delegate to the scaffold, because a one-row table is still a table — the work that
 * made returns possible was in the projection, where the aggregate columns are computed over
 * the whole roll instead of per employee.
 */
export const renderPeriodicReturn: RegisterRenderer = (table, meta) => writeRegisterWorkbook(table, meta);

const RENDERERS: Partial<Record<ProjectedTable['form']['archetype'], RegisterRenderer>> = {
  wages: renderWages,
  musterRoll: renderMusterRoll,
  combinedWages: renderCombinedWages,
  leave: renderLeave,
  employment: renderEmployment,
  wageSlip: renderWageSlip,
  periodicReturn: renderPeriodicReturn,
};

/** Render a projected table as the .xlsx bytes of its register. */
export function renderForForm(table: ProjectedTable, meta: WorkbookMeta): Promise<Buffer> {
  const renderer = RENDERERS[table.form.archetype];
  if (!renderer) throw new ArchetypeNotBuilt(table.form.archetype);
  return renderer(table, meta);
}

export { isBuilt, ArchetypeNotBuilt };
export type { WorkbookMeta };
