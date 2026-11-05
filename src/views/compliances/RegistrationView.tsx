'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarClock } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { OwnerChip } from '@/components/ui/spectrum-chip';
import { StepMark, type StepState } from '@/components/ui/step-track';
import { EmptyState } from '@/components/ui/empty-state';
import { useApp } from '@/context/AppContext';
import { getChecklistStepTimelineLabel, getRegistrationPhases } from '@/data/checklist';
import { adminProjectStepPath, internEngagementStepPath } from '@/lib/projects/project-step-path';
import { formatWindow } from '@/lib/projects/schedule-windows';
import { cn } from '@/lib/utils';
import type { ComplianceScope } from '@/views/compliances/compliance-scope';
import { daysUntil, isIdentifier, plainDate } from '@/lib/compliance/spectrum-status';
import { Fact, HeadRing, RailCard, TextCard, WordChip } from '@/views/compliances/spectrum-parts';
import { PersonCell } from '@/views/compliances/identity';
import { BeforeFilingCard } from '@/views/compliances/record-cards';
import { AssistCard } from '@/components/compliances/AssistParts';
import { AppliesCard, StaffFromClientCard, StaffSbcFieldsCard, StartsCard } from '@/views/compliances/input-cards';
import { registrationChecklist } from '@/data/before-filing';
import { CertificateButton, RegistrationDatesDialog, RenewByCell, renewalLine } from '@/views/compliances/registration-renewal';
import { useRegistrationFacts } from '@/hooks/use-registration-facts';
import { isoOfText } from '@/lib/registrations/registration-facts';
import {
  parseRegistrationKey,
  regDateLabel,
  registrationRows,
  type RegistrationRow,
} from '@/views/compliances/registration-rows';

const OWNER_LABEL = { client: 'Client', sbc: 'SBC', mca: 'Authority', manager: 'Manager' } as const;

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
  const assignee = nameOf(row.assigneeId);
  const number = facts?.number ?? row.number ?? null;
  const factDate = facts?.registeredOn ? (isoOfText(facts.registeredOn) ? plainDate(facts.registeredOn, now) : facts.registeredOn) : null;
  const regDate = factDate ?? (row.registrationDate ? plainDate(row.registrationDate, now) : null);
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
  const others = rows.filter((r) => r.key !== row.key && r.word !== 'Not needed' && r.word !== 'Done').slice(0, 6);

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
            <CertificateButton facts={facts} engagementId={engagement.id} size="default" />
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <CalendarClock aria-hidden />
              Renewal dates
            </Button>
            <Button asChild>
              <Link href={stepHref}>
                Open step
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <Fact k="Status">
              {row.word === 'Not needed' ? <span className="font-normal text-ink-muted">Not needed</span> : <WordChip word={row.word} />}
            </Fact>
            {row.owner ? (
              <Fact k="With">
                <OwnerChip owner={row.owner} label={OWNER_LABEL[row.owner]} />
              </Fact>
            ) : null}
            <Fact k="Number" className={cn(number && isIdentifier(number) && 'font-mono')}>
              {number ?? <span className="font-normal text-ink-faint">Not recorded</span>}
            </Fact>
            <Fact k={row.word === 'Done' ? 'Done on' : 'Due'} className={date.className}>
              {date.text}
            </Fact>
            {regDate ? <Fact k="Date of registration">{regDate}</Fact> : null}
            {facts?.issuedOn ? <Fact k="Issued">{plainDate(facts.issuedOn, now)}</Fact> : null}
            {facts?.expiresOn ? (
              <Fact k="Renew by">
                <RenewByCell facts={facts} now={now} />
              </Fact>
            ) : null}
            {facts?.certificate ? <Fact k="Certificate">{facts.certificate.name}</Fact> : null}
            {row.window ? <Fact k="Window">{formatWindow(row.window)}</Fact> : null}
            <Fact k="Lead">
              <PersonCell name={lead} />
            </Fact>
            {assignee && assignee !== lead ? (
              <Fact k="Assigned to">
                <PersonCell name={assignee} />
              </Fact>
            ) : null}
            <Fact k="Step">{`${row.step} of registration`}</Fact>
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            <DashSection title="Progress" bodyClassName="p-0">
              <ul>
                {[
                  ['Documents from the client', 'Client'],
                  ['Application filed by SBC', 'SBC'],
                  [`Review by ${row.authority}`, 'Authority'],
                ].map(([label, who], i) => (
                  <li key={label} className={cn('flex items-center gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0', marks[i] === 'now' && 'bg-surface-sunken/60')}>
                    <StepMark state={marks[i]!} tone={row.word === 'Overdue' ? 'bad' : row.word === 'Waiting' ? 'teal' : 'prog'} size={20} />
                    <span className="min-w-0 flex-1">
                      <b className={cn('block truncate text-[14px]', marks[i] === 'now' ? 'font-medium text-ink' : 'font-normal text-ink-2')}>{label}</b>
                      <span className="block text-[12.5px] text-ink-muted">
                        {marks[i] === 'done' ? 'Done' : marks[i] === 'now' ? `With ${who}` : 'Next'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </DashSection>

            {/* S-774-style From the client on the registration: asked documents, needs not asked yet, the client's details. */}
            {row.word === 'Not needed' ? null : (
              <StaffFromClientCard engagementId={engagement.id} kind="registration" subjectKey={item.id} clientName={engagement.companyName} />
            )}
            {/* S-811: the values SBC records on the registration. */}
            <StaffSbcFieldsCard engagementId={engagement.id} kind="registration" subjectKey={item.id} />
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
            {row.word === 'Not needed' ? null : (
              <BeforeFilingCard
                engagementId={engagement.id}
                kind="registration"
                subjectKey={item.id}
                lines={registrationChecklist(row.category)}
              />
            )}
            <AppliesCard engagementId={engagement.id} stepId={item.id} companyName={engagement.companyName} notNeeded={row.word === 'Not needed'} />
            <StartsCard engagementId={engagement.id} stepId={item.id} obligationsBase={`${shellBase}/compliances/obligations`} />
            <TextCard title="Renewal">
              <p className={renewal ? undefined : 'text-ink-faint'}>{renewal ?? 'No expiry recorded'}</p>
            </TextCard>
            <RailCard
              title={`Open for ${engagement.companyName}`}
              items={others.map((r) => {
                const d = regDateLabel(r, now);
                return { key: r.key, title: r.name, sub: r.word, right: d.text, rightClass: d.className, href: `${basePath}/${encodeURIComponent(r.key)}` };
              })}
            />
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
