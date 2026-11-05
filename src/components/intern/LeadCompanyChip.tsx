'use client';

import { TONE_BADGE } from '@/components/common/IconChip';
import { initialsFromName } from '@/lib/auth';
import { cn } from '@/lib/utils';

/* A company is an identity, and identities do not get a colour of their own
   (docs/design/TOKENS.md): every company tile and pill is neutral. */
export function LeadCompanyChip({
  name,
  compact = false,
}: {
  name: string;
  engagementId?: string;
  compact?: boolean;
}) {
  const initials = initialsFromName(name) || '•';
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-md text-[9.5px] font-semibold',
          TONE_BADGE.neutral,
        )}
      >
        {initials.slice(0, 2)}
      </span>
      {compact ? null : <span className="min-w-0 truncate font-medium">{name}</span>}
    </span>
  );
}

