'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink, FileSignature, ListPlus, Repeat } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { AreaPill, Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { SuperProjectJourney } from '@/components/super/project/SuperProjectJourney';
import { SpiceAttachmentsCard } from '@/components/incorporation/SpiceAttachmentsCard';
import { SuperProjectDocuments } from '@/components/super/project/SuperProjectDocuments';
import { SuperProjectTimeline } from '@/components/super/project/SuperProjectTimeline';
import {
  SuperActivityPanel,
  SuperRegistrationsPanel,
} from '@/components/super/project/SuperProjectRail';
import { StaffClientFilings } from '@/components/client-portal/pages/compliances';
import {
  ClientTile,
  SuperPageError,
} from '@/components/super/parts/super-parts';
import { superOwnerOf, superStateChip } from '@/components/super/overview/super-overview-format';
import { AssignClientDialog } from '@/components/super/assign/AssignClientDialog';
import { AssignTaskDialog } from '@/components/super/assign/AssignTaskDialog';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import { EscalationsPanel } from '@/components/super/escalations/EscalationsPanel';
import { EngagementNotesPanel } from '@/components/notes/EngagementNotesPanel';
import { StaffClientTeam } from '@/components/client-portal/pages/team';
import { RaiseEscalationButton } from '@/components/super/escalations/RaiseEscalationButton';
import { useSuperOverview, useSuperProject } from '@/hooks/use-super-overview';
import { cn } from '@/lib/utils';
import { SUPER_PROJECTS_HREF } from '@/lib/super/super-overview';

/**
 * SUPER ADMIN CLIENT RECORD (L2) — one engagement, end to end (prototype
 * `ClientRecordScreen`, C-0109).
 *
 * A plain head: the client tile, the name with the stage pill, the client,
 * admin, manager and lead, the read-only "inspect as" links into the role shells,
 * and the super admin's own actions (G-20): Reassign, Assign task and Escalate.
 * Under it one white band with the step, steps done, who holds the work and the
 * live step, then underline tabs (R-11): Steps opens on the Gantt timeline (R-21)
 * over the step list, then registrations, filings, documents, escalations, team
 * and activity. Step work stays in the firm shell. The
 * head links to the super admin's board resolution editor (P-112).
 */
type TabKey = 'steps' | 'registrations' | 'filings' | 'documents' | 'escalations' | 'notes' | 'team' | 'activity';

