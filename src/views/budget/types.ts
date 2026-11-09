import type { BudgetResult } from '@/lib/budget/engine';
import type { BudgetRow, BudgetSection, BudgetSettings, BudgetState, RowKind } from '@/lib/budget/model';
import type { BudgetView } from '@/lib/budget/wire';
import type { BudgetController } from './use-budget';

/** What every tab receives once the budget has loaded. */
export interface Ready {
  b: BudgetController;
  view: BudgetView;
  state: BudgetState;
  settings: BudgetSettings;
  rows: BudgetRow[];
  result: BudgetResult;
  canEdit: (section: BudgetSection) => boolean;
  openRow: (rowId: string) => void;
}

export const rowsOf = (ready: Pick<Ready, 'rows'>, kind: RowKind) => ready.rows.filter((r) => r.kind === kind);

export const departmentOptions = (s: BudgetSettings) => s.departments.map((d) => ({ value: d.id, label: d.name }));
export const locationOptions = (s: BudgetSettings) => s.locations.map((d) => ({ value: d.id, label: d.name }));
/** System lines are filled by the calculation, so a row cannot choose them. */
export const lineOptions = (s: BudgetSettings) => s.lines.filter((l) => !l.system).map((l) => ({ value: l.id, label: l.name }));
