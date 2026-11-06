import type { Visual } from '@/data/ask/schema';

type KeyFactsVisual = Extract<Visual, { type: 'keyFacts' }>;


export function KeyFacts({ visual }: { visual: KeyFactsVisual }) {
  return (
    <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
      {visual.facts.map((f, i) => (
        // Two updates can share one date, so the label alone is not a unique key.
        <div key={`${i}-${f.k}`} className="contents">
          <dt className="text-[12px] font-medium text-ink-muted">{f.k}</dt>
          <dd className="text-[13px] text-ink">{f.v}</dd>
        </div>
      ))}
    </dl>
  );
}
