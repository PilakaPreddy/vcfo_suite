'use client';

import Link from 'next/link';
import { Award, IdCard, ShieldCheck } from 'lucide-react';
import { indexPeople, usePeopleMetrics } from '@/components/metrics/use-metrics';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Tag } from '@/components/ui/spectrum-chip';
import {
  NameCell,
  PersonAvatar,
  StackedBar,
  ToneBar,
} from '@/components/super/parts/super-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import {
  buildRisks,
  capacityTone,
  isFiled,
  filingOutcome,
  inRegistrations,
  registrationCounts,
  riskAgeLabel,
  SUPER_RISK_LABEL,
  type SuperInsights,
  type SuperRiskKind,
  type SuperTeamManager,
} from '@/lib/super/super-insights-model';
import { cn } from '@/lib/utils';

/**
 * The Overview's practice row and its insight panels (prototype `OverviewScreen`): the three
 * practice cards (Incorporation, Registrations, Compliances this month), the Managers grid and
 * Top risks. Every number is read from `/api/super/insights`; each card opens its full page.
 */

const PRACTICE_INCORPORATION_HREF = '/app/super/practice/incorporation';
const PRACTICE_REGISTRATIONS_HREF = '/app/super/practice/registrations';
const COMPLIANCE_CALENDAR_HREF = '/app/admin/compliances/calendar';
const TEAM_HREF = '/app/super/team';
const RISKS_HREF = '/app/super/risks';

export function SuperPracticeCards({ insights }: { insights: SuperInsights }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
      <IncorporationCard insights={insights} />
      <RegistrationsCard insights={insights} />
      <CompliancesCard insights={insights} />
    </div>
  );
}

function IncorporationCard({ insights }: { insights: SuperInsights }) {
  const incorporating = insights.clients.filter((c) => !c.summary.incorporated);
  const phases = insights.clients[0]?.summary.phases ?? [];
  const rows = phases.map((phase, index) => ({
    id: phase.id,
    label: phase.label,
    list: incorporating.filter((c) => c.summary.phases.findIndex((p) => p.done < p.total) === index),
  }));
  const max = Math.max(1, ...rows.map((r) => r.list.length));
  const coi = insights.clients.flatMap((c) => (c.daysToCoi === null ? [] : [c.daysToCoi]));
  const avg = coi.length ? Math.round(coi.reduce((a, b) => a + b, 0) / coi.length) : null;

  return (
    <DashSection title="Incorporation" meta={String(incorporating.length)} icon={Award} tone="violet" href={PRACTICE_INCORPORATION_HREF} hrefLabel="Open">
      <ul className="grid gap-2.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className="grid grid-cols-[100px_1fr_24px] items-center gap-2 text-[13px]"
            title={row.list.map((c) => c.summary.companyName).join(', ') || 'None'}
          >
            <span className="truncate text-ink-2">{row.label}</span>
            <ToneBar pct={(row.list.length / max) * 100} tone="prog" />
            <b className="text-right font-medium tabular-nums">{row.list.length}</b>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] text-ink-muted">
        {avg === null ? (
          'No certificate recorded yet'
        ) : (
          <>
            Average <b className="font-medium text-ink">{avg} days</b> to COI
          </>
        )}
      </p>
    </DashSection>
  );
}

