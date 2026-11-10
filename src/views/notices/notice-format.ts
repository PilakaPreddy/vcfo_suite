import type { ChipTone } from '@/components/ui/spectrum-chip';
import type { NoticeStage } from '@/lib/notices/model';

/** Display helpers the notice board and its drawer share. */

export const STAGE_TONE: Record<NoticeStage, ChipTone> = {
  received: 'idle',
  analysed: 'prog',
  docs_requested: 'warn',
  reply_drafted: 'violet',
  submitted: 'teal',
  closed: 'ok',
};

/** "Due in 5 days", "Due today", "3 days overdue", "No reply date", or the submitted state. */
export function dueLabel(c: { open: boolean; stage: NoticeStage; daysLeft: number | null; responseDueOn: string | null }): string {
  if (c.stage === 'closed') return 'Closed';
  if (c.stage === 'submitted') return 'Reply submitted';
  if (c.daysLeft === null) return 'No reply date';
  if (c.daysLeft < 0) return `${-c.daysLeft} day${c.daysLeft === -1 ? '' : 's'} overdue`;
  if (c.daysLeft === 0) return 'Due today';
  return `Due in ${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'}`;
}

/** The colour of the due line: overdue or within two days is danger, within seven is warning. */
export function dueTone(c: { open: boolean; daysLeft: number | null }): 'danger' | 'warning' | 'muted' {
  if (!c.open || c.daysLeft === null) return 'muted';
  if (c.daysLeft <= 2) return 'danger';
  if (c.daysLeft <= 7) return 'warning';
  return 'muted';
}
