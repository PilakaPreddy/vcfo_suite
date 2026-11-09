'use client';

import Link from 'next/link';
import { DashHero, type DashHeroStat } from '@/components/dash/DashHero';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, Tag, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import {
  AttentionList,
  Col,
  Cols,
  DevCard,
  EnvNames,
  HeadLink,
  ListRow,
  Pending,
  ReachChip,
  ReachNotice,
  StackedBar,
  StatusChip,
  type DevAttentionRow,
} from '@/components/dev/parts';
import { useDevApi } from '@/components/dev/use-dev-api';
import { day, duration, imageVersion, money, stamp, words } from '@/lib/dev/format';
import { uptimeLow } from '@/lib/dev/health';
import type { CostGroup, EnvironmentRow, Incident, JobRun, OverviewPayload, ServiceConfig, ServiceHealth } from '@/lib/dev/types';
import { trendWithLive, useHomeTrends } from '@/hooks/use-home-trends';

/** Things a developer should act on, worst first. Built only from the real readings. */
function attention(d: OverviewPayload, today = new Date()): DevAttentionRow[] {
  const rows: DevAttentionRow[] = [];
  if (d.jobs.state === 'ok' && d.jobs.data.failedToday > 0)
    rows.push({
      id: 'jobs',
      date: today,
      tint: 'bad',
      title: `${d.jobs.data.failedToday} job runs failed today`,
      sub: 'Inngest',
      chip: { label: 'Failed', tone: 'bad' },
      urgent: true,
      action: { label: 'Open', href: '/app/dev/jobs' },
    });
  for (const name of d.secrets.missing)
    rows.push({
      id: `secret-${name}`,
      date: today,
      tint: 'bad',
      title: `${name} is not set`,
      sub: name === 'CREDENTIALS_ENCRYPTION_KEY' ? 'Credential features fail until it is set. Set the key, then redeploy.' : 'Set the value, then redeploy.',
      chip: { label: 'Missing', tone: 'bad' },
      urgent: true,
      action: { label: 'Open', href: '/app/dev/connections' },
    });
  if (d.messages.failed > 0)
    rows.push({ id: 'msg', date: today, tint: 'bad', title: `${d.messages.failed} messages failed in 24 hours`, sub: 'Email and WhatsApp', chip: { label: 'Failed', tone: 'bad' }, href: '/app/dev/messages' });
  if (d.errors24h.state === 'ok' && d.errors24h.data.errors > 0)
    rows.push({ id: 'errors', date: today, tint: 'warn', title: `${d.errors24h.data.errors} error lines in the log in 24 hours`, sub: 'CloudWatch Logs', chip: { label: 'Errors', tone: 'bad' }, href: '/app/dev/logs' });
  for (const s of d.services.filter((x) => x.status === 'partial'))
    rows.push({ id: `svc-${s.id}`, date: today, tint: 'warn', title: `${s.name} is partly set`, sub: `Missing ${s.missing.join(', ')}`, chip: { label: 'Partly set', tone: 'warn' }, href: `/app/dev/connections?c=${s.id}` });
  if (d.outlook.expiringSoon > 0)
    rows.push({
      id: 'outlook',
      date: today,
      tint: 'warn',
      title: `${d.outlook.expiringSoon} Outlook mailboxes need sign-in soon`,
      sub: 'Refresh token near its 90 days',
      chip: { label: 'Due soon', tone: 'warn' },
      href: '/app/dev/connections?c=outlook',
    });
  if (d.audit7d.denied > 0)
    rows.push({ id: 'denied', date: today, tint: 'warn', title: `${d.audit7d.denied} denied actions in 7 days`, sub: 'Audit', chip: { label: 'Denied', tone: 'bad' }, href: '/app/dev/audit' });
  if (d.secrets.demoLogins > 0)
    rows.push({
      id: 'demo',
      date: today,
      tint: 'idle',
      title: `${d.secrets.demoLogins} seeded demo logins still work`,
      sub: 'Purge them before real users sign in',
      chip: { label: 'Pre-launch', tone: 'warn' },
      href: '/app/dev/access',
    });
  return rows;
}

