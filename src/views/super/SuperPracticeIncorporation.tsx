'use client';

import Link from 'next/link';
import { ChevronRight, List } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { PhaseBar } from '@/components/ui/step-track';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ClientTile,
  NameCell,
  SuperFilterChips,
  SuperNumberStrip,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { plainDay, shortCompany, todayKey } from '@/components/super/parts/super-text';
import {
  superOwnerOf,
  superPhaseTrack,
  superStateChip,
} from '@/components/super/overview/super-overview-format';
import type { SuperInsightClient } from '@/lib/super/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { usePracticeMetrics } from '@/components/metrics/use-metrics';
import { ExpectedCoiCard, StageDaysCard } from '@/components/metrics/practice-cards';
import { superEngagementHref } from '@/lib/super/super-overview';
import { cn } from '@/lib/utils';

/**
 * PRACTICE · INCORPORATION (prototype `PracticeScreen` area "Incorporation").
 *
 * Every client that is not incorporated yet: where it sits in the four phases, the current
 * step, who holds it, the manager and lead, and the next open filing date. All of it is read
 * from the engagement rows and the checklist gate through `/api/super/insights`. Read-only.
 */
const SUPER_INCORPORATION_HREF = '/app/super/practice/incorporation';

const OWNER_WORD: Record<'client' | 'sbc' | 'manager', string> = {
  client: 'Client',
  sbc: 'SBC',
  manager: 'Manager',
};

