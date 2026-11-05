'use client';

import Link from 'next/link';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Mail } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Engagement } from '@/data/engagements';
import type { Role } from '@/lib/auth';
import { initialsFromName } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { adminProjectPath, internEngagementPath } from '@/lib/projects/project-step-path';
import { identityTone, type IdentityTone } from '@/views/compliances/identity';
import {
  SidebarNavCountBadge,
  SidebarRailUrgentBadge,
  sidebarActiveTextClass,
  sidebarIconSize,
  sidebarIdleIconClass,
  sidebarNavTriggerClass,
  sidebarPillClass,
  type SidebarInk,
} from '@/components/shell/SidebarNavGroup';

/**
 * STAFF SIDEBAR FOLDS (VCFO Spectrum, prototype StaffSidebarExtras and SuperSidebarExtras).
 *
 * - The client list under Clients (every staff role): an identity colour square, the short name
 *   and an Inc or Cmp pill, then "View all N". The rows are the engagements the app already
 *   holds, which the engagements repository scoped by role.
 * - Project leads (manager) with "N open", and managers (admin, super admin) with "N clients",
 *   from `/api/shell/sidebar` (repository `sidebar-folds`, scoped by AuthContext).
 * - "Your manager" (project lead) with a mail button.
 * - The "New" tag after Compliances (lead and manager).
 *
 * Fold state is kept per browser tab, like the prototype ("vcfo.nav.<key>").
 */

export type FoldIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

/** The `/api/shell/sidebar` body (the `sidebar-folds` repository's `SidebarFolds`). */
export interface SidebarFolds {
  people: { id: string; key: string; name: string; count: number }[];
  reportsTo: { id: string; name: string; email: string } | null;
}

