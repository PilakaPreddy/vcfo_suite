'use client';

import { useQuery } from '@tanstack/react-query';
import type { SuperInsights } from '@/lib/super/super-insights-model';

/**
 * The read behind Practice areas, Team, Risks, Growth and Reports. Like `useSuperOverview`,
 * it goes through a route (`/api/super/insights`) that runs the repository under the caller's
 * `AuthContext`; views never touch `db`.
 */
const SUPER_INSIGHTS_QUERY_KEY = ['super-insights'] as const;

async function fetchSuperInsights(): Promise<SuperInsights> {
  const res = await fetch('/api/super/insights');
  const data = (await res.json()) as { insights?: SuperInsights; error?: string };
  if (!res.ok || !data.insights) {
    throw new Error(data.error ?? 'Could not load the firm insights');
  }
  return data.insights;
}

export function useSuperInsights() {
  return useQuery({
    queryKey: SUPER_INSIGHTS_QUERY_KEY,
    queryFn: fetchSuperInsights,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    notifyOnChangeProps: ['data', 'error', 'isPending'],
  });
}
