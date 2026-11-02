/** The date headings of the full Ask VCFO page's chat list, newest first. */
export const HISTORY_GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const;
export type HistoryGroup = (typeof HISTORY_GROUPS)[number];

/** The chat list's date heading for a chat last answered at `iso`, seen at `now` (local days). */
export function historyGroup(iso: string, now: Date = new Date()): HistoryGroup {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Older';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Previous 7 days';
  if (days <= 30) return 'Previous 30 days';
  return 'Older';
}
