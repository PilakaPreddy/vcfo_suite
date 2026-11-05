import { ArrowLeftRight, Ban, CheckCircle2, CirclePause, FileMinus, History, MessageSquare, Trash2, Undo2 } from 'lucide-react';
import type { ActionItem } from '@/components/ui/action-menu';
import type { ManagerInvoiceDto } from '@/lib/receivables/wire';

/** What a row menu item opens; the sheet's state hook decides how. */
export type RowAction = 'mark' | 'pause' | 'resume' | 'fx' | 'notes' | 'history' | 'dispute' | 'resolve' | 'credit' | 'reopen' | 'delete';

/**
 * The row menu of one invoice (Phase 10), the same on the table and the phone cards: Mark
 * received, Pause, Currency, Notes, History, Dispute, Credit note and Delete for an open invoice;
 * Set back to open, Notes, History and Delete for a received one. Each has a letter key.
 */
export function createRowMenu(inv: ManagerInvoiceDto, today: string, run: (action: RowAction, inv: ManagerInvoiceDto) => void): ActionItem[] {
  const go = (a: RowAction) => () => run(a, inv);
  const notes: ActionItem = { label: 'Notes', key: 'n', Icon: MessageSquare, hint: inv.noteCount ? String(inv.noteCount) : undefined, onSelect: go('notes') };
  const history: ActionItem = { label: 'History', key: 'h', Icon: History, onSelect: go('history') };
  const del: ActionItem = { label: 'Delete', key: 'x', Icon: Trash2, danger: true, onSelect: go('delete') };
  if (inv.status !== 'open') {
    return [{ label: 'Set back to open', key: 'u', Icon: Undo2, onSelect: go('reopen') }, notes, history, 'separator', del];
  }
  const paused = Boolean(inv.remindersPausedUntil && inv.remindersPausedUntil >= today);
  return [
    { label: 'Mark received', key: 'r', Icon: CheckCircle2, onSelect: go('mark') },
    paused ? { label: 'Resume reminders', key: 'p', Icon: CirclePause, onSelect: go('resume') } : { label: 'Pause reminders', key: 'p', Icon: CirclePause, onSelect: go('pause') },
    { label: 'Currency and rate', key: 'f', Icon: ArrowLeftRight, onSelect: go('fx') },
    notes,
    history,
    'separator',
    inv.disputed ? { label: 'Resolve dispute', key: 'd', Icon: Ban, onSelect: go('resolve') } : { label: 'Dispute', key: 'd', Icon: Ban, onSelect: go('dispute') },
    { label: 'Credit note', key: 'c', Icon: FileMinus, onSelect: go('credit') },
    'separator',
    del,
  ];
}
