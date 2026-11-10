'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid } from '@/components/dash/EFilingGrid';
import { AlertTriangle, Building2, Clock, Plus, Rocket, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssignTaskDialog } from '@/components/staff/today/AssignTaskDialog';
import { deriveStuckReason, primaryPhaseItems } from '@/lib/projects/project-stuck';
import { FirmProjectsPanel } from '@/views/admin/FirmProjectsPanel';
import { BoardMeetingsCard } from '@/views/board-meetings/BoardMeetingsCard';
import { FirmDecisionsCard } from '@/views/admin/FirmDecisionsCard';
import { PhaseProgressGrid } from '@/components/staff/today/PhaseProgressGrid';
import { buildPhaseProgressRows } from '@/components/staff/today/today-rows';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { adminProjectPath } from '@/lib/projects/project-step-path';
import { cn } from '@/lib/utils';
import { LeadFocusCard } from '@/components/intern/LeadFocusCard';
import { TeamTodosPanel } from '@/components/staff/TeamTodosPanel';
import { internFirstName, internGreeting, internGreetingHour } from '@/lib/intern/intern-work';
import { isAwaitingManagerDecision } from '@/lib/incorporation/pre-inc-direct-flow';
import { AdminPracticeCards } from '@/components/metrics/practice-cards';
import { CapacityControl, LastSeenCell, LoadCell, OnTimeCell } from '@/components/metrics/people-cells';
import { indexPeople, usePeopleMetrics, usePracticeMetrics } from '@/components/metrics/use-metrics';
import { isFirmWideAdmin } from '@/lib/auth';
import { trendWithLive, useHomeTrends } from '@/hooks/use-home-trends';
import { useStampHomeTiles } from '@/hooks/use-stamp-home-tiles';
import { clientRowFacts } from '@/views/admin/clients/client-row';
import { MyDayCard } from '@/views/my-day/MyDayCard';

type ManagerOption = { id: string; name: string; email: string };

async function fetchManagers(): Promise<ManagerOption[]> {
  const res = await fetch('/api/admin/managers');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (body.managers ?? []) as ManagerOption[];
}

