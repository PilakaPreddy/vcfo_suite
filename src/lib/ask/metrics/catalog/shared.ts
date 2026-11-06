import 'server-only';

import { loadStaffEngagements } from '@/lib/ask/tools/staff-data';
import type { StaffEngagement } from '@/lib/ask/tools/staff';
import type { MetricEnv, MetricFilters } from '../types';

/** The one engagement this question is about, when it is about one. */
export const oneEngagement = (env: MetricEnv, filters: MetricFilters): string | undefined =>
  filters.client?.id ?? env.engagementId ?? undefined;

/** The caller's engagements with their checklist state, narrowed to one when the question names one. */
export async function engagementsFor(env: MetricEnv, filters: MetricFilters): Promise<StaffEngagement[]> {
  const rows = await loadStaffEngagements(env.ctx);
  const only = oneEngagement(env, filters);
  return only ? rows.filter((e) => e.dbId === only) : rows;
}

/** Counts by group, largest first, for the small chart. */
export function barsByGroup(labels: readonly string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
