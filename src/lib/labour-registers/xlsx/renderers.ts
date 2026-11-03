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

const RENDERERS: Partial<Record<ProjectedTable['form']['archetype'], RegisterRenderer>> = {
  wages: renderWages,
  musterRoll: renderMusterRoll,
  combinedWages: renderCombinedWages,
  leave: renderLeave,
  employment: renderEmployment,
};

/** Render a projected table as the .xlsx bytes of its register. */
export function renderForForm(table: ProjectedTable, meta: WorkbookMeta): Promise<Buffer> {
  const renderer = RENDERERS[table.form.archetype];
  if (!renderer) throw new ArchetypeNotBuilt(table.form.archetype);
  return renderer(table, meta);
}

export { isBuilt, ArchetypeNotBuilt };
export type { WorkbookMeta };
