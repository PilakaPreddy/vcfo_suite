import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A key cap (VCFO Spectrum, prototype `Kbd`): 18px line, 11px weight 500, 4px corners. `dark`
 * sits on the navy tip (TP3) and on the navy sidebar.
 */
export function Kbd({ children, dark, className }: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex flex-none items-center rounded-mark px-[5px] font-mono text-[11px] font-medium',
        dark ? 'bg-white/10 leading-4 text-side-ink' : 'border border-line bg-surface-sunken leading-[18px] text-ink-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
