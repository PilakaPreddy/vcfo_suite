/**
 * Journey status helpers shared by the tracker, the tree, the metro map and the panel: one place
 * maps a journey status to its word, chip tone, step mark and bar tone.
 */
import type { ChipTone } from '@/components/ui/spectrum-chip';
import type { StepState, StepTone } from '@/components/ui/step-track';
import type { BarTone } from '../../incorporation/spectrum';
import type { JNode, JStatus } from './journey-model';

export const STATUS_WORD: Record<JStatus, string> = {
  done: 'Done',
  active: 'In progress',
  waiting: 'Waiting on you',
  late: 'Overdue',
  up: 'Upcoming',
};

export const STATUS_CHIP: Record<JStatus, ChipTone> = { done: 'ok', active: 'prog', waiting: 'teal', late: 'bad', up: 'idle' };

export const STATUS_BAR: Record<JStatus, BarTone> = { done: 'ok', active: 'prog', waiting: 'teal', late: 'bad', up: 'idle' };

/** The StepMark state and tone for a status. */
export function markOf(status: JStatus): { state: StepState; tone: StepTone } {
  if (status === 'done') return { state: 'done', tone: 'prog' };
  if (status === 'up') return { state: 'next', tone: 'prog' };
  return { state: 'now', tone: status === 'waiting' ? 'teal' : status === 'late' ? 'bad' : 'prog' };
}

/** Every leaf under a node, in order; a leaf returns itself. */
export function leavesOf(node: JNode): JNode[] {
  if (!node.children.length) return [node];
  return node.children.flatMap(leavesOf);
}

export function pctOf(node: { done: number; total: number }): number {
  return node.total ? Math.round((node.done / node.total) * 100) : 0;
}

/** A localStorage read or write that never throws (private windows, blocked storage). */
export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage is a convenience only */
  }
}
