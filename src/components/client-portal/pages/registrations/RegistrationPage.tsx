'use client';

/**
 * One registration (VCFO Spectrum RegistrationScreen): the record head (status, area,
 * owner, the due or done date and the stored number), the step's parts as ST5 marks from
 * the client's own answers, the registration details stored on the credentials workbook,
 * the documents the step needs, About, and the filings it starts on the client's register.
 * The client acts on the incorporation step page, so "Upload documents" goes there.
 * The registration facts (G-05) add the certificate download (a signed URL through the
 * scoped `/api/registrations/certificate`), the issue date, the expiry and a Renewal card.
 */
import { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { clientIncorporationStepPath } from '@/lib/projects/project-step-path';
import { fmtDM, fmtDMY, todayIso } from '@/lib/client-portal/compliances';
import { usePortal, usePortalCrumbs } from '../../PortalProvider';
import { usePortalIncorporation } from '../../hooks';
import { subList } from '../incorporation/data';
import { useAllFilings } from '../compliances/api';
import { groupCompanyObligations } from '@/lib/compliance/obligation-groups';
import { obligationHref } from '../compliances/ObligationsPage';
import { Empty, GoLink, Island, ListRow, PeopleStack, RecordHead, SCard, StepList, TextCard, WordPill } from '../compliances/spectrum';
import { FromClientCard, SbcFieldsCard, useRecordPeople } from '../compliances/inputs';
import { useComplianceStarts } from '@/components/compliances/use-compliance-records';
import { buildRegistrations, startsFilings, type RegItem } from './model';
import { REGISTRATIONS_BASE, RegChip, useClientRegistrationFacts, useRegCredentials } from './parts';
import { CertificateButton, renewalLine } from '@/views/compliances/registration-renewal';
import { renewalOf } from '@/lib/registrations/registration-facts';
import '../../css/compliances-board.css';

export function RegistrationRecordPage({ id }: { id: string }) {
  const { model, loading } = usePortalIncorporation();
  const { after } = usePortal();
  const creds = useRegCredentials();
  const { facts } = useClientRegistrationFacts();
  const r = useMemo(
    () => buildRegistrations(model, creds.data, facts, { beforeCoi: !after }).find((x) => x.id === id || x.stepId === id) ?? null,
    [model, creds.data, facts, id, after],
  );
  usePortalCrumbs(['Registrations', r?.name ?? 'Registration']);
  const back = (
    <GoLink href={REGISTRATIONS_BASE} className="text-[13px] font-medium text-brand-text hover:underline">
      All registrations
    </GoLink>
  );
  return (
    <div className="cp-compliances">
      <div className="cp-comp-root page">
        <Island className="grid gap-5">
          {loading ? (
            <div aria-busy="true" aria-label="Loading the registration">
              <SkeletonRows rows={6} />
            </div>
          ) : !r ? (
            <SCard title="Registration">
              <Empty action={back}>Not on your checklist</Empty>
            </SCard>
          ) : (
            <Record r={r} credsError={creds.isError && !facts} credsLoading={creds.isLoading} />
          )}
        </Island>
      </div>
    </div>
  );
}

function Record({ r, credsError, credsLoading }: { r: RegItem; credsError: boolean; credsLoading: boolean }) {
  const { go, after, shell } = usePortal();
  const companyShort = shell?.companyShort || 'You';
  const today = todayIso();
  const parts = subList(r.step);
  const filings = useAllFilings(after && Boolean(startsFilings(r.stepId)));
  const starts = useMemo(() => {
    const rule = startsFilings(r.stepId);
    if (!rule) return [];
    return groupCompanyObligations(filings.data?.rows ?? [], today).filter((o) => o.area === rule.area && (!rule.name || rule.name.test(`${o.name} ${o.particular}`)));
  }, [filings.data, r.stepId, today]);
  const date = r.status === 'Done' ? r.doneOn : r.due;
  const numberEmpty = credsLoading ? 'Loading' : credsError ? 'Could not load' : '-';
  const now = new Date(`${today}T00:00:00`);
  const renewal = renewalOf(r.facts, now);
  const renewalText = renewalLine(r.facts, now);
  const registeredOn = r.registeredOn && /^\d{4}-\d{2}-\d{2}$/.test(r.registeredOn) ? fmtDMY(r.registeredOn) : r.registeredOn;
  const people = useRecordPeople();
  const applicability = useComplianceStarts();
  const rule = applicability.data?.byStep[r.stepId] ?? null;
  const fixed = [
    { k: 'Number', v: r.number ?? (numberEmpty === '-' ? null : numberEmpty), mono: Boolean(r.number) },
    { k: 'Date of registration', v: registeredOn ?? null },
    { k: 'Certificate', v: r.certificate ?? null, mono: Boolean(r.certificate) },
    ...(r.facts?.issuedOn ? [{ k: 'Issued', v: fmtDMY(r.facts.issuedOn) }] : []),
    ...(r.facts?.expiresOn ? [{ k: 'Expires', v: fmtDMY(r.facts.expiresOn) }] : []),
  ];
  const detailsRef = useRef<HTMLDivElement>(null);

  // The one main action: the certificate once granted, the open asks while waiting, else the details.
  const actions = r.notNeeded ? null : r.status === 'Done' ? (
    <CertificateButton facts={r.facts} size="default" />
  ) : r.status === 'Waiting' && r.step.canOpen ? (
    <Button onClick={() => go(clientIncorporationStepPath(r.step.item))}>Upload documents</Button>
  ) : (
    <Button onClick={() => detailsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>Check my details</Button>
  );
  const description = r.step.item.description && !/\bintern\b/i.test(r.step.item.description) ? r.step.item.description : `Part of the ${r.group} registrations.`;

  return (
    <>
      <RecordHead
        title={r.name}
        sub={
          <>
            {r.forms.length ? <span className="font-mono text-[13px]">{r.forms.join(' · ')}</span> : null}
            {r.forms.length ? ' · ' : ''}
            {r.group}
          </>
        }
        chips={
          <>
            <RegChip r={r} />
            <WordPill word={r.area} />
          </>
        }
        facts={[
          { k: r.status === 'Done' ? 'Granted' : 'Expected', v: date ? fmtDMY(date) : after ? '-' : 'After the certificate', tone: r.status === 'Overdue' ? 'bad' : undefined },
          { k: 'Number', v: r.number ? <span className="font-mono text-[13px]">{r.number}</span> : '-' },
          ...(renewal ? [{ k: 'Renew by', v: fmtDMY(renewal.renewBy), tone: renewal.word === 'Overdue' ? ('bad' as const) : undefined }] : []),
        ]}
        people={<PeopleStack people={people} />}
        actions={actions}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-5">
          {!r.notNeeded ? (
            <SCard title="Steps" meta={`${parts.filter((p) => p.s === 'done').length} of ${parts.length} done`} flush>
              <div className="px-4 md:px-5">
                <StepList
                  today={today}
                  steps={parts.map((p, i) => ({
                    key: `${p.l}-${i}`,
                    title: p.l,
                    state: p.s === 'done' ? 'done' : p.s === 'now' ? 'now' : 'next',
                    client: r.step.kind === 'you',
                    holder: r.step.kind === 'you' ? `With ${companyShort}` : r.owner === 'mca' ? 'With MCA' : 'With SBC',
                    note: p.s === 'now' && r.due ? `due ${fmtDM(r.due)}` : undefined,
                  }))}
                />
              </div>
            </SCard>
          ) : null}
          {!r.notNeeded ? (
            <div ref={detailsRef} className="grid min-w-0 scroll-mt-20">
              <FromClientCard kind="registration" subjectKey={r.stepId} editable={r.status !== 'Done'} />
            </div>
          ) : null}
          <SbcFieldsCard kind="registration" subjectKey={r.stepId} extra={fixed} />
        </div>
        <div className="grid min-w-0 gap-5">
          <TextCard title="About" sop>
            {description}
          </TextCard>
          {rule ? (
            r.notNeeded || rule.applies === false ? (
              <TextCard title="Not needed">
                <p>{rule.notNeeded}</p>
                {rule.answers.length ? <p className="text-ink-muted">{rule.answers.map((a) => `${a.label} ${a.value}`).join(' · ')}</p> : null}
              </TextCard>
            ) : (
              <TextCard title="Applies because">
                <p>
                  Applies to {companyShort} because: {rule.why}
                </p>
                {rule.answers.length ? <p className="text-ink-muted">{rule.answers.map((a) => `${a.label} ${a.value}`).join(' · ')}</p> : null}
                <p className="text-ink-muted">Rule: {rule.rule}</p>
              </TextCard>
            )
          ) : null}
          {!starts.length && rule?.starts.length ? (
            <SCard title="What it starts" meta={rule.starts.length} flush>
              {rule.starts.map((o) => (
                <ListRow key={o.id}>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                  <span className="flex-none text-[12.5px] text-ink-muted">{o.freqLabel}</span>
                  <span className="flex-none text-[12.5px] text-ink-faint">{rule.startsOn ? `From ${fmtDM(rule.startsOn)}` : after ? 'Not on your register yet' : 'After the certificate'}</span>
                </ListRow>
              ))}
            </SCard>
          ) : startsFilings(r.stepId) && (starts.length || !after) ? (
            <SCard title="What it starts" meta={starts.length || undefined} flush>
              {starts.length ? (
                starts.map((o) => (
                  <ListRow key={o.id} onClick={() => go(obligationHref(o.id))} label={`${o.name} · open the obligation`}>
                    <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                    <span className="flex-none text-[12.5px] text-ink-muted">{o.freqLabel}</span>
                  </ListRow>
                ))
              ) : (
                <Empty>{after ? 'None on your register yet' : 'After the certificate'}</Empty>
              )}
            </SCard>
          ) : null}
          <SCard title="Renewal">
            <p className={`text-[13.5px] leading-relaxed ${renewalText ? 'text-ink-2' : 'text-ink-faint'}`}>
              {renewalText ?? 'None'}
              {renewal?.word ? ` ${renewal.word}.` : ''}
            </p>
          </SCard>
        </div>
      </div>
    </>
  );
}
