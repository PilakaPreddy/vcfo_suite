'use client';

import { BoardMeetingsCard } from '@/views/board-meetings/BoardMeetingsCard';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, CalendarDays, CheckCheck, ListChecks, Plus, User } from 'lucide-react';
import { ymdFromIsoInIst, ymdInIst } from '@/lib/intern/intern-work';
import { PageTransition } from '@/components/shell/PageTransition';
import { DashHero, type DashHeroStat } from '@/components/dash/DashHero';
import { PhaseTimeline, type Phase } from '@/components/admin/PhaseTimeline';
import { Button } from '@/components/ui/button';
import { SEO } from '@/components/SEO';
import { useApp } from '@/context/AppContext';
import { isAdminOrManager } from '@/lib/auth';
import { primaryPhaseItems } from '@/lib/projects/project-stuck';
import { isAwaitingManagerDecision } from '@/lib/incorporation/pre-inc-direct-flow';
import { staffNewProjectPath, staffProjectBaseFromPathname, adminProjectPath } from '@/lib/projects/project-step-path';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { trendWithLive, useHomeTrends } from '@/hooks/use-home-trends';
import { useStampHomeTiles } from '@/hooks/use-stamp-home-tiles';
import { internFirstName, internGreeting, internGreetingHour } from '@/lib/intern/intern-work';
import type { TaskInstance } from '@/data/engagements';
import type { Engagement } from '@/data/engagements';
import type { ComplianceFiling } from '@/data/compliance';
import { AdminDashboardFilingsPanel } from '@/views/admin/DashboardSecondaryRow';
import { DashboardApprovalsPanel } from '@/views/admin/DashboardApprovalsPanel';
import { LeadInboxCard } from '@/components/intern/LeadInboxCard';
import { LeadActionQueue } from '@/components/intern/LeadActionQueue';
import { LeadSideRail } from '@/components/intern/LeadSideRail';
import { FilingsMatrix } from '@/components/intern/FilingsMatrix';
import { useTeamWork } from '@/views/manager/use-team-work';
import { deriveStuckReason } from '@/lib/projects/project-stuck';
import { TeamTodosPanel } from '@/components/staff/TeamTodosPanel';
import { TeamTasksCard, useTeamTaskTools } from '@/components/staff/today/TeamTasksCard';
import { AssignTaskDialog } from '@/components/staff/today/AssignTaskDialog';
import { TaskStatusCard, WorkloadByLeadCard } from '@/components/staff/today/TodayCharts';
import { PhaseProgressGrid } from '@/components/staff/today/PhaseProgressGrid';
import { PersonCell, TodayScopeTabs } from '@/components/staff/today/today-parts';
import {
  buildPhaseProgressRows,
  buildTeamTaskRows,
  engagementInScope,
  type TodayScope,
} from '@/components/staff/today/today-rows';

export type AdminDashboardViewProps = {
  userId?: string;
  engagements: Engagement[];
  tasks: TaskInstance[];
  teamMembers: Array<{ id: string; name: string }>;
  blockers: number;
  pendingClientActions: number;
  overdueTasks: number;
  dueInTwoDays: number;
  approvalsToSend: number;
  approvalsReceived: number;
  dueSoon: Array<{
    id: string;
    filing: string;
    authority: string;
    status: string;
    engagementId: string;
    nextDue: string;
  }>;
  portfolioPhases: Phase[];
  completionRate: number;
  tasksByEngagement: Record<string, TaskInstance[]>;
  /** Every filing the dashboard computed, for the team task rows. */
  filings?: ComplianceFiling[];
};

/** A home card action that shrinks to a 36px icon button on a phone (M-30). */
const PHONE_ICON = 'max-sm:w-9 max-sm:px-0';

/** Main column and a rail, as on every staff Today (prototype TodayScreen GRID). */
const GRID = 'grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]';

/**
 * Manager Today as the board (prototype TodayScreen, C-0107, C-0114): the compact home card with
 * the scope switch and the five numbers, Team tasks beside the approvals, Task
 * status and Workload by lead, then Phase progress beside the upcoming filings and the to-do cards. "Assign task"
 * gives one of the leads on the manager's engagements a task (G-12); it shows in Team tasks
 * and in the lead's Work list.
 */
