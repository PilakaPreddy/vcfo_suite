'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { ActionMenu } from '@/components/ui/action-menu';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { PhaseBar } from '@/components/ui/step-track';
import { LastSeenCell, LoadCell, OnTimeCell } from '@/components/metrics/people-cells';
import { indexPeople, usePeopleMetrics } from '@/components/metrics/use-metrics';
import { ToneBar } from '@/components/super/parts/super-parts';
import { formatSuperAgo } from '@/components/super/overview/super-overview-format';
import { LeadCompanyChip } from '@/components/intern/LeadCompanyChip';
import { buildPhaseProgressRows } from '@/components/staff/today/today-rows';
import { exportRowsCsv } from '@/components/staff/today/work-actions';
import { adminProjectPath } from '@/lib/projects/project-step-path';
import { cn } from '@/lib/utils';
import { HealthChip, PersonAvatar } from '@/views/admin/firm-people/parts';
import { useTeamWork } from '@/views/manager/use-team-work';
import { LeadExpandList } from '@/views/manager/LeadExpandList';
import { WorkAreaCard, WorkStatusCard } from '@/views/manager/work-summary';
import type { TeamWorkItem } from '@/views/manager/team-work';
import {
  AssignClientDialog,
  AssignManagerTaskDialog,
  ResolveEscalationDialog,
  type ManagerOption,
} from '@/views/admin/managers/managers-dialogs';

async function fetchManagers(): Promise<ManagerOption[]> {
  const res = await fetch('/api/admin/managers');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (body.managers ?? []) as ManagerOption[];
}

async function fetchEscalations(): Promise<Escalation[]> {
  const res = await fetch('/api/super/escalations?status=open');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (body.escalations ?? []) as Escalation[];
}

/** An open escalation as `/api/super/escalations` sends it (the fields this page reads). */
type Escalation = {
  id: string;
  engagementId: string;
  companyName: string;
  reason: string;
  raisedByName: string | null;
  createdAt: string;
};

type ManagerRow = {
  id: string;
  name: string;
  leads: number;
  clients: number;
  open: number;
  overdue: number;
};

const DAY_MS = 86_400_000;

/**
 * Admin Managers (prototype `ManagersScreen`, S-380 to S-396): the managers grid; a click picks
 * a manager (kept in the URL hash) and their detail shows below it: face, name and counts, the
 * capacity line, "Assign client" and a menu with "Assign a task" and Export; the Status and By
 * area cards over their leads' work; their clients; their project leads that expand to open
 * items with Reassign; the open escalations on their clients (Reassign, Resolve); and the
 * clients without a manager and the project leads without one. Every number comes from the
 * stored engagements, tasks, filings, escalations and people metrics.
 */
