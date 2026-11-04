'use client';

import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { ComplianceCalendarView } from '@/views/compliances/ComplianceCalendarView';
import { FilingsView } from '@/views/compliances/FilingsView';
import { ObligationsView } from '@/views/compliances/ObligationsView';
import { ObligationView } from '@/views/compliances/ObligationView';
import { RegistrationsView } from '@/views/compliances/RegistrationsView';
import { RegistrationView } from '@/views/compliances/RegistrationView';
import { RedirectTo } from '@/components/routing/RedirectTo';
import { EmptyState } from '@/components/ui/empty-state';
import { complianceEngagementsForRole } from '@/lib/compliance/incorporation-state';
import {
  preIncorporationIdsOf,
  type ComplianceScope,
} from '@/views/compliances/compliance-scope';

/**
 * COMPLIANCES — the one call site of the shared module, for every shell.
 *
 * The route pages are server components, so this thin client wrapper is where
 * the scoped engagement roster is read off `useApp()` (already filtered by the
 * caller's `AuthContext`: a client's own company, a lead's assignments, a
 * manager's projects, the firm) and the pre-COI ids are derived once from
 * `isIncorporated`, the only source of that flag. The views stay
 * presentational and identical across shells; no view here or below touches
 * `db`.
 *
 * `basePath` is the shell's `…/compliances` root, passed by the route page so
 * client, intern, manager and admin each stay inside their own segment. The
 * audience only picks the wording of the pre-incorporation notice.
 */
function useComplianceScope(): {
  settled: boolean;
  scope: ComplianceScope;
  /** A lead with no incorporated engagement has nothing here — send them to Today. */
  leadHasNothing: boolean;
} {
  const { user, engagements: roster, engagementsSettled, getStateForEngagement } = useApp();
  // Lead-only: compliances exist for incorporated engagements. Other roles
  // keep the whole roster and see the pre-COI notice instead.
  const engagements = useMemo(
    () => complianceEngagementsForRole(user?.role, roster, getStateForEngagement),
    [user?.role, roster, getStateForEngagement],
  );
  const preIncorporationIds = useMemo(
    () => preIncorporationIdsOf(engagements, getStateForEngagement),
    [engagements, getStateForEngagement],
  );
  const audience = user?.role === 'client' ? 'client' : 'staff';
  const scope = useMemo<ComplianceScope>(
    () => ({ audience, engagements, preIncorporationIds }),
    [audience, engagements, preIncorporationIds],
  );
  const leadHasNothing = engagementsSettled && user?.role === 'intern' && engagements.length === 0;
  return { settled: engagementsSettled, scope, leadHasNothing };
}

const LEAD_HOME = '/app/intern/today';

/**
 * R-51: the lead always has Compliances in the sidebar. With no incorporated client yet the
 * pages say so instead of sending the lead to Today.
 */
function NoIncorporatedClients() {
  return <EmptyState title="No incorporated clients yet" />;
}

/** The same skeleton the views show while the register loads. */
function Settling({ label }: { label: string }) {
  return (
    <div className="surface p-4" aria-busy="true" aria-label={label}>
      <div className="h-64 animate-pulse rounded-md bg-surface-sunken/40" />
    </div>
  );
}

export function ComplianceCalendarPage({ basePath }: { basePath: string }) {
  const { settled, scope, leadHasNothing } = useComplianceScope();
  if (!settled) return <Settling label="Loading calendar" />;
  if (leadHasNothing) return <NoIncorporatedClients />;
  return <ComplianceCalendarView basePath={basePath} scope={scope} />;
}

export function FilingsPage({ basePath }: { basePath: string }) {
  const { settled, scope, leadHasNothing } = useComplianceScope();
  if (!settled) return <Settling label="Loading filings" />;
  if (leadHasNothing) return <NoIncorporatedClients />;
  return <FilingsView basePath={basePath} scope={scope} />;
}

export function ObligationsPage({ basePath }: { basePath: string }) {
  const { settled, scope, leadHasNothing } = useComplianceScope();
  if (!settled) return <Settling label="Loading obligations" />;
  if (leadHasNothing) return <NoIncorporatedClients />;
  return <ObligationsView basePath={basePath} scope={scope} />;
}

export function ObligationPage({ basePath, obligationId }: { basePath: string; obligationId: string }) {
  const { settled, scope, leadHasNothing } = useComplianceScope();
  if (!settled) return <Settling label="Loading obligation" />;
  if (leadHasNothing) return <NoIncorporatedClients />;
  return <ObligationView basePath={basePath} scope={scope} obligationId={obligationId} />;
}

/**
 * Super admin Practice · Compliances (prototype PracticeCalendar) and Practice · Filings: the
 * staff calendar and register with the statutory and non-statutory filter, read across every
 * client. The super admin shell has no obligation or task pages, so a filing or a task opens
 * its client's project page.
 */
const SUPER_BASE = '/app/super/practice';
const superHrefs = {
  record: (row: { engagementId: string }) => `/app/super/projects/${encodeURIComponent(row.engagementId)}`,
  task: (t: { engagementId: string }) => `/app/super/projects/${encodeURIComponent(t.engagementId)}`,
};

export function SuperComplianceCalendarPage() {
  const { settled, scope } = useComplianceScope();
  if (!settled) return <Settling label="Loading calendar" />;
  return <ComplianceCalendarView basePath={SUPER_BASE} scope={scope} hrefs={superHrefs} />;
}

export function SuperFilingsPage() {
  const { settled, scope } = useComplianceScope();
  if (!settled) return <Settling label="Loading filings" />;
  return <FilingsView basePath={SUPER_BASE} scope={scope} hrefs={superHrefs} />;
}

/**
 * Registrations sit outside Compliances in the nav but read the same scoped
 * roster: `shellBase` is the shell's root (`/app/intern`, `/app/manager`,
 * `/app/admin`), so the list lives at `{shellBase}/registrations` and a step
 * opens in that shell's own project routes.
 */
export function RegistrationsPage({ shellBase }: { shellBase: string }) {
  const { settled, scope, leadHasNothing } = useComplianceScope();
  if (!settled) return <Settling label="Loading registrations" />;
  if (leadHasNothing) return <RedirectTo href={LEAD_HOME} />;
  return <RegistrationsView shellBase={shellBase} scope={scope} />;
}

export function RegistrationPage({ shellBase, recordKey }: { shellBase: string; recordKey: string }) {
  const { settled, scope, leadHasNothing } = useComplianceScope();
  if (!settled) return <Settling label="Loading registration" />;
  if (leadHasNothing) return <RedirectTo href={LEAD_HOME} />;
  return <RegistrationView shellBase={shellBase} scope={scope} recordKey={recordKey} />;
}
