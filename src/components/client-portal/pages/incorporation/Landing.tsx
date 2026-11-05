'use client';

/**
 * INCORPORATION LANDING (VCFO Spectrum, prototype src/screens/client/IncorporationScreen.tsx).
 * A plain page head with the days to the COI, then the ST5 card beside "This week" and one
 * "Incorporation status" card with four stacked bars (R-25), then the phase timeline (R-21) whose
 * rows open the step tables. Phases 1 to 3 only (D1: no Registration section). Wired to the real
 * step model; every drill, the board resolution link and the timeline editor are kept.
 */
import { sep } from '@/lib/date-format';
import { useHomeQuery } from '../home/useHome';
import { PendingRequestChip } from '../home/PendingRequest';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAwaitingClientApproval } from '@/lib/checklist/checklist-step-approval';
import { isStepReleasedToClient } from '@/lib/checklist/checklist-visibility';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { getStepAttachmentRequirements } from '@/lib/checklist/checklist-step-attachments';
import { isReviewRejected, isAwaitingReview } from '@/lib/checklist/checklist-item-review';
import { clientBoardResolutionPath } from '@/lib/projects/project-step-path';
import type { PortalPhase, PortalStep } from '@/lib/client-portal/step-model';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { StepMark } from '@/components/ui/step-track';
import { SkeletonRows } from '@/components/ui/empty-state';
import { phaseHref, portalHref } from '../../routes';
import { usePortal, type DrillConfig, type DrillRow } from '../../PortalProvider';
import { useDocViewer, type ViewerDoc } from '../documents/DocViewer';
import { IncFrame, addD, days, fmt, fmtY, pd, wd } from './ui';
import { PHL, firstName, idx, kd, ownKey, phDoneEnd, phPlan, stRow, stepHrefOf, tabsFor, signedUrlFor, useIncData, withoutRegistration, type IncData } from './data';
import { StepTable } from './StepTable';
import { BoardResolutionLink } from './BoardLink';
import { TimelineEdit } from './TimelineEdit';
import { BAR_FILL, Chevron, Col, Dot, Empty, Island, PageHead, Row, SCard, St5Card, currentPhaseNo, useGo, type BarTone } from './spectrum';

type Seg = [label: string, n: number, tone: BarTone, rows: DrillRow[]];

/** Drill tab colours from the bar tones (tokens only). */
const TONE_VAR: Record<BarTone, string> = {
  ok: 'oklch(var(--positive-mid))',
  warn: 'oklch(var(--warning-mid))',
  bad: 'oklch(var(--danger-mid))',
  prog: 'oklch(var(--brand))',
  idle: 'oklch(var(--upcoming-mid))',
  teal: 'oklch(var(--waiting-mid))',
  violet: 'oklch(var(--identity))',
};

/* ---------------- status split data (rule 14) ---------------- */

