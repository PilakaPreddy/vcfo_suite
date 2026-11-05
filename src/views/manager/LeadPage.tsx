'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PlannerCalendar, type PlannerItem } from '@/components/work/PlannerCalendar';
import { addDaysYmd, istYmdOf, weekOf } from '@/lib/work/planner';
import { CheckCircle2, MoreHorizontal, Plus, Sparkles, UserMinus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { DangerConfirm } from '@/components/ui/danger-confirm';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { ActionMenu } from '@/components/ui/action-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { DashSection } from '@/components/dash/DashSection';
import { PlanTimeline } from '@/components/work/PlanTimeline';
import { AssignTaskDialog } from '@/components/staff/today/AssignTaskDialog';
import { copyRowLink, exportRowsCsv } from '@/components/staff/today/work-actions';
import { PersonAvatar } from '@/views/admin/firm-people/parts';
import { usePersonalTodos } from '@/hooks/use-personal-todos';
import { formatDueLabel, ymdInIst } from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';
import { WorkScreen } from '@/views/intern/MyWork';
import { useTeamWork } from '@/views/manager/use-team-work';
import type { TeamWorkItem } from '@/views/manager/team-work';
import { WorkAreaCard, WorkStatusCard } from '@/views/manager/work-summary';

/**
 * One project lead's page (prototype `LeadsScreen`, S-359 to S-373), opened from a row of the
 * Project leads roster: the lead's face, name and counts, "Plan the week", "Assign to-do" and a
 * menu with Export and Copy link; the Status and By area cards; and the lead's work as Planner,
 * List or Board. The Planner holds the lead's timeline (open dated items on the shared Gantt)
 * and their to-do card: the tasks a manager assigned and the lead's own to-dos, read-only.
 * Every number is the lead's items on the caller's engagements (`useTeamWork`).
 */
function LeadPageInner({ leadKey }: { leadKey: string }) {
  // The page lives at /app/manager/team/<lead> and /app/admin/team/<lead> (super admins use the admin one).
  const base = usePathname()?.startsWith('/app/manager') ? '/app/manager' : '/app/admin';
  const projectBase = base;
  const { teamMembers, internsLoading } = useApp();
  const work = useTeamWork({ projectBase, leadKey });
  const [assignOpen, setAssignOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();
  const others = (teamMembers as Array<{ id: string; name: string }>).filter((m) => m.id !== leadKey);

  // S-364: the lead leaves the caller's clients; their open steps and tasks move to `moveTo`.
  const removeLead = async () => {
    if (!moveTo) {
      toastError('Pick a project lead', 'Their open work needs a new owner.');
      throw new Error('no_target');
    }
    const res = await fetch('/api/work/remove-lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromLeadId: leadKey, toLeadId: moveTo }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; clients?: unknown[]; steps?: number; tasks?: number; to?: { name: string } };
    if (!res.ok) {
      toastError('Could not remove the lead', body.error ?? 'Try again');
      throw new Error(body.error ?? 'remove_failed');
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['engagements'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['checklist-index'] }),
    ]);
    toastSuccess(`${name} removed`, `${body.steps ?? 0} steps and ${body.tasks ?? 0} tasks moved to ${body.to?.name ?? 'the new lead'}`);
    router.push(`${base}/team`);
  };
  const lead = (teamMembers as Array<{ id: string; name: string; profileId?: string }>).find((m) => m.id === leadKey);
  const name = lead?.name ?? 'Project lead';
  const first = name.split(/\s+/)[0] ?? name;
  const open = work.items.filter((i) => i.kind !== 'done');
  const overdue = open.filter((i) => i.status === 'Overdue').length;
  const clients = work.leadEngagements.filter((e) => e.stage !== 'Operational Readiness').length;
  const path = `${base}/team/${encodeURIComponent(leadKey)}`;
  const workHref = base === '/app/manager' ? `/app/manager/work?lead=${encodeURIComponent(leadKey)}` : undefined;

  if (!lead && !internsLoading && teamMembers.length > 0) {
    return <EmptyState title="Project lead not found" action={<Button asChild variant="secondary"><Link href={`${base}/team`}>Project leads</Link></Button>} />;
  }

  const head = (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
      <PersonAvatar name={name} size={36} />
      <div className="min-w-0 flex-[1_1_240px]">
        <h1 className="truncate text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">{name}</h1>
        <p className="truncate text-[13.5px] text-ink-muted tabular-nums">
          Project lead · {open.length} open · {overdue} overdue · {clients} {clients === 1 ? 'client' : 'clients'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {workHref ? (
          <Button variant="secondary" asChild>
            <Link href={`${workHref}&view=plan`}>
              <Sparkles className="h-4 w-4" strokeWidth={1.6} /> Plan the week
            </Link>
          </Button>
        ) : null}
        <Button onClick={() => setAssignOpen(true)} disabled={!lead}>
          <Plus className="h-4 w-4" strokeWidth={1.6} /> Assign to-do
        </Button>
        <ActionMenu
          label="More actions"
          trigger={
            <Button size="icon" variant="secondary" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
            </Button>
          }
          items={[
            {
              label: 'Export',
              onSelect: () =>
                exportRowsCsv(
                  `${first.toLowerCase()}-work.csv`,
                  ['Step or filing', 'Client', 'Area', 'Status', 'Due'],
                  work.items.map((i) => [i.title, i.companyName, i.area, i.status, i.dueAt?.slice(0, 10) ?? '']),
                ),
            },
            { label: 'Copy link', key: 'C', onSelect: () => void copyRowLink(path) },
            'separator',
            { label: 'Remove lead', danger: true, Icon: UserMinus, disabled: !lead, onSelect: () => setRemoving(true) },
          ]}
        />
      </div>
    </div>
  );

  const summary = (
    <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <WorkStatusCard title={`${first} · status`} items={work.items} href={workHref} loading={work.loading} />
      <WorkAreaCard items={work.items} loading={work.loading} />
    </div>
  );

  return (
    <>
      <WorkScreen
        workItems={work.items}
        kpis={work.kpis}
        engagements={work.leadEngagements}
        path={path}
        head={head}
        summary={summary}
        views={['plan', 'list', 'board']}
        team={work.team(false)}
        storageScope={`lead:${leadKey}`}
        planner={<LeadPlanner items={work.items} now={work.now} profileId={lead?.profileId} leadKey={leadKey} />}
        seo={{ title: `${name} — VCFO Suite`, description: `${name}'s work, status and planner.`, path }}
      />
      <DangerConfirm
        open={removing}
        onOpenChange={(o) => {
          setRemoving(o);
          if (!o) setMoveTo('');
        }}
        title={`Remove ${name} as project lead?`}
        body={
          <span className="grid gap-3">
            <span>
              {open.length
                ? `${open.length} open ${open.length === 1 ? 'item moves' : 'items move'} to the lead you pick, on ${clients} ${clients === 1 ? 'client' : 'clients'}.`
                : `${name} has no open items; they leave ${clients} ${clients === 1 ? 'client' : 'clients'}.`}
            </span>
            <select
              aria-label="Move open work to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="h-10 w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink"
            >
              <option value="">Move open work to…</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>
        }
        word="REMOVE"
        confirm="Remove lead"
        icon={UserMinus}
        onConfirm={removeLead}
      />
      <AssignTaskDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        engagements={work.scopedEngagements}
        teamMembers={teamMembers}
        leadKey={leadKey}
        title="Assign a to-do"
      />
    </>
  );
}

type TodoShow = 'open' | 'late' | 'all';

/**
 * The lead's Planner: the timeline of their open dated items, and the to-do card with the
 * tasks a manager assigned them (Open, Overdue, All) and their own to-dos. A manager reads a
 * lead's to-dos through `/api/todos` (self, reports and people on scoped engagements) but only
 * the owner may tick them, so they are read-only here.
 */
function LeadPlanner({ items, now, profileId, leadKey }: { items: TeamWorkItem[]; now: Date; profileId?: string; leadKey: string }) {
  const [show, setShow] = useState<TodoShow>('open');
  const router = useRouter();
  const today = ymdInIst(now);
  const [weekYmd, setWeekYmd] = useState(() => istYmdOf(now));
  const weekDays = useMemo(() => weekOf(weekYmd), [weekYmd]);
  const hrefOf = useMemo(() => new Map(items.map((i) => [i.id, i.href])), [items]);
  const calendarItems = useMemo<PlannerItem[]>(
    () =>
      items
        .filter((i) => i.kind !== 'done')
        .map((i) => ({
          key: i.id,
          title: i.title,
          companyName: i.companyName,
          dueYmd: i.dueAt?.slice(0, 10),
          overdue: i.isOverdue,
          source: i.source,
          managerDated: Boolean(i.windowLabel),
        })),
    [items],
  );
  const todosQuery = usePersonalTodos(Boolean(profileId));
  const ownTodos = (todosQuery.data ?? []).filter((t) => t.ownerId === profileId);
  const tasks = items
    .filter((i) => i.source === 'task')
    .filter((i) => (show === 'all' ? true : show === 'late' ? i.status === 'Overdue' : i.kind !== 'done'))
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const count = tasks.length + ownTodos.filter((t) => show === 'all' || !t.done).length;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
      <PlanTimeline items={items} now={now} onOpen={(i) => router.push(i.href)} />
      {/* The lead's own week (read only): their time blocks on the manager's clients. */}
      <PlannerCalendar
        days={weekDays}
        onWeek={(d) => setWeekYmd((ymd) => (d === 0 ? istYmdOf(new Date()) : addDaysYmd(ymd, d * 7)))}
        onDate={setWeekYmd}
        items={calendarItems}
        now={now}
        onOpenItem={(key) => {
          const href = hrefOf.get(key);
          if (href) router.push(href);
        }}
        leadKey={leadKey}
      />
      </div>
      <DashSection
        title="To-do"
        meta={count}
        flush
        right={
          <SpectrumTabs
            label="To-do filter"
            items={[
              { key: 'open', label: 'Open' },
              { key: 'late', label: 'Overdue' },
              { key: 'all', label: 'All' },
            ]}
            value={show}
            onChange={(k) => setShow(k as TodoShow)}
          />
        }
      >
        {tasks.length === 0 && ownTodos.length === 0 ? (
          <EmptyState title="No to-dos" className="m-4" />
        ) : (
          <ul>
            {tasks.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 border-b border-line-soft px-4 py-2 text-[13.5px] last:border-b-0">
                {t.kind === 'done' ? <CheckCircle2 className="h-4 w-4 flex-none text-positive" strokeWidth={1.8} aria-label="Done" /> : null}
                <Link href={t.href} className="min-w-0 flex-1 hover:underline">
                  <span className={cn('block truncate font-medium text-ink', t.kind === 'done' && 'text-ink-muted')}>{t.title}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{t.companyName}</span>
                </Link>
                {t.kind === 'done' ? (
                  <Chip tone="ok" fixed>
                    Done
                  </Chip>
                ) : (
                  <Chip tone={t.status === 'Overdue' ? 'bad' : 'idle'} fixed>
                    {formatDueLabel(t.dueAt, now)}
                  </Chip>
                )}
              </li>
            ))}
            {ownTodos
              .filter((t) => show === 'all' || !t.done)
              .map((t) => (
                <li key={t.id} className="flex min-h-11 items-center gap-3 border-b border-line-soft px-4 py-2 text-[13.5px] last:border-b-0">
                  <Checkbox checked={t.done} disabled aria-label={t.title} />
                  <span className={cn('min-w-0 flex-1 truncate text-ink', t.done && 'text-ink-muted')}>{t.title}</span>
                  {t.done ? (
                    <Chip tone="ok" fixed>
                      Done
                    </Chip>
                  ) : null}
                  <span className="text-[12px] text-ink-muted">{t.custom ? 'Own to-do' : 'Pinned'}</span>
                </li>
              ))}
          </ul>
        )}
      </DashSection>
    </div>
  );
}

export default function LeadPage({ leadKey }: { leadKey: string }) {
  return (
    <Suspense fallback={<div className="text-[15px] text-ink-muted">Project lead</div>}>
      <LeadPageInner leadKey={leadKey} />
    </Suspense>
  );
}
