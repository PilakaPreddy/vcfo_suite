import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardLoad } from '@/components/ui/card-load';

/** R-48: an empty state is a plain-edged area with the action. No filler sentence about the obvious. */
export function EmptyState({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-[96px] flex-col items-center justify-center gap-2.5 rounded-md border-fine px-4 py-6 text-center text-[14px] text-ink-muted',
        className,
      )}
    >
      <span>{title}</span>
      {action}
    </div>
  );
}

/** R-48: loading shows grey shapes of list rows: a tile, two lines and a 104px chip, hairlines between. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return <CardLoad variant="rows" rows={rows} className={className} />;
}
