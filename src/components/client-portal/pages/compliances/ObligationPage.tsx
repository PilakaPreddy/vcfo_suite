'use client';

/**
 * Compliances · one obligation (VCFO Spectrum ObligationScreen): the record head with the
 * status, the area, the next due date, the step count and "n of m filed", then the
 * Past periods grid, About (the text, the facts and the SBC SOP link), and the Why it applies,
 * Due rule and If filed late texts from the scoped obligation read (G-04, asked with one of
 * the client's own filing ids).
 * A period opens the same side panel as Filings (proof viewer and download, Remind me, Add
 * to my calendar, Ask VCFO). `?filing=<id>` opens that period's panel on load.
 *
 * D-4 (COMPLIANCE-MODEL.md 4.2, client view): the open period shows Progress on the right (the
 * six steps with who, when and evidence, the stage and the owner; it replaced the register's
 * four-step "This period" list, hub decision of 30 Oct), Reminders without escalations,
 * the Rule without the confirm note, and the Activity trail, from
 * GET /api/compliances/statutory/:instanceId. No reviewer, no reviewer note, no staff controls.
 * The header's Upload takes the client to the open asks in "From the client".
 */
import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bell, CalendarPlus, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { usePortal, usePortalCrumbs } from '../../PortalProvider';
import { portalHref } from '../../routes';
import { AREA_FULL, fmtDM, fyStartOfMonth, portalFor, slugOf, statusOf, todayIso, type PortalFiling } from '@/lib/client-portal/compliances';
import { fetchProofs, proofHref, useAllFilings, useDownload } from './api';
import { FiledCell, ProofCell } from './cells';
import { CompProvider, useComp } from './ctx';
import { RiskChip, SidePanel, longPeriod } from './Detail';
import { groupCompanyObligations, type Obligation } from '@/lib/compliance/obligation-groups';
import { OBLIGATIONS_BASE } from './ObligationsPage';
import { AreaTag, Empty, FactRows, GoLink, Island, PeopleStack, PortalLink, RecordHead, SCard, StatusChip, WordPill } from './spectrum';
import { FromClientCard, SbcFieldsCard, useRecordPeople } from './inputs';
import { useComplianceStarts, type StartedObligation } from '@/components/compliances/use-compliance-records';
import { obligationInputs } from '@/data/compliance-inputs';
import { registrationHref } from '../registrations/parts';
import { useObligationAbout, whyItAppliesLine, type ObligationAbout } from '@/hooks/use-obligation-about';
import { useStatExtras, type StatExtras } from './task-api';
import { ActivityCard, ProgressCard, RemindersCard } from './detail-parts';
import '../../css/compliances-board.css';

export function CompliancesObligation({ id }: { id: string }) {
  const today = todayIso();
  const { go } = usePortal();
  const filingsOf = (f: PortalFiling) => `${portalHref('filings')}?fy=${fyStartOfMonth(f.dueDate.slice(0, 7))}&filing=${f.id}`;
  return (
    <div className="cp-compliances">
      <CompProvider
        today={today}
        onDrillRow={(f) => go(filingsOf(f))}
        drillLink={{
          text: 'Open filings',
          onClick: () => go(portalHref('filings')),
        }}
      >
        <ObligationBody id={id} today={today} />
      </CompProvider>
    </div>
  );
}

function usePanelParam() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filing = params.get('filing');
  const setFiling = useCallback(
    (v: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (v) next.set('filing', v);
      else next.delete('filing');
      const q = next.toString();
      router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
    },
    [params, router, pathname],
  );
  return { filing, setFiling };
}

function ObligationBody({ id, today }: { id: string; today: string }) {
  const { after } = usePortal();
  const q = useAllFilings(after);
  const o = useMemo(() => groupCompanyObligations(after ? (q.data?.rows ?? []) : [], today).find((x) => x.id === id) ?? null, [after, q.data, today, id]);
  usePortalCrumbs(['Compliances', 'Obligations', o?.name ?? 'Obligation']);

  const back = (
    <GoLink href={OBLIGATIONS_BASE} className="text-[13px] font-medium text-brand-text hover:underline">
      All obligations
    </GoLink>
  );

  let body: React.ReactNode;
  if (!after) return <BeforeObligation id={id} back={back} />;
  else if (q.isError)
    body = (
      <SCard title="Obligation">
        <Empty
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          Could not load the register
        </Empty>
      </SCard>
    );
  else if (q.isLoading)
    body = (
      <div aria-busy="true" aria-label="Loading the obligation">
        <SkeletonRows rows={6} />
      </div>
    );
  else if (!o)
    body = (
      <SCard title="Obligation">
        <Empty action={back}>Not on your register</Empty>
      </SCard>
    );
  else
    return (
      <div className="cp-comp-root page">
        <ObligationRecord o={o} today={today} />
      </div>
    );

  return (
    <div className="cp-comp-root page">
      <Island className="grid gap-5">{body}</Island>
    </div>
  );
}