function docSegs(d: IncData): { you: Seg[]; sbc: Seg[] } {
  const docsHref = portalHref('documents');
  const sub: DrillRow[] = [];
  const review: DrillRow[] = [];
  const pend: DrillRow[] = [];
  const back: DrillRow[] = [];
  const gen: DrillRow[] = [];
  const spend: DrillRow[] = [];
  const signed: DrillRow[] = [];
  const seen = new Set<string>();
  const curPhase = d.model.current?.phaseNo ?? 4;
  for (const s of d.model.steps) {
    const k = kd(s);
    const released = k === 'done' || isStepReleasedToClient(s.slice);
    if (!released && k !== 'you' && k !== 'prog') continue;
    const responses = extractItemResponses(s.item, s.slice);
    const reqs = getStepAttachmentRequirements(s.item, responses, d.ownershipType);
    for (const r of reqs) {
      const key = `${s.id}:${r.fieldId}`;
      seen.add(key);
      if (s.owner === 'client') {
        const row: DrillRow = { title: r.label, meta: `From ${d.short}`, href: docsHref };
        if (r.uploaded) {
          if (isReviewRejected(s.slice) && (s.slice?.unlockedFields ?? []).includes(r.fieldId)) back.push(row);
          else if (isAwaitingReview(s.slice)) review.push(row);
          else sub.push(row);
        } else if (k === 'you' || k === 'prog') pend.push(row);
      } else {
        const row: DrillRow = { title: r.label, meta: 'Prepared by SBC', href: docsHref };
        if (r.uploaded) gen.push(row);
        else if (k !== 'done' && s.phaseNo <= curPhase && released) spend.push(row);
      }
    }
  }
  for (const r of d.extras?.fileRequests ?? []) {
    const key = `${r.stepId}:${r.fieldId}`;
    const row: DrillRow = { title: r.label, meta: `From ${d.short}`, href: docsHref };
    if (!r.fulfilledAt) {
      if (!seen.has(key) || !pend.some((x) => x.title === r.label)) pend.push(row);
    } else if (!seen.has(key)) {
      const step = d.model.byId[r.stepId];
      (step && kd(step) === 'done' ? sub : review).push(row);
    }
  }
  const br = d.extras?.boardResolution;
  if (br?.status === 'finalized' && br.hasDocx) gen.push({ title: 'Board resolution', meta: 'Prepared by SBC', href: clientBoardResolutionPath() });
  if (br?.signedUploadedAt) signed.push({ title: 'Board resolution (signed)', meta: `From ${d.short}`, href: clientBoardResolutionPath() });
  return {
    you: [
      ['Submitted', sub.length, 'ok', sub],
      ['Under review', review.length, 'prog', review],
      ['Pending', pend.length, 'warn', pend],
      ['Sent back', back.length, 'bad', back],
    ],
    sbc: [
      ['Generated', gen.length, 'prog', gen],
      ['Pending', spend.length, 'idle', spend],
      [`Signed by ${d.short}`, signed.length, 'ok', signed],
    ],
  };
}

function segData(d: IncData) {
  const left = d.model.steps.filter((x) => kd(x) !== 'done');
  const coi = d.coiExpected;
  const rows = (l: PortalStep[]) => l.map((x) => stRow(x, coi));
  const you = left.filter((x) => ownKey(x) === 'You');
  const sbc = left.filter((x) => ownKey(x) === 'SBC');
  const mca = left.filter((x) => ownKey(x) === 'MCA');
  const act = d.model.steps.filter((x) => ['you', 'prog', 'with'].includes(kd(x)));
  const over = act.filter((x) => x.late);
  const risk = act.filter((x) => !x.late && kd(x) === 'you');
  const ok = act.filter((x) => !x.late && kd(x) !== 'you');
  const docs = docSegs(d);
  return {
    you: docs.you,
    sbc: docs.sbc,
    who: [
      [d.short, you.length, 'warn', rows(you)],
      ['SBC', sbc.length, 'prog', rows(sbc)],
      ['MCA', mca.length, 'violet', rows(mca)],
    ] as Seg[],
    plan: [
      ['On time', ok.length, 'ok', rows(ok)],
      ['At risk', risk.length, 'warn', rows(risk)],
      ['Overdue', over.length, 'bad', rows(over)],
    ] as Seg[],
  };
}

