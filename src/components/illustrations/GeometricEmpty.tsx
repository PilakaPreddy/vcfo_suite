import { cn } from '@/lib/utils';

type GeometricEmptyProps = {
  variant?: 'inbox' | 'waiting' | 'success' | 'empty';
  className?: string;
};

/** Lightweight CSS/SVG geometric art for empty / waiting / success states. */
export function GeometricEmpty({ variant = 'empty', className }: GeometricEmptyProps) {
  const stroke =
    variant === 'success'
      ? 'oklch(var(--positive))'
      : variant === 'waiting'
        ? 'oklch(var(--warning))'
        : variant === 'inbox'
          ? 'oklch(var(--brand))'
          : 'oklch(var(--ink-muted) / 0.45)';

  return (
    <div className={cn('mx-auto flex h-20 w-20 items-center justify-center', className)} aria-hidden>
      <svg viewBox="0 0 80 80" className="h-full w-full">
        <circle cx="40" cy="40" r="28" fill="oklch(var(--brand-soft) / 0.65)" stroke={stroke} strokeWidth="1.25" />
        <circle cx="40" cy="40" r="16" fill="none" stroke={stroke} strokeWidth="1" opacity="0.7" />
        {variant === 'success' && (
          <path d="M30 41 L37 48 L51 32" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {variant === 'waiting' && (
          <>
            <circle cx="40" cy="40" r="3" fill={stroke} />
            <path d="M40 28 V36" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
            <path d="M40 40 L48 46" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {variant === 'inbox' && (
          <>
            <rect x="26" y="32" width="28" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="1.5" />
            <path d="M26 36 L40 46 L54 36" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
          </>
        )}
        {variant === 'empty' && (
          <rect x="30" y="30" width="20" height="20" rx="4" fill="none" stroke={stroke} strokeWidth="1.5" />
        )}
      </svg>
    </div>
  );
}
