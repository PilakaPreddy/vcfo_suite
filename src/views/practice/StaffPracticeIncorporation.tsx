'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Landmark } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip } from '@/components/ui/spectrum-chip';
import { PhaseBar } from '@/components/ui/step-track';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Button } from '@/components/ui/button';
import { SuperNumberStrip, SuperPageError } from '@/components/super/parts/super-parts';
import { shortCompany, todayKey } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import { superOwnerOf, superPhaseTrack, superStateChip } from '@/components/super/overview/super-overview-format';
import { usePracticeMetrics } from '@/components/metrics/use-metrics';
import { usePracticeIncorporation } from '@/hooks/use-practice-incorporation';
import {
  practiceClientsHref,
  type PracticeIncorporationClient,
  type PracticeShellBase,
} from '@/lib/practice/practice-incorporation';
import type { CurrentStepDays } from '@/lib/metrics/practice-metrics';
import { cn } from '@/lib/utils';
import { stepNumbers } from '@/lib/client-portal/documents';

/**
 * INCORPORATION on the admin, manager and lead shells (rule R-51, D-29; prototype
 * `src/screens/staff/IncorporationScreen.tsx`).
 *
 * The clients still incorporating, scoped to the role through `/api/practice/incorporation`
 * (a lead sees their own clients, a manager their team's, an admin all), never the super-only
 * insights. Four number tiles, then one grid with a "With" filter: Client, Current step,
 * Progress (PhaseBar), Steps, With, Days, Next, Status. Late rows are red, and a row opens the
 * client's record in this shell.
 *
 * Every number is real. Phase, current step, owner and status come from the checklist gate
 * (the same builder the super admin's Practice · Incorporation uses); days in step and the
 * step's due date come from the scoped practice metrics. The prototype's "With MCA" tile and
 * filter are left out: the app records no MCA-pending state, so "With manager" (a step waiting
 * on the manager's review) takes its place.
 */

type WithKey = '' | 'client' | 'sbc' | 'manager';

const WITH_WORD: Record<Exclude<WithKey, ''>, string> = { client: 'Client', sbc: 'SBC', manager: 'Manager' };

const STEP_NO = stepNumbers();

/**
 * The step's number in the client order ("Step 10"), as the project page shows it. The internal
 * id ("pre-7") counts differently, so showing it made one step look like two.
 */
function stepCode(stepId: string | undefined): string | null {
  const n = stepId ? STEP_NO[stepId]?.n : undefined;
  return n ? `Step ${n}` : null;
}

/** A row is late when a step is overdue, the client is blocked, or the step's window has passed. */
function isLateRow(c: PracticeIncorporationClient, step: CurrentStepDays | undefined, today: string): boolean {
  return (
    c.summary.stateKey === 'overdue' ||
    c.summary.stuckReason === 'blocked' ||
    Boolean(step?.dueOn && step.dueOn < today)
  );
}