function ObligationRecord({ o, today }: { o: Obligation; today: string }) {
  const { openChat, toast } = usePortal();
  const { remind, addToCalendar, openProof } = useComp();
  const download = useDownload();
  const { filing, setFiling } = usePanelParam();
  const panel = filing ? (o.instances.find((r) => r.id === filing) ?? null) : null;
  const cur = o.next ?? o.last;
  const late = o.status === 'over';
  const history = [...o.instances].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const [portal] = portalFor(o);
  const about = useObligationAbout({ instanceId: o.instances[0]?.id ?? null });
  const extras = useStatExtras(cur?.id ?? null);
  const x = extras.data ?? null;
  const fromClient = useRef<HTMLDivElement>(null);
  const toInputs = () => {
    const el = fromClient.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  };

  const downloadPrimary = (f: PortalFiling) => {
    fetchProofs(f.id)
      .then((p) => {
        if (!p.length) return toast('Proof pending · SBC will upload it');
        download(proofHref(f.id, p[0]!.id));
        toast(`Download started · ${p[0]!.fileName}`);
      })
      .catch(() => toast('Could not download the proof'));
  };

  const actions = o.next ? (
    <>
      {x?.canUpload !== false ? (
        <Button variant="secondary" onClick={toInputs}>
          <Upload size={16} strokeWidth={1.6} aria-hidden /> Upload
        </Button>
      ) : null}
      <Button
        aria-pressed={Boolean(o.next.reminderOn)}
        onClick={() => (o.next!.reminderOn ? toast(`Reminder already set · email on ${fmtDM(o.next!.reminderOn)}`) : remind(o.next!))}
      >
        <Bell size={16} strokeWidth={1.6} aria-hidden />
        {o.next.reminderOn ? `Reminder ${fmtDM(o.next.reminderOn)}` : 'Remind me'}
      </Button>
      <Button variant="secondary" onClick={() => addToCalendar(o.next!)}>
        <CalendarPlus size={16} strokeWidth={1.6} aria-hidden /> Add to my calendar
      </Button>
    </>
  ) : o.last && o.last.proofCount > 0 ? (
    <Button onClick={() => downloadPrimary(o.last!)}>
      <Download size={16} strokeWidth={1.6} aria-hidden /> Download acknowledgement
    </Button>
  ) : null;
  const people = useRecordPeople();
  const steps = x?.steps ?? [];
  const stepsDone = steps.filter((n) => n.state === 'done').length;
  const past = history.filter((r) => r.id !== cur?.id && (r.filedOn || r.dueDate < today));

  const columns: EFilingColumn<PortalFiling>[] = [
    {
      key: 'period',
      header: 'Period',
      render: (r) => (
        <button
          type="button"
          className="min-w-0 truncate text-left font-medium text-ink"
          aria-label={`${o.name} · ${r.period} · open the details`}
          onClick={(e) => {
            e.stopPropagation();
            setFiling(r.id);
          }}
        >
          {r.period}
        </button>
      ),
    },
    {
      key: 'filed',
      header: 'Filed on',
      width: '120px',
      render: (r) => <FiledCell r={r} today={today} />,
    },
    {
      key: 'ref',
      header: 'Reference',
      width: '190px',
      render: (r) =>
        r.acknowledgementNo ? <span className="font-mono text-[12.5px] text-ink">{r.acknowledgementNo}</span> : <span className="text-ink-faint">-</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '124px',
      render: (r) => <StatusChip s={statusOf(r, today)} />,
    },
    {
      key: 'proof',
      header: 'Proof',
      width: '136px',
      align: 'right',
      render: (r) => <ProofCell r={r} onProof={openProof} onDownload={downloadPrimary} />,
    },
  ];

  return (
    <>
      <Island className="grid gap-5">
        <RecordHead
          title={o.name}
          sub={
            <>
              {o.authorityName} · {o.freqLabel} · {o.companyName}
            </>
          }
          chips={
            <>
              <StatusChip s={o.status} />
              <AreaTag a={o.area} />
            </>
          }
          people={<PeopleStack people={people} />}
          facts={[
            o.next
              ? {
                  k: 'Next due',
                  v: fmtDM(o.next.dueDate),
                  tone: late ? 'bad' : undefined,
                }
              : {
                  k: 'Filed',
                  v: o.last?.filedOn ? fmtDM(o.last.filedOn) : '-',
                },
            ...(o.next && x?.daysToDue != null
              ? [{ k: x.daysToDue < 0 ? 'Overdue' : 'Due in', v: x.daysToDue < 0 ? `${-x.daysToDue} day${x.daysToDue === -1 ? '' : 's'}` : `${x.daysToDue} day${x.daysToDue === 1 ? '' : 's'}`, tone: x.daysToDue < 0 ? ('bad' as const) : undefined }]
              : []),
            ...(steps.length ? [{ k: 'Steps', v: `${stepsDone} of ${steps.length}` }] : []),
            { k: 'Filed', v: `${o.filed} of ${o.total}` },
          ]}
          actions={actions}
        />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-5">
            {cur ? (
              <>
                <div ref={fromClient} className="grid min-w-0 scroll-mt-4">
                  <FromClientCard kind="obligation" subjectKey={cur.id} editable={!cur.filedOn} />
                </div>
                <SbcFieldsCard
                  kind="obligation"
                  subjectKey={cur.id}
                  extra={[
                    { k: 'Reference', v: cur.acknowledgementNo, mono: true },
                    ...(cur.amountPaid ? [{ k: 'Tax paid', v: `₹${Number(cur.amountPaid).toLocaleString('en-IN')}` }] : []),
                    ...(cur.filedOn ? [{ k: 'Filed by', v: cur.filedByName ? `${cur.filedByName} · SBC` : 'SBC' }] : []),
                  ]}
                />
                {x ? <RemindersCard rows={x.reminders} /> : null}
                {x?.rule ? <RuleCard rule={x.rule} frequency={o.freqLabel} /> : null}
                {x ? <ActivityCard rows={x.history} /> : null}
              </>
            ) : null}
            <SCard title="Past periods" flush>
              <div className="px-2 pb-3 pt-1 md:px-3">
                <EFilingGrid
                  caption={`${o.name} past periods`}
                  columns={columns}
                  rows={past}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setFiling(r.id)}
                  pageSize={6}
                  minWidth={640}
                  empty="None"
                />
              </div>
            </SCard>
          </div>
          <div className="grid min-w-0 gap-5">
            {cur && x ? (
              <ProgressCard
                steps={x.steps}
                stage={x.stageLabel}
                owner={x.owner ?? cur.ownerName}
                period={cur.periodLong ?? longPeriod(cur.period)}
                right={
                  <button type="button" className="text-[13px] font-medium text-brand-text hover:underline" onClick={() => setFiling(cur.id)}>
                    Open details
                  </button>
                }
              />
            ) : null}
            <SCard title="About" flush>
              {about.data?.about ? <p className="px-4 pb-1 pt-4 text-[13.5px] leading-relaxed text-ink-2 md:px-5">{about.data.about}</p> : null}
              <FactRows
                rows={[
                  { k: 'Authority', v: o.authorityName },
                  { k: 'Area', v: AREA_FULL[o.area] },
                  { k: 'Frequency', v: o.freqLabel },
                  { k: 'Penalty risk', v: <RiskChip r={o.penaltyRisk} /> },
                  { k: 'With SBC', v: o.ownerName ?? '-', empty: !o.ownerName },
                  {
                    k: 'Filed on',
                    v: (
                      <span className="inline-flex items-center gap-1">
                        {portal} <PortalLink f={o} />
                      </span>
                    ),
                  },
                ]}
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft px-4 py-3 md:px-5">
                <GoLink href={portalHref('knowledge-bank')} className="text-[13px] font-medium text-brand-text hover:underline">
                  Read the SBC SOP
                </GoLink>
                <button type="button" className="text-[13px] font-medium text-brand-text hover:underline" onClick={() => openChat(`Tell me about ${o.name}`)}>
                  Ask VCFO about {o.name}
                </button>
              </div>
            </SCard>
            <AboutTexts about={about.data ?? null} ruleShown={Boolean(x?.rule?.dueRule)} />
          </div>
        </div>
      </Island>
      {panel ? <SidePanel f={panel} onClose={() => setFiling(null)} hideObligation /> : null}
    </>
  );
}

