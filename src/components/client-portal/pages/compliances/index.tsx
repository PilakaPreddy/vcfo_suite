'use client';

/**
 * Route entries for /app/client/compliances/{calendar,filings,obligations}. Inside the
 * client portal shell they render the v7 pages; a super admin viewing the
 * client segment keeps the staff AppShell, so the shared staff views
 * (src/views/compliances/CompliancePages.tsx) render there instead. Obligations
 * has no staff view on the client segment yet, so outside the portal it shows
 * the staff Filings register.
 */
import { useParams } from 'next/navigation';
import { usePortalOptional } from '../../PortalProvider';
import { StaffPortalProvider } from '../../StaffPortalProvider';
import { ComplianceCalendarPage, FilingsPage } from '@/views/compliances/CompliancePages';
import { CompliancesCalendar } from './CalendarPage';
import { CompliancesFilings } from './FilingsPage';
import { CompliancesObligations } from './ObligationsPage';
import { CompliancesObligation } from './ObligationPage';
import { CompliancesTask } from './TaskPage';
import { CompliancesMeeting } from './MeetingPage';
import { MeetingPage } from '@/views/board-meetings/MeetingPage';

export function ClientCompliancesCalendarRoute() {
  const portal = usePortalOptional();
  if (!portal) return <ComplianceCalendarPage basePath="/app/client/compliances" />;
  return <CompliancesCalendar />;
}

export function ClientCompliancesFilingsRoute() {
  const portal = usePortalOptional();
  if (!portal) return <FilingsPage basePath="/app/client/compliances" />;
  return <CompliancesFilings />;
}

export function ClientCompliancesObligationsRoute() {
  const portal = usePortalOptional();
  if (!portal) return <FilingsPage basePath="/app/client/compliances" />;
  return <CompliancesObligations />;
}

export function ClientCompliancesObligationRoute() {
  const portal = usePortalOptional();
  const params = useParams<{ id: string }>();
  if (!portal) return <FilingsPage basePath="/app/client/compliances" />;
  return <CompliancesObligation id={decodeURIComponent(String(params?.id ?? ''))} />;
}

/** The client's non-statutory task page (COMPLIANCE-MODEL.md 4.3, K-1, K-2). */
export function ClientCompliancesTaskRoute() {
  const portal = usePortalOptional();
  const params = useParams<{ id: string }>();
  if (!portal) return <FilingsPage basePath="/app/client/compliances" />;
  return <CompliancesTask id={decodeURIComponent(String(params?.id ?? ''))} />;
}

/** The client's board meeting page (read only; docs/specs/board-meetings/PLAN.md). */
export function ClientCompliancesMeetingRoute() {
  const portal = usePortalOptional();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ''));
  if (!portal) return <MeetingPage basePath="/app/admin/compliances" meetingId={id} />;
  return <CompliancesMeeting id={id} />;
}

/**
 * The client's own Filings page for staff, for one engagement, inside the staff shell (the super
 * admin project record's Obligations tab). The register is read with `&engagement=` and the
 * server checks access with `assertEngagementAccess`; links that open another client page open
 * the project record instead.
 */
export function StaffClientFilings({ engagementId, projectHref }: { engagementId: string; projectHref: string }) {
  return (
    <StaffPortalProvider engagementId={engagementId} projectHref={projectHref}>
      <CompliancesFilings />
    </StaffPortalProvider>
  );
}
