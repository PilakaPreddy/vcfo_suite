'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Tag, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { RemindClientButton } from '@/components/reminders/RemindClientButton';
import { ClientTile, SuperPageError } from '@/components/super/parts/super-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { AssignClientDialog } from '@/components/super/assign/AssignClientDialog';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import {
  buildRisks,
  riskAgeLabel,
  SUPER_RISK_LABEL,
  type SuperRisk,
  type SuperRiskKind,
} from '@/components/super/insights/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { superEngagementHref } from '@/lib/super/super-overview';
import { cn } from '@/lib/utils';

/**
 * RISKS (prototype `RisksScreen`).
 *
 * Built only from stored states and dates: steps marked overdue, filings past their due date
 * and not filed, clients with open work and no move for `SUPER_STUCK_DAYS` days (or blocked),
 * and clients with nobody assigned. Each row opens the client or the step behind it. An
 * overdue step or filing has the one-click Remind to the client (G-15); when the reminder
 * cannot go out, the row's record opens instead so the super admin can follow up. A client
 * with no manager or no project lead gets Assign, which opens the assign dialog on that
 * client; once saved, the risk leaves the list because the next read no longer finds it.
 * A stuck client gets Open. The client name under each title links to the record.
 */
const SUPER_RISKS_HREF = '/app/super/risks';

const KINDS: SuperRiskKind[] = ['step', 'filing', 'stuck', 'owner', 'lead'];

const KIND_TONE: Record<SuperRiskKind, ChipTone> = {
  step: 'bad',
  filing: 'bad',
  stuck: 'warn',
  owner: 'violet',
  lead: 'violet',
};

function SeverityBars({ severity }: { severity: 1 | 2 | 3 }) {
  return (
    <span className="flex flex-none gap-0.5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <i key={i} className={cn('h-3 w-1.5 rounded-[1px]', i <= severity ? 'bg-danger-mid' : 'bg-line')} />
      ))}
    </span>
  );
}

/** Risks the client can act on: an overdue step or filing. The risk id is the item key. */
function remindKeyOf(risk: SuperRisk): string | null {
  return risk.kind === 'step' || risk.kind === 'filing' ? risk.id : null;
}

export default function SuperRisks() {
  const router = useRouter();
  const query = useSuperInsights();
  const insights = query.data;
  const staff = useSuperStaff();
  const [kind, setKind] = useState('all');
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const risks = useMemo(() => (insights ? buildRisks(insights, new Date()) : []), [insights]);

  const seo = <SEO title="Risks — VCFO Suite" description="Overdue steps, overdue filings and stuck clients." path={SUPER_RISKS_HREF} />;

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <DashSection title="Risks" bodyClassName="px-2 pb-2 pt-3">
          <SkeletonRows rows={8} className="p-2" />
        </DashSection>
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Risks could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const rows = risks.filter((r) => kind === 'all' || r.kind === kind);

  const columns: EFilingColumn<SuperRisk>[] = [
    {
      key: 'kind',
      header: 'Kind',
      width: '132px',
      render: (r) => (
        <Tag tone={KIND_TONE[r.kind]} className="w-[112px]">
          {SUPER_RISK_LABEL[r.kind]}
        </Tag>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ClientTile id={r.engagementId} name={r.companyName} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{r.title}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted" title={`Severity ${r.severity} of 3`}>
              <SeverityBars severity={r.severity} />
              <Link href={superEngagementHref(r.engagementId)} className="truncate hover:underline">
                {shortCompany(r.companyName)}
              </Link>
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      width: '180px',
      render: (r) => (
        <span className="block min-w-0">
          <span className="block truncate">{r.managerName ?? 'No manager'}</span>
          <span className="block truncate text-[12px] text-ink-muted">{staff.adminNameOf(r.managerId) ?? 'No admin'}</span>
        </span>
      ),
    },
    { key: 'age', header: 'Age', width: '90px', align: 'right', render: (r) => <span className="whitespace-nowrap tabular-nums">{riskAgeLabel(r.ageDays)}</span> },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      width: '110px',
      align: 'right',
      // One action per row, as in the prototype: Remind, Assign or Open.
      render: (r) => {
        const key = remindKeyOf(r);
        if (key) {
          return (
            <RemindClientButton
              engagementId={r.engagementId}
              itemKey={key}
              title={r.title}
              className="w-[84px]"
              onFailed={() => router.push(r.href)}
            />
          );
        }
        if (r.kind === 'owner' || r.kind === 'lead') {
          return (
            <Button size="sm" variant="outline" className="w-[84px]" onClick={() => setAssignFor(r.engagementId)}>
              Assign
            </Button>
          );
        }
        return (
          <Button asChild size="sm" variant="outline" className="w-[84px]">
            <Link href={r.href}>Open</Link>
          </Button>
        );
      },
    },
  ];

  return (
    <PageTransition>
      {seo}
      {/* R-09: no page title over the card; the kind tabs sit in the card head (R-08). */}
      <DashSection
        title="Risks"
        meta={
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tabular-nums">{rows.length}</span>
            <SpectrumTabs
              label="Kind"
              items={[
                { key: 'all', label: 'All', count: risks.length },
                ...KINDS.map((k) => ({ key: k, label: SUPER_RISK_LABEL[k], count: risks.filter((r) => r.kind === k).length })),
              ]}
              value={kind}
              onChange={setKind}
            />
          </span>
        }
        bodyClassName="px-2 pb-2 pt-1"
      >
        <EFilingGrid caption="Risks" columns={columns} rows={rows} rowKey={(r) => r.id} empty="No risk of this kind" minWidth={820} pageSize={10} />
      </DashSection>
      <AssignClientDialog
        open={assignFor !== null}
        onOpenChange={(open) => !open && setAssignFor(null)}
        engagementId={assignFor ?? undefined}
        engagements={insights.clients.map((c) => c.summary)}
        staff={staff}
      />
    </PageTransition>
  );
}
