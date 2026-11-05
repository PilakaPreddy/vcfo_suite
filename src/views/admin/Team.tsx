"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTeamWork } from "@/views/manager/use-team-work";
import { cn } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { PageTransition } from "@/components/shell/PageTransition";
import { PageHeader } from "@/components/admin/PageHeader";
import { CreateInternForm } from "@/components/admin/CreateInternForm";
import { SEO } from "@/components/SEO";
import { EFilingGrid, type EFilingColumn } from "@/components/dash/EFilingGrid";
import { EmptyState, SkeletonRows } from "@/components/ui/empty-state";
import { PeopleCard, PersonAvatar } from "./firm-people/parts";
import { Users } from "lucide-react";
import { CapacityControl, LastSeenCell, LoadCell, OnTimeCell } from "@/components/metrics/people-cells";
import { indexPeople, usePeopleMetrics } from "@/components/metrics/use-metrics";
import { isFirmWideAdmin } from "@/lib/auth";

type RosterRow = { id: string; name: string; email?: string; open: number; late: number; myEng: number };

/**
 * Project leads (prototype `LeadsScreen`): the add-lead form in one card and the active leads
 * as a T1 grid (R-07) with projects, open tasks, On time, Load against capacity, Last active and
 * (admin and super admin) the capacity editor, from `/api/metrics/people` (G-14). Open and late
 * count the lead's work items (`useTeamWork`, the same items as their Work list); a row opens
 * the lead's own page (`/team/<lead>`).
 */
export default function Team() {
  const { internOptions, internsLoading, engagements, role } = useApp();
  const router = useRouter();
  // The roster lives at /app/manager/team and /app/admin/team (super admins use the admin one).
  const base = usePathname()?.startsWith("/app/manager") ? "/app/manager" : "/app/admin";
  const work = useTeamWork({ projectBase: base });
  const peopleQuery = usePeopleMetrics();
  const people = useMemo(() => indexPeople(peopleQuery.data), [peopleQuery.data]);
  const canSetCapacity = isFirmWideAdmin(role);

  const roster = useMemo(() => {
    const list = internOptions ?? [];
    return list.map((m) => {
      const mine = work.all.filter((i) => i.leadId === m.id && i.kind !== "done");
      const open = mine.length;
      const late = mine.filter((i) => i.status === "Overdue").length;
      const myEng = engagements.filter(
        (e) => e.stage !== "Operational Readiness" && (e.internId === m.id || (e.leadIds ?? []).includes(m.id)),
      ).length;
      return { ...m, email: (m as { email?: string }).email, open, late, myEng };
    });
  }, [internOptions, work.all, engagements]);

  const columns: EFilingColumn<RosterRow>[] = [
    {
      key: "name",
      header: "Project lead",
      render: (m) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={m.name} />
          <span className="min-w-0">
            <b className="block truncate font-medium text-ink">{m.name}</b>
            {m.email ? <span className="block truncate text-[12px] text-ink-muted">{m.email}</span> : null}
          </span>
        </span>
      ),
    },
    { key: "projects", header: "Projects", width: "96px", align: "right", render: (m) => <span className="tabular-nums">{m.myEng}</span> },
    { key: "open", header: "Open", width: "80px", align: "right", render: (m) => <span className="tabular-nums">{m.open}</span> },
    {
      key: "late",
      header: "Late",
      width: "72px",
      align: "right",
      render: (m) => <span className={cn("tabular-nums", m.late > 0 ? "font-medium text-danger" : "text-ink-muted")}>{m.late}</span>,
    },
    { key: "ontime", header: "On time", width: "84px", align: "right", render: (m) => <OnTimeCell person={people.byInternId.get(m.id)} /> },
    { key: "load", header: "Load", width: "150px", render: (m) => <LoadCell person={people.byInternId.get(m.id)} /> },
    { key: "seen", header: "Last active", width: "104px", render: (m) => <LastSeenCell person={people.byInternId.get(m.id)} /> },
    ...(canSetCapacity
      ? [
          {
            key: "capacity",
            header: "Capacity",
            width: "96px",
            render: (m: RosterRow) => {
              const person = people.byInternId.get(m.id);
              return person ? <CapacityControl person={person} /> : null;
            },
          },
        ]
      : []),
  ];

  return (
    <PageTransition>
      <SEO
        title="Project leads — VCFO Suite"
        description="Create project lead accounts and review delivery workload."
        path="/app/manager/team"
      />

      <PageHeader
        accent="violet"
        icon={Users}
        title="Project leads"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <PeopleCard title="Add project lead" className="h-fit">
          <div className="p-4 sm:p-5">
            <CreateInternForm />
          </div>
        </PeopleCard>

        <PeopleCard title="Active project leads" count={internsLoading ? undefined : roster.length}>
          {internsLoading ? (
            <SkeletonRows className="p-4" />
          ) : roster.length === 0 ? (
            <EmptyState title="No project leads yet" className="m-4" />
          ) : (
            <div className="px-2 pb-2">
              <EFilingGrid
                caption="Active project leads"
                columns={columns}
                rows={roster}
                rowKey={(m) => m.id}
                onRowClick={(m) => router.push(`${base}/team/${encodeURIComponent(m.id)}`)}
                pageSize={12}
                minWidth={canSetCapacity ? 860 : 760}
              />
            </div>
          )}
        </PeopleCard>
      </div>
    </PageTransition>
  );
}
