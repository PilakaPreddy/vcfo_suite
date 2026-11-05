import type { ReactNode } from 'react';
import { initialsFromName } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { clientIdentityTone } from '@/views/client-record/client-identity';

/* Parts of the plain client record head (VCFO Spectrum C-0108; prototype `ClientRecordScreen`). */

/**
 * Company tile: initials on a 6px square (R-44). With `identityId` (the engagement id) the tile
 * takes the client's identity colour (R-35, `client-identity.tsx`); without it the tile stays
 * neutral, as on the recycle bin and the people screens.
 */
export function RecordTile({
  name,
  size = 44,
  identityId,
  className,
}: {
  name: string;
  size?: 30 | 36 | 44;
  identityId?: string | null;
  className?: string;
}) {
  const initials = (initialsFromName(name) || '•').slice(0, 2);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid flex-none place-items-center rounded-md font-medium tracking-[.02em]',
        identityId ? clientIdentityTone(identityId) : 'bg-surface-sunken text-ink-2',
        size <= 30 ? 'text-[11px]' : 'text-[12.5px]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

/** One number in the record's numbers line: a 20px value and a muted word. */
export function RecordStat({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-baseline gap-1.5', className)}>
      <b className="text-[20px] font-medium tabular-nums text-ink">{value}</b>
      <span className="text-[13px] text-ink-muted">{label}</span>
    </span>
  );
}

/** The numbers line under the record head. */
export function RecordStats({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-8 gap-y-2">{children}</div>;
}