export default function FirmDashboard() {
  const { user, engagements, getStateForEngagement, teamMembers, engagementsLoading } = useApp();
  const greet = internGreeting(internGreetingHour(new Date()));
  const first = internFirstName(user?.name ?? '');
  /**
   * A super admin reaches this page through the rail's "Firm" jump, having
   * already been greeted on their own Overview. A second greeting card here
   * reads as someone else's home, so the firm view opens straight on the work.
   * Its numbers are not lost: the Portfolio health donut in the right rail
   * carries the same on-track / stuck / awaiting-PM counts and the total.
   */
  const showGreeting = user?.role !== 'super_admin';
  const [assignOpen, setAssignOpen] = useState(false);

  const managersQuery = useQuery({
    queryKey: ['admin-managers'],
    queryFn: fetchManagers,
    staleTime: 5 * 60_000,
  });
  // Practice cards (G-13, G-29) and the managers' On time, Load and Last active (G-14).
  const practiceQuery = usePracticeMetrics();
  const peopleQuery = usePeopleMetrics();
  const people = useMemo(() => indexPeople(peopleQuery.data), [peopleQuery.data]);
  const canSetCapacity = isFirmWideAdmin(user?.role);
  // "Awaiting approval" is rebuilt from the review history; the other tiles use stamped values.
  const trends = useHomeTrends('admin', { enabled: showGreeting && isFirmWideAdmin(user?.role) });

  // Not memoised on getStateForEngagement: its identity does not change when the checklist states
  // finish loading, so a memo kept counts from before and the tiles disagreed with the table.
  const pulse = (() => {
    let total = 0;
    let pending = 0;
    let good = 0;
    let incorporating = 0;
    let overdue = 0;
    let waitingClient = 0;
    // Counted the way the clients table below counts: every client, and "Overdue" from the same
    // health rule, so the tiles and the table never disagree.
    for (const eng of engagements) {
      total += 1;
      const state = getStateForEngagement(eng);
      const reason = deriveStuckReason(eng, state);
      if (reason === 'on_track') good += 1;
      else pending += 1;
      if (reason === 'waiting_client') waitingClient += 1;
      // The health chip shows a Stuck client as "Overdue · Stuck", so it is counted here too.
      const health = clientRowFacts(eng, state).health;
      if (health === 'Overdue' || health === 'Stuck') overdue += 1;
      if (!isIncorporated(eng, state)) incorporating += 1;
    }
    return { total, pending, good, incorporating, overdue, waitingClient };
  })();
  // Clients, Incorporating, In compliance and Stuck keep no history (stage and stuck reason are
  // current state only), so their lines come from the values this home showed on earlier days.
  useStampHomeTiles(
    'admin',
    { clients: pulse.total, incorporating: pulse.incorporating, inCompliance: pulse.total - pulse.incorporating, stuck: pulse.pending },
    showGreeting && !engagementsLoading && isFirmWideAdmin(user?.role),
  );

  /* Phase progress: the companies still incorporating, the nearest incorporation date first. */
  const phaseRows = useMemo(() => {
    const now = new Date();
    return buildPhaseProgressRows({
      engagements,
      getState: getStateForEngagement,
      href: (e) => adminProjectPath(e, '/app/admin'),
      now,
    })
      .filter((r) => !r.incorporated)
      .sort((a, b) => (a.daysToCoi ?? 9999) - (b.daysToCoi ?? 9999) || a.companyName.localeCompare(b.companyName));
  }, [engagements, getStateForEngagement]);

  const { pendingApprovals, approvalClients } = useMemo(() => {
    let n = 0;
    let clients = 0;
    for (const eng of engagements) {
      const state = getStateForEngagement(eng);
      let here = 0;
      for (const item of primaryPhaseItems()) {
        if (isAwaitingManagerDecision(item.id, state[item.id])) here += 1;
      }
      n += here;
      if (here > 0) clients += 1;
    }
    return { pendingApprovals: n, approvalClients: clients };
  }, [engagements, getStateForEngagement]);
  const practice = practiceQuery.data;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const managerStrip = useMemo(() => {
    const byManager = new Map<
      string,
      { managerId: string; open: number; stuck: number; awaitingPm: number; overdue: number; leads: Set<string> }
    >();
    for (const eng of engagements) {
      if (eng.stage === 'Operational Readiness') continue;
      const mid = eng.managerId ?? eng.adminId ?? 'unassigned';
      const row = byManager.get(mid) ?? {
        managerId: mid,
        open: 0,
        stuck: 0,
        awaitingPm: 0,
        overdue: 0,
        leads: new Set<string>(),
      };
      row.open += 1;
      if (eng.health === 'overdue') row.overdue += 1;
      if (eng.internId) row.leads.add(eng.internId);
      const state = getStateForEngagement(eng);
      const reason = deriveStuckReason(eng, state);
      if (reason !== 'on_track') row.stuck += 1;
      for (const item of primaryPhaseItems()) {
        if (isAwaitingManagerDecision(item.id, state[item.id])) row.awaitingPm += 1;
      }
      byManager.set(mid, row);
    }
    return Array.from(byManager.values()).sort((a, b) => b.open - a.open);
  }, [engagements, getStateForEngagement]);

  const nameFor = (id: string) => {
    if (id === 'unassigned') return 'Unassigned';
    return managersQuery.data?.find((m) => m.id === id)?.name ?? 'Project manager';
  };

  return (
    <PageTransition>
      <SEO title="Admin home — VCFO Suite" description="Firm-wide portfolio pulse." path="/app/admin/dashboard" />

      {/* Admin Today (prototype TodayScreen, admin branch): the home card, the clients grid,
          phase progress, then the managers beside the decisions and the portfolio health. */}
      <div className="flex flex-col gap-5">
        {showGreeting ? (
          <DashHero
            title={first ? `Good ${greet}, ${first}` : 'Firm home'}
            stats={[
              {
                label: 'Clients',
                icon: Building2,
                value: pulse.total,
                href: '/app/admin/projects',
                trend: trendWithLive(trends, 'clients', pulse.total),
                note: pulse.overdue > 0 ? `${pulse.overdue} overdue` : `${pulse.good} on track`,
                how: 'Every client of the firm still being set up, incorporating or in compliance.',
              },
              {
                label: 'Incorporating',
                icon: Rocket,
                value: pulse.incorporating,
                href: '/app/admin/projects?view=incorporating',
                trend: trendWithLive(trends, 'incorporating', pulse.incorporating),
                note: practice?.incorporation.avgDaysToCoi != null ? `avg ${practice.incorporation.avgDaysToCoi}d to COI` : undefined,
                how: 'Clients that do not have the certificate of incorporation yet.',
              },
              {
                label: 'In compliance',
                icon: ShieldCheck,
                value: pulse.total - pulse.incorporating,
                href: '/app/admin/projects?view=compliance',
                trend: trendWithLive(trends, 'inCompliance', pulse.total - pulse.incorporating),
                trendTone: 'ok',
                note: practice && practice.compliances.overdue > 0 ? `${plural(practice.compliances.overdue, 'filing', 'filings')} overdue` : undefined,
                how: 'Incorporated clients with a filing calendar.',
              },
              {
                label: 'Overdue',
                icon: AlertTriangle,
                value: pulse.overdue,
                href: '/app/admin/projects?view=overdue',
                hot: pulse.overdue > 0,
                how: 'Clients with a step or filing past its due date, across all managers.',
              },
              {
                // Every client not on track (waiting on the client included), not only stuck ones.
                label: 'Not on track',
                icon: Clock,
                value: pulse.pending,
                href: '/app/admin/projects?view=stuck',
                hot: pulse.pending > 0,
                trend: trendWithLive(trends, 'stuck', pulse.pending),
                note: pulse.waitingClient > 0 ? `${pulse.waitingClient} on clients` : undefined,
                how: 'Clients whose current step waits on the client, the manager or the lead, or is blocked.',
              },
            ]}
          >
            {/* On a phone the action is a 36px icon button. */}
            <Button onClick={() => setAssignOpen(true)} className="max-sm:w-9 max-sm:px-0" title="Assign task">
              <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden /> <span className="max-sm:sr-only">Assign task</span>
            </Button>
          </DashHero>
        ) : null}

        {/* IDEAS-PLAN F: the caller's ranked plan for today. */}
        <MyDayCard />

        <AdminPracticeCards practice={practiceQuery.data} loading={practiceQuery.isPending} base="/app/admin" />

        <FirmProjectsPanel title="Clients · where each one is" />

        <PhaseProgressGrid
          rows={phaseRows}
          meta={`${phaseRows.length} incorporating`}
          empty="No company is incorporating."
          extraColumns={[
            {
              key: 'manager',
              header: 'Manager',
              width: '120px',
              render: (r) => nameFor(r.managerId ?? 'unassigned'),
            },
          ]}
        />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]">
          {/* The to-dos sit under Managers in the main column, so the taller rail leaves no gap beside them. */}
          <div className="flex min-w-0 flex-col gap-5">
          {/* Managers (K-37, C-0034): a T1 grid. */}
          <DashSection title="Managers" meta={managerStrip.length || undefined} flush>
            <EFilingGrid
              caption="Managers"
              rows={managerStrip}
              rowKey={(row) => row.managerId}
              empty="No open Pre/Post projects."
              minWidth={canSetCapacity ? 860 : 760}
              columns={[
                {
                  key: 'name',
                  header: 'Manager',
                  render: (row) =>
                    row.managerId === 'unassigned' ? (
                      <span className="font-medium">{nameFor(row.managerId)}</span>
                    ) : (
                      <Link href={`/app/admin/managers#${row.managerId}`} className="font-medium text-ink hover:underline">
                        {nameFor(row.managerId)}
                      </Link>
                    ),
                },
                { key: 'leads', header: 'Project leads', width: '120px', align: 'right', render: (row) => <span className="tabular-nums">{row.leads.size}</span> },
                { key: 'open', header: 'Clients', width: '90px', align: 'right', render: (row) => <span className="tabular-nums">{row.open}</span> },
                {
                  key: 'overdue',
                  header: 'Overdue',
                  width: '90px',
                  align: 'right',
                  render: (row) => <span className={cn('tabular-nums', row.overdue > 0 && 'font-medium text-danger')}>{row.overdue}</span>,
                },
                { key: 'ontime', header: 'On time', width: '90px', align: 'right', render: (row) => <OnTimeCell person={people.byProfileId.get(row.managerId)} /> },
                { key: 'load', header: 'Load', width: '150px', render: (row) => <LoadCell person={people.byProfileId.get(row.managerId)} /> },
                { key: 'seen', header: 'Last active', width: '110px', render: (row) => (row.managerId === 'unassigned' ? null : <LastSeenCell person={people.byProfileId.get(row.managerId)} />) },
                ...(canSetCapacity
                  ? [
                      {
                        key: 'capacity',
                        header: 'Capacity',
                        width: '96px',
                        render: (row: (typeof managerStrip)[number]) => {
                          const person = people.byProfileId.get(row.managerId);
                          return person ? <CapacityControl person={person} /> : null;
                        },
                      },
                    ]
                  : []),
              ]}
            />
          </DashSection>
          {user?.id ? (
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
              <LeadFocusCard userId={user.id} items={[]} />
              <TeamTodosPanel userId={user.id} />
            </div>
          ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <FirmDecisionsCard engagements={engagements} />
            <BoardMeetingsCard />
          </div>
        </div>
      </div>
      <AssignTaskDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        engagements={engagements.filter((e) => e.stage !== 'Operational Readiness')}
        teamMembers={teamMembers}
      />
    </PageTransition>
  );
}