/** D-2.4 Rule, client view: the due rule, where it applies and the penalty. The confirm note never shows here (D-4). */
function RuleCard({ rule, frequency }: { rule: NonNullable<StatExtras['rule']>; frequency: string }) {
  return (
    <SCard title="Rule" flush>
      <FactRows
        rows={[
          { k: 'Due rule', v: rule.dueRule ?? '-', empty: !rule.dueRule },
          ...(rule.applies ? [{ k: 'Applies to', v: rule.applies }] : []),
          { k: 'Penalty', v: rule.penalty || '-', empty: !rule.penalty },
          { k: 'Frequency', v: frequency },
          ...(rule.note ? [{ k: 'Note', v: rule.note }] : []),
        ]}
      />
    </SCard>
  );
}

/** Why it applies and Due rule, then If filed late; not drawn until loaded. The about text sits in the About card. */
function AboutTexts({ about, ruleShown }: { about: ObligationAbout | null; ruleShown?: boolean }) {
  if (!about) return null;
  const why = whyItAppliesLine(about);
  return (
    <>
      {why ? (
        <SCard title="Why it applies">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{why}</p>
        </SCard>
      ) : null}
      {about.dueRule && !ruleShown ? (
        <SCard title="Due rule">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{about.dueRule}</p>
        </SCard>
      ) : null}
      {about.ifLate ? (
        <SCard title="If filed late">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{about.ifLate}</p>
        </SCard>
      ) : null}
    </>
  );
}