function RegistrationsCard({ insights }: { insights: SuperInsights }) {
  const reached = insights.clients.filter(inRegistrations);
  const counts = registrationCounts({ ...insights, clients: reached });
  const sum = (k: 'done' | 'progress' | 'waiting' | 'overdue') => counts.reduce((a, c) => a + c[k], 0);
  const top = [...counts]
    .map((c) => ({ ...c, open: c.progress + c.waiting + c.overdue }))
    .filter((c) => c.open > 0)
    .sort((a, b) => b.open - a.open)
    .slice(0, 4);
  const worst = [...counts].sort((a, b) => b.waiting - a.waiting)[0];

  return (
    <DashSection title="Registrations" meta={String(reached.length)} icon={IdCard} tone="violet" href={PRACTICE_REGISTRATIONS_HREF} hrefLabel="Open">
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: sum('done'), label: 'Done', cls: 'text-positive' },
          { n: sum('progress'), label: 'In progress', cls: 'text-brand-text' },
          { n: sum('waiting'), label: 'Waiting', cls: 'text-waiting' },
        ].map((x) => (
          <div key={x.label}>
            <b className={cn('block text-[26px] font-medium leading-none tabular-nums', x.cls)}>{x.n}</b>
            <span className="text-[12px] text-ink-muted">{x.label}</span>
          </div>
        ))}
      </div>
      {top.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {top.map((x) => (
            <li
              key={x.id}
              className="grid grid-cols-[96px_1fr_24px] items-center gap-2 text-[13px]"
              title={`${x.title}: ${x.done} done, ${x.progress} in progress, ${x.waiting} waiting, ${x.overdue} overdue`}
            >
              <span className="truncate text-ink-2">{x.title}</span>
              <StackedBar
                height={6}
                legend={false}
                segments={[
                  { label: 'Done', value: x.done, tone: 'ok' },
                  { label: 'In progress', value: x.progress, tone: 'prog' },
                  { label: 'Waiting', value: x.waiting, tone: 'teal' },
                  { label: 'Overdue', value: x.overdue, tone: 'bad' },
                ]}
              />
              <b className="text-right font-medium tabular-nums">{x.open}</b>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] text-ink-muted">
        Most waiting: <b className="font-medium text-ink">{worst && worst.waiting > 0 ? worst.title : 'None'}</b>
      </p>
    </DashSection>
  );
}

function CompliancesCard({ insights }: { insights: SuperInsights }) {
  const month = insights.months[insights.months.length - 1];
  const title = `Compliances · ${month?.longLabel.split(' ')[0] ?? 'this month'}`;
  const byAuthority = new Map<string, number>();
  const monthKey = month?.key ?? '';
  const today = insights.generatedAt.slice(0, 10);
  for (const f of insights.filings) {
    if (!f.dueDate.startsWith(monthKey)) continue;
    if (filingOutcome(f, today) === 'overdue') byAuthority.set(f.authority, (byAuthority.get(f.authority) ?? 0) + 1);
  }
  const worst = [...byAuthority.entries()].sort((a, b) => b[1] - a[1])[0];
  // "Due this week": this month's filings still to file and due in the next 7 days.
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const dueWeek = insights.filings.filter(
    (f) => f.dueDate.startsWith(monthKey) && !isFiled(f) && f.dueDate >= today && f.dueDate <= weekEnd,
  ).length;
  const stillToFile = Math.max(0, (month?.open ?? 0) - dueWeek);

  return (
    <DashSection title={title} icon={ShieldCheck} tone="success" href={COMPLIANCE_CALENDAR_HREF} hrefLabel="Open">
      <b className="mb-2 block text-[26px] font-medium leading-none tabular-nums text-ink">{month?.filingsDue ?? 0}</b>
      <StackedBar
        segments={[
          { label: 'Overdue', value: month?.overdue ?? 0, tone: 'bad' },
          { label: 'Filed late', value: month?.filedLate ?? 0, tone: 'warn' },
          { label: 'Due this week', value: dueWeek, tone: 'prog' },
          { label: 'Upcoming', value: stillToFile, tone: 'idle' },
          { label: 'Filed on time', value: month?.filedOnTime ?? 0, tone: 'ok' },
        ]}
      />
      <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] text-ink-muted">
        Most overdue: <b className="font-medium text-ink">{worst ? worst[0] : 'None'}</b>
      </p>
    </DashSection>
  );
}

function clientsTone(m: SuperTeamManager) {
  if (m.overdueSteps > 0 || m.overdueFilings > 0) return 'bad' as const;
  if (m.approvalsPending > 0 || m.attention > 0) return 'warn' as const;
  return 'prog' as const;
}