export default function StaffPracticeIncorporation({ base }: { base: PracticeShellBase }) {
  const query = usePracticeIncorporation();
  const practiceQuery = usePracticeMetrics();
  const steps = practiceQuery.data?.currentStep;
  const [withWho, setWithWho] = useState<WithKey>('');
  const today = todayKey();
  const clientsHref = practiceClientsHref(base);

  const all = useMemo(() => (query.data ?? []).filter((c) => !c.summary.incorporated), [query.data]);
  const count = (w: Exclude<WithKey, ''>) => all.filter((c) => superOwnerOf(c.summary) === w).length;
  const late = all.filter((c) => isLateRow(c, steps?.[c.summary.id], today)).length;
  const rows = useMemo(
    () =>
      all
        .filter((c) => !withWho || superOwnerOf(c.summary) === withWho)
        .sort((a, b) => a.summary.progress.done - b.summary.progress.done),
    [all, withWho],
  );

  const seo = (
    <SEO
      title="Incorporation — VCFO Suite"
      description="Clients in incorporation: current step, progress, who holds it and status."
      path={`${base}/incorporation`}
    />
  );

  if (query.isError) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Incorporation could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const columns: EFilingColumn<PracticeIncorporationClient>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '22%',
      render: (c) => (
        <span className="block max-w-[220px] truncate font-medium" title={c.summary.companyName}>
          {shortCompany(c.summary.companyName)}
        </span>
      ),
    },
    {
      key: 'step',
      header: 'Current step',
      width: '26%',
      render: (c) => {
        const code = stepCode(c.summary.currentStep?.id);
        return (
          <span className="flex min-w-0 items-center gap-2">
            {code ? <span className="flex-none font-mono text-[12px] text-ink-muted">{code}</span> : null}
            <span className="truncate">{c.summary.currentStep?.title ?? 'Every step is done'}</span>
          </span>
        );
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '140px',
      render: (c) => {
        const track = superPhaseTrack(c.summary);
        return <PhaseBar done={track.done} totals={track.totals} names={track.names} className="w-28" />;
      },
    },
    {
      key: 'done',
      header: 'Steps',
      width: '76px',
      align: 'right',
      render: (c) => (
        <span className="tabular-nums">
          {c.summary.progress.done} / {c.summary.progress.total}
        </span>
      ),
    },
    {
      key: 'with',
      header: 'With',
      width: '88px',
      render: (c) => {
        const owner = superOwnerOf(c.summary);
        return owner ? WITH_WORD[owner] : <span className="text-ink-faint">–</span>;
      },
    },
    {
      key: 'days',
      header: 'Days',
      width: '64px',
      align: 'right',
      render: (c) => {
        const step = steps?.[c.summary.id];
        if (step?.days === null || step?.days === undefined) return <span className="text-ink-faint">–</span>;
        return (
          <span className={cn('tabular-nums', isLateRow(c, step, today) && 'font-medium text-danger')}>{step.days}</span>
        );
      },
    },
    {
      key: 'next',
      header: 'Next',
      width: '76px',
      render: (c) => {
        const next = steps?.[c.summary.id]?.dueOn ?? c.nextDueDate;
        return (
          <span className={cn('whitespace-nowrap tabular-nums', next && next < today && 'font-medium text-danger')}>
            {plainDay(next)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '124px',
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

  const loading = query.isPending;

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-4">
        <SuperNumberStrip
          items={[
            { label: 'Clients incorporating', value: loading ? '–' : all.length },
            { label: 'Waiting on client', value: loading ? '–' : count('client') },
            { label: 'With manager', value: loading ? '–' : count('manager') },
            { label: 'Stuck or overdue', value: loading ? '–' : late, bad: late > 0 },
          ]}
        />
        <DashSection
          title="Incorporation"
          meta={loading ? undefined : String(rows.length)}
          headIcon={{ icon: Landmark, tone: 'blue' }}
          right={
            <SpectrumTabs
              label="With"
              value={withWho}
              onChange={(v) => setWithWho(v as WithKey)}
              items={[
                { key: '', label: 'All', count: all.length },
                { key: 'client', label: 'Client', count: count('client') },
                { key: 'sbc', label: 'SBC', count: count('sbc') },
                { key: 'manager', label: 'Manager', count: count('manager') },
              ]}
            />
          }
          flush
          bodyClassName="px-2 pb-2"
        >
          <EFilingGrid
            caption="Clients in incorporation"
            columns={columns}
            rows={rows}
            rowKey={(c) => c.summary.id}
            rowHref={(c) => c.summary.href}
            rowClassName={(c) => (isLateRow(c, steps?.[c.summary.id], today) ? 'text-danger' : undefined)}
            loading={loading}
            empty={all.length === 0 ? 'No clients in incorporation' : 'No client matches this filter'}
            emptyAction={
              all.length === 0 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={clientsHref}>View clients</Link>
                </Button>
              ) : undefined
            }
            minWidth={960}
            pageSize={15}
          />
        </DashSection>
      </div>
    </PageTransition>
  );
}
