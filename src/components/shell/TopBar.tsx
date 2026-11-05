"use client";

import { useApp } from "@/context/AppContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CalendarCheck,
  ClipboardCheck,
  FolderOpen,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  Megaphone,
  Menu,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { AnnouncementsBell } from "@/components/shell/AnnouncementsBell";
import { NotificationsBell } from "@/components/shell/NotificationsBell";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useShellNav } from "@/components/shell/shell-nav-context";
import { SBC_LOGO_LABEL, SbcLogo } from "@/components/brand/SbcLogo";
import { roleHomePath } from "@/lib/auth-routes";
import { CommandPalette } from "@/components/shell/CommandPalette";
import {
  resolveShellCrumbSegments,
  shellBreadcrumb,
  type ShellCrumbSegment,
  type ShellCrumbIcon,
} from "@/components/shell/shell-crumbs";
import { cn } from "@/lib/utils";

const CRUMB_ICONS: Record<ShellCrumbIcon, LucideIcon> = {
  users: Users,
  folder: FolderOpen,
  megaphone: Megaphone,
  bell: Bell,
  layout: LayoutDashboard,
  briefcase: Briefcase,
  inbox: Inbox,
  mail: Mail,
  calendar: CalendarCheck,
  book: BookOpen,
  chart: BarChart3,
  clipboard: ClipboardCheck,
  history: History,
  settings: Settings,
  home: LayoutDashboard,
};

function ShellLocationTrail({
  icon,
  segments,
}: {
  icon: ShellCrumbIcon;
  segments: ShellCrumbSegment[];
}) {
  const Icon = CRUMB_ICONS[icon];

  return (
    <nav aria-label="Location" className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="sr-only"><Icon aria-hidden /></span>
      <ol className="flex min-w-0 list-none items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {segments.map((seg, index) => (
          <li key={`${seg.label}-${index}`} className={cn("flex shrink-0 items-center gap-2", index < segments.length - 1 && "max-sm:hidden")}>
            {index > 0 ? (
              <span className="text-ink-faint max-sm:hidden" aria-hidden>/</span>
            ) : null}
            {seg.href ? (
              <Link
                href={seg.href}
                className="whitespace-nowrap text-[14px] text-ink-muted transition-colors hover:text-ink"
              >
                {seg.label}
              </Link>
            ) : (
              <span
                className="whitespace-nowrap text-[14px] font-medium text-ink"
                title={seg.label}
                aria-current="page"
              >
                {seg.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function TopBar() {
  const { user, setCommandOpen, commandOpen, engagements } = useApp();
  const { openMobile } = useShellNav();
  const pathname = usePathname();
  const crumb = shellBreadcrumb(pathname);
  const segments = resolveShellCrumbSegments(crumb, engagements);
  const homeHref = user ? roleHomePath(user.role) : "/";
  /* Owner, 30 Oct 2026: every practice role keeps the Notifications bell and its popup (the
     prototype's F-329 dropped it for the super admin). The developer keeps one bell. */
  const notificationsBell = user?.role !== "developer";

  return (
    <header className="relative flex h-[var(--shell-rail-height)] items-center gap-2 border-b-1.5 border-line bg-surface-raised px-4 sm:gap-3 sm:px-7">
      {/* F-317: phones get a menu button (20 px Menu icon) and the VCFO mark beside it. */}
      <button
        type="button"
        onClick={openMobile}
        className="-ml-1 grid h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-sunken hover:text-ink md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.6} />
      </button>
      <Link href={homeHref} aria-label="VCFO Suite home" className="flex-none sm:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/client-portal/vcfo-mark.webp" alt="VCFO Suite" className="block h-[26px] w-auto" />
      </Link>

      {/* F-318: the 26 px SBC logo with a 1 px line and 12 px gap after it; dark mode takes the
          copy with light letters. */}
      <Link
        href={homeHref}
        aria-label={`${SBC_LOGO_LABEL} home`}
        className="hidden shrink-0 items-center border-r border-line pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:inline-flex"
      >
        <SbcLogo variant="lockup" size={26} decorative />
      </Link>

      <ShellLocationTrail icon={crumb.icon} segments={segments} />

      <CommandPalette />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className={cn(
            "flex h-control-md w-control-md items-center justify-center rounded-md border-1.5 border-line bg-surface-sunken text-ink-muted hover:border-line-strong hover:text-ink sm:hidden",
            commandOpen && "pointer-events-none opacity-0",
          )}
          aria-label="Search"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <AnnouncementsBell />
        {notificationsBell ? <NotificationsBell /> : null}
        <ThemeToggle />
        {/* F-335: Profile opens from the sidebar's profile row (and the rail's avatar), so the
            top bar repeats no profile link. */}
      </div>
    </header>
  );
}
