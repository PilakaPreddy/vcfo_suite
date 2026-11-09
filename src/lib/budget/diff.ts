import { computeBudget, sumSeries } from './engine';
import { ROW_SECTION, type BudgetRow, type BudgetSection, type BudgetState, type RoleData } from './model';

/**
 * BUDGET COMPARE — what changed between two frozen versions: the annual total of each budget line,
 * and which rows were added, removed or edited. Pure, so a version can be compared on any screen.
 */

export interface LineDifference {
  lineId: string;
  name: string;
  before: number;
  after: number;
  change: number;
}

export interface RowDifference {
  section: BudgetSection;
  name: string;
  kind: 'added' | 'removed' | 'changed';
  fields: { field: string; before: unknown; after: unknown }[];
}

export interface BudgetDifference {
  beforeTotal: number;
  afterTotal: number;
  lines: LineDifference[];
  rows: RowDifference[];
}

const nameOf = (row: BudgetRow): string => ((row.data as RoleData).role ?? (row.data as { name?: string }).name ?? '') || '(unnamed row)';

/** The field-by-field changes of a row, as the change log and this compare show them. */
export function changedFields(before: object, after: object): { field: string; before: unknown; after: unknown }[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    const a = (before as Record<string, unknown>)[key];
    const b = (after as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: key, before: a ?? null, after: b ?? null });
  }
  return out;
}

export function compareBudgets(before: BudgetState, after: BudgetState): BudgetDifference {
  const a = computeBudget(before);
  const b = computeBudget(after);
  const names = new Map([...before.settings.lines, ...after.settings.lines].map((l) => [l.id, l.name]));
  const lines: LineDifference[] = [];
  for (const [lineId, name] of names) {
    const was = sumSeries(a.lines[lineId] ?? []);
    const now = sumSeries(b.lines[lineId] ?? []);
    if (was !== now) lines.push({ lineId, name, before: was, after: now, change: now - was });
  }
  lines.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));

  const rows: RowDifference[] = [];
  const old = new Map(before.rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const row of after.rows) {
    seen.add(row.id);
    const was = old.get(row.id);
    if (!was) {
      rows.push({ section: ROW_SECTION[row.kind], name: nameOf(row), kind: 'added', fields: [] });
      continue;
    }
    const fields = changedFields(was.data, row.data);
    if (fields.length) rows.push({ section: ROW_SECTION[row.kind], name: nameOf(row), kind: 'changed', fields });
  }
  for (const row of before.rows) if (!seen.has(row.id)) rows.push({ section: ROW_SECTION[row.kind], name: nameOf(row), kind: 'removed', fields: [] });

  return { beforeTotal: sumSeries(a.grandTotal), afterTotal: sumSeries(b.grandTotal), lines, rows };
}
