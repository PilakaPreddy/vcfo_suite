'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PortalContext, type PortalContextValue } from '@/components/client-portal/PortalProvider';
import { toastUndo } from '@/components/ui/undo-toast';
import { DocumentsInner } from './DocumentsPage';
import { setViewingEngagement } from './model';
import '../../portal-css';

const noop = () => undefined;

/**
 * A client's Documents page, rendered for staff inside their own shell: the same components the
 * client sees, fed by the same server read, which gives staff what their role allows for an
 * engagement they may access. Uploads and the portal chrome (chat, preferences, top bar) stay
 * client-only; links that would open a client page open the staff project page instead.
 */
export function StaffClientDocuments({ engagementId, projectHref }: { engagementId: string; projectHref: string }) {
  const router = useRouter();
  // Set during render so the first file and zip links already carry the engagement, and again on
  // mount because a remount (React's development double mount) runs the cleanup first.
  setViewingEngagement(engagementId);
  useEffect(() => {
    setViewingEngagement(engagementId);
    return () => setViewingEngagement(null);
  }, [engagementId]);

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
      <PortalContext.Provider value={value}>
        <DocumentsInner />
      </PortalContext.Provider>
    </div>
  );
}
