import type { ReactNode } from 'react';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { cn } from '@/lib/utils';

/* Layout pieces shared by the profile sections (VCFO Spectrum, prototype ProfileScreen): a white
   section card with the 52px head and its icon tile, and a form row with the label and hint on
   the left and the control on the right. */

export function ProfileCard({
  id,
  title,
  meta,
  action,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-24 overflow-hidden rounded-md border-1.5 border-line bg-surface-raised"
    >
      <header className="flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title={title} />
        <h2 id={`${id}-title`} className="min-w-0 truncate text-[15px] font-medium text-ink">
          {title}
        </h2>
        {meta ? <span className="truncate text-[13px] text-ink-muted">{meta}</span> : null}
        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** Kept for callers; the hairline now sits above each row after the first. */
  last?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-2 border-t border-line-soft px-4 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,464px)] sm:items-center md:px-5',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-[12.5px] text-ink-muted">{hint}</span> : null}
      </span>
      <div className="min-w-0 text-[14px] text-ink">{children}</div>
    </div>
  );
}
