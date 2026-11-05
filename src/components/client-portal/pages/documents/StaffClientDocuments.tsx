'use client';

import { useEffect } from 'react';
import { StaffPortalProvider } from '@/components/client-portal/StaffPortalProvider';
import { DocumentsInner } from './DocumentsPage';
import { setViewingEngagement } from './model';

/**
 * A client's Documents page, rendered for staff inside their own shell through
 * `StaffPortalProvider`. Uploads stay client-only.
 */
export function StaffClientDocuments({ engagementId, projectHref }: { engagementId: string; projectHref: string }) {
  // Set during render so the first file and zip links already carry the engagement, and again on
  // mount because a remount (React's development double mount) runs the cleanup first.
  setViewingEngagement(engagementId);
  useEffect(() => {
    setViewingEngagement(engagementId);
    return () => setViewingEngagement(null);
  }, [engagementId]);

  return (
    <StaffPortalProvider engagementId={engagementId} projectHref={projectHref}>
      <DocumentsInner />
    </StaffPortalProvider>
  );
}