/** Managers with their load, as on the Team page. */
export function SuperManagersPanel({
  insights,
  adminOf,
}: {
  insights: SuperInsights;
  /** The admin a manager reports to, for the "under <admin>" line. */
  adminOf?: (managerId: string) => string | null;
}) {
  const managers = insights.team.managers;
  const people = indexPeople(usePeopleMetrics().data).byProfileId;
  const max = Math.max(1, ...managers.map((m) => m.clients));
  const columns: EFilingColumn<SuperTeamManager>[] = [
    {
      key: 'name',
      header: 'Manager',
      render: (m) => {
        const admin = adminOf?.(m.id);
        return <NameCell lead={<PersonAvatar name={m.name} />} title={m.name} sub={admin ? `under ${admin}` : `${m.leads.length} project leads`} />;
      },
    },
    { key: 'clients', header: 'Clients', width: '72px', align: 'right', render: (m) => <span className="tabular-nums">{m.clients}</span> },
    { key: 'open', header: 'Open', width: '64px', align: 'right', render: (m) => <span className="tabular-nums">{m.openSteps}</span> },
    {
      key: 'late',
      header: 'Overdue',
      width: '80px',
      align: 'right',
      render: (m) => (
        <span className={cn('tabular-nums', m.overdueSteps + m.overdueFilings > 0 ? 'font-medium text-danger' : 'text-ink-faint')}>
          {m.overdueSteps + m.overdueFilings}
        </span>
      ),
    },
    {
      key: 'ontime',
      header: 'On time',
      width: '80px',
      align: 'right',
      render: (m) => {
        const filed = m.filedOnTime + m.filedLate;
        return <span className="tabular-nums">{filed ? `${Math.round((m.filedOnTime / filed) * 100)}%` : '–'}</span>;
      },
    },
    {
      key: 'load',
      header: 'Load',
      width: '110px',
      // Against the capacity an admin set (red over 80%, amber from 70%); else relative to the busiest manager.
      render: (m) => {
        const load = people.get(m.id)?.load;
        return load?.pct != null ? (
          <ToneBar pct={load.pct} tone={capacityTone(load.pct)} className="w-20" label={`${load.open} of ${load.capacity}`} />
        ) : (
          <ToneBar pct={(m.clients / max) * 100} tone={clientsTone(m)} className="w-20" />
        );
      },
    },
  ];
  return (
    <DashSection title="Managers" meta={String(managers.length)} href={TEAM_HREF} hrefLabel="Open team" bodyClassName="px-2 pb-2 pt-1">
      <EFilingGrid caption="Managers" columns={columns} rows={managers} rowKey={(m) => m.id} empty="No manager yet" minWidth={600} pageSize={6} />
    </DashSection>
  );
}

const KIND_TONE: Record<SuperRiskKind, 'bad' | 'warn' | 'violet'> = {
  step: 'bad',
  filing: 'bad',
  stuck: 'warn',
  owner: 'violet',
  lead: 'violet',
};

/** The five most severe risks. */
export function SuperTopRisks({ insights }: { insights: SuperInsights }) {
  const risks = buildRisks(insights, new Date());
  return (
    <DashSection title="Top risks" meta={String(risks.length)} href={RISKS_HREF} hrefLabel="All risks" bodyClassName="p-0">
      {risks.length === 0 ? (
        <p className="px-4 py-4 text-center text-[13px] text-ink-muted">None</p>
      ) : (
        <ul>
          {risks.slice(0, 5).map((r) => (
            <li key={r.id} className="border-t border-line-soft first:border-t-0">
              <Link href={r.href} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-surface-sunken/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {r.title} · {shortCompany(r.companyName)}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {r.managerName ?? 'No manager'}
                    {r.ageDays !== null ? ` · ${riskAgeLabel(r.ageDays)}` : ''}
                  </span>
                </span>
                <Tag tone={KIND_TONE[r.kind]} className="w-[104px] flex-none">
                  {SUPER_RISK_LABEL[r.kind]}
                </Tag>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
