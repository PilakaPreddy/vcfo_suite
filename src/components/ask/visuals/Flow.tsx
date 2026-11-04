import { Check } from 'lucide-react';
import type { Visual } from '@/data/ask/schema';
import { flowText } from '@/lib/ask/visual-text';
import { cn } from '@/lib/utils';

type FlowVisual = Extract<Visual, { type: 'flow' }>;



export function Flow({ visual }: { visual: FlowVisual }) {
  return (
    <div>
      <p className="sr-only">{flowText(visual)}</p>
      {/* As many stages per row as fit at a readable width: 2 in the panel, 4 in the reader. */}
      <ol className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" aria-hidden>
        {visual.stages.map((stage, i) => (
          <li
            key={`${stage.label}-${i}`}
            className={cn(
              'flex min-w-0 flex-col gap-0.5 rounded-[var(--radius-md)] border px-2.5 py-2',
              stage.state === 'here' && 'border-brand bg-brand-soft',
              stage.state === 'done' && 'border-line bg-surface-sunken',
              stage.state === 'next' && 'border-line bg-surface-raised',
            )}
          >
            <span className="flex items-center gap-1 text-[10.5px] font-medium">
              {stage.state === 'done' ? (
                <span className="inline-flex items-center gap-1 text-positive">
                  <Check className="h-3 w-3" strokeWidth={2.25} /> Done
                </span>
              ) : stage.state === 'here' ? (
                <span className="text-brand">You are here</span>
              ) : (
                <span className="text-ink-muted">Next</span>
              )}
            </span>
            {/* Wrap, never truncate: "SPICe+ Part A" and "SPICe+ Part B" must stay distinguishable. */}
            <span className="break-words text-[12.5px] font-medium leading-snug text-ink">{stage.label}</span>
            {stage.sub && <span className="text-[11.5px] text-ink-muted">{stage.sub}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
