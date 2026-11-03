'use client';

/**
 * Shared parts of the Registrations list and record: the credentials query (the same cache
 * key as the Credentials page), the status chip, the owner chip and the date tile.
 */
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Chip, OwnerChip, type ChipTone } from '@/components/ui/spectrum-chip';
import { daysBetween } from '@/lib/client-portal/compliances';
import type { CredentialsPayload } from '@/lib/client-portal/credentials';
import { useRegistrationFacts } from '@/hooks/use-registration-facts';
import type { RegistrationFactsMap } from '@/lib/registrations/registration-facts';
import { portalHref } from '../../routes';
import { DateTile } from '../compliances/spectrum';
import type { RegItem, RegStatus } from './model';

export const REGISTRATIONS_BASE = portalHref('registrations');

export function registrationHref(id: string): string {
  return `${REGISTRATIONS_BASE}/${encodeURIComponent(id)}`;
}

/** The credentials workbook (GET /api/client/credentials). Numbers are not secret cells. */
export function useRegCredentials(enabled = true) {
  return useQuery({
    queryKey: ['client-portal', 'credentials'],
    enabled,
    queryFn: async (): Promise<CredentialsPayload> => {
      const res = await fetch('/api/client/credentials', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      return ((await res.json()) as { credentials: CredentialsPayload }).credentials;
    },
    staleTime: 15_000,
    retry: false,
  });
}

/** The client's own registration facts (GET /api/registrations), by step id. */
export function useClientRegistrationFacts(enabled = true): { facts: RegistrationFactsMap | null; isError: boolean } {
  const q = useRegistrationFacts({ enabled });
  const facts = q.data ? (Object.values(q.data)[0] ?? null) : null;
  return { facts, isError: q.isError };
}

/** Solid fills for the progress flow bar (R-25). */
export const REG_FILL: Record<RegStatus, string> = {
  Done: 'bg-positive-mid',
  'In progress': 'bg-brand',
  Waiting: 'bg-waiting-mid',
  'Due soon': 'bg-warning-mid',
  Overdue: 'bg-danger-mid',
  'Not started': 'bg-upcoming-mid',
};
/** Chip tone per status word (R-13); "Not started" is grey, not the blue `toneFor` gives /started/. */
const REG_TONE: Record<RegStatus, ChipTone> = {
  Done: 'ok',
  'In progress': 'prog',
  Waiting: 'teal',
  'Due soon': 'warn',
  Overdue: 'bad',
  'Not started': 'idle',
};
export const REG_ORDER: RegStatus[] = ['Overdue', 'Waiting', 'In progress', 'Not started', 'Done'];

export function RegChip({ r, className }: { r: Pick<RegItem, 'status' | 'notNeeded'>; className?: string }) {
  if (r.notNeeded)
    return (
      <Chip tone="idle" fixed className={className}>
        Not needed
      </Chip>
    );
  return (
    <Chip tone={REG_TONE[r.status]} fixed className={className}>
      {r.status}
    </Chip>
  );
}

function RegOwner({ r }: { r: Pick<RegItem, 'owner'> }) {
  return <OwnerChip owner={r.owner} />;
}

/** The date a row shows: the done date, else the due date. */
export function regDate(r: RegItem): string | undefined {
  return r.status === 'Done' ? r.doneOn : r.due;
}

/** 44px tile of that date, tinted by state; an empty tile when the step has no date yet. */
function RegTile({ r, today }: { r: RegItem; today: string }) {
  const iso = regDate(r);
  if (!iso)
    return (
      <span className="grid h-11 w-11 flex-none place-items-center rounded-md border-1.5 border-line-strong text-[13px] text-ink-faint" aria-hidden>
        -
      </span>
    );
  const s = r.notNeeded ? 'none' : r.status === 'Done' ? 'ok' : r.status === 'Overdue' ? 'over' : daysBetween(today, iso) <= 7 ? 'due' : 'none';
  return <DateTile iso={iso} s={s} className={cn(r.notNeeded && 'opacity-60')} />;
}
