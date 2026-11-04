'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ClientPortalShell } from '@/lib/client-portal/types';
import { PORTAL_SHELL_KEY, PortalContext, type PortalContextValue } from './PortalProvider';
import { toastUndo } from '@/components/ui/undo-toast';
import { RedirectTo } from '@/components/routing/RedirectTo';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import './portal-css';

const noop = () => undefined;

/**
 * Renders a client portal page body for staff inside their own shell, for one engagement: the
 * same components the client sees, fed by the same server reads, which give staff what their
 * role allows for an engagement they may access. The shell (company, SBC team) is that
 * engagement's, read with `?engagement=`. The portal chrome (chat, preferences, theme,
 * top bar) stays client-only, and any link that would open a client page opens the staff
 * project page (`projectHref`) instead.
 */
export function StaffPortalProvider({ engagementId, projectHref, children }: { engagementId: string; projectHref: string; children: ReactNode }) {
  const router = useRouter();
  const { data: shell, isLoading } = useQuery({
    queryKey: [...PORTAL_SHELL_KEY, engagementId],
    queryFn: async () => {
      const res = await fetch(`/api/client/portal?engagement=${encodeURIComponent(engagementId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`shell ${res.status}`);
      return ((await res.json()) as { shell: ClientPortalShell }).shell;
    },
    staleTime: 30_000,
  });
  const value = useMemo<PortalContextValue>(
    () => ({
      engagementId,
      shell,
      shellLoading: isLoading,
      after: false,
      setAfter: noop,
      theme: 'light',
      toggleTheme: noop,
      textSize: 'default',
      setTextSize: noop,
      prefs: shell?.prefs,
      savePrefs: noop,
      toast: (msg, opts) => void toastUndo(msg, opts?.undo),
      drill: noop,
      tipAt: noop,
      chatOpen: false,
      openChat: noop,
      closeChat: noop,
      pendingQuestion: null,
      go: () => router.push(projectHref),
      drawerOpen: false,
      setDrawerOpen: noop,
      crumbs: null,
      setCrumbs: noop,
    }),
    [engagementId, shell, isLoading, projectHref, router],
  );

  return (
    <div className="cp" data-theme="light" style={{ minHeight: 0, background: 'transparent' }}>
      <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
    </div>
  );
}

/**
 * A super admin who opens a client page in the staff shell goes to the staff projects list:
 * each project's record shows the client's page for that one engagement.
 */
export function StaffProjectsRedirect() {
  const base = useStaffBasePath();
  return <RedirectTo href={`${base}/projects`} />;
}
