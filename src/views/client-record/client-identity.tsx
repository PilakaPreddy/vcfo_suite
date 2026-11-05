import { initialsFromName } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * CLIENT IDENTITY COLOUR (R-35): each client keeps one colour on every staff screen.
 *
 * The real tool stores no colour for a client, so the colour is derived from the engagement id:
 * the same id always hashes to the same tone. The palette and the hash are the ones the super
 * admin client tiles use (`src/components/super/parts/super-parts.tsx`), so one client reads the
 * same colour on the super admin, admin, manager and lead screens. Every tone is a token pair
 * that flips in dark mode.
 */
const CLIENT_IDENTITY_TONES = [
  'bg-brand-soft text-brand-text',
  'bg-identity-soft text-identity',
  'bg-waiting-soft text-waiting',
  'bg-warning-soft text-warning',
  'bg-positive-soft text-positive',
  'bg-surface-sunken text-ink-2',
] as const;

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** The tile classes (fill and text) for one client, stable for its engagement id. */
export function clientIdentityTone(id: string | null | undefined): string {
  if (!id) return 'bg-surface-sunken text-ink-2';
  return CLIENT_IDENTITY_TONES[hashOf(id) % CLIENT_IDENTITY_TONES.length]!;
}

/** Initials tile in the client's identity colour (6px corners, R-44). */
export function ClientIdentityTile({
  id,
  name,
  size = 30,
  className,
}: {
  id: string | null | undefined;
  name: string;
  size?: 20 | 24 | 26 | 30 | 36 | 44;
  className?: string;
}) {
  const initials = (initialsFromName(name) || '•').slice(0, 2);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid flex-none place-items-center rounded-md font-medium tracking-[.02em]',
        size <= 20 ? 'text-[9.5px]' : size <= 26 ? 'text-[10.5px]' : size <= 30 ? 'text-[11px]' : 'text-[12.5px]',
        clientIdentityTone(id),
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}
