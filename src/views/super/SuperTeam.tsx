'use client';

import { useMemo, useState } from 'react';
import { ListPlus, UserCog, UserPlus } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
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
import { medianResponse } from '@/lib/super/super-insights-model';
import {
  AdminFeedList,
  NameCell,
  PersonAvatar,
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { formatSuperAgo, isAdminWork } from '@/components/super/overview/super-overview-format';
import type { SuperTeamManager } from '@/lib/super/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { LoadCell, OnTimeCell } from '@/components/metrics/people-cells';
import { indexPeople, usePeopleMetrics } from '@/components/metrics/use-metrics';
import type { PersonMetrics } from '@/lib/metrics/practice-metrics';
import { cn } from '@/lib/utils';

/**
 * TEAM (prototype `TeamScreen`).
 *
 * Managers with the project leads who report to them, and the load on each: clients (primary
 * and co-assigned through the engagement memberships), open steps, overdue steps and overdue
 * filings. On time, Load (open items against capacity) and Last active (`profiles.last_seen_at`,
 * else the newest audit row the person wrote) come from `/api/metrics/people` (G-14). The admins
 * grid adds this month's assignments, reassignments and accepted reviews (insights) and the
 * escalations sent to each admin. The Capacity card bands each manager's load against the capacity
 * an admin set. Assign client and Assign task open the same dialogs as the Overview. People, and
 * the capacity editor, are on the admin People and Team pages.
 */
const SUPER_TEAM_HREF = '/app/super/team';

const PEOPLE_HREF = '/app/admin/people';


/** Last signed-in request (`profiles.last_seen_at`, G-14), else the newest audit row they wrote. */
function lastActive(person: PersonMetrics | undefined, auditIso: string | null): string {
  const iso = person?.lastSeenAt ?? auditIso;
  return iso ? formatSuperAgo(iso) : 'No activity';
}

/** One row of the Staff grid, whichever role the person has. Admins carry no step counts. */
type StaffRow = {
  key: string;
  id: string;
  name: string;
  role: 'Admin' | 'Manager' | 'Project lead';
  reportsTo: string;
  clients: number;
  open: number | null;
  overdue: number | null;
  lastActiveAt: string | null;
};

/** One firm admin with the managers who report to them (`profiles.reports_to_admin_id`, G-20). */
type AdminRow = {
  id: string;
  name: string;
  managers: string[];
  clients: number;
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
          managers: managers.map((m) => m.name),
          clients: insights.clients.filter((c) => c.managerIds.some((id) => ids.has(id))).length,
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

  const { managers } = insights.team;
  const feed = insights.adminFeed.filter(isAdminWork);

  const managerColumns: EFilingColumn<SuperTeamManager>[] = [
    {
      key: 'name',
      header: 'Manager',
      width: '22%',
      render: (m) => (
        <NameCell lead={<PersonAvatar name={m.name} />} title={m.name} sub={`${m.leads.length} project leads`} />
      ),
    },
    {
      key: 'admin',
      header: 'Admin',
      render: (m) => {
        const name = staff.adminOfManager.get(m.id)?.name;
        return name ? <span className="block truncate">{name}</span> : <span className="text-ink-faint">–</span>;
      },
    },
    { key: 'clients', header: 'Clients', width: '76px', align: 'right', render: (m) => <span className="tabular-nums">{m.clients}</span> },
    { key: 'open', header: 'Open', width: '70px', align: 'right', render: (m) => <span className="tabular-nums">{m.openSteps}</span> },
    {
      key: 'late',
      header: 'Late',
      width: '60px',
      align: 'right',
      render: (m) => (
        <span className={cn('tabular-nums', m.overdueSteps + m.overdueFilings > 0 ? 'font-medium text-danger' : 'text-ink-faint')}>
          {m.overdueSteps + m.overdueFilings}
        </span>
      ),
    },
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
  ];

  const staffColumns: EFilingColumn<StaffRow>[] = [
    { key: 'name', header: 'Name', render: (s) => <NameCell lead={<PersonAvatar name={s.name} />} title={s.name} sub={s.reportsTo} /> },
    { key: 'role', header: 'Role', width: '110px', render: (s) => s.role },
    { key: 'clients', header: 'Clients', width: '76px', align: 'right', render: (s) => <span className="tabular-nums">{s.clients}</span> },
    {
      key: 'open',
      header: 'Open tasks',
      width: '96px',
      align: 'right',
      render: (s) => (s.open === null ? <span className="text-ink-faint">–</span> : <span className="tabular-nums">{s.open}</span>),
    },
    {
      key: 'overdue',
      header: 'Overdue',
      width: '84px',
      align: 'right',
      render: (s) =>
        s.overdue === null ? (
          <span className="text-ink-faint">–</span>
        ) : (
          <span className={cn('tabular-nums', s.overdue > 0 ? 'font-medium text-danger' : 'text-ink-faint')}>{s.overdue}</span>
        ),
    },
    {
      key: 'load',
      header: 'Load',
      width: '150px',
      render: (s) => (s.role === 'Admin' ? <span className="text-ink-faint">–</span> : <LoadCell person={people.byProfileId.get(s.id)} />),
    },
    { key: 'last', header: 'Last active', width: '104px', render: (s) => lastActive(people.byProfileId.get(s.id), s.lastActiveAt) },
  ];

  const adminColumns: EFilingColumn<AdminRow>[] = [
    { key: 'name', header: 'Admin', render: (a) => <NameCell lead={<PersonAvatar name={a.name} />} title={a.name} sub="Admin" /> },
    {
      key: 'managers',
      header: 'Managers',
      width: '120px',
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
    { key: 'resolved', header: 'Escalations resolved', width: '170px', align: 'right', render: (a) => <span className="tabular-nums">{a.resolved}</span> },
    {
      key: 'open',
      header: 'Open',
      width: '64px',
      align: 'right',
      render: (a) => <span className={cn('tabular-nums', a.open > 0 && 'font-medium text-danger')}>{a.open}</span>,
    },
    { key: 'response', header: 'Median response', width: '140px', align: 'right', render: (a) => <span className="tabular-nums">{a.response}</span> },
  ];

  const managerRows: StaffRow[] = managers.map((m) => {
    const admin = staff.adminOfManager.get(m.id)?.name;
    return {
      key: `manager:${m.id}`,
      id: m.id,
      name: m.name,
      role: 'Manager',
      reportsTo: admin ? `Reports to ${admin}` : 'No admin',
      clients: m.clients,
      open: m.openSteps,
      overdue: m.overdueSteps,
      lastActiveAt: m.lastActiveAt,
    };
  });
  const leadRows: StaffRow[] = leads.map((l) => ({
    key: `lead:${l.id}`,
    id: l.id,
    name: l.name,
    role: 'Project lead',
    reportsTo: `Reports to ${l.reportsTo}`,
    clients: l.clients,
    open: l.openSteps,
    overdue: l.overdueSteps,
    lastActiveAt: l.lastActiveAt,
  }));
  const adminStaffRows: StaffRow[] = adminRows.map((a) => ({
    key: `admin:${a.id}`,
    id: a.id,
    name: a.name,
    role: 'Admin',
    reportsTo: 'Reports to the super admin',
    clients: a.clients,
    open: null,
    overdue: null,
    lastActiveAt: a.lastActiveAt,
  }));
  const staffRows =
    tab === 'managers'
      ? managerRows
      : tab === 'leads'
        ? leadRows
        : tab === 'admins'
          ? adminStaffRows
          : [...adminStaffRows, ...managerRows, ...leadRows];

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Team" meta={`${managers.length} managers · ${leads.length} project leads`} />

        <DashSection
          title="Admins · this month"
          headIcon={{ icon: UserCog, tone: 'violet' }}
          right={
            <>
              <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                <ListPlus aria-hidden />
                Assign task
              </Button>
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus aria-hidden />
                Assign client
              </Button>
            </>
          }
          href={PEOPLE_HREF}
          hrefLabel="People"
          flush
        >
          {staff.isPending ? (
            <SkeletonRows rows={2} className="p-2" />
          ) : (
            <EFilingGrid caption="Admins" columns={adminColumns} rows={adminRows} rowKey={(a) => a.id} empty="No firm admin yet" minWidth={1040} />
          )}
        </DashSection>

        {/* Managers and Staff on the left, a 360px rail from lg (prototype). */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <DashSection title="Managers" flush>
              <EFilingGrid caption="Managers" columns={managerColumns} rows={managers} rowKey={(m) => m.id} empty="No manager yet" minWidth={720} />
            </DashSection>

            <DashSection
              title="Staff"
              right={
                <SpectrumTabs
                  label="Staff"
                  items={[
                    { key: 'managers', label: 'Managers', count: managerRows.length },
                    { key: 'leads', label: 'Leads', count: leadRows.length },
                    { key: 'admins', label: 'Admins', count: adminStaffRows.length },
                    { key: 'all', label: 'All', count: managerRows.length + leadRows.length + adminStaffRows.length },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              }
              flush
            >
              <EFilingGrid caption="Staff" columns={staffColumns} rows={staffRows} rowKey={(s) => s.key} empty="Nobody here yet" minWidth={720} pageSize={15} />
            </DashSection>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <DashSection title="What admins did" href="/app/admin/audit-log" hrefLabel="Firm log" flush>
              {feed.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No admin activity yet" />
                </div>
              ) : (
                <AdminFeedList rows={feed} />
              )}
            </DashSection>
            <SuperCapacityCard managers={managers} people={people.byProfileId} />
            <SuperReassignCard clients={insights.clients} managers={insights.team.managers} people={people.byProfileId} />
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