/** The folds data for staff roles. Clients and developers never ask for it. */
export function useSidebarFolds(role: Role | undefined) {
  const enabled = role === 'intern' || role === 'manager' || role === 'admin' || role === 'super_admin';
  return useQuery({
    queryKey: ['shell', 'sidebar-folds', role],
    queryFn: async (): Promise<SidebarFolds> => {
      const res = await fetch('/api/shell/sidebar');
      if (!res.ok) return { people: [], reportsTo: null };
      return (await res.json()) as SidebarFolds;
    },
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Open or closed per block, kept for the browser tab. Folds start open. */
function useFold(key: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return typeof window === 'undefined' || window.sessionStorage.getItem(`vcfo.nav.${key}`) !== '0';
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOpen((o) => {
      try {
        window.sessionStorage.setItem(`vcfo.nav.${key}`, o ? '0' : '1');
      } catch {
        /* storage blocked: the fold still works for this page */
      }
      return !o;
    });
  return [open, toggle];
}

/** Plain chevron fold button at the right of a nav row (R-24). */
function FoldButton({ open, onToggle, label, ink }: { open: boolean; onToggle: () => void; label: string; ink: SidebarInk }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      title={`${open ? 'Hide' : 'Show'} ${label}`}
      className={cn(
        'grid h-7 w-7 flex-none place-items-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        ink === 'light' ? 'text-side-muted hover:bg-side-hover hover:text-white' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
      )}
    >
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} strokeWidth={1.6} aria-hidden />
    </button>
  );
}

/** "New" tag after the Compliances label (lead and manager). */
export function NewTag({ ink }: { ink: SidebarInk }) {
  return (
    <span
      className={cn(
        'rounded-sm px-1.5 text-[10px] font-medium leading-4',
        ink === 'light' ? 'bg-white/[.12] text-side-ink' : 'bg-surface-sunken text-ink-2',
      )}
    >
      New
    </span>
  );
}

const PILL_LIGHT = 'flex-none rounded-sm bg-white/[.1] px-1.5 text-[10px] font-medium leading-4 text-side-ink';
const PILL_DARK = 'flex-none rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium leading-4 text-ink-2';
const pillClass = (ink: SidebarInk) => (ink === 'light' ? PILL_LIGHT : PILL_DARK);

function childClass(ink: SidebarInk, on: boolean) {
  return cn(
    'relative flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
    on
      ? sidebarActiveTextClass(ink)
      : ink === 'light'
        ? 'text-side-ink hover:bg-side-hover hover:text-white'
        : 'text-ink-2 hover:bg-surface-sunken hover:text-ink',
  );
}

/** Identity colour square per tone (R-35: each client keeps one colour on every staff screen). */
const IDENTITY_SQUARE: Record<IdentityTone, string> = {
  brand: 'bg-brand',
  identity: 'bg-identity-mid',
  waiting: 'bg-waiting-mid',
  warning: 'bg-warning-mid',
  positive: 'bg-positive-mid',
  upcoming: 'bg-upcoming-mid',
};

/** The company name without the legal suffix ("Northwind India Pvt Ltd" → "Northwind"). */
function shortClientName(name: string): string {
  const short = name.replace(/(\s+India)?\s+(Private Limited|Pvt\.? Ltd\.?|Limited|Ltd\.?|LLP)$/i, '').trim();
  return short || name;
}

/** Where one client opens for a role. */
function clientHrefFor(role: Role, e: Pick<Engagement, 'id' | 'slug'>): string {
  if (role === 'intern') return internEngagementPath(e);
  if (role === 'super_admin') return `/app/super/projects/${encodeURIComponent(e.id)}`;
  return adminProjectPath(e, role === 'manager' ? '/app/manager' : '/app/admin');
}

/** Clients shown in the fold: the first four by name, plus the open client when it is not one of them. */
function foldClients<T extends Pick<Engagement, 'id' | 'companyName'>>(all: readonly T[], openId: string | null, size = 4): T[] {
  const sorted = [...all].sort((a, b) => a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' }));
  const list = sorted.slice(0, size);
  const open = openId ? sorted.find((c) => c.id === openId) : undefined;
  return open && !list.includes(open) ? [...list, open] : list;
}

/** Folded client list under Clients. */
export function ClientsFoldBody({
  role,
  pathname,
  viewAllHref,
  ink,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  viewAllHref: string;
  ink: SidebarInk;
  onNavigate?: () => void;
}) {
  const { engagements, engagementsLoading } = useApp();
  const live = engagements;
  const openId = useMemo(() => {
    for (const e of live) {
      const href = clientHrefFor(role, e);
      if (pathname === href || pathname.startsWith(`${href}/`)) return e.id;
    }
    return null;
  }, [live, pathname, role]);
  const list = useMemo(() => foldClients(live, openId), [live, openId]);
  const faint = ink === 'light' ? 'text-side-muted' : 'text-ink-muted';

  if (engagementsLoading && live.length === 0) {
    return <p className={cn('px-2 py-1 text-[12px]', faint)}>Loading clients</p>;
  }
  if (live.length === 0) {
    return <p className={cn('px-2 py-1 text-[12px]', faint)}>No clients yet</p>;
  }
  return (
    <div className="grid gap-px pb-1.5 pl-[18px] pt-0.5" aria-label="Clients">
      {list.map((c) => {
        const on = c.id === openId;
        const inc = c.stage === 'Pre-Incorporation';
        return (
          <Link
            key={c.id}
            href={clientHrefFor(role, c)}
            onClick={onNavigate}
            aria-current={on ? 'page' : undefined}
            title={`${c.companyName} · ${inc ? 'Incorporating' : 'Compliance'}`}
            className={childClass(ink, on)}
          >
            {on ? <span className={sidebarPillClass(ink)} aria-hidden /> : null}
            <i className={cn('relative h-2 w-2 flex-none rounded-[2px]', IDENTITY_SQUARE[identityTone(c.id)])} aria-hidden />
            <span className="relative min-w-0 flex-1 truncate">{shortClientName(c.companyName)}</span>
            <span className={cn('relative', pillClass(ink))}>{inc ? 'Inc' : 'Cmp'}</span>
          </Link>
        );
      })}
      <Link
        href={viewAllHref}
        onClick={onNavigate}
        className={cn('flex h-[26px] items-center px-2 text-[12px] font-medium', ink === 'light' ? 'text-side-ink hover:text-white' : 'text-ink-2 hover:text-ink')}
      >
        View all {live.length}
      </Link>
    </div>
  );
}

/** 20 px initials tile on the sidebar. */
function Ini({ name, ink }: { name: string; ink: SidebarInk }) {
  return (
    <span
      className={cn(
        'grid h-5 w-5 flex-none place-items-center rounded-md text-[9px] font-medium',
        ink === 'light' ? 'bg-white/[.12] text-white' : 'bg-surface-sunken text-ink-2',
      )}
      aria-hidden
    >
      {(initialsFromName(name) || '•').slice(0, 2)}
    </span>
  );
}

/** Folded people list: project leads with "N open" (manager) or managers with "N clients". */
export function PeopleFoldBody({
  kind,
  href,
  hrefFor,
  ink,
  onNavigate,
  role,
  pathname,
}: {
  kind: 'leads' | 'managers';
  href: string;
  /** Where one person opens; defaults to the list page. */
  hrefFor?: (key: string) => string;
  pathname?: string;
  ink: SidebarInk;
  onNavigate?: () => void;
  role: Role;
}) {
  const { data, isLoading } = useSidebarFolds(role);
  const people = data?.people ?? [];
  const faint = ink === 'light' ? 'text-side-muted' : 'text-ink-muted';
  if (isLoading) return <p className={cn('px-2 py-1 text-[12px]', faint)}>Loading</p>;
  if (people.length === 0) {
    return <p className={cn('px-2 py-1 text-[12px]', faint)}>{kind === 'leads' ? 'No project leads yet' : 'No managers yet'}</p>;
  }
  return (
    <div className="grid gap-px pb-1.5 pl-[18px] pt-0.5" aria-label={kind === 'leads' ? 'Project leads' : 'Managers'}>
      {people.map((p) => {
        const pill = kind === 'leads' ? `${p.count} open` : `${p.count} ${p.count === 1 ? 'client' : 'clients'}`;
        return (
          <Link
            key={p.id}
            href={hrefFor ? hrefFor(p.key) : href}
            onClick={onNavigate}
            title={`${p.name} · ${pill}`}
            aria-current={hrefFor && pathname === hrefFor(p.key) ? 'page' : undefined}
            className={childClass(ink, Boolean(hrefFor && pathname === hrefFor(p.key)))}
          >
            <Ini name={p.name} ink={ink} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className={pillClass(ink)}>{pill}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * A nav row with a folded list under it (prototype `Item` with a `fold`): the row links to the
 * page, and a chevron at its right folds the list. On the rail it is the icon alone.
 */
export function SidebarFoldRow({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  ink,
  onNavigate,
  count = 0,
  urgent = false,
  foldKey,
  foldLabel,
  children,
}: {
  href: string;
  label: string;
  icon: FoldIcon;
  active: boolean;
  expanded: boolean;
  ink: SidebarInk;
  onNavigate?: () => void;
  count?: number;
  urgent?: boolean;
  foldKey: string;
  foldLabel: string;
  children: ReactNode;
}) {
  const [open, toggle] = useFold(foldKey);
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      title={!expanded ? label : undefined}
      aria-label={count > 0 ? `${label}, ${count}` : label}
      aria-current={active ? 'page' : undefined}
      className={cn(sidebarNavTriggerClass({ ink, active, expanded, fillHover: true }), expanded && 'min-w-0 flex-1')}
    >
      {active ? <span className={sidebarPillClass(ink)} aria-hidden /> : null}
      <Icon
        className={cn(
          'relative z-10 shrink-0',
          sidebarIconSize(expanded),
          active ? (ink === 'light' ? 'text-side-active-ink' : 'text-brand-text') : sidebarIdleIconClass(ink),
        )}
        strokeWidth={1.6}
      />
      {!expanded && urgent ? <SidebarRailUrgentBadge count={count} ink={ink} /> : null}
      <span className={expanded ? 'relative z-10 min-w-0 flex-1 truncate' : 'sr-only'}>{label}</span>
      {expanded ? <SidebarNavCountBadge count={count} hot={urgent} ink={ink} /> : null}
    </Link>
  );
  if (!expanded) return link;
  return (
    <div>
      <div className="flex items-center gap-0.5">
        {link}
        <FoldButton open={open} onToggle={toggle} label={foldLabel} ink={ink} />
      </div>
      {open ? children : null}
    </div>
  );
}

/** "Your manager" with a 24 px avatar, name, role and a mail button (project lead). The
    in-app Email page takes no recipient in the address, so the button opens a mail draft. */
export function ReportsToBlock({ role, ink }: { role: Role; ink: SidebarInk }) {
  const { data } = useSidebarFolds(role);
  const p = data?.reportsTo;
  if (role !== 'intern' || !p) return null;
  const light = ink === 'light';
  return (
    <div className={cn('mx-1.5 border-t pt-3', light ? 'border-side-line' : 'border-line')}>
      <div className={cn('mb-2 text-[10.5px] font-medium', light ? 'text-side-muted' : 'text-ink-muted')}>Your manager</div>
      <div className="flex h-[34px] items-center gap-2">
        <span
          className={cn(
            'grid h-6 w-6 flex-none place-items-center rounded-full text-[9.5px] font-medium',
            light ? 'bg-white/[.12] text-side-ink ring-[1.5px] ring-white/[.22]' : 'bg-surface-sunken text-ink-2',
          )}
          aria-hidden
        >
          {(initialsFromName(p.name) || '•').slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[12.5px] font-medium', light ? 'text-white' : 'text-ink')}>{p.name}</span>
          <span className={cn('block truncate text-[11px]', light ? 'text-side-muted' : 'text-ink-muted')}>Manager</span>
        </span>
        <Link
          href={`mailto:${p.email}`}
          aria-label={`Email ${p.name}`}
          title={`Email ${p.name}`}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md transition-colors',
            light ? 'bg-white/[.08] text-white hover:bg-white/[.14]' : 'bg-surface-sunken text-ink-2 hover:text-ink',
          )}
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
