'use client';

import { Gauge } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { PersonAvatar, ToneBar } from '@/components/super/parts/super-parts';
import { capacityTone, type SuperTeamManager } from '@/lib/super/super-insights-model';
import type { PersonMetrics } from '@/lib/metrics/practice-metrics';
import { cn } from '@/lib/utils';

/**
 * "Capacity" (prototype rail card): open items used against the capacity admins set, one bar
 * per manager in the capacity bands. A manager with no capacity set shows the open count only.
 */
export function SuperCapacityCard({
  managers,
  people,
  title = 'Capacity',
}: {
  managers: SuperTeamManager[];
  people: Map<string, PersonMetrics>;
  title?: string;
}) {
  const loads = managers.map((m) => ({ m, load: people.get(m.id)?.load }));
  const withCap = loads.filter((x) => x.load?.capacity != null);
  const used = withCap.reduce((sum, x) => sum + (x.load?.open ?? 0), 0);
  const total = withCap.reduce((sum, x) => sum + (x.load?.capacity ?? 0), 0);
  const perManager = managers.length ? Math.round(managers.reduce((sum, m) => sum + m.clients, 0) / managers.length) : 0;

  return (
    <DashSection
      title={title}
      icon={Gauge}
      tone="violet"
      meta={total > 0 ? `${used} / ${total} · ${perManager} clients per manager` : `${perManager} clients per manager`}
      bodyClassName="p-0"
    >
      {managers.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No manager yet" />
        </div>
      ) : (
        <>
          <ul>
            {loads.map(({ m, load }) => (
              <li key={m.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 border-t border-line-soft px-4 py-3 first:border-t-0">
                <PersonAvatar name={m.name} />
                <span className="truncate text-[13.5px] font-medium">{m.name}</span>
                <span className="text-[12.5px] tabular-nums text-ink-muted">
                  {load?.capacity != null ? `${load.open} / ${load.capacity}` : `${load?.open ?? m.openSteps} open`}
                </span>
                {load?.pct != null ? (
                  <ToneBar pct={load.pct} tone={capacityTone(load.pct)} height={8} className="col-span-2 col-start-2" />
                ) : (
                  <span className="col-span-2 col-start-2 text-[12.5px] text-ink-faint">No capacity set</span>
                )}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-muted">
            {(
              [
                ['bg-brand', 'Under 70%'],
                ['bg-warning-mid', '70 to 80%'],
                ['bg-danger-mid', 'Over 80%'],
              ] as const
            ).map(([fill, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <i className={cn('h-2 w-2 rounded-[2px]', fill)} aria-hidden />
                {label}
              </span>
            ))}
          </p>
        </>
      )}
    </DashSection>
  );
}
