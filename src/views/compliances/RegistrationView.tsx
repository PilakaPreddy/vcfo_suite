'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { AvatarStack } from '@/components/ui/avatar-stack';
import type { StepState } from '@/components/ui/step-track';
import { EmptyState } from '@/components/ui/empty-state';
import { useApp } from '@/context/AppContext';
import { getChecklistStepTimelineLabel, getRegistrationPhases } from '@/data/checklist';
import { adminProjectStepPath, internEngagementStepPath } from '@/lib/projects/project-step-path';
import { cn } from '@/lib/utils';
import type { ComplianceScope } from '@/views/compliances/compliance-scope';
import { daysUntil, isIdentifier } from '@/lib/compliance/spectrum-status';
import { Fact, HeadRing, WordChip } from '@/views/compliances/spectrum-parts';
import { BeforeFilingCard } from '@/views/compliances/record-cards';
import { AssistCard } from '@/components/compliances/AssistParts';
import { AppliesCard, StaffFromClientCard, StaffSbcFieldsCard, StartsCard } from '@/views/compliances/input-cards';
import { registrationChecklist } from '@/data/before-filing';
import { CertificateButton, RegistrationDatesDialog, renewalLine } from '@/views/compliances/registration-renewal';
import { useRegistrationFacts } from '@/hooks/use-registration-facts';
import {
  parseRegistrationKey,
  regDateLabel,
  registrationRows,
  type RegistrationRow,
} from '@/views/compliances/registration-rows';

/** Three workflow stages (Client, SBC, authority) as ST5 marks. */
function stageMarks(row: RegistrationRow): StepState[] {
  if (row.word === 'Done') return ['done', 'done', 'done'];
  if (row.stage === 'approval') return ['done', 'done', 'now'];
  if (row.stage === 'filing') return ['done', 'now', 'next'];
  if (row.stage === 'collection' || row.word === 'Waiting') return ['now', 'next', 'next'];
  if (row.word === 'In progress') return ['done', 'now', 'next'];
  return ['next', 'next', 'next'];
}

/**
 * REGISTRATION RECORD — one registration-phase step for one client (prototype
 * RegistrationScreen / ItemScreen, kind "reg").
 *
 * The head carries the name, the form, the authority and the client, the
 * status and owner chips and the one main button, which opens the step
 * workspace where every action on the step lives (submit, review, request
 * from client, documents). The facts are the step's own: status, stage, who
 * holds it, the lead, the due date from the checklist rule or the manager's
 * window, the completion date, and the registration number and date when the
 * step's answers or the credentials workbook hold them. No number is ever
 * made up.
 *
 * The number, the date of registration, the certificate and the renewal dates
 * come from the scoped `GET /api/registrations?engagementId=` read (G-05),
 * which reads only the workbook's non-secret cells. Staff set the issue date,
 * expiry and renewal period in the Renewal dates dialog (audited).
 */
