import type { StatusCode } from '@/data/checklist';

/**
 * Drag and drop rules for the Work board (M6 G1). The board has four columns; only an
 * assigned task card moves, because steps and filings change status through their own
 * workflow (checklist review, filing actions). A task card dropped on a column takes that
 * column's status through `PATCH /api/tasks/:id`; a card dropped inside its column keeps
 * its status and the tasks of that column get a new `sort_order`.
 */
export type BoardColumn = 'action' | 'progress' | 'waiting' | 'done';

/** The task status each column stands for. */
const COLUMN_STATUS: Record<BoardColumn, StatusCode> = {
  action: 'not-started',
  progress: 'in-progress',
  waiting: 'awaiting-client',
  done: 'completed',
};

/** The column of an open or done task status. */
export function columnOfTaskStatus(status: StatusCode | undefined): BoardColumn {
  if (status === 'in-progress') return 'progress';
  if (status === 'awaiting-client') return 'waiting';
  if (status === 'completed') return 'done';
  return 'action';
}

/** True when a card may be picked up: tasks only. */
export function isBoardDraggable(item: { source: string; taskId?: string }): boolean {
  return item.source === 'task' && Boolean(item.taskId);
}

/**
 * The column's cards in their shown order: the default order, with the task slots refilled
 * by the tasks in their `sortOrder` (tasks with no order keep their default place after the
 * ordered ones). Steps and filings never move.
 */
export function orderColumn<T extends { source: string; sortOrder?: number | null }>(items: readonly T[]): T[] {
  const tasks = items.filter((i) => i.source === 'task');
  const ordered = tasks
    .map((t, at) => ({ t, at }))
    .sort((a, b) => {
      const x = a.t.sortOrder ?? Number.POSITIVE_INFINITY;
      const y = b.t.sortOrder ?? Number.POSITIVE_INFINITY;
      return x === y ? a.at - b.at : x - y;
    })
    .map((e) => e.t);
  let next = 0;
  return items.map((i) => (i.source === 'task' ? ordered[next++]! : i));
}

/** `arrayMove` without the dependency: the item at `from` lands at `to`. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [moved] = out.splice(from, 1);
  if (moved === undefined) return out;
  out.splice(Math.max(0, Math.min(to, out.length)), 0, moved);
  return out;
}

/**
 * The new `sortOrder` of each task in a column after a reorder. `list` is the column in its
 * new order; tasks are numbered 1, 2, 3 in that order. Only tasks whose number changed are
 * returned, so the board saves the fewest rows.
 */
export function sortOrderPatches(
  list: ReadonlyArray<{ source: string; taskId?: string; sortOrder?: number | null }>,
): Array<{ taskId: string; sortOrder: number }> {
  const out: Array<{ taskId: string; sortOrder: number }> = [];
  let n = 0;
  for (const item of list) {
    if (item.source !== 'task' || !item.taskId) continue;
    n += 1;
    if (item.sortOrder !== n) out.push({ taskId: item.taskId, sortOrder: n });
  }
  return out;
}

export type BoardDrop =
  | { action: 'none' }
  | { action: 'status'; taskId: string; status: StatusCode; to: BoardColumn; patches: Array<{ taskId: string; sortOrder: number }> }
  | { action: 'order'; patches: Array<{ taskId: string; sortOrder: number }> };

/**
 * What a drop does. `from` and `to` are the columns; `list` is the target column after the
 * card was placed at its new index (built with `moveInList` for a reorder).
 */
export function boardDrop(
  item: { source: string; taskId?: string },
  from: BoardColumn,
  to: BoardColumn,
  list: ReadonlyArray<{ source: string; taskId?: string; sortOrder?: number | null }>,
): BoardDrop {
  if (!isBoardDraggable(item)) return { action: 'none' };
  if (from !== to) return { action: 'status', taskId: item.taskId!, status: COLUMN_STATUS[to], to, patches: sortOrderPatches(list) };
  const patches = sortOrderPatches(list);
  return patches.length ? { action: 'order', patches } : { action: 'none' };
}
