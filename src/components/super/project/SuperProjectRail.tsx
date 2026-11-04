'use client';

import Link from 'next/link';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { AreaPill, Chip, OwnerChip, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { PreIncorporationNotice } from '@/components/compliances/PreIncorporationNotice';
import { formatSuperAgo } from '@/components/super/overview/super-overview-format';
import { NameCell, PersonAvatar } from '@/components/super/parts/super-parts';
import { todayKey } from '@/components/super/parts/super-text';
import { plainDay } from '@/lib/date-format';
import type { SuperEngagementDetail, SuperFiling, SuperJourneyStep } from '@/lib/super/super-overview';
import { cn } from '@/lib/utils';

/**
 * The client record's tab panels (prototype `ClientRecordScreen`): Registrations, Filings,
 * Team and Activity. The ball-in-court numbers and the read-only "inspect as" links moved
 * into the record head, so every panel here is one tab's content.
 */

const REGISTRATION_PHASE_ID = 'registration-phase-4';

function regWord(step: SuperJourneyStep): { word: string; tone: ChipTone } {
  // The gate counts a not-applicable step as done; the stored status says it was never needed.
  if (step.status === 'not-applicable') return { word: 'Not needed', tone: 'idle' };
  if (step.rejected) return { word: 'Sent back', tone: 'bad' };
  if (step.kind === 'done') return { word: 'Done', tone: 'ok' };
  if (step.kind === 'waiting' || step.awaitingReview) return { word: 'Waiting', tone: 'teal' };
  if (step.kind === 'active') return { word: 'In progress', tone: 'prog' };
  return { word: 'Not started', tone: 'idle' };
}

/** The registration-phase steps of this client, as the gate says. */
export function SuperRegistrationsPanel({ detail }: { detail: SuperEngagementDetail }) {
  const steps = detail.journey.filter((step) => step.phaseId === REGISTRATION_PHASE_ID);
  const notNeeded = steps.filter((step) => step.status === 'not-applicable').length;
  const done = steps.filter((step) => step.kind === 'done' && step.status !== 'not-applicable').length;
  const needed = steps.length - notNeeded;
  const columns: EFilingColumn<SuperJourneyStep>[] = [
    {
      key: 'name',
      header: 'Registration',
      render: (step) => (
        <Link href={step.href} className="font-medium text-ink hover:underline">
          {step.title}
        </Link>
      ),
    },
    {
      key: 'with',
      header: 'With',
      width: '120px',
      render: (step) =>
        step.kind === 'active' || step.kind === 'waiting' ? (
          <OwnerChip owner={step.awaitingReview ? 'manager' : step.owner === 'client' ? 'client' : 'sbc'} />
        ) : (
          <span className="text-ink-faint">–</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (step) => {
        const chip = regWord(step);
        return (
          <Chip fixed tone={chip.tone}>
            {chip.word}
          </Chip>
        );
      },
    },
  ];
  return (
    <DashSection title="Registrations" meta={`${done} of ${needed} done${notNeeded ? ` · ${notNeeded} not needed` : ''}`} bodyClassName="px-2 pb-2 pt-1">
      <EFilingGrid caption="Registrations" columns={columns} rows={steps} rowKey={(step) => step.id} pageSize={25} minWidth={560} empty="None" />
    </DashSection>
  );
}

const FILING_TONE: Record<string, ChipTone> = {
  filed: 'ok',
  'in-progress': 'prog',
  upcoming: 'idle',
  overdue: 'bad',
};

const FILING_WORD: Record<string, string> = {
  filed: 'Filed',
  'in-progress': 'In progress',
  upcoming: 'Not started',
  overdue: 'Overdue',
};

/** Filings in the 90-day window either side of today. */
export function SuperFilingsPanel({ detail }: { detail: SuperEngagementDetail }) {
  const today = todayKey();
  const columns: EFilingColumn<SuperFiling>[] = [
    {
      key: 'form',
      header: 'Filing',
      render: (f) => <NameCell title={f.title} sub={f.periodLabel} />,
    },
    { key: 'area', header: 'Area', width: '124px', render: (f) => <AreaPill area={f.authority} /> },
    {
      key: 'due',
      header: 'Due',
      width: '76px',
      render: (f) => (
        <span className={cn('tabular-nums', f.status !== 'filed' && f.dueDate < today && 'font-medium text-danger')}>
          {plainDay(f.dueDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (f) => (
        <Chip fixed tone={FILING_TONE[f.status] ?? 'idle'}>
          {FILING_WORD[f.status] ?? f.status}
        </Chip>
      ),
    },
  ];

  return (
    <DashSection title="Obligations" meta={detail.filings.length === 0 ? undefined : `${detail.filings.length} in window`} bodyClassName="px-2 pb-2 pt-3">
      {/* Inspection only: the same per-engagement state the client sees, read off
          `summary.incorporated` (which is `isIncorporated`). Nothing is mutated. */}
      {!detail.summary.incorporated ? (
        <PreIncorporationNotice
          scope={{ audience: 'staff', companyName: detail.summary.companyName }}
          className="mx-2 mb-2.5"
        />
      ) : null}
      <EFilingGrid caption="Filings" columns={columns} rows={detail.filings} rowKey={(f) => f.id} minWidth={600} empty="No filings in the next 90 days" />
    </DashSection>
  );
}

export function SuperTeamPanel({ detail }: { detail: SuperEngagementDetail }) {
  return (
    <DashSection title="Team" meta={detail.team.length || undefined} bodyClassName="p-0">
      {detail.team.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nobody assigned yet" />
        </div>
      ) : (
        <ul>
          {detail.team.map((member) => (
            <li key={member.id} className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0">
              <PersonAvatar name={member.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{member.name}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">{member.email}</span>
              </span>
              <span className="shrink-0 text-[12.5px] text-ink-2">{member.role}</span>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}

export function SuperActivityPanel({ detail }: { detail: SuperEngagementDetail }) {
  const entries = detail.activity;

  return (
    <DashSection title="Audit" href="/app/admin/audit-log" hrefLabel="Full log" bodyClassName="p-0">
      {entries.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No activity yet" />
        </div>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id} className="flex min-w-0 items-start gap-3 border-t border-line-soft px-4 py-3 first:border-t-0">
              <PersonAvatar name={entry.actor ?? 'System'} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-snug text-ink">{entry.label}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {entry.actor ?? 'System'} · {formatSuperAgo(entry.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