export default function SuperPracticeIncorporation() {
  const router = useRouter();
  const query = useSuperInsights();
  const insights = query.data;
  // Days in step, days in each stage and expected certificates come from the step events (G-13).
  const practiceQuery = usePracticeMetrics();
  const practice = practiceQuery.data;
  const [manager, setManager] = useState('');
  const [lead, setLead] = useState('');
  const [holder, setHolder] = useState('');

  const incorporating = useMemo(
    () => (insights?.clients ?? []).filter((client) => !client.summary.incorporated),
    [insights],
  );

  const rows = useMemo(
    () =>
      incorporating.filter((client) => {
        const s = client.summary;
        const owner = superOwnerOf(s);
        return (
          (!manager || (s.managerName ?? 'Unassigned') === manager) &&
          (!lead || (s.leadName ?? 'Unassigned') === lead) &&
          (!holder || (owner ? OWNER_WORD[owner] : '') === holder)
        );
      }),
    [incorporating, manager, lead, holder],
  );

  const seo = (
    <SEO
      title="Incorporation — VCFO Suite"
      description="Every client in incorporation: phase, current step, owner and lead."
      path={SUPER_INCORPORATION_HREF}
    />
  );

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading incorporation" />
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Incorporation could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const today = todayKey();
  const waiting = incorporating.filter((c) => c.summary.stateKey === 'with-client').length;
  const overdue = incorporating.filter((c) => c.summary.steps.overdue > 0).length;
  const coiDays = insights.clients.flatMap((c) => (c.daysToCoi === null ? [] : [c.daysToCoi]));
  const avgCoi = coiDays.length ? Math.round(coiDays.reduce((a, b) => a + b, 0) / coiDays.length) : null;
  const issued = insights.clients
    .filter((c) => c.startedPreInc && c.certificateDate)
    .sort((a, b) => (b.certificateDate ?? '').localeCompare(a.certificateDate ?? ''))
    .slice(0, 8);

  const names = (pick: (c: SuperInsightClient) => string | null) =>
    [...new Set(incorporating.map((c) => pick(c) ?? 'Unassigned'))].sort((a, b) => a.localeCompare(b));

  const columns: EFilingColumn<SuperInsightClient>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '22%',
      render: (c) => (
        <NameCell
          lead={<ClientTile id={c.summary.id} name={c.summary.companyName} />}
          title={shortCompany(c.summary.companyName)}
          sub={c.summary.clientName ?? undefined}
        />
      ),
    },
    {
      key: 'now',
      header: 'Now at',
      width: '24%',
      render: (c) => (
        <NameCell
          title={c.summary.currentStep?.title ?? 'Every step is done'}
          sub={c.summary.leadName ?? 'No lead'}
        />
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '150px',
      render: (c) => {
        const track = superPhaseTrack(c.summary);
        return (
          <span className="flex items-center gap-2">
            <PhaseBar done={track.done} totals={track.totals} names={track.names} className="w-24" />
            <span className="text-[12.5px] tabular-nums text-ink-muted">{c.summary.progress.pct}%</span>
          </span>
        );
      },
    },
    {
      key: 'with',
      header: 'With',
      width: '120px',
      render: (c) => {
        const owner = superOwnerOf(c.summary);
        return owner ? <OwnerChip owner={owner} /> : <span className="text-ink-faint">–</span>;
      },
    },
    { key: 'manager', header: 'Manager', width: '13%', render: (c) => c.summary.managerName ?? 'Unassigned' },
    {
      key: 'inStep',
      header: 'In step',
      width: '84px',
      align: 'right',
      render: (c) => {
        const row = practice?.currentStep[c.summary.id];
        const late = Boolean(row?.dueOn && row.dueOn < today);
        return row?.days === null || row?.days === undefined ? (
          <span className="text-ink-faint">–</span>
        ) : (
          <span
            className={cn('tabular-nums', late && 'font-medium text-danger')}
            title={row.dueOn ? `Due ${plainDay(row.dueOn)}` : undefined}
          >
            {row.days}d
          </span>
        );
      },
    },
    {
      key: 'next',
      header: 'Next',
      width: '72px',
      render: (c) => (
        <span className={cn('tabular-nums', c.nextDueDate && c.nextDueDate < today && 'font-medium text-danger')}>
          {plainDay(c.nextDueDate)}
        </span>
      ),
    },
    {
      key: 'idle',
      header: 'Last move',
      width: '88px',
      align: 'right',
      render: (c) => (
        <span className={cn('tabular-nums', (c.summary.idleDays ?? 0) >= 14 && 'font-medium text-danger')}>
          {c.summary.idleDays === null ? '–' : c.summary.idleDays === 0 ? 'Today' : `${c.summary.idleDays}d`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (c) => {
        const chip = superStateChip(c.summary);
        return (
          <Chip fixed tone={chip.tone} title={chip.title}>
            {chip.word}
          </Chip>
        );
      },
    },
  ];

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Incorporation" meta={`${incorporating.length} clients`} />

        <SuperNumberStrip
          items={[
            { label: 'Clients in incorporation', value: incorporating.length },
            { label: 'Waiting on client', value: waiting },
            { label: 'Overdue', value: overdue, bad: overdue > 0 },
            {
              label: 'Days to COI · average',
              value: avgCoi ?? '–',
              sub: coiDays.length ? `${coiDays.length} certificates` : undefined,
              good: avgCoi !== null,
            },
          ]}
        />

        <Pipeline clients={incorporating} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <StageDaysCard rows={practice?.incorporation.stageDays ?? []} loading={practiceQuery.isPending} />
          <ExpectedCoiCard
            rows={practice?.incorporation.expected ?? []}
            loading={practiceQuery.isPending}
            hrefFor={(row) => superEngagementHref(row.engagementId)}
          />
        </div>

        <DashSection title="Clients in incorporation" meta={`${rows.length} of ${incorporating.length}`} bodyClassName="px-2 pb-2 pt-3">
          <SuperFilterChips
            className="mb-2 px-2"
            onClear={() => {
              setManager('');
              setLead('');
              setHolder('');
            }}
            filters={[
              { key: 'manager', label: 'Manager', value: manager, options: names((c) => c.summary.managerName), onChange: setManager },
              { key: 'lead', label: 'Lead', value: lead, options: names((c) => c.summary.leadName), onChange: setLead },
              { key: 'with', label: 'With', value: holder, options: ['SBC', 'Client', 'Manager'], onChange: setHolder },
            ]}
          />
          <EFilingGrid
            caption="Clients in incorporation"
            columns={columns}
            rows={rows}
            rowKey={(c) => c.summary.id}
            onRowClick={(c) => router.push(c.summary.href)}
            empty="No client matches these filters"
            minWidth={1060}
            pageSize={15}
          />
        </DashSection>

        <DashSection title="Certificates issued" meta={issued.length ? String(issued.length) : undefined} bodyClassName="p-0">
          {issued.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No certificate recorded yet" />
            </div>
          ) : (
            <ul>
              {issued.map((c) => (
                <li key={c.summary.id} className="border-t border-line-soft first:border-t-0">
                  <Link href={c.summary.href} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-surface-sunken/60">
                    <ClientTile id={c.summary.id} name={c.summary.companyName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{shortCompany(c.summary.companyName)}</span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {[c.summary.managerName, c.daysToCoi !== null ? `${c.daysToCoi} days to COI` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <b className="w-16 flex-none text-right text-[13px] font-medium tabular-nums">{plainDay(c.certificateDate)}</b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashSection>
      </div>
    </PageTransition>
  );
}

/** The four phases across the page, each with the clients whose current step sits in it. */
function Pipeline({ clients }: { clients: SuperInsightClient[] }) {
  const phases = clients[0]?.summary.phases ?? [];
  const byPhase = phases.map((phase, index) => ({
    id: phase.id,
    label: phase.label,
    clients: clients.filter((c) => {
      const current = c.summary.phases.findIndex((p) => p.done < p.total);
      return current === index;
    }),
  }));

  return (
    <DashSection title="Incorporation pipeline" meta={String(clients.length)} icon={List} tone="info">
      {clients.length === 0 ? (
        <EmptyState title="No client is in incorporation" />
      ) : (
        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {byPhase.map((phase, i) => (
            <li key={phase.id} className="relative min-w-0 rounded-md border-1.5 border-line px-4 py-3.5">
              {i < byPhase.length - 1 ? (
                <ChevronRight
                  size={16}
                  strokeWidth={1.6}
                  className="absolute -right-[18px] top-1/2 hidden -translate-y-1/2 text-ink-faint xl:block"
                  aria-hidden
                />
              ) : null}
              <span className="block truncate text-[13px] font-medium text-ink-2">{phase.label}</span>
              <b className="mt-1.5 block text-[26px] font-medium leading-none tabular-nums">{phase.clients.length}</b>
              <ul className="mt-3 grid gap-2">
                {phase.clients.slice(0, 8).map((c) => (
                  <li key={c.summary.id}>
                    <Link href={c.summary.href} className="flex min-w-0 items-center gap-2 text-[13px] hover:underline">
                      <ClientTile id={c.summary.id} name={c.summary.companyName} className="h-[22px] w-[22px] text-[9.5px]" />
                      <span className="truncate">{shortCompany(c.summary.companyName)}</span>
                    </Link>
                  </li>
                ))}
                {phase.clients.length > 8 ? (
                  <li className="text-[12.5px] text-ink-muted">{phase.clients.length - 8} more</li>
                ) : null}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </DashSection>
  );
}
