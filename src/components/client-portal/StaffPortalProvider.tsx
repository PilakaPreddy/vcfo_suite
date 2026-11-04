'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PortalContext, type PortalContextValue } from './PortalProvider';
import { toastUndo } from '@/components/ui/undo-toast';
import './portal-css';

const noop = () => undefined;

/**
 * Renders a client portal page body for staff inside their own shell, for one engagement: the
 * same components the client sees, fed by the same server reads, which give staff what their
 * role allows for an engagement they may access. The portal chrome (chat, preferences, theme,
 * top bar) stays client-only, and any link that would open a client page opens the staff
 * project page (`projectHref`) instead.
 */
export function StaffPortalProvider({ engagementId, projectHref, children }: { engagementId: string; projectHref: string; children: ReactNode }) {
  const router = useRouter();
  const value = useMemo<PortalContextValue>(
    () => ({
      engagementId,
      shell: undefined,
      shellLoading: false,
      after: false,
      setAfter: noop,
      theme: 'light',
      toggleTheme: noop,
      textSize: 'default',
      setTextSize: noop,
      prefs: undefined,
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
    [engagementId, projectHref, router],
  );

  return (
    <div className="cp" data-theme="light" style={{ minHeight: 0, background: 'transparent' }}>
      <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
    </div>
  );
}