/**
 * Before the certificate (C-426): the obligation comes from the list the engagement will
 * carry once incorporated (`/api/registrations/applicability`, the static library kept to the
 * legal form and the questionnaire). Nothing is filed yet: the dates read "After the
 * certificate", the client's fields and SBC's fields show empty and read only.
 */
function BeforeObligation({ id, back }: { id: string; back: React.ReactNode }) {
  const starts = useComplianceStarts();
  const people = useRecordPeople();
  const o: StartedObligation | null = starts.data?.upcoming.find((x) => slugOf(x.particular) === id || x.id === id) ?? null;
  usePortalCrumbs(['Compliances', 'Obligations', o?.name ?? 'Obligation']);
  if (starts.isLoading)
    return (
      <div className="cp-comp-root page">
        <Island className="grid gap-5">
          <div aria-busy="true" aria-label="Loading the obligation">
            <SkeletonRows rows={6} />
          </div>
        </Island>
      </div>
    );
  if (!o)
    return (
      <div className="cp-comp-root page">
        <Island className="grid gap-5">
          <SCard title="Obligation">
            <Empty action={back}>{starts.isError ? 'Could not load the obligation' : 'Starts after incorporation'}</Empty>
          </SCard>
        </Island>
      </div>
    );
  const fields = obligationInputs(o.id, o.complianceArea);
  return (
    <div className="cp-comp-root page">
      <Island className="grid gap-5">
        <RecordHead
          title={o.name}
          sub={
            <>
              {o.authorityName} · {o.freqLabel} ·{' '}
              {o.startedBy ? (
                <GoLink href={registrationHref(o.startedBy.stepId)} className="hover:text-brand-text hover:underline">
                  Started by {o.startedBy.name}
                </GoLink>
              ) : (
                'Every company'
              )}
            </>
          }
          chips={
            <>
              <WordPill word="Not started" />
              <AreaTag a={o.area} />
            </>
          }
          people={<PeopleStack people={people} />}
          facts={[{ k: 'Next due', v: 'After the certificate' }]}
        />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-5">
            <FromClientCard kind="obligation" subjectKey={null} fallback={fields.client} editable={false} />
            <SbcFieldsCard kind="obligation" subjectKey={null} fallback={fields.sbc} />
          </div>
          <div className="grid min-w-0 gap-5">
            <SCard title="About" flush>
              <FactRows
                rows={[
                  { k: 'Authority', v: o.authorityName },
                  { k: 'Area', v: AREA_FULL[o.area] },
                  { k: 'Frequency', v: o.freqLabel },
                  { k: 'Penalty risk', v: <RiskChip r={o.penaltyRisk} /> },
                  { k: 'First due', v: 'After the certificate' },
                ]}
              />
              <div className="border-t border-line-soft px-4 py-3 md:px-5">{back}</div>
            </SCard>
          </div>
        </div>
      </Island>
    </div>
  );
}
