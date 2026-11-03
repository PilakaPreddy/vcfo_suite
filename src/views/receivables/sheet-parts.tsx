import type { LucideIcon } from 'lucide-react';
import { IconChip, type IconChipTone } from '@/components/common/IconChip';
import { cn } from '@/lib/utils';

/**
 * Small shared pieces of the receivables sheet as read outside the staff shell (the signed-in
 * client partner's page, the print view and the statement of account): the table cell classes,
 * the plural helper and the totals tile. They came from the retired public client page.
 */

export const SHEET_TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
export const SHEET_TD = 'border-t border-line-soft px-2.5 py-2 align-middle';

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * One figure of a totals row: open, overdue, received this week, or a statement total. With
 * `icon` the label gets the shared icon tile (IconChip) in `tone`; `hot` paints the value in the
 * danger colour and `good` in the done colour.
 */
export function SheetTile({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  hot,
  good,
}: {
  label: string;
  value: string;
  sub: string;
  icon?: LucideIcon;
  tone?: IconChipTone;
  hot?: boolean;
  good?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-md border border-line bg-surface-raised px-4 py-3.5">
      {icon ? <IconChip icon={icon} tone={tone} size="md" className="print:hidden" /> : null}
      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-ink-muted">{label}</div>
        <div className={cn('mt-0.5 whitespace-nowrap text-[20px] font-medium tabular-nums', hot ? 'text-danger' : good ? 'text-positive' : 'text-ink')}>{value}</div>
        <div className="truncate text-[12px] text-ink-muted">{sub}</div>
      </div>
    </div>
  );
}
