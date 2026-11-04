'use client';

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { regOf, type Regulator } from '@/lib/ui/regulator';
import { companyInitials, shortCompany } from '@/components/super/parts/super-text';

/**
 * CLIENT IDENTITY (rule R-35) for the staff compliance screens.
 *
 * The real tool stores no colour per client, so the colour is chosen from the
 * engagement id with the same hash and the same six tones as the super admin
 * `ClientTile` (`src/components/super/parts/super-parts.tsx`). One client
 * therefore keeps one colour on every staff screen. Nothing is stored.
 */

export type IdentityTone = 'brand' | 'identity' | 'waiting' | 'warning' | 'positive' | 'upcoming';

const TONES: readonly IdentityTone[] = ['brand', 'identity', 'waiting', 'warning', 'positive', 'upcoming'];

/** Soft tile fill and text per tone (the order matches the super admin `ClientTile`). */
const TILE: Record<IdentityTone, string> = {
  brand: 'bg-brand-soft text-brand-text',
  identity: 'bg-identity-soft text-identity',
  waiting: 'bg-waiting-soft text-waiting',
  warning: 'bg-warning-soft text-warning',
  positive: 'bg-positive-soft text-positive',
  upcoming: 'bg-surface-sunken text-ink-2',
};

/** Solid dot fill per tone. */
const DOT: Record<IdentityTone, string> = {
  brand: 'bg-brand',
  identity: 'bg-identity-mid',
  waiting: 'bg-waiting-mid',
  warning: 'bg-warning-mid',
  positive: 'bg-positive-mid',
  upcoming: 'bg-upcoming-mid',
};

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** The steady identity tone of one client, from its engagement id. */
export function identityTone(id: string): IdentityTone {
  return TONES[hashOf(id) % TONES.length]!;
}

/** Initials tile in the client's identity colour (26 px in rows, 30 px in bands). */
export function ClientTile({
  id,
  name,
  size = 26,
  className,
}: {
  id: string;
  name: string;
  size?: 26 | 30;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-grid flex-none place-items-center rounded-md font-medium',
        size === 30 ? 'h-[30px] w-[30px] text-[11px]' : 'h-[26px] w-[26px] text-[10.5px]',
        TILE[identityTone(id)],
        className,
      )}
      aria-hidden
    >
      {companyInitials(name)}
    </span>
  );
}

/** 8 px square dot in the client's identity colour. */
export function ClientDot({ id, className }: { id: string; className?: string }) {
  return <i className={cn('inline-block h-2 w-2 flex-none rounded-[2px]', DOT[identityTone(id)], className)} aria-hidden />;
}

/** A soft tag with the client's short name in its identity colour. */
export function ClientTag({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-5 max-w-full items-center truncate rounded-md px-1.5 text-[11.5px] font-medium', TILE[identityTone(id)], className)}
      title={name}
    >
      {shortCompany(name)}
    </span>
  );
}

const SHORT: Record<Regulator, string> = { mca: 'MCA', gst: 'GST', it: 'IT', payroll: 'PAY', fema: 'FEMA', labour: 'LAB' };
const SWATCH: Record<Regulator, string> = {
  mca: 'bg-reg-mca',
  gst: 'bg-reg-gst',
  it: 'bg-reg-it',
  payroll: 'bg-reg-payroll',
  fema: 'bg-reg-fema',
  labour: 'bg-reg-labour',
};

/** Short area tag for tight spots (prototype `AreaShort`): the R-43 swatch and the short word. */
export function AreaShort({ area, className }: { area: string; className?: string }) {
  const r = regOf(area);
  return (
    <span
      title={area}
      className={cn(
        'inline-flex h-5 flex-none items-center gap-1 rounded-sm border-1.5 border-line bg-surface-raised px-1.5 text-[11px] font-medium text-ink-2',
        className,
      )}
    >
      <i className={cn('h-1.5 w-1.5 flex-none rounded-[2px]', r ? SWATCH[r] : 'bg-upcoming-mid')} aria-hidden />
      {r ? SHORT[r] : area}
    </span>
  );
}

/** The government portal of each regulator (name and address). Public addresses, not data. */
const PORTAL: Record<Regulator, [string, string]> = {
  gst: ['GST portal', 'https://www.gst.gov.in/'],
  it: ['Income-tax portal', 'https://www.incometax.gov.in/'],
  mca: ['MCA portal', 'https://www.mca.gov.in/'],
  payroll: ['EPFO portal', 'https://unifiedportal-emp.epfindia.gov.in/'],
  fema: ['RBI FIRMS', 'https://firms.rbi.org.in/'],
  labour: ['Labour portal', 'https://shramsuvidha.gov.in/'],
};

/** The government portal of an area, or undefined when the area has no regulator. */
function portalOf(area: string): { name: string; url: string } | undefined {
  const r = regOf(area);
  return r ? { name: PORTAL[r][0], url: PORTAL[r][1] } : undefined;
}

/** Small link to the government portal of a filing (prototype `PortalLink`). Renders nothing without a regulator. */
export function PortalLink({ area, className }: { area: string; className?: string }) {
  const p = portalOf(area);
  if (!p) return null;
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-grid h-6 w-6 flex-none place-items-center rounded-sm text-ink-faint hover:bg-surface-sunken hover:text-brand-text',
        className,
      )}
      aria-label={`Open ${p.name}`}
      title={`Open ${p.name}`}
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
    </a>
  );
}

/** 24 px initials circle of a person (R-44: people avatars are circles), with the name after it. */
export function PersonCell({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-ink-faint">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="inline-grid h-6 w-6 flex-none place-items-center rounded-full bg-surface-sunken text-[10px] font-medium text-ink-2"
        aria-hidden
      >
        {personInitials(name)}
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : (parts[0]![1] ?? '');
  return (first + last).toUpperCase();
}
