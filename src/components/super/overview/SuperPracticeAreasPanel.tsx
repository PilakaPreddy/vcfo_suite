'use client';

import { useRouter } from 'next/navigation';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import {
  buildPracticeAreas,
  type SuperAreaHealth,
  type SuperInsights,
  type SuperPracticeArea,
} from '@/lib/super/super-insights-model';
import { cn } from '@/lib/utils';

/**
 * "Practice areas" on the super Overview (prototype `areaCols`): one row per area with its
 * active clients, what finished this month, what is overdue, a health chip and the manager who
 * holds most of the area. Every number comes from the insights read; each row opens the area.
 */

const AREA_HREFS: Record<SuperPracticeArea['area'], string> = {
  Incorporation: '/app/super/practice/incorporation',
  Registrations: '/app/super/practice/registrations',
  Compliances: '/app/super/practice/compliances',
};

const HEALTH_TONE: Record<SuperAreaHealth, ChipTone> = { 'On track': 'ok', Watch: 'warn', 'At risk': 'bad' };

export function SuperPracticeAreasPanel({ insights }: { insights: SuperInsights }) {
  const router = useRouter();
  const rows = buildPracticeAreas(insights, AREA_HREFS, new Date());

  const columns: EFilingColumn<SuperPracticeArea>[] = [
    { key: 'area', header: 'Area', render: (r) => <span className="font-medium text-ink">{r.area}</span> },
    { key: 'active', header: 'Active clients', width: '120px', align: 'right', render: (r) => <span className="tabular-nums">{r.active}</span> },
    {
      key: 'done',
      header: 'Done this month',
      width: '134px',
      align: 'right',
      render: (r) =>
        r.doneThisMonth === null ? (
          <span className="text-ink-faint" title="Registration items store no finish date">–</span>
        ) : (
          <span className="tabular-nums">{r.doneThisMonth}</span>
        ),
    },
    {
      key: 'overdue',
      header: 'Overdue',
      width: '84px',
      align: 'right',
      render: (r) => <span className={cn('tabular-nums', r.overdue > 0 && 'font-medium text-danger')}>{r.overdue}</span>,
    },
    {
      key: 'health',
      header: 'Health',
      width: '170px',
      render: (r) => (
        <Chip fixed tone={HEALTH_TONE[r.health]}>
          {r.health}
        </Chip>
      ),
    },
    { key: 'lead', header: 'Lead manager', width: '110px', render: (r) => <span className="truncate">{r.leadManager ?? '–'}</span> },
  ];

  return (
    <DashSection title="Practice areas" flush>
      <EFilingGrid
        caption="Practice areas"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.area}
        onRowClick={(r) => router.push(r.href)}
        minWidth={720}
      />
    </DashSection>
  );
}
