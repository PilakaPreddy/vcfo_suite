'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ListPlus, UserCog, UserPlus } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { Button } from '@/components/ui/button';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import { AssignClientDialog } from '@/components/super/assign/AssignClientDialog';
import { AssignTaskDialog } from '@/components/super/assign/AssignTaskDialog';
import { useEscalations } from '@/components/super/escalations/use-escalations';
import { SuperCapacityCard } from '@/components/super/overview/SuperCapacityCard';
import { SuperReassignCard } from '@/components/super/overview/SuperReassignCard';
import { medianResponse } from '@/components/super/insights/super-insights-model';
import {
  NameCell,
  PersonAvatar,
  SuperNumberStrip,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { plainDay } from '@/components/super/parts/super-text';
import { formatSuperAgo } from '@/components/super/overview/super-overview-format';
import type { SuperTeamLead, SuperTeamManager } from '@/components/super/insights/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { CapacityControl, LoadCell, OnTimeCell } from '@/components/metrics/people-cells';
import { indexPeople, usePeopleMetrics } from '@/components/metrics/use-metrics';
import type { PersonMetrics } from '@/lib/metrics/practice-metrics';
import { cn } from '@/lib/utils';

/**
 * TEAM (prototype `TeamScreen`).
 *
 * Managers with the project leads who report to them, and the load on each: clients (primary
 * and co-assigned through the engagement memberships), open steps, overdue steps, approvals
 * waiting and overdue filings. On time, Load (open items against capacity), Last active
 * (`profiles.last_seen_at`, else the newest audit row the person wrote) and the capacity editor
 * come from `/api/metrics/people` (G-14). The admins grid adds this month's assignments,
 * reassignments and accepted reviews (insights) and the escalations sent to each admin. The
 * Capacity card bands each manager's load against the capacity an admin set. Assign client and
 * Assign task open the same dialogs as the Overview. People are managed on the admin People page.
 */
const SUPER_TEAM_HREF = '/app/super/team';

const PEOPLE_HREF = '/app/admin/people';


/** Last signed-in request (`profiles.last_seen_at`, G-14), else the newest audit row they wrote. */
function lastActive(person: PersonMetrics | undefined, auditIso: string | null): string {
  const iso = person?.lastSeenAt ?? auditIso;
  return iso ? formatSuperAgo(iso) : 'No activity';
}

type StaffRow = (SuperTeamLead & { kind: 'lead'; reportsTo: string }) | (SuperTeamManager & { kind: 'manager' });

/** One firm admin with the managers who report to them (`profiles.reports_to_admin_id`, G-20). */
type AdminRow = {
  id: string;
  name: string;
  email: string;
  managers: string[];
  clients: number;
  actions30d: number | null;
  lastActiveAt: string | null;
  /** This calendar month, from the audit rows and the step reviews (insights). */
  assigned: number;
  reassigned: number;
  approvals: number;
  /** Escalations sent to this admin: resolved this month, still open, and the median time to resolve this month. */
  resolved: number;
  open: number;
  response: string;
};

export default function SuperTeam() {
  const query = useSuperInsights();
  const insights = query.data;
  const [tab, setTab] = useState('managers');
  // On time over the last 12 months, load against capacity, last seen and capacity (G-14).
  const peopleQuery = usePeopleMetrics();
  const people = useMemo(() => indexPeople(peopleQuery.data), [peopleQuery.data]);
  // C-0121: the managers of each admin, shown as stacked faces (V3).
  const staff = useSuperStaff();
  const escalations = useEscalations({ status: 'all' });
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const adminRows = useMemo<AdminRow[]>(() => {
    if (!insights) return [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const escRows = escalations.data ?? [];
    return staff.firmAdmins
      .filter((a) => a.role === 'admin')
      .map((a) => {
        const managers = staff.managers.filter((m) => staff.adminOfManager.get(m.id)?.id === a.id);
        const ids = new Set(managers.map((m) => m.id));
        const audit = insights.team.admins.find((x) => x.id === a.id);
        return {
          id: a.id,
          name: a.name,
          email: a.email,
          managers: managers.map((m) => m.name),
          clients: insights.clients.filter((c) => c.managerIds.some((id) => ids.has(id))).length,
          actions30d: audit?.actions30d ?? null,
          lastActiveAt: audit?.lastActiveAt ?? null,
          assigned: audit?.assignedMonth ?? 0,
          reassigned: audit?.reassignedMonth ?? 0,
          approvals: audit?.approvalsMonth ?? 0,
          ...escalationCounts(escRows.filter((e) => e.assignedToId === a.id), monthStart),
        };
      });
  }, [insights, staff, escalations.data]);

  const leads = useMemo(() => {
    if (!insights) return [];
    return [
      ...insights.team.managers.flatMap((m) => m.leads.map((l) => ({ ...l, kind: 'lead' as const, reportsTo: m.name }))),
      ...insights.team.unassignedLeads.map((l) => ({ ...l, kind: 'lead' as const, reportsTo: 'No manager' })),
    ];
  }, [insights]);

  const seo = <SEO title="Team — VCFO Suite" description="Managers, their project leads and the load on each." path={SUPER_TEAM_HREF} />;

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading the team" />
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="The team could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const { managers, admins } = insights.team;
  const overdueAll = managers.reduce((sum, m) => sum + m.overdueSteps, 0);
  const unassignedClients = insights.clients.filter((c) => c.managerIds.length === 0).length;

  const managerColumns: EFilingColumn<SuperTeamManager>[] = [
    {
      key: 'name',
      header: 'Manager',
      width: '24%',
      render: (m) => (
        <NameCell lead={<PersonAvatar name={m.name} />} title={m.name} sub={`${m.leads.length} project leads`} />
      ),
    },
    {
      key: 'admin',
      header: 'Admin',
      width: '120px',
      render: (m) => {
        const name = staff.adminOfManager.get(m.id)?.name;
        return name ? <span className="block truncate">{name}</span> : <span className="text-ink-faint">–</span>;
      },
    },
    { key: 'clients', header: 'Clients', width: '76px', align: 'right', render: (m) => <span className="tabular-nums">{m.clients}</span> },
    { key: 'open', header: 'Open', width: '70px', align: 'right', render: (m) => <span className="tabular-nums">{m.openSteps}</span> },
    {
      key: 'late',
      header: 'Overdue',
      width: '84px',
      align: 'right',
      render: (m) => (
        <span className={cn('tabular-nums', m.overdueSteps + m.overdueFilings > 0 ? 'font-medium text-danger' : 'text-ink-faint')}>
          {m.overdueSteps + m.overdueFilings}
        </span>
      ),
    },
    { key: 'approvals', header: 'Approvals', width: '92px', align: 'right', render: (m) => <span className="tabular-nums">{m.approvalsPending}</span> },
    { key: 'ontime', header: 'On time', width: '80px', align: 'right', render: (m) => <OnTimeCell person={people.byProfileId.get(m.id)} /> },
    {
      key: 'coi',
      header: 'Days to COI',
      width: '104px',
      align: 'right',
      // Amber over 35 days (prototype).
      render: (m) => (
        <span className={cn('tabular-nums', m.avgDaysToCoi !== null && m.avgDaysToCoi > 35 && 'font-medium text-warning')}>
          {m.avgDaysToCoi === null ? '–' : `${m.avgDaysToCoi} ${m.avgDaysToCoi === 1 ? 'day' : 'days'}`}
        </span>
      ),
    },
    { key: 'load', header: 'Load', width: '150px', render: (m) => <LoadCell person={people.byProfileId.get(m.id)} /> },
    { key: 'seen', header: 'Last active', width: '104px', render: (m) => lastActive(people.byProfileId.get(m.id), m.lastActiveAt) },
    {
      key: 'capacity',
      header: 'Capacity',
      width: '96px',
      render: (m) => {
        const person = people.byProfileId.get(m.id);
        return person ? <CapacityControl person={person} /> : null;
      },
    },
  ];

  const staffColumns: EFilingColumn<StaffRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '26%',
      render: (s) => (
        <NameCell
          lead={<PersonAvatar name={s.name} />}
          title={s.name}
          sub={s.kind === 'lead' ? `Reports to ${s.reportsTo}` : s.email}
        />
      ),
    },
    { key: 'role', header: 'Role', width: '120px', render: (s) => (s.kind === 'lead' ? 'Project lead' : 'Manager') },
    { key: 'clients', header: 'Clients', width: '76px', align: 'right', render: (s) => <span className="tabular-nums">{s.clients}</span> },
    { key: 'open', header: 'Open steps', width: '96px', align: 'right', render: (s) => <span className="tabular-nums">{s.openSteps}</span> },
    {
      key: 'overdue',
      header: 'Overdue',
      width: '84px',
      align: 'right',
      render: (s) => (
        <span className={cn('tabular-nums', s.overdueSteps > 0 ? 'font-medium text-danger' : 'text-ink-faint')}>{s.overdueSteps}</span>
      ),
    },
    {
      key: 'status',
      header: 'Account',
      width: '120px',
      render: (s) => (
        <Chip fixed tone={s.status === 'active' ? 'ok' : 'idle'}>
          {s.status === 'active' ? 'Active' : s.status.charAt(0).toUpperCase() + s.status.slice(1)}
        </Chip>
      ),
    },
    {
      key: 'load',
      header: 'Load',
      width: '150px',
      render: (s) => <LoadCell person={people.byProfileId.get(s.id)} />,
    },
    { key: 'last', header: 'Last active', width: '110px', render: (s) => lastActive(people.byProfileId.get(s.id), s.lastActiveAt) },
    {
      key: 'capacity',
      header: 'Capacity',
      width: '96px',
      render: (s) => {
        const person = people.byProfileId.get(s.id);
        return person ? <CapacityControl person={person} /> : null;
      },
    },
  ];

  const adminColumns: EFilingColumn<AdminRow>[] = [
    { key: 'name', header: 'Admin', width: '28%', render: (a) => <NameCell lead={<PersonAvatar name={a.name} />} title={a.name} sub={a.email} /> },
    {
      key: 'managers',
      header: 'Managers',
      width: '140px',
      render: (a) =>
        a.managers.length ? (
          <AvatarStack people={a.managers} max={4} label={`Managers: ${a.managers.join(', ')}`} />
        ) : (
          <span className="text-ink-faint">None</span>
        ),
    },
    { key: 'clients', header: 'Clients', width: '76px', align: 'right', render: (a) => <span className="tabular-nums">{a.clients}</span> },
    { key: 'assigned', header: 'Assigned', width: '86px', align: 'right', render: (a) => <span className="tabular-nums">{a.assigned}</span> },
    { key: 'reassigned', header: 'Reassigned', width: '96px', align: 'right', render: (a) => <span className="tabular-nums">{a.reassigned}</span> },
    { key: 'approvals', header: 'Approvals', width: '90px', align: 'right', render: (a) => <span className="tabular-nums">{a.approvals}</span> },
    { key: 'resolved', header: 'Esc. resolved', width: '104px', align: 'right', render: (a) => <span className="tabular-nums">{a.resolved}</span> },
    {
      key: 'open',
      header: 'Open',
      width: '64px',
      align: 'right',
      render: (a) => <span className={cn('tabular-nums', a.open > 0 && 'font-medium text-danger')}>{a.open}</span>,
    },
    { key: 'response', header: 'Median response', width: '120px', align: 'right', render: (a) => <span className="tabular-nums">{a.response}</span> },
    {
      key: 'actions',
      header: 'Actions, 30 days',
      width: '136px',
      align: 'right',
      render: (a) => <span className="tabular-nums">{a.actions30d ?? '–'}</span>,
    },
    { key: 'seen', header: 'Last active', width: '120px', render: (a) => lastActive(people.byProfileId.get(a.id), a.lastActiveAt) },
  ];

  const managerRows: StaffRow[] = managers.map((m) => ({ ...m, kind: 'manager' as const }));
  const staffRows: StaffRow[] = tab === 'managers' ? managerRows : tab === 'leads' ? leads : [...managerRows, ...leads];

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Team" meta={`${managers.length} managers · ${leads.length} project leads`} />

        <SuperNumberStrip
          items={[
            { label: 'Managers', value: managers.length, href: PEOPLE_HREF },
            { label: 'Project leads', value: leads.length, href: PEOPLE_HREF },
            { label: 'Overdue steps', value: overdueAll, bad: overdueAll > 0 },
            { label: 'Clients without a manager', value: unassignedClients, bad: unassignedClients > 0 },
          ]}
        />

        <DashSection
          title="Admins · this month"
          icon={UserCog}
          tone="violet"
          meta={
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              {staff.isPending ? null : <span className="tabular-nums">{adminRows.length}</span>}
              <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                <ListPlus aria-hidden />
                Assign task
              </Button>
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus aria-hidden />
                Assign client
              </Button>
            </span>
          }
          href={PEOPLE_HREF}
          hrefLabel="People"
          bodyClassName="px-2 pb-2 pt-1"
        >
          {staff.isPending ? (
            <SkeletonRows rows={2} className="p-2" />
          ) : (
            <EFilingGrid caption="Admins" columns={adminColumns} rows={adminRows} rowKey={(a) => a.id} empty="No firm admin yet" minWidth={1180} />
          )}
        </DashSection>

        {/* Managers and Staff on the left, a 360px rail from lg (prototype). */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <DashSection title="Managers" meta={String(managers.length)} href={PEOPLE_HREF} hrefLabel="People" bodyClassName="px-2 pb-2 pt-1">
              <EFilingGrid caption="Managers" columns={managerColumns} rows={managers} rowKey={(m) => m.id} empty="No manager yet" minWidth={1220} />
            </DashSection>

            <DashSection title="Staff" meta={String(staffRows.length)} bodyClassName="px-2 pb-2 pt-3">
              <div className="mb-2 px-2">
                <SpectrumTabs
                  label="Staff"
                  items={[
                    { key: 'managers', label: 'Managers', count: managers.length },
                    { key: 'leads', label: 'Leads', count: leads.length },
                    { key: 'all', label: 'All', count: managers.length + leads.length },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              </div>
              <EFilingGrid
                caption="Staff"
                columns={staffColumns}
                rows={staffRows}
                rowKey={(s) => `${s.kind}:${s.id}`}
                empty="Nobody here yet"
                minWidth={1020}
                pageSize={15}
              />
            </DashSection>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <SuperCapacityCard managers={managers} people={people.byProfileId} />
            <SuperReassignCard clients={insights.clients} managers={insights.team.managers} people={people.byProfileId} />

            <DashSection title="What admins did" meta={admins.length ? `${admins.length} admins` : undefined} href="/app/admin/audit-log" hrefLabel="Firm log" bodyClassName="p-0">
              {insights.adminFeed.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No admin activity yet" />
                </div>
              ) : (
                <ul>
                  {insights.adminFeed.map((entry) => {
                    const body = (
                      <>
                        <PersonAvatar name={entry.actor ?? 'System'} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] leading-snug text-ink">{entry.label}</span>
                          <span className="block truncate text-[12.5px] text-ink-muted">
                            {[entry.actor ?? 'System', entry.companyName, plainDay(entry.at)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={entry.id} className="border-t border-line-soft first:border-t-0">
                        {entry.href ? (
                          <Link href={entry.href} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken/60">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-start gap-3 px-4 py-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashSection>
          </div>
        </div>
      </div>
      <AssignClientDialog open={assignOpen} onOpenChange={setAssignOpen} engagements={insights.clients.map((c) => c.summary)} staff={staff} />
      <AssignTaskDialog open={taskOpen} onOpenChange={setTaskOpen} engagements={insights.clients.map((c) => c.summary)} staff={staff} />
    </PageTransition>
  );
}

function escalationCounts(rows: Array<{ status: string; createdAt: string; resolvedAt: string | null }>, monthStart: number) {
  const resolvedMonth = rows.filter((e) => e.status === 'resolved' && e.resolvedAt && Date.parse(e.resolvedAt) >= monthStart);
  return {
    resolved: resolvedMonth.length,
    open: rows.filter((e) => e.status === 'open').length,
    response: medianResponse(resolvedMonth.map((e) => Date.parse(e.resolvedAt!) - Date.parse(e.createdAt))),
  };
}
