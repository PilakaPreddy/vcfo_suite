'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
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
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { internOverviewNow, internOverviewPhases } from '@/lib/intern/intern-overview-progress';
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
  // A lead's own record names only the client (prototype: `portal !== "lead"`).
  if (staffLead) {
    parts.push(
      <span key="lead">
        Project lead <b className="font-medium text-ink">{lead?.name ?? 'Unassigned'}</b>
      </span>,
    );
  }

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
const HOLDER_TONE = { client: 'teal', mca: 'violet', sbc: 'prog' } as const;

const REG_PHASE = 'registration-phase-4';

/**
 * A step's place on the record, counted across the phases as the prototype counts them: "Step 13"
 * of the 14 steps before the certificate or of all 25, and "Reg-n" for a registration.
 */
export function recordStepPlace(id: string): { n: number; code: string; of: number; registration: boolean } | null {
  const phases = internOverviewPhases();
  const pre = phases.filter((p) => p.id.startsWith('pre-inc')).reduce((n, p) => n + p.items.length, 0);
  const steps = phases.filter((p) => p.id !== REG_PHASE).reduce((n, p) => n + p.items.length, 0);
  let before = 0;
  for (const p of phases) {
    const i = p.items.findIndex((it) => it.id === id);
    if (i >= 0) {
      if (p.id === REG_PHASE) return { n: i + 1, code: `Reg-${i + 1}`, of: p.items.length, registration: true };
      const n = before + i + 1;
      return { n, code: `Step ${n}`, of: n <= pre ? pre : steps, registration: false };
    }
    before += p.items.length;
  }
  return null;
}

/** The count on the record's first tab: "13/14" while the steps run, "21/25" once incorporated. */
export function recordOverviewCount(gates: Record<string, ChecklistStepGate>): string {
  const now = internOverviewNow(gates);
  const place = now ? recordStepPlace(now.item.id) : null;
  const pre = internOverviewPhases().filter((p) => p.id.startsWith('pre-inc')).reduce((n, p) => n + p.items.length, 0);
  if (place && !place.registration && place.n <= pre) return `${place.n}/${pre}`;
  const phases = internOverviewPhases().filter((p) => p.id !== REG_PHASE);
  const items = phases.flatMap((p) => p.items);
  return `${items.filter((it) => gates[it.id]?.kind === 'done').length}/${items.length}`;
}

/** Incorporating or Compliance, the record head's stage chip. A category, so it has no dot. */
export function RecordStageChip({ engagement, state }: { engagement: Engagement; state: Parameters<typeof isIncorporated>[1] }) {
  const inc = !isIncorporated(engagement, state);
  return (
    <Chip tone={inc ? 'violet' : 'teal'} dot={false} fixed>
      {inc ? 'Incorporating' : 'Compliance'}
    </Chip>
  );
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
  const place = now ? recordStepPlace(now.item.id) : null;
  const regDone = internOverviewPhases()
    .find((p) => p.id === REG_PHASE)
    ?.items.filter((it) => gates[it.id]?.kind === 'done').length;

  return (
    <>
      {place && !place.registration ? <RecordStat value={place.code} label={`of ${place.of}`} /> : null}
      {place?.registration ? <RecordStat value="Incorporated" label={`${regDone ?? 0} of ${place.of} registrations`} /> : null}
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
          <b className="min-w-0 truncate font-medium text-ink">
            <span className="font-mono text-[13px]">{place?.code}</span> · {now.stepTitle}
          </b>
          <Chip tone={HOLDER_TONE[holder]} fixed>
            {HOLDER_CHIP[holder]}
          </Chip>
        </Link>
      ) : null}
    </>
  );
}

export function RecordDocumentsButton({ engagement, onOpen }: { engagement: Engagement; onOpen: () => void }) {
  const docs = useRecordDocuments(engagement.id);
  return (
    <Button variant="outline" onClick={onOpen} className="flex-none">
      Documents {docs.data ? docs.data.length : ''}
    </Button>
  );
}
