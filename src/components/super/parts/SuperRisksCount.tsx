'use client';

import { memo, useMemo } from 'react';
import { SidebarNavCountBadge, SidebarRailBadge, type SidebarInk } from '@/components/shell/SidebarNavGroup';
import { buildRisks } from '@/lib/super/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';

/**
 * The number on the super admin's Risks nav row (P-129): the same list the Risks page shows
 * (`buildRisks` over `/api/super/insights`, which runs under the caller's AuthContext). The
 * read is shared with the Overview, Team and Reports pages through its React Query key.
 */
export const SUPER_RISKS_NAV_HREF = '/app/super/risks';

function useSuperRiskCount(): number {
  const { data } = useSuperInsights();
  return useMemo(() => (data ? buildRisks(data, new Date()).length : 0), [data]);
}

export const SuperRisksNavCount = memo(function SuperRisksNavCount({ ink }: { ink: SidebarInk }) {
  return <SidebarNavCountBadge count={useSuperRiskCount()} ink={ink} />;
});

export const SuperRisksRailCount = memo(function SuperRisksRailCount() {
  return <SidebarRailBadge count={useSuperRiskCount()} />;
});
