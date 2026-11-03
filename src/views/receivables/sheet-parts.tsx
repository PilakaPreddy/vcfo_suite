/**
 * Small shared pieces of the receivables sheet as read outside the staff shell (the signed-in
 * client partner's page): the table cell classes, the plural helper and the totals tile. They
 * came from the retired public client page.
 */

export const SHEET_TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
export const SHEET_TD = 'border-t border-line-soft px-2.5 py-2 align-middle';

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** One figure of the totals row: open, overdue, received this week. */
export function SheetTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-raised px-4 py-3.5">
      <div className="text-[12px] text-ink-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[20px] font-medium">{value}</div>
      <div className="text-[12px] text-ink-muted">{sub}</div>
    </div>
  );
}
