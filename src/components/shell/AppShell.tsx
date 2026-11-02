"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { RoleSidebar, MobileNavSheet } from "./RoleSidebar";
import { TopBar } from "./TopBar";
import { AnnouncementLivePopup } from "@/components/announcements/AnnouncementLivePopup";
import { NotificationLivePopup } from "@/components/notifications/NotificationLivePopup";
import { ShellNavProvider, useShellNav } from "./shell-nav-context";
import { TabBar } from "./TabBar";
import { ShortcutSheet } from "./ShortcutSheet";
import { isInternEngagementPathname } from "@/lib/projects/project-step-path";
import { shellDesktopNavExpanded } from "@/components/shell/intern-sidebar";
import { useSidebarNarrow } from "@/components/shell/use-sidebar-peek";
import { cn } from "@/lib/utils";
import { AuthBootScreen } from "@/components/common/AuthBootScreen";
import { useShellAppearance } from "@/hooks/use-shell-appearance";
import { AskPushColumn, AskShellMount } from "@/components/ask/AskShellMount";

export function AppShell({
  requireRole,
  children,
}: {
  requireRole?: "super_admin" | "admin" | "manager" | "intern" | "client" | "developer";
  children: ReactNode;
}) {
  const { user, authLoading, sidebarMode } = useApp();
  const { prefs, reduceMotion } = useShellAppearance();
  const pathname = usePathname();
  const internProjectOpen = isInternEngagementPathname(pathname);
  // R-49: under 1100px the sidebar is always the rail.
  const narrowDesktop = useSidebarNarrow();
  const navExpanded = !narrowDesktop && shellDesktopNavExpanded(sidebarMode, pathname, user?.role);

  useEffect(() => {
    if (!user) {
      document.body.removeAttribute("data-role");
      return;
    }
    document.body.setAttribute("data-role", user.role);
    return () => document.body.removeAttribute("data-role");
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-motion", reduceMotion ? "true" : "false");
  }, [reduceMotion]);

  if (authLoading || !user) return <AuthBootScreen />;
  if (
    requireRole &&
    user.role !== requireRole &&
    user.role !== "super_admin"
  ) {
    return <AuthBootScreen label="Opening your workspace…" />;
  }

  /* Client used to cap at 1200px, which left a visible gutter beside every
     client page on a normal laptop. It now matches the lead dashboard. */
  const mainMaxWidth =
    user.role === "super_admin" || user.role === "admin" || user.role === "manager"
      ? "max-w-[1480px]"
      : internProjectOpen
        ? "max-w-none"
        : "max-w-[1400px]";

  /* Flush to the sidebar from 768 px (F-273): exact width, no screen inset. Pinned (R-49) puts the page beside
     the 248px sidebar; the rail keeps 56px and opens over the page. */
  const desktopPad = navExpanded ? "md:pl-[15.5rem]" : "md:pl-14";

  return (
    <ShellNavProvider>
      <AskShellMount userRole={user.role}>
      <div
        className="relative min-h-screen bg-[oklch(var(--background))] text-ink"
        data-role={user.role}
        data-motion={prefs.motion}
        data-reduce-motion={reduceMotion ? "true" : "false"}
      >
        <div className="page-atmosphere pointer-events-none absolute inset-0" aria-hidden />
        {/* R-46: the 3px regulator spectrum ribbon across the very top. The only decorative line. */}
        <div className="spectrum-ribbon fixed inset-x-0 top-0 z-[60]" aria-hidden />

        <RoleSidebar />
        <MobileNavSheet />
        <AnnouncementLivePopup />
        <NotificationLivePopup />
        <ShortcutSheet />
        <ShellTabBar />

        <AskPushColumn
          className={cn(
            "relative z-10 pl-0 pt-[3px]",
            reduceMotion ? "transition-none" : "transition-[padding] duration-200 ease-out motion-reduce:transition-none",
            desktopPad,
          )}
        >
          <div className="sticky top-[3px] z-20 pt-0">
            <TopBar />
          </div>
          {/* md:pb-32 leaves room under every page so its last row scrolls clear of the Ask VCFO robot. */}
          <main
            className={cn(
              "mx-auto page-fade-up px-4 pb-28 pt-5 md:px-8 md:pb-32 md:pt-7",
              mainMaxWidth,
            )}
          >
            {children}
          </main>
        </AskPushColumn>
      </div>
      </AskShellMount>
    </ShellNavProvider>
  );
}

/** The phone tab bar (R-45); More opens the same drawer as the menu button. */
function ShellTabBar() {
  const { openMobile } = useShellNav();
  return <TabBar onMore={openMobile} />;
}
