'use client';

import { UserCog } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { SkeletonRows } from '@/components/ui/empty-state';
import { NameCell, PersonAvatar } from '@/components/super/parts/super-parts';
import type { SuperStaff } from '@/components/super/assign/use-super-staff';
import { useEscalations } from '@/components/super/escalations/use-escalations';
import { type SuperEngagementSummary } from '@/lib/super/super-overview';
import { medianResponse, type SuperTeamAdmin } from '@/lib/super/super-insights-model';
import { cn } from '@/lib/utils';

/**
 * "Admins · this month" on the super Overview (prototype `adminCols`, G-20): each firm admin with
 * the project managers who report to them (`profiles.reports_to_admin_id`) and the clients those
 * managers own; this month's assignments and accepted reviews (insights, when loaded); the open
 * escalations sent to the admin; and the median time to resolve this month's escalations.
 * Managers with no admin set are grouped in one "No admin" row so nobody drops out of the table.
 */

interface AdminRow {
  id: string;
  name: string;
  managers: string[];
  clients: number;
  assigned: number | null;
  approvals: number | null;
  escalations: number;
  response: string;
}

const NO_ADMIN = '__none';

export function SuperAdminsPanel({
  staff,
  engagements,
  admins,
}: {
  staff: SuperStaff;
  engagements: SuperEngagementSummary[];
  /** This month's counts per admin from the insights read; dashes until it lands. */
  admins?: SuperTeamAdmin[];
}) {
  const escalations = useEscalations({ status: 'all' });
  const head = { title: 'Admins · this month', icon: UserCog, tone: 'violet' as const, href: '/app/super/team', hrefLabel: 'Open team' };

  if (staff.isPending) {
    return (
      <DashSection {...head}>
        <SkeletonRows rows={3} />
      </DashSection>
    );
  }

  const groups = new Map<string, { name: string; managerIds: Set<string>; managers: string[] }>();
  for (const admin of staff.firmAdmins) {
    if (admin.role === 'admin') groups.set(admin.id, { name: admin.name, managerIds: new Set(), managers: [] });
  }
  for (const manager of staff.managers) {
    const admin = staff.adminOfManager.get(manager.id);
    const key = admin?.id ?? NO_ADMIN;
    const group =
      groups.get(key) ??
      { name: admin?.name ?? 'No admin', managerIds: new Set<string>(), managers: [] as string[] };
    group.managerIds.add(manager.id);
    group.managers.push(manager.name);
    groups.set(key, group);
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const openByAdmin = new Map<string, number>();
  const resolveMs = new Map<string, number[]>();
  for (const e of escalations.data ?? []) {
    if (!e.assignedToId) continue;
    if (e.status === 'open') openByAdmin.set(e.assignedToId, (openByAdmin.get(e.assignedToId) ?? 0) + 1);
    else if (e.resolvedAt && Date.parse(e.resolvedAt) >= monthStart) {
      const list = resolveMs.get(e.assignedToId) ?? [];
      list.push(Date.parse(e.resolvedAt) - Date.parse(e.createdAt));
      resolveMs.set(e.assignedToId, list);
    }
  }
  const monthOf = new Map((admins ?? []).map((a) => [a.id, a]));

  const rows: AdminRow[] = [...groups.entries()].map(([id, group]) => {
    const book = engagements.filter((e) => e.managerId && group.managerIds.has(e.managerId));
    const month = monthOf.get(id);
    return {
      id,
      name: group.name,
      managers: group.managers,
      clients: book.length,
      assigned: month ? month.assignedMonth : null,
      approvals: month ? month.approvalsMonth : null,
      escalations: openByAdmin.get(id) ?? 0,
      response: medianResponse(resolveMs.get(id) ?? []),
    };
  });
  rows.sort((a, b) => (a.id === NO_ADMIN ? 1 : b.id === NO_ADMIN ? -1 : b.clients - a.clients));

  const num = (n: number | null) => <span className="tabular-nums">{n ?? '–'}</span>;
  const columns: EFilingColumn<AdminRow>[] = [
    {
      key: 'name',
      header: 'Admin',
      render: (r) => (
        <NameCell
          lead={<PersonAvatar name={r.name} />}
          title={r.name}
          sub={r.managers.length ? r.managers.join(', ') : 'No managers yet'}
        />
      ),
    },
    { key: 'clients', header: 'Clients', width: '80px', align: 'right', render: (r) => num(r.clients) },
    { key: 'assigned', header: 'Assigned', width: '90px', align: 'right', render: (r) => (r.id === NO_ADMIN ? '–' : num(r.assigned)) },
    { key: 'approvals', header: 'Approvals', width: '96px', align: 'right', render: (r) => (r.id === NO_ADMIN ? '–' : num(r.approvals)) },
    {
      key: 'esc',
      header: 'Open esc.',
      width: '90px',
      align: 'right',
      render: (r) => <span className={cn('tabular-nums', r.escalations > 0 && 'font-medium text-danger')}>{r.id === NO_ADMIN ? '–' : r.escalations}</span>,
    },
    { key: 'response', header: 'Response', width: '96px', align: 'right', render: (r) => (r.id === NO_ADMIN ? '–' : r.response) },
  ];

  return (
    <DashSection {...head} meta={rows.filter((r) => r.id !== NO_ADMIN).length} bodyClassName="px-2 pb-2 pt-1">
      <EFilingGrid caption="Admins" columns={columns} rows={rows} rowKey={(r) => r.id} minWidth={640} empty="No admins yet" />
    </DashSection>
  );
}