export function AdminDashboardView({
  userId,
  engagements,
  tasks,
  teamMembers,
  blockers,
  dueInTwoDays,
  approvalsReceived,
  dueSoon,
  portfolioPhases,
  completionRate,
  filings = [],
}: AdminDashboardViewProps) {
  const { user, requests, getStateForEngagement, engagementsLoading } = useApp();
  const pathname = usePathname();
  const staffBase = useStaffBasePath();
  const projectBase = staffProjectBaseFromPathname(pathname, staffBase);
  const newProjectHref = staffNewProjectPath(projectBase);
  const [scope, setScope] = useState<TodayScope>('all');
  const [assignOpen, setAssignOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  const active = useMemo(() => engagements.filter((e) => e.stage !== 'Operational Readiness'), [engagements]);
  const scopeCounts = useMemo(() => {
    const incorporating = active.filter((e) => engagementInScope('incorporating', e, getStateForEngagement(e))).length;
    return { all: active.length, incorporating, compliance: active.length - incorporating };
  }, [active, getStateForEngagement]);
  const scoped = useMemo(
    () => active.filter((e) => engagementInScope(scope, e, getStateForEngagement(e))),
    [active, scope, getStateForEngagement],
  );
  const scopedIds = useMemo(() => new Set(scoped.map((e) => e.id)), [scoped]);

  const teamRows = useMemo(
    () =>
      buildTeamTaskRows({
        engagements: scoped,
        getState: getStateForEngagement,
        filings,
        requests,
        tasks,
        leads: teamMembers,
        projectBase,
        now,
      }),
    [scoped, getStateForEngagement, filings, requests, tasks, teamMembers, projectBase, now],
  );
  const phaseRows = useMemo(
    () =>
      buildPhaseProgressRows({
        engagements: scoped,
        getState: getStateForEngagement,
        href: (e) => adminProjectPath(e, projectBase),
        now,
      }).filter((r) => !r.incorporated),
    [scoped, getStateForEngagement, projectBase, now],
  );
  const scopedDueSoon = dueSoon.filter((f) => scopedIds.has(f.engagementId));
  // The leads' items for the Action queue and Waiting on cards (same builder as manager Work).
  const team = useTeamWork({ projectBase: projectBase === '/app/manager' ? '/app/manager' : '/app/admin' });
  const teamItems = useMemo(() => team.items.filter((i) => scopedIds.has(i.engagementId)), [team.items, scopedIds]);
  const engById = useMemo(() => new Map(scoped.map((e) => [e.id, e])), [scoped]);
  const stuck = useMemo(
    () =>
      scoped
        .filter((e) => deriveStuckReason(e, getStateForEngagement(e)) !== 'on_track')
        .map((e) => ({ engagementId: e.id, companyName: e.companyName, href: adminProjectPath(e, projectBase) })),
    [scoped, getStateForEngagement, projectBase],
  );
  const scopedFilings = filings.filter((f) => scopedIds.has(f.engagementId));

  /* Five numbers (R-18, E-04, E-05). Overdue, Waiting on clients and Due this week count the
     Team tasks rows, and each opens Team tasks on the matching saved view. */
  const open = teamRows.filter((r) => r.status !== 'Done');
  const overdueRows = teamRows.filter((r) => r.status === 'Overdue');
  const overdue = overdueRows.length;
  const overdueClients = new Set(overdueRows.map((r) => r.engagementId)).size;
  const waitingRows = teamRows.filter((r) => r.status === 'Waiting' && r.withClient);
  const waitingOnClients = waitingRows.length;
  const waitingClients = new Set(waitingRows.map((r) => r.engagementId)).size;
  const dueWeek = teamRows.filter((r) => r.status === 'Due soon').length;
  const approvalClients = engagements.filter((e) => {
    const state = getStateForEngagement(e);
    return primaryPhaseItems().some((item) => isAwaitingManagerDecision(item.id, state[item.id]));
  }).length;
  const tasksHref = (view: string) => `${staffBase}/dashboard?view=${view}#team-tasks`;
  // "Needs your approval" is rebuilt from the review history; the other four lines come from
  // the values this home showed on earlier days, stored only for the whole home (scope All).
  const trends = useHomeTrends('manager', { enabled: isAdminOrManager(user?.role) });
  useStampHomeTiles(
    'manager',
    { activeProjects: scoped.length, overdue, waitingClients: waitingOnClients, dueWeek },
    scope === 'all' && !engagementsLoading && isAdminOrManager(user?.role),
  );
  const todayYmd = ymdInIst(now);
  const doneToday = team.items.filter((i) => i.kind === 'done' && ymdFromIsoInIst(i.completedAt) === todayYmd).length;
  /* The prototype's five numbers. Approvals have their own card in the rail. */
  const heroStats: DashHeroStat[] = [
    {
      label: 'Needs action',
      icon: ListChecks,
      value: open.length,
      href: tasksHref('open'),
      note: `${new Set(open.map((r) => r.engagementId)).size} clients`,
      how: 'Open team tasks in the clients shown.',
    },
    {
      label: 'Overdue',
      icon: AlertTriangle,
      value: overdue,
      hot: overdue > 0,
      href: tasksHref('overdue'),
      trend: trendWithLive(trends, 'overdue', overdue),
      trendTone: 'bad',
      note: overdueClients > 0 ? `${overdueClients} ${overdueClients === 1 ? 'client' : 'clients'}` : undefined,
      how: 'Team tasks past their due date: steps, filings, document requests and assigned tasks.',
    },
    {
      label: 'Waiting on clients',
      icon: User,
      value: waitingOnClients,
      href: tasksHref('waiting'),
      trend: trendWithLive(trends, 'waitingClients', waitingOnClients),
      trendTone: 'teal',
      note: waitingClients > 0 ? `${waitingClients} ${waitingClients === 1 ? 'client' : 'clients'}` : undefined,
      how: 'Team tasks the client still owes: a step to fill or a document to upload.',
    },
    {
      label: 'Due this week',
      icon: CalendarDays,
      value: dueWeek,
      href: tasksHref('week'),
      trend: trendWithLive(trends, 'dueWeek', dueWeek),
      note: dueInTwoDays > 0 ? `${dueInTwoDays} filings in 2 days` : undefined,
      how: 'Open team tasks due in the next seven days.',
    },
    {
      label: 'Done today',
      icon: CheckCheck,
      value: doneToday,
      good: doneToday > 0,
      how: 'Team tasks finished today.',
    },
  ];
  const tools = useTeamTaskTools({
    storageScope: user?.id ?? 'manager',
    leads: teamMembers,
    canReassign: isAdminOrManager(user?.role),
  });

  const greet = internGreeting(internGreetingHour(now));
  const first = internFirstName(user?.name ?? '');

  return (
    <PageTransition>
      <SEO
        title="Dashboard — VCFO Suite"
        description="Portfolio overview: filings, approvals, and process health."
        path={`${staffBase}/dashboard`}
      />

      <div className="flex flex-col gap-5">
        <DashHero
          title={first ? `Good ${greet}, ${first}` : 'Dashboard'}
          stats={heroStats}
          scope={<TodayScopeTabs value={scope} onChange={setScope} counts={scopeCounts} />}
        >
          {/* M-30: on a phone the action is a 36px icon button, so it fits beside the switch. */}
          <Button onClick={() => setAssignOpen(true)} className={PHONE_ICON} title="Assign task">
            <Plus aria-hidden />
            <span className="max-sm:sr-only">Assign task</span>
          </Button>
        </DashHero>

        {/*
          One grid with two independent columns, so a tall rail never leaves a gap under the main column.
          Below lg the column wrappers are display: contents and `order` keeps the phone reading order:
          team tasks, the first rail cards, the queues, then the rest of the rail.
        */}
        <div className={GRID}>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
            <div id="team-tasks" className="order-1 min-w-0 scroll-mt-24">
              <TeamTasksCard rows={teamRows} tools={tools} loading={engagementsLoading} />
            </div>
            <div className="order-3 flex min-w-0 flex-col gap-5">
              <LeadActionQueue
                userId={user?.id ?? ''}
                items={teamItems}
                now={now}
                statusOf={(i) => team.byId.get(i.id)?.status ?? 'In progress'}
                stuck={stuck}
                loading={engagementsLoading}
                workHref={projectBase === '/app/manager' ? '/app/manager/work' : `${projectBase}/projects?tab=leads`}
                companyHref={(id) => {
                  const e = engById.get(id);
                  return e ? adminProjectPath(e, projectBase) : `${projectBase}/projects`;
                }}
              />
              {scope !== 'compliance' && phaseRows.length > 0 ? <PhaseProgressGrid rows={phaseRows} meta={`${phaseRows.length} incorporating`} /> : null}
              {scope !== 'incorporating' ? <FilingsMatrix filings={scopedFilings} engagements={scoped} now={now} /> : null}
            </div>
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
            <div className="order-2 flex min-w-0 flex-col gap-5">
              <DashboardApprovalsPanel />
              <TaskStatusCard rows={teamRows} />
              <WorkloadByLeadCard rows={teamRows} rebalanceHref={`${projectBase}/team`} />
            </div>
            <div className="order-4 flex min-w-0 flex-col gap-5">
              {userId ? <LeadInboxCard userId={userId} items={teamItems} engagementIds={scopedIds} /> : null}
              <LeadSideRail items={teamItems} mailHref={`${staffBase}/mail`} />
              <BoardMeetingsCard />
              {userId ? <TeamTodosPanel userId={userId} /> : null}
            </div>
          </div>
        </div>
      </div>
      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} engagements={active} teamMembers={teamMembers} />
    </PageTransition>
  );
}