/** Services health columns; uptime, p95 and the last check come from the stored live checks. */
function serviceColumns(health: Map<string, ServiceHealth>): EFilingColumn<ServiceConfig>[] {
  return [
    {
      key: 'name',
      header: 'Service',
      width: '28%',
      render: (s) => (
        <span className="block min-w-[180px]">
          <span className="block truncate font-medium text-ink">{s.name}</span>
          <span className="block truncate text-[12px] text-ink-muted">
            {s.what} · {s.provider}
          </span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', width: '148px', render: (s) => <StatusChip status={s.status} /> },
    {
      key: 'up',
      header: 'Uptime, 30 days',
      width: '130px',
      align: 'right',
      render: (s) => {
        const h = health.get(s.id);
        if (!h || h.uptime === null) return <span className="text-ink-faint">-</span>;
        return <span className={uptimeLow(h.uptime) ? 'font-medium text-warning' : undefined}>{`${h.uptime}%`}</span>;
      },
    },
    {
      key: 'p95',
      header: 'p95',
      width: '100px',
      align: 'right',
      render: (s) => {
        const p = health.get(s.id)?.p95;
        return p === null || p === undefined ? <span className="text-ink-faint">-</span> : <span className="whitespace-nowrap">{`${p.toLocaleString('en-IN')} ms`}</span>;
      },
    },
    { key: 'last', header: 'Last check', width: '140px', render: (s) => stamp(health.get(s.id)?.lastCheck?.checkedAt) },
    { key: 'missing', header: 'Note', wrap: true, render: (s) => <EnvNames names={s.missing} tone={s.status === 'partial' ? 'danger' : 'muted'} /> },
  ];
}

const incidentColumns = (names: Map<string, string>): EFilingColumn<Incident>[] => [
  { key: 'at', header: 'Date', width: '140px', render: (i) => stamp(i.startedAt) },
  {
    key: 'what',
    header: 'What happened',
    render: (i) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-ink">{i.detail || 'Check failed'}</span>
        <span className="block truncate text-[12px] text-ink-muted">
          {names.get(i.service) ?? i.service} · {i.endedAt ? duration(i.startedAt, i.endedAt) : `${i.failedChecks} failed checks`}
        </span>
      </span>
    ),
  },
  { key: 'status', header: 'Status', width: '148px', render: (i) => <StatusChip status={i.endedAt ? 'ok' : 'failed'} label={i.endedAt ? 'Resolved' : 'Open'} /> },
];

const envColumns: EFilingColumn<EnvironmentRow>[] = [
  { key: 'name', header: 'Environment', width: '140px', render: (e) => <span className="font-medium text-ink">{e.name}</span> },
  { key: 'addr', header: 'Address', render: (e) => <span className="font-mono text-[12.5px]">{e.address ?? '-'}</span> },
  { key: 'ver', header: 'Version', width: '150px', render: (e) => <span className="font-mono text-[12.5px]">{e.version ?? '-'}</span> },
  { key: 'commit', header: 'Commit', width: '130px', render: (e) => <span className="font-mono text-[12.5px]">{e.commit ?? '-'}</span> },
  { key: 'at', header: 'Deployed', width: '140px', render: (e) => stamp(e.deployedAt) },
  { key: 'by', header: 'By', width: '140px', render: (e) => e.by ?? <span className="text-ink-faint">Pipeline</span> },
];

const runColumns: EFilingColumn<JobRun>[] = [
  { key: 'fn', header: 'Job', render: (r) => <span className="font-mono text-[13px]">{r.functionId ?? r.event}</span> },
  { key: 'at', header: 'Started', width: '150px', render: (r) => stamp(r.startedAt) },
  { key: 'status', header: 'Status', width: '148px', render: (r) => <StatusChip status={r.status} /> },
];

const COST_TONE: Record<CostGroup['group'], ChipTone | 'navy'> = {
  AI: 'violet',
  'App Runner': 'navy',
  Database: 'prog',
  Messaging: 'teal',
  Other: 'idle',
};

/**
 * Developer console home: the home card with six numbers, services health, what needs
 * attention, recent runs and deploys, and in the rail the connections and this month's spend.
 * Every value comes from env presence, the app's own tables or a live AWS or Inngest read; a
 * reader that is not set up shows its plain state instead of a number.
 */
export default function DevOverview() {
  const q = useDevApi<OverviewPayload>('/api/dev/overview', { refetchMs: 60_000 });
  const d = q.data;
  // R-18: the last 30 day ends, rebuilt from the message logs and the audit log.
  const trends = useHomeTrends('dev');

  const working = d ? d.services.filter((s) => s.status === 'configured').length : 0;
  // A connection is a service that is switched on, or a linked Outlook mailbox.
  const live = d ? d.services.filter((s) => s.status !== 'off') : [];
  const connTotal = d ? live.length + d.outlook.connected : 0;
  const connHealthy = d ? live.filter((s) => s.status === 'configured').length + d.outlook.healthy : 0;
  const secretsToFix = d ? d.secrets.missing.length + (d.secrets.demoLogins > 0 ? 1 : 0) : 0;

  /* Seven numbers (R-18, E-04, E-05), each opening the page behind it. Messages failed and
     Denied draw a trend line from the stored logs; the other tiles keep only their current
     state, so they draw none. */
  const stats: DashHeroStat[] = d
    ? [
        {
          label: 'Services working',
          value: working,
          of: `/ ${d.services.length}`,
          href: '/app/dev/connections',
          note: d.services.length - working > 0 ? `${d.services.length - working} not set` : undefined,
          how: 'Services whose settings are all present, over every service the app uses.',
        },
        {
          label: 'Connections healthy',
          value: connHealthy,
          of: `/ ${connTotal}`,
          href: '/app/dev/connections',
          note: d.outlook.expiringSoon ? `${d.outlook.expiringSoon} Outlook due soon` : undefined,
          how: 'Switched-on services with every setting present, and linked Outlook mailboxes whose sign-in is fresh.',
        },
        {
          label: 'Jobs failed today',
          value: d.jobs.state === 'ok' ? d.jobs.data.failedToday : '-',
          hot: d.jobs.state === 'ok' && d.jobs.data.failedToday > 0,
          note: d.jobs.state === 'not_set_up' ? 'Not set up' : d.jobs.state === 'unreachable' ? 'Unreachable' : undefined,
          href: '/app/dev/jobs',
          how: 'Inngest job runs that ended in failure since midnight.',
        },
        {
          // Short enough for the tile; the 24-hour window moves into the note.
          label: 'Failed messages',
          value: d.messages.failed,
          hot: d.messages.failed > 0,
          note: `${d.messages.sent} sent · 24 hours`,
          trend: trendWithLive(trends, 'messagesFailed', d.messages.failed),
          trendTone: 'bad',
          href: '/app/dev/messages',
          how: 'Email and WhatsApp messages that failed in the last 24 hours.',
        },
        {
          label: 'Secrets to fix',
          value: secretsToFix,
          hot: secretsToFix > 0,
          note: d.secrets.demoLogins > 0 ? 'Demo logins on' : undefined,
          href: d.secrets.missing.length ? '/app/dev/connections' : '/app/dev/access',
          how: 'Secrets the app needs that are not set, plus one when seeded demo logins can still sign in. Expiry dates are not stored.',
        },
        {
          label: 'Errors, 24 hours',
          value: d.errors24h.state === 'ok' ? `${d.errors24h.data.errors}${d.errors24h.data.capped ? '+' : ''}` : '-',
          hot: d.errors24h.state === 'ok' && d.errors24h.data.errors > 0,
          note:
            d.errors24h.state === 'ok'
              ? `of ${d.errors24h.data.lines}${d.errors24h.data.capped ? '+' : ''} lines`
              : d.errors24h.state === 'not_set_up'
                ? 'Not set up'
                : 'Unreachable',
          href: '/app/dev/logs',
          how: 'Error lines in the app log in the last 24 hours, from CloudWatch. The app keeps no request count, so this is not a rate.',
        },
        {
          label: 'Denied, 7 days',
          value: d.audit7d.denied,
          hot: d.audit7d.denied > 0,
          note: `${d.audit7d.failed} failed`,
          trend: trendWithLive(trends, 'denied', d.audit7d.denied),
          trendTone: 'bad',
          href: '/app/dev/audit',
          how: 'Actions the access checks refused in the last seven days, from the audit log.',
        },
      ]
    : [];

  const rows = d ? attention(d) : [];
  const version = d && d.deploy.state === 'ok' ? imageVersion(d.deploy.data.image) : null;
  const conns = [...live].sort((a, b) => Number(a.status === 'configured') - Number(b.status === 'configured'));
  const health = new Map((d?.health ?? []).map((h) => [h.service, h]));
  const names = new Map((d?.services ?? []).map((s) => [s.id as string, s.name]));
  const checked = (d?.health ?? []).some((h) => h.checks > 0);

  return (
    <div className="grid grid-cols-1 gap-5">
      <DashHero
        title="Developer console"
        meta={
          d && d.deploy.state === 'ok' ? (
            <Chip tone={d.deploy.data.status === 'RUNNING' ? 'ok' : 'warn'}>
              {d.deploy.data.status === 'RUNNING' ? `Production${version ? ` ${version}` : ''}` : words(d.deploy.data.status)}
            </Chip>
          ) : null
        }
        subtitle={
          d ? (
            <Link href="/app/dev/access" className="hover:underline">
              {d.staffSignedIn} staff signed in
            </Link>
          ) : undefined
        }
        stats={stats}
      />
      {!d ? (
        <DevCard title="Services health">
          <Pending error={q.error} />
        </DevCard>
      ) : (
        <>
          <DevCard title="Services health" meta={`${working} of ${d.services.length} working · last 30 days`}>
            <div className="px-2 pb-2">
              <EFilingGrid columns={serviceColumns(health)} rows={d.services} rowKey={(s) => s.id} pageSize={20} minWidth={640} caption="Services" stickyFirstColumn stickyHead />
            </div>
          </DevCard>
          <Cols>
            <Col>
              <DevCard title="Needs attention" meta={rows.length ? `${rows.length}` : undefined}>
                <AttentionList rows={rows} />
              </DevCard>
              <DevCard title="Incidents" meta="Last 30 days" right={<HeadLink href="/app/dev/logs">Logs ›</HeadLink>}>
                <div className="px-2 pb-2">
                  <EFilingGrid
                    columns={incidentColumns(names)}
                    rows={d.incidents ?? []}
                    rowKey={(i) => i.id}
                    minWidth={520}
                    empty={checked ? 'No failed checks in 30 days' : 'No checks yet. Run Test on Connections.'}
                    stickyFirstColumn
                  />
                </div>
              </DevCard>
              <DevCard title="Recent job runs" right={<ReachChip reach={d.jobs} />}>
                {d.jobs.state === 'ok' ? (
                  <div className="px-2 pb-2">
                    <EFilingGrid columns={runColumns} rows={d.jobs.data.lastRuns} rowKey={(r) => r.id} minWidth={420} empty="No runs today" stickyFirstColumn />
                  </div>
                ) : (
                  <ReachNotice reach={d.jobs} service="Inngest" />
                )}
              </DevCard>
              <DevCard title="Recent deploys" right={<HeadLink href="/app/dev/deploys">Deploys ›</HeadLink>}>
                {d.deploy.state === 'ok' ? (
                  d.deploy.data.recent.length ? (
                    d.deploy.data.recent.map((o) => (
                      <ListRow key={o.id} href="/app/dev/deploys">
                        <span className="w-[150px] flex-none truncate font-medium text-ink">{words(o.type)}</span>
                        <Tag tone="prog" className="hidden w-[104px] sm:inline-flex">
                          Production
                        </Tag>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{stamp(o.startedAt)}</span>
                        <StatusChip status={o.status} />
                      </ListRow>
                    ))
                  ) : (
                    <div className="p-4">
                      <EmptyState title="No operations yet" />
                    </div>
                  )
                ) : (
                  <ReachNotice reach={d.deploy} service="App Runner" />
                )}
              </DevCard>
            </Col>
            <Col>
              <DevCard title="Connections" meta={`${connHealthy} of ${connTotal} healthy`} right={<HeadLink href="/app/dev/connections">All ›</HeadLink>}>
                {conns.map((s) => (
                  <ListRow key={s.id} href={`/app/dev/connections?c=${s.id}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{s.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">
                        {s.kind} · {s.provider}
                      </span>
                    </span>
                    <StatusChip status={s.status} />
                  </ListRow>
                ))}
                <ListRow href="/app/dev/connections?c=outlook">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">Outlook mailboxes</span>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {d.outlook.connected} linked{d.outlook.expiringSoon ? ` · ${d.outlook.expiringSoon} due soon` : ''}
                    </span>
                  </span>
                  <StatusChip status={d.outlook.expiringSoon ? 'due soon' : d.outlook.connected ? 'connected' : 'off'} label={d.outlook.expiringSoon ? 'Due soon' : d.outlook.connected ? 'Connected' : 'None linked'} />
                </ListRow>
              </DevCard>
              <DevCard title="Costs this month" meta={d.costsMonth.state === 'ok' ? `${day(d.costsMonth.data.start)} to ${day(d.costsMonth.data.end)}` : undefined}>
                {d.costsMonth.state === 'ok' ? (
                  d.costsMonth.data.total > 0 ? (
                    <StackedBar
                      total={money(d.costsMonth.data.total, d.costsMonth.data.currency)}
                      segments={d.costsMonth.data.groups.map((g) => ({ label: g.group, value: g.amount, tone: COST_TONE[g.group] }))}
                      format={(n) => money(n, d.costsMonth.state === 'ok' ? d.costsMonth.data.currency : 'USD')}
                    />
                  ) : (
                    <div className="p-4">
                      <EmptyState title="No spend this month yet" />
                    </div>
                  )
                ) : (
                  <ReachNotice reach={d.costsMonth} service="Cost Explorer" />
                )}
              </DevCard>
            </Col>
          </Cols>
          <DevCard title="Environments">
            {d.environment?.state === 'ok' ? (
              <div className="px-2 pb-2">
                <EFilingGrid columns={envColumns} rows={[d.environment.data]} rowKey={(e) => e.name} minWidth={820} stickyFirstColumn />
              </div>
            ) : d.environment ? (
              <ReachNotice reach={d.environment} service="App Runner" />
            ) : (
              <Pending />
            )}
          </DevCard>
        </>
      )}
    </div>
  );
}
