'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { RecordStat } from '@/components/incorporation/RecordHead';
import { useApp } from '@/context/AppContext';
import type { ChecklistItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import type { ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { buildIncorporationModel } from '@/lib/client-portal/step-model';
import { internOverviewNow } from '@/lib/intern/intern-overview-progress';
import { daysBetween } from '@/components/timeline/timeline-model';
import { ReassignDialog } from '@/views/admin/work/ReassignDialog';
import { AssignClientDialog } from '@/views/admin/clients/AssignClientDialog';
import type { TeamTaskRow } from '@/components/staff/today/today-rows';
import { useRecordDocuments } from '@/views/client-record/RecordDocuments';

/**
 * Parts of the staff client record head (prototype `ClientRecordScreen` head), shared by the
 * lead's record and the manager and admin record.
 *
 *   - `RecordMetaLine`: contact name, email, "Manager <name>", "Project lead <name>" and the
 *     "Reassign" link. Managers and admins move the client to another lead (`ReassignDialog`,
 *     `/api/work/reassign`); firm-wide admins also move it to another manager
 *     (`AssignClientDialog`).
 *   - `RecordNumbers`: "Step n of m", "n days to COI" before the certificate, "n d with <holder>"
 *     and the Now link with the step code and who holds the step.
 *   - `RecordDocumentsButton`: the outline "Documents n" button that opens the Documents tab.
 */

type ManagerOption = { id: string; name: string };

function useManagers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-managers'],
    enabled,
    queryFn: async (): Promise<ManagerOption[]> => {
      const res = await fetch('/api/admin/managers');
      const body = (await res.json().catch(() => ({}))) as { managers?: ManagerOption[] };
      return res.ok ? body.managers ?? [] : [];
    },
    staleTime: 5 * 60_000,
  });
}

export function RecordMetaLine({ engagement }: { engagement: Engagement }) {
  const { user, teamMembers, engagements, tasks } = useApp();
  const role = user?.role;
  const staffLead = isAdminOrManager(role);
  const firmAdmin = isFirmWideAdmin(role);
  const managers = useManagers(staffLead);
  const [reassign, setReassign] = useState<TeamTaskRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const email = engagement.clientEmail?.trim();
  const contact = engagement.clientDisplayName?.trim();
  const lead =
    teamMembers.find((m) => m.id === engagement.internId) ??
    (user && user.id === engagement.internId ? { id: user.id, name: user.name } : undefined);
  const managerId = engagement.managerId ?? null;
  const manager = managerId ? managers.data?.find((m) => m.id === managerId) : undefined;
  const leads = useMemo(() => teamMembers.map((m) => ({ id: m.id, name: m.name })), [teamMembers]);

  const openReassign = () => {
    if (firmAdmin && !engagement.internId) {
      setAssignOpen(true);
      return;
    }
    if (!engagement.internId) return;
    setReassign({
      id: engagement.id,
      engagementId: engagement.id,
      companyName: engagement.companyName,
      title: engagement.companyName,
      leadId: engagement.internId,
      leadName: lead?.name ?? 'Project lead',
      area: '',
      status: 'In progress',
      withClient: false,
      href: '',
    });
  };

  const parts: ReactNode[] = [];
  if (contact) parts.push(<span key="contact">{contact}</span>);
  if (email) {
    parts.push(
      <a key="email" href={`mailto:${email}`} className="min-w-0 truncate hover:text-ink hover:underline" title={`Email ${engagement.companyName}`}>
        {email}
      </a>,
    );
  }
  if (manager) {
    parts.push(
      <span key="manager">
        Manager <b className="font-medium text-ink">{manager.name}</b>
      </span>,
    );
  }
  parts.push(
    <span key="lead">
      Project lead <b className="font-medium text-ink">{lead?.name ?? 'Unassigned'}</b>
    </span>,
  );

  return (
    <>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-ink-muted">
        {parts.map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-x-2">
            {i > 0 ? <span aria-hidden>·</span> : null}
            {p}
          </span>
        ))}
        {staffLead && (engagement.internId || firmAdmin) ? (
          <>
            <span aria-hidden>·</span>
            <button type="button" onClick={openReassign} className="font-medium text-brand-text hover:underline">
              Reassign
            </button>
          </>
        ) : null}
        {firmAdmin && engagement.internId ? (
          <>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => setAssignOpen(true)} className="font-medium text-brand-text hover:underline">
              Change manager
            </button>
          </>
        ) : null}
      </p>
      {staffLead ? (
        <ReassignDialog row={reassign} onOpenChange={(open) => (!open ? setReassign(null) : undefined)} leads={leads} />
      ) : null}
      {firmAdmin ? (
        <AssignClientDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          engagements={engagements}
          tasks={tasks}
          managers={managers.data ?? []}
          clientId={engagement.id}
        />
      ) : null}
    </>
  );
}

const HOLDER_CHIP = { client: 'Waiting on client', mca: 'With MCA', sbc: 'With SBC' } as const;

/** "pre-8" gives "Pre-8": the step code the lists and the step page show in mono. */
function stepCode(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function RecordNumbers({
  engagement,
  state,
  gates,
  hrefFor,
}: {
  engagement: Engagement;
  state: Record<string, ChecklistItemStateSlice | undefined>;
  gates: Record<string, ChecklistStepGate>;
  hrefFor: (item: ChecklistItem) => string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const now = useMemo(() => internOverviewNow(gates), [gates]);
  const model = useMemo(() => buildIncorporationModel(state, engagement.schedule ?? null, today), [state, engagement.schedule, today]);
  const facts = now ? model.byId[now.item.id] : undefined;
  const holder = facts?.owner ?? 'sbc';
  const sinceDays = facts?.since ? Math.max(0, daysBetween(facts.since, today)) : null;
  const coiDays =
    !engagement.incorporationDate && engagement.expectedCoiOn
      ? daysBetween(today, engagement.expectedCoiOn.slice(0, 10))
      : null;
  const holderWord = holder === 'client' ? 'client' : holder === 'mca' ? 'MCA' : 'SBC';

  return (
    <>
      {now ? <RecordStat value={`Step ${now.stepNumber}`} label={`of ${now.stepTotal}`} /> : null}
      {coiDays !== null ? (
        <RecordStat
          value={Math.abs(coiDays)}
          label={coiDays >= 0 ? `${coiDays === 1 ? 'day' : 'days'} to COI` : `${Math.abs(coiDays) === 1 ? 'day' : 'days'} past expected COI`}
        />
      ) : null}
      {now && sinceDays !== null ? <RecordStat value={`${sinceDays}d`} label={`with ${holderWord}`} /> : null}
      {now ? (
        <Link href={hrefFor(now.item)} className="flex min-w-0 flex-wrap items-center gap-2 text-[14px] hover:underline">
          <span className="text-ink-muted">Now</span>
          <span className="font-mono text-[13px] text-ink-muted">{stepCode(now.item.id)}</span>
          <b className="min-w-0 truncate font-medium text-ink">{now.stepTitle}</b>
          <Chip fixed>{facts?.late ? 'Overdue' : HOLDER_CHIP[holder]}</Chip>
        </Link>
      ) : null}
    </>
  );
}

export function RecordDocumentsButton({ engagement, onOpen }: { engagement: Engagement; onOpen: () => void }) {
  const docs = useRecordDocuments(engagement.id);
  return (
    <Button size="sm" variant="outline" onClick={onOpen} className="flex-none">
      <FileText size={14} strokeWidth={1.6} aria-hidden />
      Documents{docs.data ? <span className="tabular-nums text-ink-muted">{docs.data.length}</span> : null}
    </Button>
  );
}
