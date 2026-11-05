'use client';

/**
 * PHASE PAGE — `/app/client/incorporation/phase/[n]` (VCFO Spectrum, prototype
 * src/screens/client/PhaseScreen.tsx): a plain page head with the previous and next phase,
 * the Progress card (one bar, key dates), the Steps table (T1), the ST5 journey of the phase
 * with the focus step's sub-steps, and "Who is doing it" as one stacked bar.
 */
import { CircleHelp, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PortalPhase, PortalStep } from '@/lib/client-portal/step-model';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StepMark } from '@/components/ui/step-track';
import { SkeletonRows } from '@/components/ui/empty-state';
import { phaseHref } from '../../routes';
import { usePortal, usePortalCrumbs } from '../../PortalProvider';
import { useDocViewer, type ViewerDoc } from '../documents/DocViewer';
import { IncFrame, days, fmt, fmtY } from './ui';
import { PH, kd, idx, ownKey, phDoneEnd, phPlan, phaseAnswer, stRow, stepHrefOf, subList, tabsFor, useIncData, type IncData, type SubStep } from './data';
import { StepTable } from './StepTable';
import { Col, Cols, Dot, Empty, Island, PageHead, SCard, StackedBar, StepRow, useGo, type BarTone, type PageHeadLink } from './spectrum';

