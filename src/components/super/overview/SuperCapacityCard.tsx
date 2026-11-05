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
      headIcon={{ icon: Gauge, tone: 'blue' }}
      meta={total > 0 ? `${used} / ${total} · ${perManager} clients per manager` : `${perManager} clients per manager`}
      flush
    >
      {managers.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No manager yet" />
        </div>
      ) : (
        <>
          <ul>
            {loads.map(({ m, load }) => (
              <li key={m.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
                <PersonAvatar name={m.name} />
                <span className="truncate text-[13.5px] font-medium">{m.name}</span>
                <span className="text-[12.5px] tabular-nums text-ink-muted">
                  {load?.capacity != null ? `${load.open} of ${load.capacity}` : `${load?.open ?? m.openSteps} open`}
                </span>
                {load?.pct != null ? (
                  <ToneBar pct={load.pct} tone={capacityTone(load.pct)} height={8} className="col-span-2 col-start-2" />
                ) : (
                  <span className="col-span-2 col-start-2 text-[12.5px] text-ink-faint">No capacity set</span>
                )}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-muted md:px-5">
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

/**
 * "Capacity · can the team take more?" on Growth (prototype): one line per manager with the bar and
 * "N of M · room for R", then a sentence on who has the most room and which won prospect waits.
 */
export function SuperCapacityLines({
  managers,
  people,
  waiting,
}: {
  managers: SuperTeamManager[];
  people: Map<string, PersonMetrics>;
  /** Won prospects not linked to a client yet. */
  waiting: string[];
}) {
  const loads = managers.map((m) => {
    const load = people.get(m.id)?.load;
    return { m, load, room: load?.capacity != null ? Math.max(0, load.capacity - load.open) : null };
  });
  const withRoom = loads.filter((x) => x.room !== null);
  const room = withRoom.reduce((sum, x) => sum + (x.room ?? 0), 0);
  const most = [...withRoom].sort((a, b) => (b.room ?? 0) - (a.room ?? 0)).slice(0, 2).map((x) => x.m.name);
  const parts = [
    withRoom.length > 0 ? `The team can take ${room} more open items${most.length ? `; ${most.join(' and ')} have the most room` : ''}.` : null,
    waiting.length > 0 ? `${waiting.join(' and ')} ${waiting.length === 1 ? 'is' : 'are'} won and waiting for a client link.` : null,
  ].filter(Boolean);

  return (
    <DashSection title="Capacity · can the team take more?" headIcon={{ icon: Gauge, tone: 'violet' }} flush>
      {managers.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No manager yet" />
        </div>
      ) : (
        <ul className="grid gap-2.5 px-4 py-3 md:px-5">
          {loads.map(({ m, load, room: left }) => (
            <li key={m.id} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)_150px]">
              <span className="truncate font-medium text-ink">{m.name}</span>
              <ToneBar pct={load?.pct ?? 0} tone={load?.pct != null ? capacityTone(load.pct) : 'idle'} />
              <span className={cn('col-span-2 text-[12.5px] tabular-nums sm:col-span-1 sm:text-right', left !== null && left <= 2 ? 'font-medium text-warning' : 'text-ink-2')}>
                {load?.capacity != null ? `${load.open} of ${load.capacity} · room for ${left}` : `${load?.open ?? m.openSteps} open · no capacity set`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {parts.length > 0 ? <p className="border-t border-line-soft px-4 py-3 text-[13.5px] text-ink-2 md:px-5">{parts.join(' ')}</p> : null}
    </DashSection>
  );
}