export default function ManagersPage() {
  const router = useRouter();
  const { engagements, teamMembers, getStateForEngagement, updateEngagement, engagementsLoading } = useApp();
  const managersQuery = useQuery({ queryKey: ['admin-managers'], queryFn: fetchManagers, staleTime: 5 * 60_000 });
  const escalationsQuery = useQuery({ queryKey: ['escalations', 'open'], queryFn: fetchEscalations, staleTime: 60_000 });
  const peopleQuery = usePeopleMetrics();
  const people = useMemo(() => indexPeople(peopleQuery.data), [peopleQuery.data]);
  const managers = useMemo(() => managersQuery.data ?? [], [managersQuery.data]);
  const [pick, setPick] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ engagementId?: string; managerId?: string } | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [resolving, setResolving] = useState<Escalation | null>(null);

  // The sidebar and links pick a manager with `#<profile id>`.
  useEffect(() => {
    const read = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) setPick(id);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const picked = managers.find((m) => m.id === pick) ?? managers[0] ?? null;
  const choose = (id: string) => {
    setPick(id);
    router.replace(`#${encodeURIComponent(id)}`, { scroll: false });
  };

  const firm = useTeamWork({ projectBase: '/app/admin' });
  const mine = useTeamWork({
    projectBase: '/app/admin',
    managerId: picked?.id ?? '__none__',
    owners: picked ? [{ profileId: picked.id, name: picked.name }] : undefined,
  });

  const live = useMemo(() => engagements.filter((e) => e.stage !== 'Operational Readiness'), [engagements]);
  const managerOf = (e: { managerId?: string; adminId: string }) => e.managerId ?? e.adminId;

  const rows = useMemo((): ManagerRow[] => {
    const itemsByEng = new Map<string, TeamWorkItem[]>();
    for (const i of firm.all) {
      const list = itemsByEng.get(i.engagementId) ?? [];
      list.push(i);
      itemsByEng.set(i.engagementId, list);
    }
    return managers.map((m) => {
      const engs = live.filter((e) => managerOf(e) === m.id);
      const leads = new Set<string>();
      let open = 0;
      let overdue = 0;
      for (const e of engs) {
        if (e.internId) leads.add(e.internId);
        for (const l of e.leadIds ?? []) leads.add(l);
        for (const i of itemsByEng.get(e.id) ?? []) {
          if (i.kind === 'done') continue;
          open += 1;
          if (i.status === 'Overdue') overdue += 1;
        }
      }
      return { id: m.id, name: m.name, leads: leads.size, clients: engs.length, open, overdue };
    });
  }, [managers, live, firm.all]);

  const columns: EFilingColumn<ManagerRow>[] = [
    {
      key: 'name',
      header: 'Manager',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={r.name} size={24} />
          <span className="truncate font-medium text-ink">{r.name}</span>
        </span>
      ),
    },
    { key: 'leads', header: 'Project leads', width: '120px', align: 'right', render: (r) => <span className="tabular-nums">{r.leads}</span> },
    { key: 'clients', header: 'Clients', width: '84px', align: 'right', render: (r) => <span className="tabular-nums">{r.clients}</span> },
    { key: 'open', header: 'Open tasks', width: '104px', align: 'right', render: (r) => <span className="tabular-nums">{r.open}</span> },
    {
      key: 'overdue',
      header: 'Overdue',
      width: '88px',
      align: 'right',
      render: (r) => <span className={cn('tabular-nums', r.overdue > 0 ? 'font-medium text-danger' : 'text-ink-muted')}>{r.overdue}</span>,
    },
    { key: 'ontime', header: 'On time', width: '80px', align: 'right', render: (r) => <OnTimeCell person={people.byProfileId.get(r.id)} /> },
    { key: 'load', header: 'Load', width: '150px', render: (r) => <LoadCell person={people.byProfileId.get(r.id)} /> },
    { key: 'seen', header: 'Last active', width: '104px', render: (r) => <LastSeenCell person={people.byProfileId.get(r.id)} /> },
  ];

  const pickedRow = rows.find((r) => r.id === picked?.id);
  const person = picked ? people.byProfileId.get(picked.id) : undefined;
  const clients = useMemo(() => live.filter((e) => picked && managerOf(e) === picked.id), [live, picked]);
  const clientRows = useMemo(
    () => buildPhaseProgressRows({ engagements: clients, getState: getStateForEngagement, href: (e) => adminProjectPath(e, '/app/admin'), now: firm.now }),
    [clients, getStateForEngagement, firm.now],
  );
  const leadKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of clients) {
      if (e.internId) keys.add(e.internId);
      for (const l of e.leadIds ?? []) keys.add(l);
    }
    return keys;
  }, [clients]);
  const leads = firm.leads.filter((l) => leadKeys.has(l.id));
  const clientIds = new Set(clients.map((e) => e.id));
  const escalations = (escalationsQuery.data ?? []).filter((e) => clientIds.has(e.engagementId));
  const unassigned = live.filter((e) => !e.managerId);
  const leadsWithoutManager = (teamMembers as Array<{ id: string; name: string; reportsToManagerId?: string | null }>).filter(
    (m) => 'reportsToManagerId' in m && !m.reportsToManagerId,
  );
  const first = picked?.name.split(/\s+/)[0] ?? '';
  const capacity = person?.capacity ?? null;
  const capPct = capacity ? (clients.length / capacity) * 100 : null;
  const engById = new Map(engagements.map((e) => [e.id, e]));
  const leadName = (key: string) => firm.leads.find((l) => l.id === key)?.name ?? '';

  return (
    <PageTransition>
      <SEO title="Managers — VCFO Suite" description="Managers, their clients and leads, escalations and clients to assign." path="/app/admin/managers" />
      <div className="grid grid-cols-1 gap-5">
        <DashSection title="Managers" meta={managers.length || undefined} flush>
          <EFilingGrid
            caption="Managers"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => choose(r.id)}
            rowClassName={(r) => (r.id === picked?.id ? 'bg-brand-soft' : undefined)}
            loading={managersQuery.isLoading}
            empty="No managers yet"
            minWidth={900}
          />
        </DashSection>

        {picked ? (
          <>
            <section className="flex flex-wrap items-center gap-3" aria-label={picked.name}>
              <PersonAvatar name={picked.name} size={36} />
              <div className="min-w-0 flex-[1_1_320px]">
                <h2 className="truncate text-[22px] font-medium leading-8 tracking-[-0.01em] text-ink">{picked.name}</h2>
                <p className="text-[13.5px] text-ink-muted tabular-nums">
                  Manager · {clients.length} {clients.length === 1 ? 'client' : 'clients'} · {leads.length} project{' '}
                  {leads.length === 1 ? 'lead' : 'leads'} · {pickedRow?.open ?? 0} open · {pickedRow?.overdue ?? 0} overdue
                  {person?.onTime.pct != null ? ` · ${person.onTime.pct}% on time` : ''}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted tabular-nums">
                  {capacity ? `Capacity ${clients.length} of ${capacity} clients` : `${clients.length} clients · no capacity set`}
                  {person?.lastSeenAt ? ` · last active ${formatSuperAgo(person.lastSeenAt)}` : ''}
                  {capPct !== null ? (
                    <ToneBar pct={capPct} tone={capPct > 100 ? 'bad' : capPct > 80 ? 'warn' : 'prog'} className="w-[160px]" />
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setAssign({ managerId: picked.id })}>Assign client</Button>
                <ActionMenu
                  label="More actions"
                  trigger={
                    <Button size="icon" variant="secondary" aria-label="More actions">
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
                    </Button>
                  }
                  items={[
                    { label: 'Assign a task', onSelect: () => setTaskOpen(true), disabled: clients.length === 0 },
                    {
                      label: 'Export',
                      onSelect: () =>
                        exportRowsCsv(
                          `${first.toLowerCase() || 'manager'}-work.csv`,
                          ['Item', 'Client', 'Lead', 'Area', 'Status', 'Due'],
                          mine.items.map((i) => [i.title, i.companyName, i.leadName, i.area, i.status, i.dueAt?.slice(0, 10) ?? '']),
                        ),
                    },
                  ]}
                />
              </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <WorkStatusCard title={`${first} · status`} items={mine.items} href="/app/admin/projects" loading={engagementsLoading} />
              <WorkAreaCard items={mine.items} loading={engagementsLoading} />
            </div>

            <DashSection title={`${first}'s clients`} meta={clients.length} flush>
              <EFilingGrid
                caption={`${first}'s clients`}
                rows={clientRows}
                rowKey={(r) => r.engagementId}
                onRowClick={(r) => router.push(r.href)}
                empty="No clients yet"
                minWidth={900}
                columns={[
                  {
                    key: 'client',
                    header: 'Client',
                    render: (r) => (
                      <span className="flex min-w-0 items-center gap-2">
                        <LeadCompanyChip name={r.companyName} compact />
                        <span className="truncate font-medium text-ink">{r.companyName}</span>
                      </span>
                    ),
                  },
                  { key: 'now', header: 'Now at', width: '24%', render: (r) => <span className="truncate text-ink-2">{r.currentLabel}</span> },
                  {
                    key: 'progress',
                    header: 'Progress',
                    width: '200px',
                    render: (r) => <PhaseBar done={r.done} totals={r.totals} names={r.names} className="w-full" />,
                  },
                  {
                    key: 'lead',
                    header: 'Project lead',
                    width: '140px',
                    render: (r) => {
                      const key = engById.get(r.engagementId)?.internId ?? '';
                      return <span className="truncate">{leadName(key) || <span className="text-ink-faint">None</span>}</span>;
                    },
                  },
                  {
                    key: 'stage',
                    header: 'Stage',
                    width: '140px',
                    render: (r) => <Tag tone="idle">{engById.get(r.engagementId)?.stage ?? ''}</Tag>,
                  },
                  {
                    key: 'health',
                    header: 'Health',
                    width: '120px',
                    render: (r) => <HealthChip health={engById.get(r.engagementId)?.health} stuck={r.stuck} />,
                  },
                ]}
              />
            </DashSection>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]">
              <LeadExpandList
                leads={leads}
                items={mine.items}
                engagements={clients}
                projectBase="/app/admin"
                peopleByInternId={people.byInternId}
                allLeads={firm.leads}
              />
              <div className="flex min-w-0 flex-col gap-5">
                <DashSection title="Escalations" meta={escalations.length} flush loading={escalationsQuery.isLoading}>
                  {escalations.length === 0 ? (
                    <EmptyState title="No open escalations" className="m-4" />
                  ) : (
                    escalations.map((e) => {
                      const eng = engById.get(e.engagementId);
                      const age = Math.max(0, Math.floor((Date.now() - Date.parse(e.createdAt)) / DAY_MS));
                      return (
                        <div key={e.id} className="flex items-start gap-3 border-t border-line-soft px-4 py-3 text-[13.5px] first:border-t-0">
                          <span className="min-w-0 flex-1">
                            {eng ? (
                              <Link href={adminProjectPath(eng, '/app/admin')} className="block truncate font-medium text-ink hover:underline">
                                {e.reason}
                              </Link>
                            ) : (
                              <span className="block truncate font-medium text-ink">{e.reason}</span>
                            )}
                            <span className="block truncate text-[12.5px] text-ink-muted">
                              {e.companyName}
                              {e.raisedByName ? ` · ${e.raisedByName}` : ''}
                              {eng?.internId && leadName(eng.internId) ? ` · ${leadName(eng.internId)}` : ''}
                            </span>
                            <span className="mt-2 flex gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => setAssign({ engagementId: e.engagementId })}>
                                Reassign
                              </Button>
                              <Button size="sm" variant="soft" onClick={() => setResolving(e)}>
                                Resolve
                              </Button>
                            </span>
                          </span>
                          <Chip tone={age > 5 ? 'bad' : 'warn'} fixed>
                            {age} {age === 1 ? 'day' : 'days'}
                          </Chip>
                        </div>
                      );
                    })
                  )}
                </DashSection>
                <DashSection title="Assign" meta={`${unassigned.length} without a manager`} flush>
                  {unassigned.length === 0 ? (
                    <EmptyState title="Every client has a manager" className="m-4" />
                  ) : (
                    unassigned.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[13.5px] first:border-t-0">
                        <span className="min-w-0 flex-1">
                          <Link href={adminProjectPath(e, '/app/admin')} className="block truncate font-medium text-ink hover:underline">
                            {e.companyName}
                          </Link>
                          <span className="block truncate text-[12.5px] text-ink-muted">{e.stage}</span>
                        </span>
                        <Button size="sm" variant="outline" onClick={() => setAssign({ engagementId: e.id })}>
                          Assign
                        </Button>
                      </div>
                    ))
                  )}
                </DashSection>
                <DashSection title="Project leads without a manager" meta={leadsWithoutManager.length} flush>
                  {leadsWithoutManager.length === 0 ? (
                    <EmptyState title="Every lead reports to a manager" className="m-4" />
                  ) : (
                    leadsWithoutManager.map((l) => (
                      <Link
                        key={l.id}
                        href={`/app/admin/team/${encodeURIComponent(l.id)}`}
                        className="flex items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-[13.5px] first:border-t-0 hover:bg-surface-sunken"
                      >
                        <PersonAvatar name={l.name} size={24} />
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{l.name}</span>
                      </Link>
                    ))
                  )}
                </DashSection>
              </div>
            </div>
          </>
        ) : managersQuery.isLoading ? null : (
          <EmptyState title="No managers yet" />
        )}
      </div>

      <AssignClientDialog
        open={assign !== null}
        onOpenChange={(o) => !o && setAssign(null)}
        engagements={live}
        managers={managers}
        managerId={assign?.managerId}
        engagementId={assign?.engagementId}
        onSave={(engagementId, managerId) => updateEngagement(engagementId, { managerId })}
      />
      <AssignManagerTaskDialog open={taskOpen} onOpenChange={setTaskOpen} manager={picked} engagements={clients} />
      <ResolveEscalationDialog escalation={resolving} onOpenChange={(o) => !o && setResolving(null)} />
    </PageTransition>
  );
}
