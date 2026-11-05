import { cn } from '@/lib/utils';
import { StepMark } from '@/components/ui/step-track';

/**
 * Stage track (prototype cards/StageTrack): one item's progress through a few fixed stages
 * (Started, Submitted, Reviewed, Completed). The current stage is a blurple block with a kicker
 * line; done stages are joined by a green hairline. Stacks on phones.
 */
export interface TrackStage {
  label: string;
  sub?: string;
  state: 'done' | 'now' | 'todo';
}

export interface TrackNow {
  /** "Step 3 of 4". */
  kicker: string;
  title: string;
  sub?: string;
  /** A short tag at the right of the block, from 1024px. */
  tag?: string;
}

export function StageTrack({ stages, now, className }: { stages: TrackStage[]; now?: TrackNow; className?: string }) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-md border border-line bg-surface-raised px-4 py-3.5 md:px-5', className)} aria-label="Progress">
      <ol className="flex flex-col gap-2 md:flex-row md:items-center md:gap-0">
        {stages.map((s, i) => {
          const last = i === stages.length - 1;
          const isNow = s.state === 'now' && now;
          return (
            <li key={s.label} className={cn('flex min-w-0 items-center md:flex-1', last && 'md:flex-none')} aria-current={s.state === 'now' ? 'step' : undefined}>
              {isNow ? (
                <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-brand-soft px-3 py-2 text-ink shadow-[inset_0_0_0_1.5px_oklch(var(--brand)/0.28)]">
                  <StepMark state="now" size={20} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-brand-text">{now.kicker}</span>
                    <b className="block truncate text-[13px] font-semibold">{now.title}</b>
                    {now.sub ? <span className="block truncate text-[12px] text-ink-muted">{now.sub}</span> : null}
                  </span>
                  {now.tag ? (
                    <span className="ml-1 hidden flex-none rounded-sm bg-surface px-1.5 py-0.5 text-[11.5px] font-medium text-brand-text lg:inline">{now.tag}</span>
                  ) : null}
                </div>
              ) : (
                <div className={cn('flex min-w-0 items-center gap-2.5', s.state === 'todo' && 'opacity-60')}>
                  <StepMark state={s.state === 'done' ? 'done' : s.state === 'now' ? 'now' : 'next'} size={20} />
                  <span className="min-w-0">
                    <b className="block truncate text-[13px] font-semibold text-ink">{s.label}</b>
                    {s.sub ? <span className="block truncate text-[11.5px] text-ink-muted">{s.sub}</span> : null}
                  </span>
                </div>
              )}
              {!last ? <span className={cn('mx-3 hidden h-[1.5px] min-w-4 flex-1 md:block', s.state === 'done' ? 'bg-positive-mid' : 'bg-line')} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