export function RegistrationView({
  shellBase,
  scope,
  recordKey,
}: {
  shellBase: string;
  scope: ComplianceScope;
  recordKey: string;
}) {
  const now = useMemo(() => new Date(), []);
  const { getStateForEngagement, refreshEngagementChecklist, internOptions, teamMembers } = useApp();
  const parsed = parseRegistrationKey(recordKey);
  const engagement = parsed ? scope.engagements.find((e) => e.id === parsed.engagementId) : undefined;
  const item = parsed ? getRegistrationPhases().flatMap((p) => p.items).find((i) => i.id === parsed.itemId) : undefined;
  const engagementId = engagement?.id;

  // The list reads the slim checklist index; the record loads the full answers once.
  useEffect(() => {
    if (engagementId) void refreshEngagementChecklist(engagementId);
  }, [engagementId, refreshEngagementChecklist]);

  const rows = useMemo(
    () => (engagement ? registrationRows([engagement], getStateForEngagement, now) : []),
    [engagement, getStateForEngagement, now],
  );
  const row = item ? rows.find((r) => r.item.id === item.id) : undefined;
  const factsQ = useRegistrationFacts({ engagementId, enabled: Boolean(engagementId) });
  const facts = engagementId && item ? factsQ.data?.[engagementId]?.[item.id] : undefined;
  const [editing, setEditing] = useState(false);
  const basePath = `${shellBase}/registrations`;

  if (!engagement || !item || !row) {
    return (
      <EmptyState
        title="This registration is not in your clients"
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link href={basePath}>Open registrations</Link>
          </Button>
        }
      />
    );
  }

  const people = [...teamMembers, ...internOptions];
  const nameOf = (id: string | undefined) => (id ? people.find((p) => p.id === id)?.name : undefined);
  const lead = nameOf(engagement.internId);
  const number = facts?.number ?? row.number ?? null;
  const renewal = renewalLine(facts, now);
  const date = regDateLabel(row, now);
  const stepHref =
    shellBase === '/app/intern'
      ? internEngagementStepPath(engagement, item)
      : adminProjectStepPath(engagement, item, shellBase === '/app/manager' ? '/app/manager' : '/app/admin');
  const marks = stageMarks(row);
  const stagesDone = marks.filter((m) => m === 'done').length;
  const lateDays = row.word === 'Overdue' && row.dueDate ? -(daysUntil(row.dueDate, now) ?? 0) : 0;
  const kbHref = `${shellBase}/knowledge-bank?q=${encodeURIComponent(row.name)}`;
  const contact = engagement.clientDisplayName?.trim();
  const manager = engagement.managerId ? nameOf(engagement.managerId) : undefined;
  const onIt = [contact, lead, manager].filter(Boolean) as string[];
  // The two lanes of the Steps card: the authority on the left, SBC for the client on the right.
  const lanes = [
    { title: 'Documents from the client', side: 's', who: 'Client' },
    { title: 'Application filed by SBC', side: 's', who: 'SBC' },
    { title: `Review by ${row.authority}`, side: 'a', who: row.authority },
  ];

  return (
    <PageTransition>
      <SEO title={`${row.name} · ${engagement.companyName} — VCFO Suite`} description={`${row.name} for ${engagement.companyName}.`} path={`${basePath}/${recordKey}`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {/* R-02 plain head: the name, a muted meta line, the chips, the facts and the one main button. */}
        <header className="grid gap-3" aria-label="Registration">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-[1_1_320px] items-center gap-3.5">
              {row.word === 'Not needed' ? null : (
                <HeadRing
                  done={stagesDone}
                  total={marks.length}
                  lateDays={lateDays}
                  label={`${stagesDone} of ${marks.length} stages done`}
                />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">
                  {row.name} · {engagement.companyName}
                </h1>
                <p className="text-[13.5px] text-ink-muted">
                  {row.form ? (
                    <span className="font-mono text-[13px] underline decoration-dashed decoration-line-strong underline-offset-4" title={`Form ${row.form}`}>
                      {row.form}
                    </span>
                  ) : null}
                  {row.form ? ' · ' : null}
                  {row.authority} · {row.category}
                </p>
              </div>
            </div>
            {onIt.length ? <AvatarStack people={onIt} size={30} label={`People on it: ${onIt.join(', ')}`} /> : null}
            <CertificateButton facts={facts} engagementId={engagement.id} size="default" />
            <Button asChild>
              <Link href={stepHref}>
                Open step
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <Fact k={row.word === 'Done' ? 'Done on' : 'Expected'} className={date.className}>
              {date.text}
            </Fact>
            <Fact k="Number" className={cn(number && isIdentifier(number) && 'font-mono')}>
              {number ?? '-'}
            </Fact>
            <Fact k="Status">
              {row.word === 'Not needed' ? <span className="font-normal text-ink-muted">Not needed</span> : <WordChip word={row.word} />}
            </Fact>
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            <DashSection title="Steps" right={<span className="text-[12.5px] text-ink-muted">{stagesDone} of {marks.length} done</span>}>
              <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)]">
                <div className="border-b-1.5 border-line pb-1.5 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">{row.authority}</div>
                <div className="border-b-1.5 border-line pb-1.5">&nbsp;</div>
                <div className="truncate border-b-1.5 border-line pb-1.5 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">SBC, for {engagement.companyName}</div>
                {lanes.map((l, i) => {
                  const mark = marks[i]!;
                  const next = mark !== 'done';
                  const late = mark === 'now' && row.word === 'Overdue';
                  const card = (
                    <div className={cn('min-w-0 rounded-md border-1.5 px-3 py-2', next && !late ? 'border-dashed border-line-strong' : late ? 'border-warning-mid bg-warning-soft' : 'border-line')}>
                      <b className={cn('block truncate text-[13px] font-medium', late ? 'text-warning' : next ? 'text-ink-2' : 'text-ink')}>
                        {mark === 'next' ? `Next: ${l.title}` : l.title}
                      </b>
                      <span className="block truncate text-[12px] text-ink-muted">{mark === 'done' ? 'Done' : mark === 'now' ? `With ${l.who}` : 'Next'}</span>
                    </div>
                  );
                  return (
                    <div key={l.title} className="contents">
                      <div className="min-w-0">{l.side === 'a' ? card : null}</div>
                      <div className={cn('grid place-items-center rounded-md px-1 py-1.5 text-center leading-tight', next ? 'border-1.5 border-dashed border-line-strong' : 'bg-surface-sunken')}>
                        <b className="text-[13px] font-medium text-ink">{mark === 'now' ? 'Today' : mark === 'done' ? 'Done' : '-'}</b>
                      </div>
                      <div className="min-w-0">{l.side === 's' ? card : null}</div>
                    </div>
                  );
                })}
              </div>
            </DashSection>

            {/* S-809: VCFO Assist on the registration's portal form. */}
            {row.word === 'Not needed' ? null : (
              <AssistCard
                engagementId={engagement.id}
                kind="registration"
                subjectKey={item.id}
                portal={`${row.authority}`}
                form={row.form || item.forms[0] || null}
                mayStart={row.word !== 'Done'}
              />
            )}

            {/* S-774-style From the client on the registration: asked documents, needs not asked yet, the client's details. */}
            {row.word === 'Not needed' ? null : (
              <StaffFromClientCard engagementId={engagement.id} kind="registration" subjectKey={item.id} clientName={engagement.companyName} />
            )}
            {/* S-811: the values SBC records on the registration. */}
            <StaffSbcFieldsCard engagementId={engagement.id} kind="registration" subjectKey={item.id} />
          </div>

          <div className="grid min-w-0 gap-3">
            <DashSection title="About">
              <div className="grid gap-2 text-[14px] leading-relaxed text-ink-2">
                {item.notes ? <p>{item.notes}</p> : null}
                <p className="text-ink-muted">{getChecklistStepTimelineLabel(item)}</p>
                {item.forms.length ? <p className="text-ink-muted">Forms: {item.forms.join(', ')}</p> : null}
                <Link href={kbHref} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-text hover:underline">
                  <BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
                  Find the SOP in the knowledge bank
                </Link>
              </div>
            </DashSection>
            <AppliesCard engagementId={engagement.id} stepId={item.id} companyName={engagement.companyName} notNeeded={row.word === 'Not needed'} />
            <StartsCard engagementId={engagement.id} stepId={item.id} obligationsBase={`${shellBase}/compliances/obligations`} />
            <DashSection
              title="Renewal"
              right={
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Renewal dates
                </Button>
              }
            >
              <p className={cn('text-[13.5px] leading-relaxed text-ink-2', !renewal && 'text-ink-faint')}>{renewal ?? 'No expiry recorded'}</p>
            </DashSection>
            {row.word === 'Not needed' ? null : (
              <BeforeFilingCard
                engagementId={engagement.id}
                kind="registration"
                subjectKey={item.id}
                lines={registrationChecklist(row.category)}
              />
            )}
          </div>
        </div>
      </div>
      <RegistrationDatesDialog
        open={editing}
        onOpenChange={setEditing}
        engagementId={engagement.id}
        stepId={item.id}
        title={`${row.name} · ${engagement.companyName}`}
        facts={facts}
      />
    </PageTransition>
  );
}
