'use client';

/**
 * Team-area page entries. A signed-in client inside the v7 portal gets the new
 * page; anyone else on /app/client/** (a super admin in the staff AppShell)
 * keeps the existing view passed as `legacy`, except Team, which sends them to
 * the staff projects list.
 */
import { useEffect, type ReactNode } from 'react';
import { usePortalOptional } from '../../PortalProvider';
import { StaffPortalProvider, StaffProjectsRedirect } from '../../StaffPortalProvider';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import { TeamPage } from './TeamPage';
import { TeamSection } from './team-sections';
import { AnnouncementsPage } from './AnnouncementsPage';
import { NotificationsPage } from './NotificationsPage';
import { AuditPage } from './AuditPage';
import { SettingsPage } from './SettingsPage';

function Area({ page, legacy }: { page: ReactNode; legacy: ReactNode }) {
  const portal = usePortalOptional();
  const { prefs } = useShellAppearance();
  useEffect(() => {
    if (!portal) return;
    // app preference overrides; off → back to the OS setting the shell applies
    const os = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.cp')?.setAttribute('data-reduce-motion', prefs.reduceMotion || os ? 'true' : 'false');
  }, [portal, prefs.reduceMotion]);
  return <>{portal ? page : legacy}</>;
}

/**
 * A client's Team section for staff, on the project record's Team tab: the same SBC team card
 * and people list the client sees, read-only (inviting and substituting stay the client's).
 */
export function StaffClientTeam({ engagementId, projectHref }: { engagementId: string; projectHref: string }) {
  return (
    <StaffPortalProvider engagementId={engagementId} projectHref={projectHref}>
      <div className="cp-team">
        <TeamSection />
      </div>
    </StaffPortalProvider>
  );
}

/** Staff see a client's Team on the project record's Team tab, so a super admin goes there. */
export function ClientTeamEntry() {
  return <Area page={<TeamPage />} legacy={<StaffProjectsRedirect />} />;
}
export function ClientAnnouncementsEntry({ legacy }: { legacy: ReactNode }) {
  return <Area page={<AnnouncementsPage />} legacy={legacy} />;
}
export function ClientNotificationsEntry({ legacy }: { legacy: ReactNode }) {
  return <Area page={<NotificationsPage />} legacy={legacy} />;
}
export function ClientAuditEntry({ legacy }: { legacy: ReactNode }) {
  return <Area page={<AuditPage />} legacy={legacy} />;
}
export function ClientSettingsEntry({ legacy }: { legacy: ReactNode }) {
  return <Area page={<SettingsPage />} legacy={legacy} />;
}
