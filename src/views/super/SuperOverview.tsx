'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, IdCard, ListPlus, ShieldCheck, UserPlus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { AssignClientDialog } from '@/components/super/assign/AssignClientDialog';
import { AssignTaskDialog } from '@/components/super/assign/AssignTaskDialog';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import { SuperAdminsPanel } from '@/components/super/overview/SuperAdminsPanel';
import { AdminFeedList, SuperPageError } from '@/components/super/parts/super-parts';
import { SuperAttentionPanel } from '@/components/super/overview/SuperAttentionPanel';
import { isAdminWork } from '@/components/super/overview/super-overview-format';
import { SuperOverviewSkeleton } from '@/components/super/overview/SuperOverviewSkeleton';
import {
  SuperManagersPanel,
  SuperPracticeCards,
  SuperTopRisks,
} from '@/components/super/overview/SuperPracticeCards';
import { SuperPracticeAreasPanel } from '@/components/super/overview/SuperPracticeAreasPanel';
import { SuperTeamLoadPanel } from '@/components/super/overview/SuperTeamLoadPanel';
import { EscalationsPanel } from '@/components/super/escalations/EscalationsPanel';
import {
  changeText,
  filingOutcome,
  openRegistrations,
  overdueFilingsNow,
} from '@/lib/super/super-insights-model';
import { useSuperOverview } from '@/hooks/use-super-overview';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { SUPER_PROJECTS_HREF } from '@/lib/super/super-overview';

const SUPER_REGISTRATIONS_HREF = '/app/super/practice/registrations';
const SUPER_COMPLIANCES_HREF = '/app/super/practice/compliances';
const SUPER_FILINGS_HREF = '/app/super/practice/filings';
import { internFirstName, internGreeting, internGreetingHour } from '@/lib/intern/intern-work';
import { trendWithLive, useHomeTrends } from '@/hooks/use-home-trends';

/**
 * SUPER ADMIN OVERVIEW (L0) — the observatory.
 *
 * Answers "is the firm healthy, and what needs me?" in five seconds, and every
 * element drills to the detail behind it. The reads stay read-only; the writes
 * are the super admin's own actions (G-20): Assign client and Assign task on the
 * home card, and Resolve on an escalation. The admins table and the escalations
 * come from the People roster, the reporting lines and `/api/super/escalations`. The home card, attention list, charts and rail come from
 * `/api/super/overview`; the practice cards, managers and top risks come from
 * `/api/super/insights`, which loads beside it and never blocks the page.
 *
 * Layout follows the prototype's Overview (C-0109): the home card with its four
 * tiles (Clients, Registrations open, Filed on time, Filings overdue, each with the
 * change against last month where stored dates can say), the three practice cards,
 * then a main column (admins, managers, practice areas and the attention list last)
 * and a 360px rail (escalations, top risks, what admins did, team load) from lg, 20px gaps.
 * Assign task stays beside Assign client because it is a real super admin action.
 * The firm-wide open escalations sit at the top of the rail, beyond the prototype, because
 * no other page lists them. The audit trail opens from Team.
 */