/** Sub-steps of the focus step: small ST5 marks with labels under them (was the navy rail hero). Also on the step page (G-10). */
function SubSteps({ subs }: { subs: SubStep[] }) {
  const labels = subs.length <= 6;
  const st = (s: string) => (s === 'done' ? 'done' : s === 'now' ? 'in progress' : 'to do');
  return (
    <span className="mt-2 block">
      <span className="grid gap-1" style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0, 1fr))` }} role="list" aria-label="Sub-steps">
        {subs.map((x, i) => (
          <span key={`${x.l}-${i}`} role="listitem" className="grid min-w-0 justify-items-start gap-1" data-tt={`${x.l} · ${st(x.s)}`}>
            <StepMark state={x.s === 'todo' ? 'next' : x.s} size={18} label={`${x.l} · ${st(x.s)}`} />
            {labels ? <span className={cn('block w-full truncate text-[11.5px]', x.s === 'now' ? 'font-medium text-ink' : 'font-normal text-ink-muted')}>{x.l}</span> : null}
          </span>
        ))}
      </span>
      {labels ? null : (
        <span className="mt-1 block text-[11.5px] font-normal text-ink-muted">
          {subs.filter((x) => x.s === 'done').length} of {subs.length} sub-steps done
        </span>
      )}
    </span>
  );
}

/** The ST5 list of one phase (prototype JourneyCard). Long phases show nine steps around the focus until expanded. */
function JourneyCard({ p, focus, d }: { p: PortalPhase; focus: string; d: IncData }) {
  const [all, setAll] = useState(false);
  const l = p.steps;
  let list = l;
  if (l.length > 11 && !all) {
    const i = l.findIndex((x) => x.id === focus);
    const s = Math.max(0, Math.min(l.length - 9, i - 4));
    list = l.slice(s, s + 9);
  }
  const prevOf = (x: PortalStep) => d.model.steps[d.model.steps.indexOf(x) - 1];
  return (
    <SCard title={`${PH[p.no - 1]} · journey`} meta={`${p.done} / ${l.length}`} headIcon={{ icon: ListChecks, tone: 'blue' }}>
      <ol className="flex flex-col">
        {list.map((x, i) => {
          const isFocus = x.id === focus;
          const subs = isFocus ? subList(x) : null;
          return (
            <StepRow
              key={x.id}
              s={x}
              prev={prevOf(x)}
              company={d.short}
              lastRow={i === list.length - 1}
              above={list[i - 1]}
              focus={isFocus}
              compact
              below={subs && subs.length > 1 ? <SubSteps subs={subs} /> : undefined}
            />
          );
        })}
      </ol>
      {l.length > 11 ? (
        <button type="button" className="mt-2 text-[13px] font-medium text-brand-text hover:underline" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer steps' : `Show all ${l.length} steps`}
        </button>
      ) : null}
    </SCard>
  );
}

export default function PhasePage({ phaseNo }: { phaseNo: number }) {
  const d = useIncData();
  const { drill, openChat } = usePortal();
  const go = useGo();
  const viewer = useDocViewer();
  const p = d.model.phases[Math.min(4, Math.max(1, phaseNo)) - 1];
  const i = (p?.no ?? 1) - 1;
  usePortalCrumbs(['Incorporation', p ? `Phase ${p.no} · ${p.name}` : 'Phase']);
  const coi = d.coiDate ?? d.coiExpected;
  const plan = p ? phPlan(p, coi) : null;
  const doneEnd = p ? phDoneEnd(p) : undefined;
  const endD = p?.state === 'done' ? doneEnd ?? plan?.[1] : plan?.[1];
  const focusStep = useMemo(() => {
    if (!p) return undefined;
    return p.steps.find((x) => kd(x) === 'you') ?? p.steps.find((x) => kd(x) !== 'done') ?? p.steps.at(-1);
  }, [p]);

  if (!p) return null;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const title = `Phase ${p.no} · ${PH[i]}`;
  const ans = phaseAnswer(p, d.short, phaseHref(p.no));
  const drillPhase = () => {
    const tabs = tabsFor(p.steps, d.coiExpected);
    const c = (k: string) => p.steps.some((x) => kd(x) === k);
    const act = c('you') ? 'you' : c('with') ? 'with' : c('prog') ? 'prog' : p.done === p.total ? 'done' : 'up';
    drill({ title, sub: `${p.done} of ${p.total} steps done`, tabs, active: idx(tabs, act) });
  };
  const O: Array<[string, PortalStep[], BarTone, string, string]> = [
    [d.short, p.steps.filter((x) => ownKey(x) === 'You'), 'warn', 'You', 'oklch(var(--warning-mid))'],
    ['SBC', p.steps.filter((x) => ownKey(x) === 'SBC'), 'prog', 'SBC', 'oklch(var(--brand))'],
    ['MCA', p.steps.filter((x) => ownKey(x) === 'MCA'), 'violet', 'MCA', 'oklch(var(--identity))'],
  ];
  const owners = O.filter((o) => o[1].length);
  const drillOwner = (o: string) => {
    const tabs = owners.map((x) => ({ k: x[3], label: x[0], color: x[4], rows: x[1].map((s) => stRow(s, d.coiExpected)) }));
    drill({ title: `Who is doing it · Phase ${p.no}`, sub: `${PH[i]} · ${p.total} steps`, tabs, active: idx(tabs, o) });
  };
  const curNow = p.state !== 'done' ? focusStep : undefined;
  const lateDays = p.state === 'done' && plan && doneEnd && doneEnd > plan[1] ? days(plan[1], doneEnd) : 0;
  const earlyDays = p.state === 'done' && plan && doneEnd && doneEnd < plan[1] ? days(doneEnd, plan[1]) : 0;
  const span = plan && doneEnd ? Math.max(1, days(plan[0], doneEnd)) : 1;
  const links: PageHeadLink[] = [
    ...(p.no > 1 ? [{ href: phaseHref(p.no - 1), label: `Phase ${p.no - 1} · ${PH[i - 1]}`, dir: 'prev' as const }] : []),
    ...(p.no < 4 ? [{ href: phaseHref(p.no + 1), label: `Phase ${p.no + 1} · ${PH[i + 1]}`, dir: 'next' as const }] : []),
  ];
  const pill = 'rounded-md bg-surface-sunken px-2.5 py-1';

  return (
    <IncFrame pending={d.pending} title={`${title} · Incorporation · VCFO Suite`}>
      <div className="wrap">
        <Island className="grid grid-cols-1 gap-5">
          {d.pending ? (
            <>
              <span className="block h-14 w-1/2 animate-pulse rounded-md bg-surface-sunken" aria-hidden />
              <SkeletonRows rows={2} />
              <Cols>
                <SkeletonRows rows={8} />
                <SkeletonRows rows={6} />
              </Cols>
            </>
          ) : (
            <>
              <PageHead
                label={title}
                title={title}
                meta={
                  <>
                    <button type="button" onClick={drillPhase} className="text-brand-text hover:underline" aria-label={`Phase ${p.no} · ${pct}% · ${p.done} of ${p.total} steps done`}>
                      {p.done}/{p.total} steps · {pct}%
                    </button>
                    {plan ? (
                      <>
                        <Dot />
                        <span>
                          {fmt(plan[0])} → {fmt(endD)}
                        </span>
                        <Dot />
                        <span>
                          {p.state === 'done' ? 'finished' : 'ends'} {fmtY(endD)}
                        </span>
                      </>
                    ) : null}
                  </>
                }
                links={links}
                actions={
                  <Button variant="quiet" size="sm" aria-label={`What’s this? ${title}`} onClick={() => openChat(`What’s this: ${title}?`, ans)}>
                    <CircleHelp size={15} strokeWidth={1.6} aria-hidden />
                    What’s this?
                  </Button>
                }
              />

              <SCard title="Progress" meta={`${p.done} of ${p.total} steps`}>
                <button type="button" onClick={drillPhase} className="flex w-full items-center gap-4 text-left" aria-label="Steps of this phase by status">
                  <span className="relative flex h-3.5 min-w-0 flex-1 items-center">
                    <span className="flex h-2.5 w-full overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
                      <i
                        className={cn('block h-full', pct === 100 ? 'bg-positive-mid' : 'bg-brand')}
                        style={{ width: `${lateDays > 0 ? (1 - lateDays / span) * 100 : pct}%` }}
                      />
                      {lateDays > 0 ? <i className="block h-full flex-1 bg-danger-mid" /> : null}
                    </span>
                    {p.no === 2 && coi ? (
                      <span className="absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[2px] bg-highlight-bright" aria-label={`COI ${fmt(coi)}`} />
                    ) : null}
                  </span>
                  <span className="flex flex-none items-baseline gap-2 whitespace-nowrap text-[12.5px] text-ink-muted">
                    <b className="text-[14px] font-medium text-ink">{pct}%</b>
                    <span>
                      {p.done} / {p.total} steps
                    </span>
                    {lateDays > 0 ? <span className="font-medium text-danger">{lateDays} days late</span> : null}
                    {earlyDays > 0 ? <span className="font-medium text-positive">{earlyDays} days early</span> : null}
                    {endD ? (
                      <span className="hidden font-medium text-ink sm:inline">
                        {p.state === 'done' ? 'Finished' : 'Ends'} {fmt(endD)}
                      </span>
                    ) : null}
                  </span>
                </button>
                <dl className="mt-3 flex flex-wrap gap-2 text-[12.5px] text-ink-muted">
                  {plan ? (
                    <div className={pill}>
                      Starts <b className="font-medium text-ink">{fmt(plan[0])}</b>
                    </div>
                  ) : null}
                  {endD ? (
                    <div className={pill}>
                      {p.state === 'done' ? 'Finished' : 'Ends'} <b className="font-medium text-ink">{fmt(endD)}</b>
                    </div>
                  ) : null}
                  {curNow ? (
                    <div className={pill}>
                      Now{' '}
                      <a href={stepHrefOf(curNow)} onClick={go(stepHrefOf(curNow))} className="font-medium text-brand-text hover:underline">
                        Step {curNow.n} · {curNow.title}
                      </a>
                    </div>
                  ) : null}
                  {p.no === 2 && coi ? (
                    <div className={pill}>
                      COI <b className="font-medium text-ink">{fmt(coi)}</b>
                      {d.coiDate ? '' : ' (expected)'}
                    </div>
                  ) : null}
                  {d.leadName ? (
                    <div className={pill}>
                      Reviewer <b className="font-medium text-ink">{d.leadName}</b>
                    </div>
                  ) : null}
                </dl>
              </SCard>

              <Cols>
                <Col>
                  <SCard title="Steps" meta={`${p.total} steps`} flush>
                    <StepTable
                      phase={p}
                      variant="phase"
                      cur={focusStep?.id}
                      short={d.short}
                      coi={d.coiExpected}
                      ownershipType={d.ownershipType}
                      openViewer={viewer.open as (docs: ViewerDoc[], i?: number) => void}
                    />
                  </SCard>
                </Col>
                <Col>
                  {focusStep ? <JourneyCard p={p} focus={focusStep.id} d={d} /> : null}
                  <SCard title="Who is doing it">
                    <StackedBar
                      segments={owners.map((o) => ({ label: o[0], value: o[1].length, tone: o[2] }))}
                      onSegment={(j) => drillOwner(owners[j]![3])}
                    />
                  </SCard>
                </Col>
              </Cols>
              {d.noEngagement ? <Empty>No incorporation project on your account yet</Empty> : null}
            </>
          )}
        </Island>
      </div>
      {viewer.node}
    </IncFrame>
  );
}
