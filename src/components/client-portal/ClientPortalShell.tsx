'use client';

/**
 * CLIENT PORTAL SHELL (v7) — the chrome around every client page, replicating
 * docs/specs/client-pages/prototype/vcfo-client-portal-FINAL.html:
 * navy sidebar (full / rail / drawer), sticky top bar, Before / After pill,
 * Ask VCFO launcher + chat, toast, drill-down pop-up, Search ⌘K, intro.
 *
 * Every rule of the prototype CSS is scoped under `.cp` (scripts/cp-css.mjs),
 * so nothing here leaks into the staff shells.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { AskProvider } from '@/components/ask/AskProvider';
import { PortalProvider } from './PortalProvider';
import { PortalSidebar } from './Sidebar';
import { PortalTopBar } from './TopBar';
import { AskLauncher } from './AskLauncher';
import { ClientSubmittedNotice } from './ClientSubmittedNotice';
import { SearchPalette } from './SearchPalette';
import { PortalIntro } from './PortalIntro';
import { IconTips } from './IconTips';
import { TabBar } from '@/components/shell/TabBar';
import { ShortcutSheet } from '@/components/shell/ShortcutSheet';
import './portal-css';

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div className="cp" ref={rootRef} data-theme="light">
      <AskProvider>
        <PortalProvider rootRef={rootRef}>
          <ShellBody>{children}</ShellBody>
        </PortalProvider>
      </AskProvider>
    </div>
  );
}

function ShellBody({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const annHead = useQuery({
    queryKey: ['client-portal', 'announcements-unread'],
    queryFn: async () => {
      const res = await fetch('/api/client/portal/announcements-unread');
      if (!res.ok) return { unread: 0 };
      return (await res.json()) as { unread: number };
    },
    refetchInterval: 60_000,
  });
  return (
    <>
      <PortalIntro />
      <PortalSidebar />
      <div className="cp-body">
        <div className="cp-sidepad" data-vp="side" aria-hidden="true" />
        <div className="cp-main">
          <PortalTopBar onSearch={openSearch} hasAnnouncements={(annHead.data?.unread ?? 0) > 0} />
          <main className="cp-page-host">
            <div key={pathname} className="cp-page-in">
              {children}
            </div>
          </main>
        </div>
      </div>
      {/* R-46: the 3px regulator spectrum ribbon across the very top. */}
      <div className="cp-ribbon" aria-hidden="true" />
      <IconTips />
      <AskLauncher />
      <ClientSubmittedNotice />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      {/* Tailwind islands (R-45 phone tab bar, the "?" shortcut sheet). */}
      <div className="cp-tw">
        <TabBar />
        <ShortcutSheet />
      </div>
    </>
  );
}
