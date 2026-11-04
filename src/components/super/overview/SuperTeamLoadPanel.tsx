'use client';

import { Users } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import { ToneBar } from '@/components/super/parts/super-parts';
import { indexPeople, usePeopleMetrics } from '@/components/metrics/use-metrics';
import type { SuperInsights } from '@/lib/super/super-insights-model';
import type { LoadValue } from '@/lib/metrics/filing-metrics';

/**
 * "Team load" in the Overview rail (prototype): one row per manager with the open items against
 * the capacity an admin set, "open · overdue · room for N" and the load bar. Open and overdue
 * steps come from the insights read; open items and capacity from `/api/metrics/people`. A
 * manager with no capacity set shows the open count and no bar.
 */

const LOAD_TONE: Record<LoadValue['tone'], ChipTone> = { ok: 'prog', warn: 'warn', bad: 'bad', none: 'idle' };

export function SuperTeamLoadPanel({ insights }: { insights: SuperInsights }) {
  const people = usePeopleMetrics();
  const { byProfileId } = indexPeople(people.data);
  const managers = insights.team.managers;

  return (
    <DashSection title="Team load" icon={Users} tone="violet" bodyClassName={managers.length ? 'p-0' : 'p-4'}>
      {managers.length === 0 ? (
        <EmptyState title="None" />
      ) : (
        <ul>
          {managers.map((m) => {
            const load = byProfileId.get(m.id)?.load;
            const room = load?.capacity != null ? Math.max(0, load.capacity - load.open) : null;
            return (
              <li key={m.id} className="border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
                <span className="flex items-center gap-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{m.name}</span>
                  <span className="text-[12.5px] tabular-nums text-ink-muted">
                    {load?.capacity != null ? `${load.open} of ${load.capacity}` : `${m.clients} ${m.clients === 1 ? 'client' : 'clients'}`}
                  </span>
                </span>
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {m.openSteps} open · {m.overdueSteps} overdue{room !== null ? ` · room for ${room}` : ''}
                </span>
                {load?.pct != null ? <ToneBar pct={load.pct} tone={LOAD_TONE[load.tone]} className="mt-2" /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </DashSection>
  );
}
