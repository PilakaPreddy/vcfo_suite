'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { adminProjectPath } from '@/lib/projects/project-step-path';
import { AssignClientDialog, ResolveEscalationDialog, type ManagerOption } from '@/views/admin/managers/managers-dialogs';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { ProjectActionsMenu } from '@/components/admin/ProjectActionsMenu';
import { CompanyTile } from '@/components/staff/today/today-parts';
import type { Engagement } from '@/data/engagements';
import { stageDisplayLabel } from '@/lib/projects/stage';
import { pendingApprovalKind, usePendingApprovals } from '@/hooks/use-pending-approvals';
import { checklistItemLabel } from '@/lib/audit/audit-log';
import { adminProjectStepPath } from '@/lib/projects/project-step-path';

const MAX_ROWS = 6;
const DAY_MS = 86_400_000;

type OpenEscalation = { id: string; engagementId: string; companyName: string; reason: string; createdAt: string };

async function fetchJson<T>(url: string, key: string): Promise<T[]> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (body[key] ?? []) as T[];
}

/**
 * Needs your decision (prototype admin Today DecisionsCard): projects that have no manager yet
 * with "Assign" (and the project menu), the open escalations with Resolve, then every step
 * waiting on a firm decision, each opening the step with its Accept / Reject pair.
 */
export function FirmDecisionsCard({ engagements }: { engagements: Engagement[] }) {
  const { updateEngagement } = useApp();
  const approvals = usePendingApprovals('firm');
  const escalationsQuery = useQuery({
    queryKey: ['escalations', 'open'],
    queryFn: () => fetchJson<OpenEscalation>('/api/super/escalations?status=open', 'escalations'),
    staleTime: 60_000,
  });
  const managersQuery = useQuery({
    queryKey: ['admin-managers'],
    queryFn: () => fetchJson<ManagerOption>('/api/admin/managers', 'managers'),
    staleTime: 5 * 60_000,
  });
  const [assignId, setAssignId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<OpenEscalation | null>(null);
  const unassigned = engagements.filter((e) => e.stage !== 'Operational Readiness' && !e.managerId?.trim());
  const escalations = escalationsQuery.data ?? [];
  const total = unassigned.length + escalations.length + approvals.length;
  const shownEscalations = escalations.slice(0, Math.max(0, MAX_ROWS - unassigned.length));
  const shownApprovals = approvals.slice(0, Math.max(0, MAX_ROWS - unassigned.length - shownEscalations.length));
  const byId = new Map(engagements.map((e) => [e.id, e]));

  return (
    <DashSection
      title="Needs your decision"
      meta={String(total)}
      href="/app/admin/approvals"
      hrefLabel="All approvals"
      bodyClassName="p-0"
    >
      {total === 0 ? (
        <EmptyState title="Nothing waiting" className="m-4" />
      ) : (
        <ul>
          {unassigned.map((eng) => (
            <li key={eng.id} className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0">
              <CompanyTile name={eng.companyName} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{eng.companyName} has no manager</span>
                <span className="block truncate text-[12.5px] text-ink-muted">{stageDisplayLabel(eng.stage)}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setAssignId(eng.id)}>
                Assign
              </Button>
              <ProjectActionsMenu engagement={eng} />
            </li>
          ))}
          {shownEscalations.map((e) => {
            const eng = byId.get(e.engagementId);
            const age = Math.max(0, Math.floor((Date.now() - Date.parse(e.createdAt)) / DAY_MS));
            return (
              <li key={e.id} className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0">
                <CompanyTile name={e.companyName} size={30} />
                <span className="min-w-0 flex-1">
                  {eng ? (
                    <Link href={adminProjectPath(eng, '/app/admin')} className="block truncate font-medium text-ink hover:underline">
                      {e.reason}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium text-ink">{e.reason}</span>
                  )}
                  <span className="block truncate text-[12.5px] text-ink-muted">{e.companyName} · Escalation</span>
                </span>
                <Chip tone={age > 5 ? 'bad' : 'warn'} fixed>
                  {age} {age === 1 ? 'day' : 'days'}
                </Chip>
                <Button size="sm" variant="outline" onClick={() => setResolving(e)}>
                  Resolve
                </Button>
              </li>
            );
          })}
          {shownApprovals.map((row) => {
            const href = adminProjectStepPath({ id: row.engagementId, slug: row.slug }, row.itemId, '/app/admin');
            return (
              <li
                key={`${row.engagementId}-${row.itemId}-${row.clientFill ? 'fill' : 'review'}`}
                className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0"
              >
                <CompanyTile name={row.companyName} size={30} />
                <span className="min-w-0 flex-1">
                  <Link href={href} className="block truncate font-medium text-ink hover:underline">
                    {checklistItemLabel(row.itemId)}
                  </Link>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {row.companyName} · {pendingApprovalKind(row)}
                  </span>
                </span>
                <Button size="sm" variant="outline" asChild>
                  <Link href={href}>Decide</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <AssignClientDialog
        open={assignId !== null}
        onOpenChange={(o) => !o && setAssignId(null)}
        engagements={engagements}
        managers={managersQuery.data ?? []}
        engagementId={assignId}
        onSave={(engagementId, managerId) => updateEngagement(engagementId, { managerId })}
      />
      <ResolveEscalationDialog escalation={resolving} onOpenChange={(o) => !o && setResolving(null)} />
    </DashSection>
  );
}