export default function SuperOverview() {
  const { user } = useApp();
  const query = useSuperOverview();
  const overview = query.data;
  // The practice cards, managers and risks come from the insights read. It loads beside the
  // overview and never blocks it: until it lands those panels show grey shapes.
  const insightsQuery = useSuperInsights();
  const insights = insightsQuery.data;
  const staff = useSuperStaff();
  // R-18: month-end counts for the four months before this one, rebuilt from stored rows.
  const trends = useHomeTrends('super');
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const greeting = useMemo(() => {
    const first = internFirstName(user?.name ?? '');
    const greet = internGreeting(internGreetingHour(new Date()));
    return first ? `Good ${greet}, ${first}` : 'Firm overview';
  }, [user?.name]);

  const seo = (
    <SEO
      title="Firm overview — VCFO Suite"
      description="Every engagement, every filing, every person — one live picture."
      path="/app/super/dashboard"
    />
  );

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperOverviewSkeleton />
      </PageTransition>
    );
  }

  if (query.isError || !overview) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError
          title="The firm overview could not load"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </PageTransition>
    );
  }

  const { kpis } = overview;
  const now = new Date();

  // Filed on time over every filing due by today in the report window (on time, late or open).
  const filedOnTime = (() => {
    if (!insights) return null;
    const today = insights.generatedAt.slice(0, 10);
    const outcomes = insights.filings.filter((f) => f.dueDate <= today).map((f) => filingOutcome(f, today));
    if (outcomes.length === 0) return null;
    return Math.round((outcomes.filter((o) => o === 'on-time').length / outcomes.length) * 100);
  })();
  // Overdue on the same 90-day rule as the month-end history, so the change text agrees.
  const overdue = insights ? overdueFilingsNow(insights.filings, now) : kpis.overdueFilings;
  const regOpen = insights ? openRegistrations(insights) : null;
  const history = insights?.history;
  const feed = (insights?.adminFeed ?? []).filter(isAdminWork).slice(0, 6);
  const withLive = (past: number[] | undefined, live: number | null) =>
    past && past.length > 0 && live !== null ? [...past, live] : undefined;
  // The attention rows' date tile: the current step's window end, else the next filing due.
  const dueOf = new Map<string, string>();
  for (const c of insights?.clients ?? []) {
    const due = c.currentStepDue ?? c.nextDueDate;
    if (due) dueOf.set(c.summary.id, due.slice(0, 10));
  }

  return (
    <PageTransition>
      {seo}

      <div className="flex flex-col gap-5">
        {/* The prototype's four tiles, each with its change against last month where stored dates say. */}
        <DashHero
          title={greeting}
          stats={[
            {
              label: 'Clients',
              value: kpis.engagements,
              icon: Building2,
              href: SUPER_PROJECTS_HREF,
              of: changeText(kpis.engagements, trends?.clients),
              trend: trendWithLive(trends, 'clients', kpis.engagements),
              trendTone: 'accent',
              how: 'Every engagement in the firm. The small text is the change against last month.',
            },
            {
              label: 'Registrations open',
              value: regOpen ?? '–',
              icon: IdCard,
              href: SUPER_REGISTRATIONS_HREF,
              how: 'Registration items in progress, waiting or overdue across every client. Items store no history, so there is no trend.',
            },
            {
              label: 'Filed on time',
              value: filedOnTime !== null ? `${filedOnTime}%` : '–',
              icon: ShieldCheck,
              href: SUPER_COMPLIANCES_HREF,
              of: changeText(filedOnTime, history?.filedOnTime, 'pts'),
              trend: withLive(history?.filedOnTime, filedOnTime),
              trendTone: 'ok',
              how: 'Filings filed by their due date, over every filing due by today in the report window.',
            },
            {
              label: 'Filings overdue',
              value: overdue,
              icon: AlertTriangle,
              href: SUPER_FILINGS_HREF,
              hot: overdue > 0,
              of: changeText(overdue, history?.overdueFilings),
              trend: withLive(history?.overdueFilings, overdue),
              trendTone: 'bad',
              how: 'Filings not filed and due in the last 90 days, across every client.',
            },
          ]}
        >
          <Button onClick={() => setAssignOpen(true)}>
            <UserPlus aria-hidden />
            Assign client
          </Button>
          <Button variant="outline" onClick={() => setTaskOpen(true)}>
            <ListPlus aria-hidden />
            Assign task
          </Button>
        </DashHero>

        {insights ? <SuperPracticeCards insights={insights} /> : <InsightShapes count={3} />}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <SuperAdminsPanel staff={staff} engagements={overview.engagements} admins={insights?.team.admins} />
            {insights ? <SuperManagersPanel insights={insights} adminOf={(id) => staff.adminOfManager.get(id)?.name ?? null} /> : <InsightShapes count={1} />}
            {insights ? <SuperPracticeAreasPanel insights={insights} /> : <InsightShapes count={1} />}
            <SuperAttentionPanel overview={overview} dueOf={dueOf} />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <EscalationsPanel canResolve limit={6} />
            {insights ? <SuperTopRisks insights={insights} /> : <InsightShapes count={1} />}
            {insights ? (
              <DashSection title="What admins did" meta="This week" flush>
                {feed.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="No admin activity yet" />
                  </div>
                ) : (
                  <AdminFeedList rows={feed} />
                )}
              </DashSection>
            ) : (
              <InsightShapes count={1} />
            )}
            {insights ? <SuperTeamLoadPanel insights={insights} /> : <InsightShapes count={1} />}
          </div>
        </div>
      </div>

      <AssignClientDialog open={assignOpen} onOpenChange={setAssignOpen} engagements={overview.engagements} staff={staff} />
      <AssignTaskDialog open={taskOpen} onOpenChange={setTaskOpen} engagements={overview.engagements} staff={staff} />
    </PageTransition>
  );
}

/** Grey shapes while the insights read lands (R-48). */
function InsightShapes({ count }: { count: number }) {
  return (
    <div className={count > 1 ? 'grid grid-cols-1 gap-5 md:grid-cols-3' : undefined} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="block h-[220px] animate-pulse rounded-md bg-surface-sunken" />
      ))}
    </div>
  );
}
