import type { Visual } from '@/data/ask/schema';

type BarsVisual = Extract<Visual, { type: 'bars' }>;

/** One hue for magnitude, values in ink, each bar anchored to the same baseline. */
export function Bars({ visual }: { visual: BarsVisual }) {
  const max = Math.max(1, ...visual.items.map((item) => item.v));
  return (
    <ul className="space-y-1.5 rounded-[var(--radius-md)] border border-line bg-surface-raised px-3 py-2.5">
      {visual.items.map((item) => (
        <li
          key={item.k}
          title={`${item.k}: ${item.v}`}
          className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2rem] items-center gap-2 text-[12px]"
        >
          <span className="truncate text-ink-muted">{item.k}</span>
          <span className="h-2 border-l border-line">
            {item.v > 0 && (
              <span
                className="block h-full rounded-r bg-data-1"
                style={{ width: `${(item.v / max) * 100}%` }}
              />
            )}
          </span>
          <span className="text-right tabular-nums text-ink">{item.v.toLocaleString('en-IN')}</span>
        </li>
      ))}
    </ul>
  );
}
