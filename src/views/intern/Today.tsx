'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewTodoDialog } from '@/components/work/PlannerTodos';
import { useOwnFocusTodos } from '@/hooks/use-personal-todos';
import { createCustomInternFocus, internQueueCompanyHref } from '@/lib/intern/intern-work';
import { deriveStuckReason } from '@/lib/projects/project-stuck';
import { toastSuccess } from '@/lib/toast-errors';
import { useApp } from '@/context/AppContext';
import { useInternPortfolio } from '@/hooks/use-intern-portfolio';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { LeadHero } from '@/components/intern/LeadHero';
import { LeadInboxCard } from '@/components/intern/LeadInboxCard';
import { LeadActionQueue } from '@/components/intern/LeadActionQueue';
import { LeadPhaseProgress } from '@/components/intern/LeadPhaseProgress';
import { FilingsMatrix } from '@/components/intern/FilingsMatrix';
import { LeadSideRail } from '@/components/intern/LeadSideRail';
import { TodayScopeTabs } from '@/components/staff/today/today-parts';
import { engagementInScope, todayStatusOf, type TodayScope } from '@/components/staff/today/today-rows';
import type { InternWorkItem } from '@/lib/intern/intern-work';

/** Main column and a rail, as on every staff Today (prototype TodayScreen GRID). */
const GRID = 'grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]';

/**
 * The lead's Today (prototype TodayScreen, C-0103, C-0114): the compact home card with five
 * numbers, then the Action queue, Phase progress and Clients × filings beside the rail
 * (Inbox, Waiting on client). The practice strip left the page; its numbers are in the
 * home card and the cards below. The scope switch sits in the home card (D-17) and narrows
 * the cards below it to the incorporating companies or the incorporated ones. The home card numbers follow the scope too. The rail's Inbox holds the client messages to triage
 * (G-11) beside the lead's own to-dos.
 */
export default function InternToday() {
  const { user, getStateForEngagement, engagementsLoading } = useApp();
  const { myEngagements, workItems, filings } = useInternPortfolio();
  const now = useMemo(() => new Date(), []);
  const [scope, setScope] = useState<TodayScope>('all');
  const [todoOpen, setTodoOpen] = useState(false);
  // One to-do state for the home card's "New to-do" and the Inbox's My to-dos.
  const todos = useOwnFocusTodos(user?.id ?? '', workItems);

  const scopeCounts = useMemo(() => {
    const incorporating = myEngagements.filter((e) => engagementInScope('incorporating', e, getStateForEngagement(e))).length;
    return { all: myEngagements.length, incorporating, compliance: myEngagements.length - incorporating };
  }, [myEngagements, getStateForEngagement]);
  const engagements = useMemo(
    () => myEngagements.filter((e) => engagementInScope(scope, e, getStateForEngagement(e))),
    [myEngagements, scope, getStateForEngagement],
  );
  const ids = useMemo(() => new Set(engagements.map((e) => e.id)), [engagements]);
  const items = useMemo(() => workItems.filter((i) => ids.has(i.engagementId)), [workItems, ids]);
  const scopedFilings = useMemo(() => filings.filter((f) => ids.has(f.engagementId)), [filings, ids]);

  const byId = useMemo(() => new Map(myEngagements.map((e) => [e.id, e])), [myEngagements]);
  const stuck = useMemo(
    () =>
      engagements
        .filter((e) => e.stage !== 'Operational Readiness' && deriveStuckReason(e, getStateForEngagement(e)) !== 'on_track')
        .map((e) => ({ engagementId: e.id, companyName: e.companyName, href: internQueueCompanyHref(e.id, workItems) })),
    [engagements, getStateForEngagement, workItems],
  );
  const statusOf = (item: InternWorkItem) => {
    const eng = byId.get(item.engagementId);
    const slice = eng && item.catalogId ? getStateForEngagement(eng)[item.catalogId] : undefined;
    return todayStatusOf(item, slice, now);
  };

  return (
    <PageTransition>
      <SEO
        title="Today — VCFO Suite"
        description="What needs you, what’s waiting, and what’s due this week."
        path="/app/intern/today"
      />

      <div className="flex flex-col gap-5">
        <LeadHero
          name={user?.name ?? ''}
          items={items}
          now={now}
          stamp={scope === 'all' && !engagementsLoading}
          scope={<TodayScopeTabs value={scope} onChange={setScope} counts={scopeCounts} />}
        >
          {/* M-30: on a phone the button is a 36 px icon, so it fits beside the scope switch. */}
          <Button onClick={() => setTodoOpen(true)} className="max-sm:w-9 max-sm:px-0" title="New to-do">
            <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden /> <span className="max-sm:sr-only">New to-do</span>
          </Button>
        </LeadHero>

        <div className={GRID}>
          <div className="flex min-w-0 flex-col gap-5">
            <LeadActionQueue
              userId={user?.id ?? ''}
              items={items}
              now={now}
              statusOf={statusOf}
              stuck={stuck}
              loading={engagementsLoading}
            />
            {scope !== 'compliance' ? <LeadPhaseProgress engagements={engagements} getState={getStateForEngagement} /> : null}
            {scope !== 'incorporating' ? (
              <FilingsMatrix filings={scopedFilings} engagements={engagements} now={now} />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-5" aria-label="Inbox">
            <LeadInboxCard userId={user?.id ?? ''} items={workItems} todos={todos} engagementIds={ids} />
            <LeadSideRail items={items} />
          </div>
        </div>
      </div>
      <NewTodoDialog
        open={todoOpen}
        onOpenChange={setTodoOpen}
        onAdd={(title) => {
          todos.persist([createCustomInternFocus(title), ...todos.focus]);
          toastSuccess('To-do added', title);
        }}
      />
    </PageTransition>
  );
}
