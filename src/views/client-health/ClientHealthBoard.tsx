'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, HeartPulse, ShieldAlert } from 'lucide-react';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { ClientHealthChipView } from '@/components/client-health/ClientHealthChip';
import { useApp } from '@/context/AppContext';
import { useClientHealthList } from '@/hooks/use-client-health';
import { isAdminOrManager } from '@/lib/auth';
import { bandRank, HEALTH_BANDS, HEALTH_BAND_LABEL, type HealthBand } from '@/lib/client-health/score';
import { projectHref } from '@/lib/client-health/links';

type View = 'all' | HealthBand;

/**
 * CLIENT HEALTH — every client in the staff member's scope by computed health band (IDEAS-PLAN
 * wave 2, section E). One page for every staff role; GET /api/client-health is scoped by
 * `AuthContext`. Worst band first, then the lowest score. Each row shows the signals that took
 * the most points off and links to the client record; the chip opens the full breakdown and,
 * for a manager or an admin, the "Set band by hand" card.
 */
export function ClientHealthBoard({ basePath }: { basePath: string }) {
  const q = useClientHealthList();
  const { user, engagements } = useApp();
  const [view, setView] = useState<View>('all');
  const items = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => bandRank(b.effectiveBand) - bandRank(a.effectiveBand) || a.score - b.score),
    [q.data],
  );
  const shown = items.filter((i) => view === 'all' || i.effectiveBand === view);
  const count = (b: HealthBand) => items.filter((i) => i.effectiveBand === b).length;
  const slugOf = (id: string) => engagements.find((e) => e.id === id)?.slug ?? id;
  const role = user?.role ?? 'intern';
  const canOverride = isAdminOrManager(role);

  return (
    <PageTransition>
      <SEO title="Client health — VCFO Suite" description="Computed health of every client, with the signals behind it." path={basePath} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <DashHero
          title="Client health"
          subtitle="Scored every night from open requests, client silence, overdue compliances, notices and stuck steps"
          stats={[
            { label: 'Critical', icon: ShieldAlert, value: count('critical'), hot: count('critical') > 0, onClick: () => setView('critical') },
            { label: 'At risk', icon: AlertTriangle, value: count('at_risk'), onClick: () => setView('at_risk') },
            { label: 'Watch', icon: Activity, value: count('watch'), onClick: () => setView('watch') },
            { label: 'Good', icon: HeartPulse, value: count('good'), onClick: () => setView('good') },
          ]}
        />
        <DashSection
          title="Clients by health"
          meta={q.isLoading ? undefined : `${shown.length} of ${items.length}`}
          right={
            <SpectrumTabs
              label="Band"
              items={[{ key: 'all', label: 'All', count: items.length }, ...[...HEALTH_BANDS].reverse().map((b) => ({ key: b, label: HEALTH_BAND_LABEL[b], count: count(b) }))]}
              value={view}
              onChange={(v) => setView(v as View)}
            />
          }
        >
          {q.isLoading ? (
            <SkeletonRows rows={5} />
          ) : q.isError ? (
            <EmptyState title="Client health did not load." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
          ) : shown.length === 0 ? (
            <EmptyState title={items.length === 0 ? 'No scores yet. The nightly job scores every client after its first run.' : 'No client is in this band.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12.5px] text-ink-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">Client</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Health</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Score</th>
                    <th scope="col" className="py-2 font-medium">What is pulling it down</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => {
                    const top = [...item.signals.penalties].filter((p) => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 2);
                    return (
                      <tr key={item.engagementId} className="border-b border-line align-top last:border-0">
                        <td className="py-2.5 pr-3">
                          <Link className="font-medium text-ink hover:underline" href={projectHref(role, { id: item.engagementId, slug: slugOf(item.engagementId) })}>
                            {item.companyName}
                          </Link>
                          {item.previousBand && item.previousBand !== item.band ? (
                            <span className="block text-[12.5px] text-ink-muted">Was {HEALTH_BAND_LABEL[item.previousBand]}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          <ClientHealthChipView item={item} canOverride={canOverride} />
                        </td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums text-ink">{item.score}</td>
                        <td className="py-2.5 text-ink-2">{top.length ? top.map((p) => p.detail).join('; ') : 'Nothing'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashSection>
      </div>
    </PageTransition>
  );
}
