'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { pendingApprovalKind, usePendingApprovals } from '@/hooks/use-pending-approvals';
import { checklistItemLabel } from '@/lib/audit/audit-log';
import { MANAGER_APPROVAL_STEP_ID } from '@/lib/incorporation/pre-inc-direct-flow';
import type { PendingApprovalRow } from '@/lib/projects/pending-approvals';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { adminProjectStepPath } from '@/lib/projects/project-step-path';
import { ProjectChangeRequestsPanel } from '@/views/admin/ProjectChangeRequestsPanel';
import { DateChangeRequestsPanel } from '@/components/work/DateChangeRequestsPanel';
import { PlainPageHead } from '@/views/admin/PlainPageHead';
import { MeetingApprovalsPanel } from '@/views/board-meetings/MeetingApprovalsPanel';

type KindKey = 'client' | 'lead' | 'send' | 'board';

const KIND_LABEL: Record<KindKey, string> = {
  client: 'Client submit',
  lead: 'Lead request',
  send: 'Send to client',
  board: 'Board resolution',
};

function kindKey(row: PendingApprovalRow): KindKey {
  if (row.clientFill) return 'send';
  if (row.itemId === MANAGER_APPROVAL_STEP_ID) return 'board';
  return row.reviewSource === 'lead_manager_request' ? 'lead' : 'client';
}

/** Two-letter company tile (prototype ClientCodeTile): a 6px square in the soft blurple. */
function CompanyTile({ name }: { name: string }) {
  const code = name
    .replace(/\b(private|pvt|limited|ltd|llp)\b\.?/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span
      className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md bg-brand-soft text-[13px] font-medium tracking-[.02em] text-brand-text"
      title={name}
      aria-hidden
    >
      {code || '·'}
    </span>
  );
}

/** Approvals (prototype ManagerToday approvals): company tile, step, company · kind, a navy button per row (D-13). */
export default function ApprovalsInbox({ scope }: { scope: 'firm' | 'manager' }) {
  const router = useRouter();
  const staffBase = useStaffBasePath();
  const rows = usePendingApprovals(scope);
  const [kind, setKind] = useState<'all' | KindKey>('all');

  const path = scope === 'firm' ? '/app/admin/approvals' : `${staffBase}/approvals`;

  const counts = useMemo(() => {
    const out: Record<KindKey, number> = { client: 0, lead: 0, send: 0, board: 0 };
    for (const row of rows) out[kindKey(row)] += 1;
    return out;
  }, [rows]);
  const kinds = (Object.keys(KIND_LABEL) as KindKey[]).filter((k) => counts[k] > 0);
  const activeKind = kind !== 'all' && counts[kind] === 0 ? 'all' : kind;
  const shown = activeKind === 'all' ? rows : rows.filter((row) => kindKey(row) === activeKind);

  return (
    <PageTransition>
      <SEO
        title="Approvals — VCFO Suite"
        description="Pending milestone reviews."
        path={path}
      />
      <PlainPageHead title="Approvals" meta={`${rows.length} waiting`} />

      <ProjectChangeRequestsPanel scope={scope} />

      {/* G-17: a lead's request to move a manager-set date window. */}
      <DateChangeRequestsPanel />

      {/* Board meeting notices waiting for the manager (docs/specs/board-meetings/PLAN.md). */}
      <MeetingApprovalsPanel />

      <DashSection
        title="Pending milestones"
        meta={
          kinds.length > 1 ? (
            <SpectrumTabs
              label="Filter by kind"
              items={[
                { key: 'all', label: 'All', count: rows.length },
                ...kinds.map((k) => ({ key: k, label: KIND_LABEL[k], count: counts[k] })),
              ]}
              value={activeKind}
              onChange={(key) => setKind(key as 'all' | KindKey)}
            />
          ) : (
            String(rows.length)
          )
        }
        bodyClassName="p-0"
      >
        {shown.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nothing waiting for approval"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(scope === 'firm' ? '/app/admin/projects' : `${staffBase}/projects`)}
                >
                  View projects
                </Button>
              }
            />
          </div>
        ) : (
          <ul>
            {shown.map((row) => (
              <li
                key={`${row.engagementId}-${row.itemId}-${row.clientFill ? 'fill' : 'review'}`}
                className="flex min-h-[60px] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
              >
                <CompanyTile name={row.companyName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium leading-snug text-ink">
                    {checklistItemLabel(row.itemId)}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-muted">
                    {row.companyName} · {pendingApprovalKind(row)}
                  </div>
                  {row.clientFill?.note ? (
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-muted">{row.clientFill.note}</div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="strong"
                  className="shrink-0"
                  onClick={() =>
                    router.push(adminProjectStepPath({ id: row.engagementId, slug: row.slug }, row.itemId, staffBase))
                  }
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DashSection>
    </PageTransition>
  );
}
