'use client';

import { openShortcuts } from '@/components/shell/ShortcutSheet';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, type TransitionEvent } from 'react';
import { LayoutGroup, useReducedMotion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { Keyboard, Pin, PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_UI_LABEL, type Role } from '@/lib/auth';
import { UserFace } from '@/components/common/UserFace';
import { AskLauncher } from '@/components/ask/AskLauncher';
import type { SidebarMode } from '@/context/AppContext';
import { Tip } from '@/components/ui/tip';
import { useShellNav } from '@/components/shell/shell-nav-context';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { SidebarComplianceMini } from '@/components/shell/SidebarComplianceMini';
import { isNavGroup, isNavSectionBreak, sidebarItemsFor, withOfficialUpdates } from '@/components/shell/sidebar-items';
import { useWatchEnabled } from '@/hooks/use-watch';
import { isWatchStaff } from '@/lib/watch/recipients';
import {
  showsIncorporationCount,
  useComplianceDueCount,
  useIncorporatingCount,
} from '@/components/shell/practice-counts';
import { INTERN_CLIENTS_HREF } from '@/components/shell/InternClientsNav';
import {
  SidebarNavCountBadge,
  SidebarNavGroup,
  SidebarRailBadge,
  SidebarRailLabel,
  SidebarRailUrgentBadge,
  sidebarIconSize,
  sidebarIdleIconClass,
  sidebarNavTriggerClass,
  sidebarPillClass,
  sidebarRailClass,
} from '@/components/shell/SidebarNavGroup';
import {
  ClientsFoldBody,
  NewTag,
  useSidebarFolds,
  PeopleFoldBody,
  ReportsToBlock,
  SidebarFoldRow,
} from '@/components/shell/StaffSidebarFolds';
import { usePendingApprovals } from '@/hooks/use-pending-approvals';
import { useQuery } from '@tanstack/react-query';
import {
  readSavedSidebarMode,
  saveSidebarMode,
  shellDesktopNavExpanded,
  sidebarIsPinned,
  sidebarPinCopy,
  toggleSidebarPin,
} from '@/components/shell/intern-sidebar';
import { useSidebarNarrow, useSidebarPeek, useSidebarPinKey } from '@/components/shell/use-sidebar-peek';
import { MotionActivePill, SidebarHoverGlass, sidebarHoverAttrs, useSidebarHoverFollow } from '@/components/shell/MotionActivePill';
import { roleHomePath, roleProfilePath } from '@/lib/auth-routes';
import { useInternPortfolio } from '@/hooks/use-intern-portfolio';
import { SUPER_RISKS_NAV_HREF, SuperRisksNavCount, SuperRisksRailCount } from '@/components/super/parts/SuperRisksCount';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import { surfaceCssVars } from '@/lib/shell/shell-appearance';

/** Home and Profile for the rail. The developer has no profile page yet, so both open the console. */
function railHomePath(role: Role): string {
  return role === 'developer' ? '/app/dev/overview' : roleHomePath(role);
}
function railProfilePath(role: Role): string {
  return role === 'developer' ? '/app/dev/overview' : roleProfilePath(role);
}

/* R-49: the lead's "needs action" count is urgent, so it is a red square in the open
   sidebar and a red badge on the rail. */
const InternMyWorkBadge = memo(function InternMyWorkBadge() {
  const { kpis } = useInternPortfolio();
  return <SidebarNavCountBadge count={kpis.action.total} hot />;
});

/* Steps waiting on a manager or admin decision are urgent too (Approvals). */
function useApprovalCount(role: Role): number {
  return usePendingApprovals(role === 'manager' ? 'manager' : 'firm').length;
}
const ApprovalsBadge = memo(function ApprovalsBadge({ role }: { role: Role }) {
  return <SidebarNavCountBadge count={useApprovalCount(role)} hot />;
});
const RailApprovalsBadge = memo(function RailApprovalsBadge({ role, ink }: { role: Role; ink: 'light' | 'dark' }) {
  return <SidebarRailUrgentBadge count={useApprovalCount(role)} ink={ink} />;
});

/* Developer console counts (P-254): Outlook links that need attention on Connections and job
   runs that failed today on Jobs, both urgent. They share the console home's read
   (`/api/dev/overview`, developer or super admin) and its cache key. */
type DevCounts = { outlook?: { expiringSoon?: number }; jobs?: { state: string; data?: { failedToday?: number } } };
function useDevCount(href: string): number {
  const q = useQuery<DevCounts>({
    queryKey: ['dev', '/api/dev/overview'],
    queryFn: async () => {
      const res = await fetch('/api/dev/overview', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as DevCounts;
    },
    staleTime: 60_000,
  });
  const d = q.data;
  if (!d) return 0;
  if (href === '/app/dev/connections') return d.outlook?.expiringSoon ?? 0;
  if (href === '/app/dev/jobs') return d.jobs?.state === 'ok' ? (d.jobs.data?.failedToday ?? 0) : 0;
  return 0;
}
const DEV_COUNT_HREFS = new Set(['/app/dev/connections', '/app/dev/jobs']);
const DevBadge = memo(function DevBadge({ href }: { href: string }) {
  return <SidebarNavCountBadge count={useDevCount(href)} hot />;
});
const RailDevBadge = memo(function RailDevBadge({ href, ink }: { href: string; ink: 'light' | 'dark' }) {
  return <SidebarRailUrgentBadge count={useDevCount(href)} ink={ink} />;
});

/** Folds per role: which row carries the client list, and which carries the people list. */
function clientsRowHref(role: Role, staffBase: string): string | null {
  if (role === 'intern') return INTERN_CLIENTS_HREF;
  if (role === 'super_admin') return '/app/super/projects';
  if (role === 'admin') return '/app/admin/projects';
  if (role === 'manager') return `${staffBase}/projects`;
  return null;
}
function peopleRowHref(
  role: Role,
  staffBase: string,
): { href: string; kind: 'leads' | 'managers'; hrefFor?: (key: string) => string; counted?: boolean } | null {
  if (role === 'manager')
    return { href: `${staffBase}/team`, kind: 'leads', hrefFor: (key) => `/app/manager/team/${encodeURIComponent(key)}` };
  if (role === 'admin')
    return { href: '/app/admin/managers', kind: 'managers', hrefFor: (key) => `/app/admin/managers#${encodeURIComponent(key)}`, counted: true };
  if (role === 'super_admin') return { href: '/app/super/team', kind: 'managers' };
  return null;
}
function approvalsHref(role: Role, staffBase: string): string | null {
  if (role === 'admin') return '/app/admin/approvals';
  if (role === 'manager') return `${staffBase}/approvals`;
  return null;
}

const StackedInternWorkBadge = memo(function StackedInternWorkBadge() {
  const { kpis } = useInternPortfolio();
  return <SidebarRailBadge count={kpis.action.total} />;
});

/* R-49: the lead's "needs action" count is the urgent one, so the rail shows it in red. */
const RailInternWorkBadge = memo(function RailInternWorkBadge({ ink }: { ink: 'light' | 'dark' }) {
  const { kpis } = useInternPortfolio();
  return <SidebarRailUrgentBadge count={kpis.action.total} ink={ink} />;
});

function SidebarNavBody({
  expanded,
  onNavigate,
  layoutIdPrefix = 'sidebar',
  mode,
  onTogglePin,
  ink = 'dark',
  stacked = false,
}: {
  expanded: boolean;
  onNavigate?: () => void;
  layoutIdPrefix?: string;
  /** R-49 pin control, desktop only (omit on the phone drawer and under 1100px). */
  mode?: SidebarMode;
  onTogglePin?: () => void;
  ink?: 'light' | 'dark';
  /** Pinned closed: icon over a short label. Hover-peek stays icon-only. */
  stacked?: boolean;
}) {
  const { user, engagements, signOut, unreadNotificationCount } = useApp();
  const folds = useSidebarFolds(user?.role);
  // R-51: counts on the practice block, only where the number is real and cheap.
  const incorporatingCount = useIncorporatingCount(user?.role);
  const complianceDueCount = useComplianceDueCount(user?.role);
  const pathname = usePathname();
  const staffBase = useStaffBasePath();
  const watchEnabled = useWatchEnabled(isWatchStaff(user?.role));
  const osReduce = useReducedMotion();
  const { reduceMotion: prefReduce, motion: motionStyle } = useShellAppearance();
  const reduceMotion = Boolean(osReduce) || prefReduce;
  const staticHover = reduceMotion || motionStyle === 'minimal';
  const { follow: hoverFollow, onLeave: onHoverLeave, navHoverProps } = useSidebarHoverFollow(
    layoutIdPrefix,
    ink,
    staticHover,
  );

  if (!user) return null;

  /* P-255: inside the developer console the super admin sees the console's own items. */
  const inDevConsole = user.role === 'super_admin' && pathname.startsWith('/app/dev');
  const baseItems = sidebarItemsFor(user.role, staffBase, inDevConsole);
  const items = watchEnabled && !inDevConsole ? withOfficialUpdates(baseItems) : baseItems;

  return (
    <>
      {/* F-278 and F-305: a 56 px head. Open, the VCFO wordmark at 26 px; on the rail, the
          26 px VCFO mark. The white skin takes the wordmark drawn for light surfaces. */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center',
          expanded ? 'gap-2 pl-4 pr-2.5' : 'justify-center px-1',
          ink === 'light' ? 'border-b border-side-line' : 'border-b border-line',
        )}
      >
        <Link
          href={railHomePath(user.role)}
          onClick={onNavigate}
          aria-label="VCFO Suite home"
          className={cn(
            'flex min-w-0 items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            expanded ? '' : 'grid h-9 w-9 place-items-center hover:bg-side-hover',
          )}
        >
          {expanded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ink === 'light' ? '/client-portal/vcfo-logo-on-black.webp' : '/client-portal/vcfo-logo-on-white.webp'}
              alt="VCFO Suite by SBC"
              className="block h-[26px] w-auto max-w-full object-contain object-left"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/client-portal/vcfo-mark.webp" alt="" className="h-[26px] w-[26px] object-contain" />
          )}
        </Link>
        {/* R-49: the pin button sits in the sidebar head; the rail keeps it at its foot. */}
        {expanded && onTogglePin && mode ? (
          <SidebarPinButton mode={mode} placement="head" ink={ink} onClick={onTogglePin} className="ml-auto" />
        ) : null}
      </div>

      <nav
        className={cn('sidebar-scroll flex-1 space-y-0.5 py-3', stacked ? 'px-1' : 'px-2')}
        {...navHoverProps}
      >
        <LayoutGroup id={layoutIdPrefix}>
        {items.map((it) => {
          if (isNavSectionBreak(it)) {
            return <SidebarNavSectionBreak key={it.id} expanded={expanded} ink={ink} />;
          }
          if (isNavGroup(it)) {
            const isCompliances = it.id.startsWith('compliances:');
            const isUpdates = it.id.startsWith('updates:');
            return (
              <SidebarNavGroup
                key={it.id}
                id={it.id}
                label={it.label}
                icon={it.icon}
                iconTone={it.iconTone}
                items={it.items}
                expanded={expanded}
                pathname={pathname}
                layoutIdPrefix={layoutIdPrefix}
                onNavigate={onNavigate}
                ink={ink}
                hoverFollow={hoverFollow}
                stacked={stacked}
                badge={isUpdates ? unreadNotificationCount : isCompliances && !inDevConsole ? complianceDueCount : undefined}
                tag={isCompliances && (user.role === 'intern' || user.role === 'manager') ? <NewTag ink={ink} /> : undefined}
              />
            );
          }
          const foldActive = pathname === it.to || pathname.startsWith(`${it.to}/`);
          if (!stacked && it.to === clientsRowHref(user.role, staffBase)) {
            return (
              <SidebarFoldRow
                key={it.to}
                href={it.to}
                label={it.label}
                icon={it.icon}
                active={foldActive}
                expanded={expanded}
                ink={ink}
                onNavigate={onNavigate}
                count={engagements.length}
                foldKey={`${user.role}.clients`}
                foldLabel="clients"
              >
                <ClientsFoldBody role={user.role} pathname={pathname} viewAllHref={it.to} ink={ink} onNavigate={onNavigate} />
              </SidebarFoldRow>
            );
          }
          const people = peopleRowHref(user.role, staffBase);
          if (!stacked && people && it.to === people.href) {
            return (
              <SidebarFoldRow
                key={it.to}
                href={it.to}
                label={it.label}
                icon={it.icon}
                active={foldActive}
                expanded={expanded}
                ink={ink}
                onNavigate={onNavigate}
                count={people.counted ? (folds.data?.people.length ?? 0) : 0}
                foldKey={`${user.role}.${people.kind}`}
                foldLabel={people.kind === 'leads' ? 'project leads' : 'managers'}
              >
                <PeopleFoldBody
                  kind={people.kind}
                  href={it.to}
                  hrefFor={people.hrefFor}
                  pathname={pathname}
                  ink={ink}
                  onNavigate={onNavigate}
                  role={user.role}
                />
              </SidebarFoldRow>
            );
          }
          const active = pathname.startsWith(it.to);
          const showInternBadge = user.role === 'intern' && it.to === '/app/intern/tasks';
          const showApprovals = it.to === approvalsHref(user.role, staffBase);
          const showDev = (user.role === 'developer' || inDevConsole) && DEV_COUNT_HREFS.has(it.to);
          // P-129: the super admin's Risks row counts the open risks (not urgent, so not red).
          const showRisks = user.role === 'super_admin' && !inDevConsole && it.to === SUPER_RISKS_NAV_HREF;
          // R-51: Incorporation counts the clients still incorporating (a plain count, not urgent).
          const navCount =
            showsIncorporationCount(user.role) && it.to.endsWith('/incorporation') ? incorporatingCount
              : (it.badge ?? 0);
          return (
            <Link
              key={it.to}
              href={it.to}
              onClick={onNavigate}
              title={!expanded ? it.label : undefined}
              className={cn(
                sidebarNavTriggerClass({
                  ink,
                  active,
                  expanded,
                  fillHover: false,
                  stacked,
                }),
                user.role === 'client' && expanded && 'text-[13.5px]',
              )}
              {...sidebarHoverAttrs(it.to)}
            >
              <SidebarHoverGlass itemId={it.to} follow={hoverFollow} />
              {active && (
                <MotionActivePill
                  layoutId={`${layoutIdPrefix}-active`}
                  reduced={reduceMotion}
                  className={sidebarPillClass(ink)}
                />
              )}
              {active && expanded && (
                <MotionActivePill
                  layoutId={`${layoutIdPrefix}-rail`}
                  reduced={reduceMotion}
                  className={sidebarRailClass(ink)}
                />
              )}
              <it.icon
                className={cn(
                  'relative z-10 shrink-0',
                  sidebarIconSize(expanded, stacked),
                  active ? (ink === 'light' ? 'text-side-active-ink' : 'text-brand-text') : cn(sidebarIdleIconClass(ink), it.iconTone),
                )}
                strokeWidth={1.6}
              />
              {stacked ? <SidebarRailLabel>{it.label}</SidebarRailLabel> : null}
              {stacked && showInternBadge ? <StackedInternWorkBadge /> : null}
              {stacked && showRisks ? <SuperRisksRailCount /> : null}
              {stacked && !showInternBadge && !showRisks ? <SidebarRailBadge count={navCount} /> : null}
              {!expanded && !stacked && showInternBadge ? <RailInternWorkBadge ink={ink} /> : null}
              {!expanded && !stacked && showApprovals ? <RailApprovalsBadge role={user.role} ink={ink} /> : null}
              {!expanded && !stacked && showDev ? <RailDevBadge href={it.to} ink={ink} /> : null}
              {/* On the rail the name stays for screen readers only. It must not keep `relative` or
                 `flex-1` there: they beat sr-only and pushed the icon off centre. */}
              <span className={expanded ? 'relative z-10 min-w-0 flex-1 truncate' : 'sr-only'}>
                {it.label}
              </span>
              <span
                className={cn(
                  'sidebar-nav-disclosure-meta relative z-10 ml-auto inline-flex shrink-0 items-center gap-1',
                  !expanded && 'hidden',
                )}
              >
                {showInternBadge ? (
                  <InternMyWorkBadge />
                ) : showApprovals ? (
                  <ApprovalsBadge role={user.role} />
                ) : showDev ? (
                  <DevBadge href={it.to} />
                ) : showRisks ? (
                  <SuperRisksNavCount ink={ink} />
                ) : (
                  <SidebarNavCountBadge count={navCount} ink={ink} />
                )}
              </span>
            </Link>
          );
        })}
        <div onPointerEnter={onHoverLeave}>
          <SidebarComplianceMini expanded={expanded} staffBase={staffBase} ink={ink} />
          {expanded ? <div className="mt-3"><ReportsToBlock role={user.role} ink={ink} /></div> : null}
        </div>
        </LayoutGroup>
      </nav>

      {/* R-45: Ask VCFO is a sidebar button at the bottom of the rail, with the "/" key. */}
      <div className="px-2 pb-2 pt-1 empty:hidden">
        <AskLauncher variant="sidebar" expanded={expanded} withShortcut={layoutIdPrefix === 'sidebar-desktop'} />
      </div>
      <div className={cn('p-2', ink === 'light' ? 'border-t-1.5 border-side-line' : 'border-t border-line')}>
        <div
          className={cn(
            'flex gap-1',
            expanded ? 'flex-row items-center' : 'flex-col items-center',
          )}
        >
          {!expanded && onTogglePin && mode ? (
            <SidebarPinButton mode={mode} placement="rail" ink={ink} onClick={onTogglePin} />
          ) : null}
          <Link
            href={railProfilePath(user.role)}
            onClick={onNavigate}
            /* K-16: the account row opens Profile; there is no Settings item in the sidebar. */
            title="Profile"
            aria-label="Profile"
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
              ink === 'light' ? 'hover:bg-side-active' : 'hover:bg-surface-sunken',
              expanded ? 'min-w-0 flex-1' : 'justify-center',
            )}
          >
            <UserFace
              src={user.imageUrl}
              initials={user.initials}
              className="h-[30px] w-[30px] bg-white/[.12] text-[11px] font-medium text-side-ink ring-[1.5px] ring-white/[.22]"
            />
            {expanded && (
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'truncate text-[13.5px] font-medium',
                    ink === 'light' ? 'text-white' : 'text-ink',
                  )}
                >
                  {user.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-[12px]',
                      ink === 'light' ? 'text-side-muted' : 'text-ink-muted',
                    )}
                  >
                    {ROLE_UI_LABEL[user.role]}
                  </span>
                </div>
              </div>
            )}
          </Link>
          {expanded ? (
            <>
            <button
              type="button"
              onClick={openShortcuts}
              aria-label="Keyboard shortcuts (?)"
              title="Keyboard shortcuts (?)"
              className={cn(
                'grid h-[30px] w-[30px] flex-none place-items-center rounded-md transition-colors',
                ink === 'light' ? 'text-side-muted hover:bg-white/[.12] hover:text-white' : 'text-ink-muted hover:bg-surface-sunken',
              )}
            >
              <Keyboard className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            </button>
            {/* F-303: sign out sits in the profile row. */}
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
              className={cn(
                'grid h-[30px] w-[30px] flex-none place-items-center rounded-md transition-colors',
                ink === 'light' ? 'text-side-muted hover:bg-white/[.12] hover:text-white' : 'text-ink-muted hover:bg-surface-sunken',
              )}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            </button>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function SidebarNavSectionBreak({
  expanded,
  ink,
}: {
  expanded: boolean;
  ink: 'light' | 'dark';
}) {
  return (
    <div
      role="separator"
      aria-hidden
      className={cn('flex items-center gap-2 px-2.5', expanded ? 'py-2.5' : 'py-1.5')}
    >
      {/* F-287: the prototype has no hairline in the nav list; the break is space alone. */}
      <span className="h-px flex-1" data-ink={ink} />
    </div>
  );
}

/**
 * R-49 pin control. Pinned, it collapses the sidebar to the rail. On the rail (and while
 * the rail is open over the page) it pins the sidebar. The "[" key does the same.
 */
function SidebarPinButton({
  mode,
  placement,
  onClick,
  ink = 'dark',
  className,
}: {
  mode: SidebarMode;
  placement: 'head' | 'rail';
  onClick: () => void;
  ink?: 'light' | 'dark';
  className?: string;
}) {
  const pinned = sidebarIsPinned(mode);
  const { label, hint } = sidebarPinCopy(mode);
  const Icon = pinned ? PanelLeftClose : placement === 'rail' ? PanelLeftOpen : Pin;
  void hint;
  return (
    <Tip label={label} keys={['[']} side="right">
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="["
      data-sidebar-pin={pinned ? 'pinned' : 'rail'}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        ink === 'light'
          ? 'text-side-muted hover:bg-side-hover hover:text-side-ink'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden />
    </button>
    </Tip>
  );
}

export function RoleSidebar() {
  const { user, sidebarMode, setSidebarMode } = useApp();
  const { sidebar, reduceMotion } = useShellAppearance();
  const pathname = usePathname();
  const narrow = useSidebarNarrow();
  const railRef = useRef<HTMLElement>(null);
  const lastExpanded = useRef<boolean | null>(null);

  /* R-49: the kept mode is saved per browser. Read it before the first paint so the
     sidebar does not slide from one width to the other on every page load. With
     nothing saved the sidebar starts pinned. */
  useLayoutEffect(() => {
    setSidebarMode(readSavedSidebarMode() ?? 'open');
  }, [setSidebarMode]);

  // Under 1100px the sidebar is always the rail, so pinning would cover the page.
  const pinned = !narrow && shellDesktopNavExpanded(sidebarMode, pathname, user?.role);
  const { peek, closeNow, handlers } = useSidebarPeek(!pinned);
  const expanded = pinned || peek;
  const expandedWidth = 'w-[15.5rem]'; // R-45: 248px for every role

  const togglePin = useCallback(() => {
    if (narrow) return;
    const next = toggleSidebarPin(sidebarMode);
    saveSidebarMode(next);
    setSidebarMode(next);
  }, [narrow, sidebarMode, setSidebarMode]);
  useSidebarPinKey(togglePin, Boolean(user) && !narrow);

  // A page opening closes the rail's peek.
  useEffect(() => {
    closeNow();
  }, [pathname, closeNow]);

  useEffect(() => {
    if (lastExpanded.current === null) {
      lastExpanded.current = expanded;
      return;
    }
    if (lastExpanded.current === expanded) return;
    lastExpanded.current = expanded;
    const el = railRef.current;
    if (el) el.style.willChange = 'width';
  }, [expanded]);

  const onWidthTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
    if (event.propertyName !== 'width') return;
    event.currentTarget.style.willChange = 'auto';
  }, []);

  if (!user) return null;

  return (
    <aside
      ref={railRef}
      {...handlers}
      onTransitionEnd={onWidthTransitionEnd}
      className={cn(
        'shell-sidebar-skin fixed bottom-0 left-0 top-[3px] z-30 hidden flex-col overflow-hidden md:flex',
        // R-49: a short slide, and none under reduced motion.
        reduceMotion ? 'transition-none' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        sidebar.ink === 'light' ? 'border-r-1.5 border-side-line' : 'border-r-1.5 border-line',
        // The old "pinned closed" rail (w-16, a label under each icon) is gone: R-49 has one rail of icons.
        expanded ? expandedWidth : 'w-14',
        peek && 'z-40 shadow-float',
      )}
      data-ink={sidebar.ink}
      data-sidebar-mode={pinned ? 'pinned' : 'rail'}
      data-peek={peek ? 'true' : undefined}
      style={surfaceCssVars(sidebar, 'sidebar')}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <SidebarNavBody
          expanded={expanded}
          layoutIdPrefix="sidebar-desktop"
          mode={sidebarMode}
          onTogglePin={narrow ? undefined : togglePin}
          ink={sidebar.ink}
        />
      </div>
    </aside>
  );
}

export function MobileNavSheet() {
  const { user } = useApp();
  const { mobileOpen, setMobileOpen, closeMobile } = useShellNav();
  const { sidebar } = useShellAppearance();
  if (!user) return null;

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side="left"
        /* F-315: the 248 px sidebar as a drawer, with a 40 px close button in its head. */
        className={cn(
          'shell-sidebar-skin flex h-full w-[min(248px,88vw)] flex-col gap-0 border-line bg-transparent p-0 sm:max-w-xs',
          '[&>button.absolute]:right-2.5 [&>button.absolute]:top-2 [&>button.absolute]:h-10 [&>button.absolute]:w-10',
          sidebar.ink === 'light' &&
            '[&>button.absolute]:bg-white/[.08] [&>button.absolute]:text-white [&>button.absolute:hover]:bg-white/[.14] [&>button.absolute:hover]:text-white',
        )}
        data-ink={sidebar.ink}
        style={surfaceCssVars(sidebar, 'sidebar')}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNavBody expanded onNavigate={closeMobile} layoutIdPrefix="sidebar-mobile" ink={sidebar.ink} />
      </SheetContent>
    </Sheet>
  );
}
