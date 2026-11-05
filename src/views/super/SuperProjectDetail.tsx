'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink, FileSignature, ListPlus, Mail, MoreHorizontal, Repeat, TriangleAlert } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AreaPill, Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { SuperProjectJourney } from '@/components/super/project/SuperProjectJourney';
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
import { stepCode, stepWord, superOwnerOf, superStageWord, superStateChip } from '@/components/super/overview/super-overview-format';
import { usePracticeMetrics } from '@/components/metrics/use-metrics';
import { AssignClientDialog } from '@/components/super/assign/AssignClientDialog';
import { AssignTaskDialog } from '@/components/super/assign/AssignTaskDialog';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import { EscalationsPanel } from '@/components/super/escalations/EscalationsPanel';
import { EngagementNotesPanel } from '@/components/notes/EngagementNotesPanel';
import { StaffClientTeam } from '@/components/client-portal/pages/team';
import { RaiseEscalationButton } from '@/components/super/escalations/RaiseEscalationButton';
import { useSuperOverview, useSuperProject } from '@/hooks/use-super-overview';
import { SUPER_PROJECTS_HREF } from '@/lib/super/super-overview';

/**
 * SUPER ADMIN CLIENT RECORD (L2) — one engagement, end to end (prototype
 * `ClientRecordScreen`, C-0109).
 *
 * A plain head: the client tile, the name with the stage pill, the contact,
 * admin, manager and lead, with Reassign and Documents beside the name. The other
 * real actions keep one "More" menu: the read-only "inspect as" links into the role
 * shells, the board resolution editor (P-112), Assign task and Escalate (G-20).
 * Under it one white band with the step, days to COI, who holds the work and the
 * live step, then underline tabs (R-11): Incorporation opens on the Gantt timeline
 * (R-21) over the phase rows, then registrations, obligations, documents, escalations
 * (the real feature behind the Overview's "Open esc."), notes, team (the only full list
 * of who is on this client) and audit. Step work stays in the firm shell. Fees stay off the record (owner decision).
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
  const [escalateOpen, setEscalateOpen] = useState(false);
  // Days the current step has been open, and the expected certificate date, from the step events.
  const practice = usePracticeMetrics().data;

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
  const currentIndex = summary.currentStep
    ? detail.journey.findIndex((step) => step.id === summary.currentStep?.id)
    : -1;
  const currentStep = currentIndex >= 0 ? detail.journey[currentIndex] : null;
  const chip = superStateChip(summary);
  const owner = superOwnerOf(summary);
  const regSteps = detail.journey.filter((step) => step.phaseId === 'registration-phase-4');
  const adminName = staff.adminNameOf(summary.managerId);
  // The first client login on the engagement is the contact the prototype mails.
  const clientEmail = detail.team.find((member) => member.role === 'Client')?.email ?? null;
  const inc = !summary.incorporated;
  // Days to COI: before the certificate, the days left to the expected date; after it, the days it took.
  const coiOn = detail.timeline?.incorporationDate ?? null;
  const expectedOn = detail.timeline?.expectedCoiOn ?? null;
  const dayStamp = (ymd: string) => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  const daysToCoi = coiOn
    ? Math.max(0, Math.round((dayStamp(coiOn) - dayStamp(summary.createdAt)) / 86_400_000))
    : expectedOn
      ? Math.round((dayStamp(expectedOn) - dayStamp(new Date().toISOString())) / 86_400_000)
      : null;
  // Steps are counted by the part the client is in: incorporation, then with post-incorporation.
  const [partA = 0, partB = 0, partC = 0, partD = 0] = summary.phases.map((phase) => phase.total);
  const incTotal = partA + partB;
  const preRegTotal = incTotal + partC;
  const cur = currentIndex >= 0 && currentIndex < preRegTotal ? currentIndex + 1 : null;
  const incDone = (summary.phases[0]?.done ?? 0) + (summary.phases[1]?.done ?? 0) + (summary.phases[2]?.done ?? 0);
  const regDone = summary.phases[3]?.done ?? 0;
  const holder = owner === 'client' ? 'client' : owner === 'manager' ? 'manager' : 'SBC';
  const daysHeld = practice?.currentStep[summary.id]?.days ?? summary.idleDays;
  const firmRows = firm.data?.engagements ?? [];
  const assignRows = firmRows.some((row) => row.id === summary.id) ? firmRows : [summary, ...firmRows];

  const tabs = [
    { key: 'steps', label: 'Incorporation', count: inc && cur ? `${cur}/${incTotal}` : `${incDone}/${preRegTotal}` },
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
          {currentStep ? (
            <>
              <span className="text-ink-muted">{stepWord(currentStep.id)} ·</span> {currentStep.title}
            </>
          ) : (
            'Every step is done'
          )}
        </span>
      </span>
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
                <AreaPill area={superStageWord(summary)} reg={summary.incorporated ? undefined : 'mca'} />
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
                    <a href={`mailto:${clientEmail}`} className="inline-flex items-center gap-1 text-brand-text hover:underline">
                      <Mail size={14} strokeWidth={1.6} aria-hidden />
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
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(true)}>
                <Repeat aria-hidden />
                Reassign
              </Button>
              <Button variant="outline" onClick={() => setTab('documents')}>
                Documents {detail.documents.length}
              </Button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuItem asChild>
                    <Link href={detail.enterAs.firm}>
                      <ExternalLink aria-hidden />
                      Firm view
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={detail.enterAs.client}>
                      <ExternalLink aria-hidden />
                      Client portal
                    </Link>
                  </DropdownMenuItem>
                  {/* P-112: the super admin's board resolution editor for this client. */}
                  <DropdownMenuItem asChild>
                    <Link href={`${SUPER_PROJECTS_HREF}/${encodeURIComponent(summary.id)}/board-resolution`}>
                      <FileSignature aria-hidden />
                      Board resolution
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTaskOpen(true)}>
                    <ListPlus aria-hidden />
                    Assign task
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEscalateOpen(true)}>
                    <TriangleAlert aria-hidden />
                    Escalate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <RaiseEscalationButton
                engagementId={summary.id}
                companyName={summary.companyName}
                admins={staff.firmAdmins}
                open={escalateOpen}
                onOpenChange={setEscalateOpen}
              />
            </div>
          </div>

          <div className="surface flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3.5 md:px-5">
            {cur ? (
              <BandNumber label="Step" value={cur} of={`of ${cur <= incTotal ? incTotal : preRegTotal}`} />
            ) : (
              <BandNumber label="Now at" value={stepCode(currentStep?.id) ?? 'Done'} of={`${regDone} of ${partD} registrations`} />
            )}
            {inc ? (
              <BandNumber label="Days to COI" value={daysToCoi ?? '–'} />
            ) : (
              <BandNumber label="Steps done" value={`${summary.progress.done}/${summary.progress.total}`} />
            )}
            {owner ? <BandNumber label={`With ${holder}`} value={daysHeld === null ? '–' : `${daysHeld} ${daysHeld === 1 ? 'day' : 'days'}`} /> : null}
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

function BandNumber({ label, value, of }: { label: string; value: number | string; of?: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <b className="text-[22px] font-medium leading-none tabular-nums text-ink">
        {value}
        {of ? <small className="ml-1 text-[13px] font-normal text-ink-muted">{of}</small> : null}
      </b>
    </span>
  );
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