export default function SuperProjectDetail() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '');
  const query = useSuperProject(id);
  const detail = query.data?.detail ?? null;
  const missing = query.data?.missing ?? false;
  const [tab, setTab] = useState<TabKey>('steps');
  const staff = useSuperStaff();
  // The firm-wide list gives the assign dialog every manager's book size; it is the Overview's
  // cached read, so opening a record from the list costs nothing extra.
  const firm = useSuperOverview();
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const seo = (
    <SEO
      title={`${detail?.summary.companyName ?? 'Project'} — VCFO Suite`}
      description="One engagement, end to end: journey, documents, compliance and activity."
      path={`${SUPER_PROJECTS_HREF}/${id}`}
    />
  );

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <RecordSkeleton />
      </PageTransition>
    );
  }

  if (missing) {
    return (
      <PageTransition>
        {seo}
        <EmptyState
          title="That client is not here"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={SUPER_PROJECTS_HREF}>Back to all clients</Link>
            </Button>
          }
        />
      </PageTransition>
    );
  }

  if (query.isError || !detail) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="This client could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const { summary } = detail;
  const overdueFilings = detail.filings.filter((filing) => filing.status === 'overdue').length;
  const currentIndex = summary.currentStep
    ? detail.journey.findIndex((step) => step.id === summary.currentStep?.id)
    : -1;
  const currentStep = currentIndex >= 0 ? detail.journey[currentIndex] : null;
  const chip = superStateChip(summary);
  const owner = superOwnerOf(summary);
  const regSteps = detail.journey.filter((step) => step.phaseId === 'registration-phase-4');
  const quiet = idleKicker(summary.idleDays);
  const adminName = staff.adminNameOf(summary.managerId);
  // The first client login on the engagement is the contact the prototype mails.
  const clientEmail = detail.team.find((member) => member.role === 'Client')?.email ?? null;
  // Days from the engagement's start to its certificate, once there is one.
  const coiOn = detail.timeline?.incorporationDate ?? null;
  const daysToCoi = coiOn
    ? Math.max(0, Math.round((Date.parse(`${coiOn}T00:00:00Z`) - Date.parse(summary.createdAt.slice(0, 10) + 'T00:00:00Z')) / 86_400_000))
    : null;
  const firmRows = firm.data?.engagements ?? [];
  const assignRows = firmRows.some((row) => row.id === summary.id) ? firmRows : [summary, ...firmRows];

  const tabs = [
    { key: 'steps', label: 'Steps', count: `${summary.progress.done}/${summary.progress.total}` },
    { key: 'registrations', label: 'Registrations', count: regSteps.length },
    { key: 'filings', label: 'Obligations', count: detail.filings.length },
    { key: 'documents', label: 'Documents', count: detail.documents.length },
    { key: 'escalations', label: 'Escalations' },
    { key: 'notes', label: 'Notes' },
    { key: 'team', label: 'Team', count: detail.team.length },
    { key: 'activity', label: 'Audit' },
  ];

  const now = (
    <span className="flex min-w-0 items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink-2">Now</span>
        <span className="block truncate text-[14px] font-medium text-ink">
          {currentStep ? currentStep.title : 'Every step is done'}
        </span>
      </span>
      {owner ? <OwnerChip owner={owner} className="hidden sm:inline-flex" /> : null}
      <Chip fixed tone={chip.tone} title={chip.title}>
        {chip.word}
      </Chip>
    </span>
  );

  return (
    <PageTransition>
      {seo}

      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-4" aria-label={summary.companyName}>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <ClientTile id={summary.id} name={summary.companyName} className="mt-1 hidden h-9 w-9 text-[12.5px] sm:inline-grid" />
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
              <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[22px] font-medium tracking-[-0.01em] text-ink md:text-[28px]">
                <span className="min-w-0">{summary.companyName}</span>
                <AreaPill area={summary.stageLabel} reg={summary.incorporated ? undefined : 'mca'} />
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-muted">
                {summary.clientName ? (
                  <>
                    <span>{summary.clientName}</span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                {clientEmail ? (
                  <>
                    <a href={`mailto:${clientEmail}`} className="text-brand-text hover:underline">
                      {clientEmail}
                    </a>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                {adminName ? (
                  <>
                    <span>
                      Admin <b className="font-medium text-ink-2">{adminName}</b>
                    </span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <span>
                  Manager <b className="font-medium text-ink-2">{summary.managerName ?? 'Unassigned'}</b>
                </span>
                <span aria-hidden>·</span>
                <span>
                  Project lead <b className="font-medium text-ink-2">{summary.leadName ?? 'No lead assigned'}</b>
                </span>
                {quiet ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{quiet}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href={detail.enterAs.firm}>
                  <ExternalLink aria-hidden />
                  Firm view
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={detail.enterAs.client}>
                  <ExternalLink aria-hidden />
                  Client portal
                </Link>
              </Button>
              {/* P-112: the super admin's board resolution editor for this client. */}
              <Button asChild variant="outline">
                <Link href={`${SUPER_PROJECTS_HREF}/${encodeURIComponent(summary.id)}/board-resolution`}>
                  <FileSignature aria-hidden />
                  Board resolution
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setTab('documents')}>
                Documents {detail.documents.length}
              </Button>
              <Button variant="outline" onClick={() => setAssignOpen(true)}>
                <Repeat aria-hidden />
                Reassign
              </Button>
              <Button variant="outline" onClick={() => setTaskOpen(true)}>
                <ListPlus aria-hidden />
                Assign task
              </Button>
              <RaiseEscalationButton engagementId={summary.id} companyName={summary.companyName} admins={staff.firmAdmins} />
            </div>
          </div>

          <div className="surface flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3.5 md:px-5">
            <BandNumber label="Step" value={currentIndex >= 0 ? currentIndex + 1 : summary.progress.total} of={`of ${summary.progress.total}`} />
            {daysToCoi !== null ? <BandNumber label="Days to COI" value={daysToCoi} /> : null}
            <BandNumber label="Steps done" value={`${summary.progress.done}/${summary.progress.total}`} good={summary.progress.pct === 100} />
            <BandNumber label="With SBC" value={summary.ballInCourt.firm} />
            <BandNumber label="With the client" value={summary.ballInCourt.client} />
            <BandNumber label="Awaiting review" value={summary.approvalsPending} />
            <BandNumber label="Filings overdue" value={overdueFilings} bad={overdueFilings > 0} />
            <span className="min-w-0 flex-[1_1_280px] md:border-l md:border-line-soft md:pl-6">
              {currentStep ? (
                <Link href={currentStep.href} className="block min-w-0 hover:underline">
                  {now}
                </Link>
              ) : (
                now
              )}
            </span>
          </div>
        </header>

        <SpectrumTabs variant="underline" label="Client record" items={tabs} value={tab} onChange={(key) => setTab(key as TabKey)} />

        {tab === 'steps' ? (
          <div className="flex flex-col gap-5">
            <SuperProjectTimeline detail={detail} />
            <SuperProjectJourney detail={detail} />
            <SpiceAttachmentsCard engagementId={summary.id} shellBase="/app/super" className="" />
          </div>
        ) : null}
        {tab === 'registrations' ? <SuperRegistrationsPanel detail={detail} /> : null}
        {tab === 'filings' ? <StaffClientFilings engagementId={summary.id} projectHref={`${SUPER_PROJECTS_HREF}/${id}`} /> : null}
        {tab === 'documents' ? <SuperProjectDocuments detail={detail} /> : null}
        {tab === 'escalations' ? <EscalationsPanel engagementId={summary.id} canResolve /> : null}
        {tab === 'notes' ? <EngagementNotesPanel engagementId={summary.id} /> : null}
        {tab === 'team' ? <StaffClientTeam engagementId={summary.id} projectHref={`${SUPER_PROJECTS_HREF}/${id}`} /> : null}
        {tab === 'activity' ? <SuperActivityPanel detail={detail} /> : null}
      </div>

      <AssignClientDialog open={assignOpen} onOpenChange={setAssignOpen} engagementId={summary.id} engagements={assignRows} staff={staff} />
      <AssignTaskDialog open={taskOpen} onOpenChange={setTaskOpen} engagementId={summary.id} engagements={assignRows} staff={staff} />
    </PageTransition>
  );
}

function BandNumber({
  label,
  value,
  of,
  bad,
  good,
}: {
  label: string;
  value: number | string;
  of?: string;
  bad?: boolean;
  good?: boolean;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <b className={cn('text-[22px] font-medium leading-none tabular-nums', bad ? 'text-danger' : good ? 'text-positive' : 'text-ink')}>
        {value}
        {of ? <small className="ml-1 text-[13px] font-normal text-ink-muted">{of}</small> : null}
      </b>
    </span>
  );
}

/** Only worth saying once it means something — three days of silence. */
function idleKicker(idleDays: number | null): string | null {
  if (idleDays === null || idleDays < 3) return null;
  return `Quiet ${idleDays} days`;
}

/** R-48: the record keeps its shape while it loads: head, number band, tabs and two cards. */
function RecordSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the client">
      <span className="block h-[60px] w-2/3 animate-pulse rounded-md bg-surface-sunken" />
      <span className="block h-[72px] animate-pulse rounded-md bg-surface-sunken" />
      <span className="block h-9 w-1/2 animate-pulse rounded-md bg-surface-sunken" />
      <span className="block h-[220px] animate-pulse rounded-md bg-surface-sunken" />
      <span className="block h-[320px] animate-pulse rounded-md bg-surface-sunken" />
    </div>
  );
}