/** R-25 (C2): one card, one stacked bar per question, in status colours. Replaces the four donut cards. */
function SplitCard({ rows }: { rows: Array<{ title: string; unit: string; segs: Seg[]; open: (i?: number) => void }> }) {
  return (
    <SCard title="Incorporation status" bodyClassName="grid gap-5 sm:grid-cols-2 sm:gap-x-8">
      {rows.map((r) => {
        const total = r.segs.reduce((a, s) => a + s[1], 0);
        return (
          <div key={r.title} className="grid min-w-0 gap-2">
            <button type="button" onClick={() => r.open()} className="flex items-baseline gap-2 text-left hover:underline" aria-label={`${r.title} · ${total} ${r.unit}`}>
              <span className="min-w-0 truncate text-[13px] font-medium text-ink-2">{r.title}</span>
              <b className="ml-auto text-[14px] font-medium text-ink">{total}</b>
            </button>
            <span className="flex h-2 w-full gap-0.5 overflow-hidden rounded-bar" aria-hidden>
              {r.segs
                .filter((s) => s[1] > 0)
                .map((s) => (
                  <i key={s[0]} className={cn('block h-full rounded-[2px]', BAR_FILL[s[2]])} style={{ width: `${(s[1] / (total || 1)) * 100}%` }} />
                ))}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {r.segs.map((s, i) => (
                <button key={s[0]} type="button" onClick={() => r.open(i)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink" aria-label={`${r.title} · ${s[0]} · ${s[1]}`}>
                  <i className={cn('h-2 w-2 flex-none rounded-[2px]', BAR_FILL[s[2]])} aria-hidden />
                  {s[0]}
                  <b className="font-medium text-ink">{s[1]}</b>
                </button>
              ))}
            </span>
          </div>
        );
      })}
    </SCard>
  );
}

/* ---------------- dates ---------------- */

function weekRange(today: string): string {
  const d = pd(today);
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = addD(today, -dow);
  const sun = addD(mon, 6);
  const a = pd(mon);
  const b = pd(sun);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()} to ${fmt(sun)}` : `${fmt(mon)} to ${fmt(sun)}`;
}

/** True below the md breakpoint: the timeline axis shows every second week. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)');
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/* ---------------- timeline (R-21) ---------------- */

interface Axis {
  ax0: string;
  ax1: string;
}

function PhaseLineRow({
  p,
  plan,
  pos,
  todayX,
  open,
  onToggle,
  onBar,
}: {
  p: PortalPhase;
  plan: [string, string] | null;
  pos: (s: string) => number;
  todayX: number | null;
  open: boolean;
  onToggle: () => void;
  onBar: () => void;
}) {
  const i = p.no - 1;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const doneEnd = phDoneEnd(p);
  const status = p.state === 'done' ? 'done' : p.state === 'up' ? 'next' : 'now';
  const a = plan ? pos(plan[0]) : 0;
  const planEnd = plan ? pos(plan[1]) : 0;
  const late = p.state === 'done' && plan && doneEnd && doneEnd > plan[1];
  const b = late ? pos(doneEnd!) : planEnd;
  const lateDays = late ? days(plan![1], doneEnd!) : 0;
  const earlyDays = p.state === 'done' && plan && doneEnd && doneEnd < plan[1] ? days(doneEnd, plan[1]) : 0;
  const labelLeft = plan ? b > 75 : false;
  const tip = `${PHL[i]} · ${p.done} of ${p.total} done${plan ? ` · ${fmt(plan[0])} → ${fmt(plan[1])}` : ''}`;
  return (
    <div className="grid h-row grid-cols-[200px_minmax(0,1fr)] items-center px-4 hover:bg-surface-sunken md:grid-cols-[230px_minmax(0,1fr)] md:px-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`phb-${p.no}`}
        aria-label={`${open ? 'Hide' : 'Show'} the steps of ${PHL[i]} · ${p.done} of ${p.total} steps`}
        className="flex h-full min-w-0 items-center gap-2 text-left text-[14px] font-medium text-ink"
      >
        <Chevron open={open} />
        <StepMark state={status} size={20} label={p.state === 'done' ? 'done' : p.state === 'up' ? 'planned' : 'current'} />
        <span className="min-w-0 truncate">{PHL[i]}</span>
      </button>
      <div className="relative h-full">
        {plan ? (
          <button
            type="button"
            onClick={onBar}
            aria-label={tip}
            data-tt={tip}
            data-notip=""
            className="absolute top-1/2 flex h-[14px] -translate-y-1/2 overflow-hidden rounded-bar"
            style={{ left: `${a}%`, width: `${Math.max(b - a, 1.5)}%` }}
          >
            {p.state === 'done' ? (
              <>
                <i className="h-full bg-positive-mid" style={{ width: `${b > a ? ((planEnd - a) / (b - a)) * 100 : 100}%` }} />
                {lateDays > 0 ? <i className="h-full flex-1 bg-danger-mid" aria-label={`${lateDays} days late`} /> : null}
              </>
            ) : p.state === 'active' ? (
              <>
                <i className="h-full bg-brand" style={{ width: `${Math.max(pct, 4)}%` }} />
                <i className="hatch h-full flex-1" />
              </>
            ) : (
              <i className="h-full w-full rounded-bar bg-surface-sunken shadow-[inset_0_0_0_1px_oklch(var(--line))]" />
            )}
          </button>
        ) : null}
        {plan && p.no === 2 ? (
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-highlight-bright" style={{ left: `${b}%` }} aria-label={`COI ${fmt(plan[1])}`} />
        ) : null}
        <span
          className="absolute top-1/2 flex -translate-y-1/2 items-baseline gap-1.5 whitespace-nowrap text-[12.5px] text-ink-muted"
          style={!plan ? { left: 0 } : labelLeft ? { right: `calc(${100 - a}% + 12px)` } : { left: `calc(${b}% + 14px)` }}
        >
          <b className="text-[14px] font-medium text-ink">{pct}%</b>
          <span>
            {p.done} / {p.total} steps
          </span>
          {lateDays > 0 ? <span className="font-medium text-danger">{lateDays} days late</span> : null}
          {earlyDays > 0 ? <span className="font-medium text-positive">{earlyDays} days early</span> : null}
        </span>
        {todayX != null ? <span className="absolute inset-y-0 border-l-[1.5px] border-highlight-bright" style={{ left: `${todayX}%` }} aria-hidden /> : null}
      </div>
    </div>
  );
}

export default function IncorporationLanding() {
  const full = useIncData();
  // D1: the page shows phases 1 to 3 only; registrations keep their own page.
  const incModel = useMemo(() => withoutRegistration(full.model), [full.model]);
  const d: IncData = { ...full, model: incModel };
  const portal = usePortal();
  const { after, go, toast, drill, openChat } = portal;
  const goTo = useGo();
  const viewer = useDocViewer();
  const { model, short, today } = d;
  const [openPh, setOpenPh] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const narrow = useNarrow();
  const pendingTl = useHomeQuery(portal.shell?.engagementId).data?.timeline?.pending;

  /* ---------- head ---------- */
  const showAfter = after && Boolean(d.coiDate);
  const coiEnd = d.coiExpected;
  const daysLeft = coiEnd ? Math.max(0, days(today, coiEnd)) : null;
  const you = model.steps.find((x) => kd(x) === 'you') ?? model.steps.find((x) => x.owner === 'client' && x.late && kd(x) !== 'done');
  const all = model.all;

  const drillAll = useCallback(() => {
    const tabs = tabsFor(model.steps, d.coiExpected);
    drill({ title: `All ${all.total} steps`, sub: `${all.done} done · ${all.total - all.done} to go`, tabs, active: idx(tabs, after ? 'with' : 'you') });
  }, [model.steps, all, after, drill, d.coiExpected]);

  const drillPhase = useCallback(
    (p: PortalPhase) => {
      const tabs = tabsFor(p.steps, d.coiExpected);
      const c = (k: string) => p.steps.some((x) => kd(x) === k);
      const act = c('you') ? 'you' : c('with') ? 'with' : c('prog') ? 'prog' : p.done === p.total ? 'done' : 'up';
      drill({
        title: PHL[p.no - 1]!,
        sub: `${p.done} of ${p.total} steps done`,
        tabs,
        active: idx(tabs, act),
        link: { lead: 'Every step of this phase', text: 'Open the phase page →', href: phaseHref(p.no), where: 'the phase page' },
      });
    },
    [drill, d.coiExpected],
  );

  const openCert = () => {
    if (!d.certificate) return;
    const c = d.certificate;
    viewer.open([{ id: `cert:${c.storagePath}`, name: c.name, url: () => signedUrlFor(c.storagePath), meta: 'Certificate of Incorporation' }], 0);
  };

  // The head says what the client asks first: the days to the COI, or the day it came.
  const headTitle = showAfter ? `Incorporated ${fmt(d.coiDate)}` : coiEnd ? `${daysLeft} days to COI` : 'Incorporation';

  const headMeta = showAfter ? (
    <>
      {d.identifiers.cin ? <span className="font-mono text-[13px] text-ink-2">{d.identifiers.cin}</span> : <span>{d.companyName}</span>}
      {d.identifiers.cin || d.identifiers.pan || d.identifiers.tan ? (
        <>
          <Dot />
          <span>{issuedLine(d.identifiers)} issued</span>
        </>
      ) : null}
      <Dot />
      <button type="button" onClick={drillAll} className="text-brand-text hover:underline">
        {all.done} / {all.total} steps · {all.pct}%
      </button>
    </>
  ) : (
    <>
      <span>{d.companyName}</span>
      {coiEnd ? (
        <>
          <Dot />
          <span>
            expected {wd(coiEnd)} {fmt(coiEnd)}
          </span>
        </>
      ) : null}
      <Dot />
      <button type="button" onClick={drillAll} className="text-brand-text hover:underline">
        {all.done} / {all.total} steps · {all.pct}%
      </button>
    </>
  );

  const headActions = (
    <>
      <BoardResolutionLink br={d.extras?.boardResolution ?? null} />
      {showAfter ? (
        <>
          {d.certificate ? (
            <Button variant="secondary" onClick={openCert}>
              Open certificate
            </Button>
          ) : null}
        </>
      ) : you ? (
        <a
          href={stepHrefOf(you)}
          onClick={goTo(stepHrefOf(you))}
          aria-label={`At risk · step ${you.n} · ${you.title}`}
          data-tt={`Step ${you.n} ${kd(you) === 'you' ? 'is waiting on' : 'is late for'} ${short}${you.due ? ` · due ${fmt(you.due)}` : ''}`}
          data-notip=""
        >
          <Chip tone="warn">At risk · step {you.n}</Chip>
        </a>
      ) : null}
    </>
  );

  /* ---------- This week ---------- */
  const week = useMemo(() => {
    type WRow = { o: 'You' | 'SBC' | 'MCA'; t: string; dt: string; step: PortalStep };
    const rows: WRow[] = [];
    const used = new Set<string>();
    const soon = addD(today, 3);
    for (const r of d.extras?.fileRequests ?? []) {
      if (r.fulfilledAt) continue;
      const step = model.byId[r.stepId];
      if (!step) continue;
      rows.push({
        o: 'You',
        t: `Upload ${r.label.replace(/\s*\([^)]*\)/g, '')}${r.requestedByName ? ` · requested by ${firstName(r.requestedByName)}` : ''}`,
        dt: r.dueDate ? fmt(r.dueDate) : step.due ? fmt(step.due) : 'Now',
        step,
      });
    }
    for (const s of model.steps) {
      if (isAwaitingClientApproval(s.slice)) {
        rows.push({ o: 'You', t: `Check and approve step ${s.n}`, dt: s.due ? fmt(s.due) : 'Now', step: s });
        used.add(s.id);
      }
    }
    const rest = model.steps
      .filter((x) => !used.has(x.id) && ['you', 'prog', 'with'].includes(kd(x)))
      .sort((a, b) => ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1));
    for (const s of rest) {
      const o = ownKey(s);
      rows.push({ o, t: s.title, dt: o === 'You' ? (s.due ? fmt(s.due) : '-') : !s.due || s.due <= soon ? 'Now' : fmt(s.due), step: s });
    }
    return { rows: rows.slice(0, 4), range: weekRange(today) };
  }, [d.extras?.fileRequests, model, today]);

  const weekCard = (
    <SCard title="This week" meta={week.range} flush>
      {week.rows.length === 0 ? (
        <Empty />
      ) : (
        <ul>
          {week.rows.map((r, i) => (
            <li key={`${r.step.id}-${i}`}>
              <a
                href={stepHrefOf(r.step)}
                onClick={goTo(stepHrefOf(r.step))}
                aria-label={`${r.t} · ${r.o === 'You' ? short : r.o} · ${r.dt}`}
                className="flex items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0 hover:bg-surface-sunken md:px-5"
              >
                <span className={cn('w-[84px] flex-none text-[12.5px]', r.dt === 'Now' ? 'font-medium text-brand-text' : 'font-normal text-ink-muted')}>{r.dt}</span>
                <OwnerChip owner={r.o === 'You' ? 'client' : r.o === 'MCA' ? 'mca' : 'sbc'} label={r.o === 'You' ? short : undefined} />
                <span className="min-w-0 flex-1 truncate pl-3 text-[13.5px] font-normal text-ink">{r.t}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </SCard>
  );

  /* ---------- status split (four bars) ---------- */
  const segs = useMemo(() => segData(d), [d]);
  const SEG_T = { you: `Documents from ${short}`, sbc: 'Documents SBC prepares', who: 'Who is working on what', plan: 'On plan or overdue' } as const;
  const drillSeg = (key: keyof typeof SEG_T, i?: number) => {
    const s = segs[key];
    const docs = key === 'you' || key === 'sbc';
    const at = i ?? Math.max(0, s.findIndex((q) => q[3].length));
    const cfg: DrillConfig = {
      title: SEG_T[key],
      sub: `${s.reduce((t, q) => t + q[1], 0)}${docs ? ' documents' : ' steps'}`,
      // Only non-empty segment tabs (spec LS-05); the clicked one always stays.
      tabs: s
        .map((q, j) => ({ label: q[0], color: TONE_VAR[q[2]], rows: q[3], j }))
        .filter((t) => t.rows.length || t.j === at)
        .map(({ j: _j, ...t }) => t),
      active: s.slice(0, at).filter((q) => q[3].length).length,
    };
    if (docs) cfg.link = { lead: 'Every document, with versions', text: 'Open Documents →', href: portalHref('documents'), where: 'Documents' };
    drill(cfg);
  };
  const split = (Object.keys(SEG_T) as Array<keyof typeof SEG_T>).map((k) => ({
    title: SEG_T[k],
    unit: k === 'you' || k === 'sbc' ? 'documents' : 'steps',
    segs: segs[k],
    open: (i?: number) => drillSeg(k, i),
  }));

  /* ---------- timeline ---------- */
  const coiForPlan = d.coiDate ?? d.coiExpected;
  const plans = useMemo(() => {
    const ps = model.phases.map((p) => phPlan(p, coiForPlan));
    // Part B starts where Part A's plan ends (prototype PLAN[2]).
    const a = ps[0];
    const b = ps[1];
    if (a && b && b[0] < a[1] && a[1] < b[1]) ps[1] = [a[1], b[1]];
    return ps;
  }, [model.phases, coiForPlan]);
  const axis: Axis | null = useMemo(() => {
    const ds = plans.flatMap((p) => (p ? [p[0], p[1]] : []));
    for (const p of model.phases) {
      const e = phDoneEnd(p);
      if (e && p.state === 'done') ds.push(e);
    }
    if (!ds.length) return null;
    ds.push(today);
    ds.sort();
    return { ax0: addD(ds[0]!, -7), ax1: addD(ds.at(-1)!, 7) };
  }, [plans, model.phases, today]);
  const pos = (s: string) => (axis ? Math.max(0, Math.min(1, days(axis.ax0, s) / days(axis.ax0, axis.ax1))) * 100 : 0);
  const todayX = axis ? pos(today) : null;
  const ticks = useMemo(() => {
    if (!axis) return [];
    const out: string[] = [];
    for (let x = addD(axis.ax0, 7); x <= addD(axis.ax1, -2); x = addD(x, narrow ? 14 : 7)) out.push(x);
    return out;
  }, [axis, narrow]);
  const rangeLabel = useMemo(() => {
    if (!axis) return '';
    const a = pd(addD(axis.ax0, 7));
    const b = pd(addD(axis.ax1, -7));
    const M = (x: Date) => sep(x.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
    return a.getUTCFullYear() === b.getUTCFullYear() ? `${M(a)} to ${M(b)} ${b.getUTCFullYear()}` : `${M(a)} ${a.getUTCFullYear()} to ${M(b)} ${b.getUTCFullYear()}`;
  }, [axis]);

  const timelineCard = (
    <SCard
      title="Timeline"
      meta={`${all.done} of ${all.total} steps${rangeLabel ? ` · ${rangeLabel}` : ''}`}
      flush
      right={
        // C-146 to C-148: the pending request pill and "Edit" before the COI; "Incorporated" after it.
        showAfter ? (
          <Chip tone="ok">Incorporated</Chip>
        ) : (
          <>
            {pendingTl ? <PendingRequestChip pending={pendingTl} manager={d.managerName ?? 'your project manager'} /> : null}
            <Button size="sm" variant="outline" aria-label="Edit the timeline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </>
        )
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid h-[34px] grid-cols-[200px_minmax(0,1fr)] items-end px-4 pb-1.5 text-[11.5px] text-ink-faint md:grid-cols-[230px_minmax(0,1fr)] md:px-5" aria-hidden>
            <span />
            <div className="relative h-full">
              {ticks.map((t) => (
                <span key={t} className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(t)}%` }}>
                  {fmt(t)}
                </span>
              ))}
            </div>
          </div>
          {model.phases.map((p, i) => (
            <div key={p.id} className="border-t border-line-soft">
              <PhaseLineRow
                p={p}
                plan={plans[i] ?? null}
                pos={pos}
                todayX={todayX}
                open={openPh === p.no}
                onToggle={() => setOpenPh(openPh === p.no ? null : p.no)}
                onBar={() => drillPhase(p)}
              />
              <div id={`phb-${p.no}`} role="region" aria-label={`${PHL[i]} steps`}>
                {openPh === p.no ? (
                  <div className="border-t border-line-soft bg-surface-sunken/40">
                    <StepTable
                      phase={p}
                      variant="landing"
                      short={short}
                      coi={d.coiExpected}
                      ownershipType={d.ownershipType}
                      openViewer={viewer.open as (docs: ViewerDoc[], i?: number) => void}
                    />
                    <div className="flex justify-end gap-3 border-t border-line-soft px-4 py-2 md:px-5">
                      <Button variant="link" size="sm" onClick={() => drillPhase(p)}>
                        Open list
                      </Button>
                      <Button variant="link" size="sm" onClick={() => go(phaseHref(p.no))} aria-label={`Open the ${PHL[i]} page`}>
                        Open phase {p.no}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {todayX != null ? (
            <div className="grid h-[26px] grid-cols-[200px_minmax(0,1fr)] px-4 md:grid-cols-[230px_minmax(0,1fr)] md:px-5">
              <span />
              <div className="relative h-full">
                <span className="absolute inset-y-0 border-l-[1.5px] border-highlight-bright" style={{ left: `${todayX}%` }} aria-hidden />
                <button
                  type="button"
                  className="absolute bottom-1 -translate-x-1/2 rounded-sm bg-highlight-bright px-1.5 py-px text-[11px] font-medium text-white"
                  style={{ left: `${todayX}%` }}
                  aria-label={`Today · ${wd(today)} ${fmt(today)}`}
                  onClick={() => toast(`Today · ${wd(today)} ${fmtY(today)}`)}
                >
                  Today
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SCard>
  );

  const cur = currentPhaseNo(model);

  return (
    <IncFrame pending={d.pending} title="Incorporation · VCFO Suite">
      <div className="wrap">
        <Island className="grid grid-cols-1 gap-5">
          {d.pending ? (
            <>
              <span className="block h-14 w-1/2 animate-pulse rounded-md bg-surface-sunken" aria-hidden />
              <Row>
                <SkeletonRows rows={6} />
                <SkeletonRows rows={6} />
              </Row>
              <SkeletonRows rows={5} />
            </>
          ) : d.noEngagement ? (
            <Empty
              action={
                <Button variant="secondary" onClick={() => openChat('When does my incorporation start?')}>
                  Ask VCFO
                </Button>
              }
            >
              No incorporation project on your account yet
            </Empty>
          ) : (
            <>
              <PageHead label="Certificate of Incorporation" title={headTitle} meta={headMeta} actions={headActions} />
              <Row>
                <St5Card
                  model={model}
                  company={short}
                  lead={d.leadName}
                  link={{ label: `Open phase ${cur}`, onClick: () => go(phaseHref(cur)) }}
                  onPhase={(no) => go(phaseHref(no))}
                />
                <Col>
                  {weekCard}
                  <SplitCard rows={split} />
                </Col>
              </Row>
              {timelineCard}
            </>
          )}
        </Island>
      </div>
      {editOpen ? <TimelineEdit onClose={() => setEditOpen(false)} /> : null}
      {viewer.node}
    </IncFrame>
  );
}

function issuedLine(ids: { cin?: string; pan?: string; tan?: string }): string {
  const l = [ids.cin ? 'CIN' : '', ids.pan ? 'PAN' : '', ids.tan ? 'TAN' : ''].filter(Boolean);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0] ?? '';
}
