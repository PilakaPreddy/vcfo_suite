'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Terminal,
  FileSpreadsheet,
  FolderClosed,
  LayoutDashboard,
  ListChecks,
  Menu,
  Plug,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAskOptional } from '@/components/ask/ask-context';
import { usePortalOptional } from '@/components/client-portal/PortalProvider';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/auth';

type Tab = { label: string; href: string; Icon: LucideIcon };

/** The three main screens per role (C-08). Ask and More complete the bar. */
export function tabBarTabs(role: Role | undefined, { staffBase = '/app/manager', incorporated = false } = {}): Tab[] {
  switch (role) {
    case 'client':
      return [
        { label: 'Home', href: '/app/client/overview', Icon: LayoutDashboard },
        incorporated
          ? { label: 'Filings', href: '/app/client/compliances/filings', Icon: FileSpreadsheet }
          : { label: 'Steps', href: '/app/client/incorporation', Icon: ClipboardList },
        { label: 'Documents', href: '/app/client/documents', Icon: FolderClosed },
      ];
    case 'super_admin':
      return [
        { label: 'Overview', href: '/app/super/dashboard', Icon: LayoutDashboard },
        { label: 'Risks', href: '/app/super/risks', Icon: TriangleAlert },
        { label: 'Clients', href: '/app/super/projects', Icon: Building2 },
      ];
    case 'intern':
      return [
        { label: 'Today', href: '/app/intern/today', Icon: LayoutDashboard },
        { label: 'Work', href: '/app/intern/tasks', Icon: ListChecks },
        { label: 'Clients', href: '/app/intern/clients', Icon: Building2 },
      ];
    case 'manager':
      return [
        { label: 'Today', href: `${staffBase}/dashboard`, Icon: LayoutDashboard },
        { label: 'Work', href: `${staffBase}/work`, Icon: ListChecks },
        { label: 'Projects', href: `${staffBase}/projects`, Icon: Briefcase },
      ];
    case 'admin':
      return [
        { label: 'Today', href: `${staffBase}/dashboard`, Icon: LayoutDashboard },
        { label: 'Projects', href: `${staffBase}/projects`, Icon: Briefcase },
        { label: 'Approvals', href: `${staffBase}/approvals`, Icon: ClipboardCheck },
      ];
    case 'developer':
      return [
        { label: 'Overview', href: '/app/dev/overview', Icon: LayoutDashboard },
        { label: 'Jobs', href: '/app/dev/jobs', Icon: Terminal },
        { label: 'Connections', href: '/app/dev/connections', Icon: Plug },
      ];
    case 'partner':
      // A client partner never gets the /app shell, so there are no tabs.
      return [];
    default:
      return [];
  }
}

const ITEM =
  'flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 text-[11.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';
const PILL = 'grid h-7 w-12 place-items-center rounded-md';

/**
 * C-08 (VCFO Spectrum, R-45): the bottom tab bar on phones (under 768px), every portal. Three main
 * screens for the role, then Ask (for the roles that have Ask VCFO) and More, which opens the
 * menu drawer. The active tab has a blurple tint. Mount it once in the shell, and give the page
 * 64px of bottom room on phones so the bar does not cover the last row.
 *
 * In the client portal, More and Ask default to the portal's drawer and chat. In the staff shell
 * pass `onMore` (the mobile nav sheet's `openMobile`).
 */
export function TabBar({ onMore, incorporated, role: roleProp }: { onMore?: () => void; incorporated?: boolean; role?: Role }) {
  const path = usePathname() ?? '';
  const { user } = useApp();
  const staffBase = useStaffBasePath();
  const ask = useAskOptional();
  const portal = usePortalOptional();
  const role = roleProp ?? user?.role;
  const tabs = tabBarTabs(role, { staffBase, incorporated: incorporated ?? portal?.after ?? false });
  if (tabs.length === 0) return null;

  const more = onMore ?? (portal ? () => portal.setDrawerOpen(true) : undefined);
  const openAsk = ask?.enabled ? () => ask.setOpen(true) : portal ? () => portal.openChat() : undefined;
  const activeHref = tabs
    .filter((t) => path === t.href || path.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="Main, phone"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t-1.5 border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map(({ label, href, Icon }) => {
        const on = href === activeHref;
        return (
          <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={cn(ITEM, on ? 'text-brand-text' : 'text-ink-muted')}>
            <span className={cn(PILL, on && 'bg-brand-soft')}>
              <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden />
            </span>
            {label}
          </Link>
        );
      })}
      {openAsk ? (
        <button type="button" onClick={openAsk} className={cn(ITEM, 'text-ink-muted')}>
          <span className={PILL}>
            <Sparkles className="h-5 w-5" strokeWidth={1.6} aria-hidden />
          </span>
          Ask
        </button>
      ) : null}
      {more ? (
        <button type="button" onClick={more} className={cn(ITEM, 'text-ink-muted')} aria-haspopup="dialog">
          <span className={PILL}>
            <Menu className="h-5 w-5" strokeWidth={1.6} aria-hidden />
          </span>
          More
        </button>
      ) : null}
    </nav>
  );
}
