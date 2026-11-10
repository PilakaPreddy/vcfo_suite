'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { AppShell } from '@/components/shell/AppShell';
import { AuthBootScreen } from '@/components/common/AuthBootScreen';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientPortalShell } from './ClientPortalShell';

/**
 * Client pages that only work inside the client portal shell: they read the portal context
 * (`usePortal`), which exists only for a signed-in client. A super admin who opens one gets a
 * pointer to the Clients list instead of a crash (UAT defect D-T01-01).
 */
const PORTAL_ONLY = ['/app/client/overview', '/app/client/messages'];

export function isPortalOnlyPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return PORTAL_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * /app/client/** chrome: a signed-in client gets the v7 client portal; a super
 * admin visiting the client shell keeps the staff-style AppShell (the portal's
 * data routes are scoped to the client's own engagement).
 */
export function ClientPortalGate({ children }: { children: ReactNode }) {
  const { user, authLoading } = useApp();
  const pathname = usePathname();
  if (authLoading || !user) return <AuthBootScreen />;
  if (user.role === 'client') return <ClientPortalShell>{children}</ClientPortalShell>;
  if (isPortalOnlyPath(pathname)) {
    return (
      <AppShell requireRole="client">
        <EmptyState
          className="m-6"
          title="This page shows one client's own portal. Open a client to see what they see."
          action={<Link className="font-semibold text-brand underline" href="/app/super/projects">Open Clients</Link>}
        />
      </AppShell>
    );
  }
  return <AppShell requireRole="client">{children}</AppShell>;
}
