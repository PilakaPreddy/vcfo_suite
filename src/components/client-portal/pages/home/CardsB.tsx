'use client';

/**
 * Home cards (VCFO Spectrum, prototype src/screens/client/inc-timeline.tsx and home-parts.tsx):
 * Timeline as a Gantt (R-21), and the after-COI cards What is next, Compliance status (one
 * stacked bar, R-25), Company IDs, Compliance by area and Registrations (T1 tables, area pills,
 * R-07 and R-43) and Post-incorporation setup.
 */
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Eye, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AreaPill, Chip, OwnerChip, type ChipTone } from '@/components/ui/spectrum-chip';
import { regOf, type Regulator } from '@/lib/ui/regulator';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { StepMark } from '@/components/ui/step-track';
import { phaseHref, portalHref, stepHref } from '@/components/client-portal/routes';
import type { DrillConfig } from '@/components/client-portal/PortalProvider';
import type { HomeFiling } from '@/lib/client/client-home';
import type { PortalStep } from '@/lib/client-portal/step-model';
import { RevealCountdown, useRevealedIdentifier } from '@/components/client-portal/pages/credentials/IdsRevealDialog';
import { Bar, DateTile, Empty, HeadLink, ListRow, SCard, StackedBar, stepChip, type BarTone } from '../incorporation/spectrum';
import { exactDate } from '@/lib/relative-due';
import { copyText, DueWords } from './ui';
import { PendingRequestChip } from './PendingRequest';
import type { HomeData } from './useHome';
import {
  AREA_NAME,
  AREA_ORDER,
  BUCKET_LABEL,
  BUCKETS,
  bucketOf,
  dLong,
  dShort,
  days,
  filingName,
  filingPortal,
  filingRow,
  groupOf,
  postIncDrill,
  REG_CATS,
  timelineAxis,
  timelineDrill,
  type FilingBucket,
  type RegRow,
  type TlPhase,
} from './derive';

function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

const BUCKET_BAR: Record<FilingBucket, BarTone> = { filed: 'ok', dueSoon: 'warn', overdue: 'bad', upcoming: 'idle' };

/* --------------------------------------------------------------- timeline */

type BarKind = 'done' | 'cur' | 'rest' | 'plan';
const BAR_CLS: Record<BarKind, string> = {
  done: 'bg-positive-mid',
  cur: 'bg-brand',
  rest: 'hatch',
  plan: 'bg-surface-sunken shadow-[inset_0_0_0_1px_oklch(var(--line))]',
};

/** Plain chevron (R-24). */
function Chevron({ open }: { open: boolean }) {
  return <ChevronRight size={16} strokeWidth={1.6} className={cn('flex-none text-ink-muted transition-transform', open && 'rotate-90')} aria-hidden />;
}

/** Steps of one timeline row, shown when the row expands. */
function RowSteps({ h, steps, onAll, phase }: { h: HomeData; steps: PortalStep[]; onAll: () => void; phase?: number }) {
  return (
    <div>
      <ul>
        {steps.map((s) => {
          const chip = stepChip(s);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => h.portal.go(stepHref(s.id))}
                className="flex w-full items-center gap-3 border-t border-line-soft px-4 py-2.5 text-left text-[13px] first:border-t-0 hover:bg-surface-raised md:px-5 md:pl-12"
              >
                <span className="w-14 flex-none font-mono text-[12px] text-ink-muted">Step {s.n}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.title}</span>
                <span className="hidden text-[12.5px] text-ink-muted sm:inline">{s.kind === 'done' ? dShort(s.doneOn) : s.due ? dShort(s.due) : ''}</span>
                <Chip tone={chip.tone} fixed>
                  {chip.label}
                </Chip>
                <ChevronRight size={16} strokeWidth={1.6} className="flex-none text-ink-faint" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-3 border-t border-line-soft px-4 py-2 md:px-5">
        <Button variant="link" size="sm" onClick={onAll}>
          Open list
        </Button>
        {phase ? (
          <Button variant="link" size="sm" onClick={() => h.portal.go(phaseHref(phase))}>
            Open phase {phase}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * R-21: Gantt with 46px rows, 14px bars with 3px corners, the orange today line and the
 * orange COI diamond. In the current phase the part before today is solid, the rest hatched.
 * Each row expands to its steps; Edit opens the timeline editor (a change request).
 */
export function TimelineCard({ h, phases, onEdit, className }: { h: HomeData; phases: TlPhase[] | null; onEdit: () => void; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const t = h.home?.timeline;
  const pending = t?.pending;
  const manager = h.manager ?? 'your project manager';
  const changed = t?.lastChangedAt ? `Changed ${t.lastChangedAt.slice(0, 10) === h.today ? 'today' : dShort(t.lastChangedAt)}${t.lastChangedBy ? ` · ${t.lastChangedBy}` : ''}` : undefined;
  // C-050: the pending request pill and an outline "Edit"; after the COI the "Incorporated" chip replaces them.
  const right = h.after ? (
    <Chip tone="ok">Incorporated</Chip>
  ) : (
    <>
      {pending ? <PendingRequestChip pending={pending} manager={manager} /> : null}
      {phases ? (
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
    </>
  );
  if (!phases) {
    return (
      <SCard title="Timeline" flush className={className} right={right}>
        <Empty>Dates not planned yet</Empty>
      </SCard>
    );
  }
  const axis = timelineAxis(phases, h.today);
  const x = (iso: string) => Math.min(100, Math.max(0, (days(axis.t0, iso) / axis.span) * 100));
  const todayX = x(h.today);
  const firstOpen = phases.findIndex((p) => !p.done);
  const p1 = h.model.phases[0]?.steps ?? [];
  const p2 = (h.model.phases[1]?.steps ?? []).filter((s) => s.id !== 'pre-11' && s.id !== 'pre-12');
  const one = (id: string) => (h.model.byId[id] ? [h.model.byId[id]!] : []);
  const stepsOf: Record<TlPhase['id'], [PortalStep[], number, number | undefined]> = {
    p1: [p1, 0, 1],
    p2: [p2, 1, 2],
    mca: [one('pre-11'), 2, undefined],
    coi: [one('pre-12'), 3, undefined],
  };
  const cols = 'grid-cols-[200px_minmax(0,1fr)_72px] md:grid-cols-[280px_minmax(0,1fr)_100px]';
  return (
    <SCard title="Timeline" meta={h.after ? undefined : changed} flush className={className} right={right}>
      <div className="overflow-x-auto">
        <div className="min-w-[680px] md:min-w-[560px]">
          <div className={cn('grid h-[46px] items-end px-4 pb-1.5 text-[11.5px] text-ink-faint md:px-5', cols)}>
            <span />
            <div className="relative h-full">
              {axis.ticks.map((k, i) => (
                <span key={k.iso} className={cn('absolute bottom-0 -translate-x-1/2 whitespace-nowrap', i % 2 === 1 && 'max-md:invisible')} style={{ left: `${k.pct}%` }}>
                  {dShort(k.iso)}
                </span>
              ))}
              <span className="absolute -bottom-1.5 h-[22px] border-l-[1.5px] border-highlight-bright" style={{ left: `${todayX}%` }}>
                <span className="absolute -left-6 -top-[22px] whitespace-nowrap rounded-sm bg-highlight-bright px-1.5 py-px text-[10.5px] font-medium text-white">Today</span>
              </span>
            </div>
            <span />
          </div>
          {phases.map((p, i) => {
            const status: 'done' | 'current' | 'planned' = h.after || p.done ? 'done' : i === firstOpen ? 'current' : 'planned';
            const bars: { from: string; to: string; kind: BarKind }[] = p.milestone
              ? []
              : status === 'done'
                ? [{ from: p.from, to: p.to, kind: 'done' }]
                : status === 'current'
                  ? h.today > p.from && h.today < p.to
                    ? [
                        { from: p.from, to: h.today, kind: 'cur' },
                        { from: h.today, to: p.to, kind: 'rest' },
                      ]
                    : [{ from: p.from, to: p.to, kind: 'cur' }]
                  : [{ from: p.from, to: p.to, kind: 'plan' }];
            const note =
              p.id === 'p1' ? (p.done ? `Done ${dShort(p.to)}` : '') : p.id === 'p2' ? (p.done ? `Filed ${dShort(p.to)}` : `${p.pct ?? 0}%`) : p.id === 'coi' ? dShort(p.from) : '';
            const [steps, tab, phaseNo] = stepsOf[p.id];
            const isOpen = open === p.id;
            return (
              <div key={p.id} className="border-t border-line-soft">
                <div
                  className={cn('grid h-row cursor-pointer items-center px-4 hover:bg-surface-sunken md:px-5', cols)}
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpen(isOpen ? null : p.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  aria-label={`${p.name} · ${status === 'done' ? 'done' : status === 'current' ? 'in progress' : 'planned'}`}
                >
                  <div className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-ink">
                    <Chevron open={isOpen} />
                    <StepMark state={status === 'done' ? 'done' : status === 'current' ? 'now' : 'next'} size={20} label={status} />
                    <span className="min-w-0 truncate">{p.name}</span>
                  </div>
                  <div className="relative h-full">
                    {bars.map((b, bi) => (
                      <span
                        key={bi}
                        className={cn('absolute top-1/2 h-[14px] -translate-y-1/2 rounded-bar', BAR_CLS[b.kind])}
                        style={{ left: `${x(b.from)}%`, width: `max(4px, ${x(b.to) - x(b.from)}%)` }}
                      />
                    ))}
                    {p.milestone ? (
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-highlight-bright"
                        style={{ left: `${x(p.from)}%` }}
                        aria-label={`COI ${dShort(p.from)}`}
                      />
                    ) : null}
                    <span className="absolute inset-y-0 border-l-[1.5px] border-highlight-bright" style={{ left: `${todayX}%` }} aria-hidden />
                  </div>
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[12.5px] text-ink-muted">{note}</div>
                </div>
                {isOpen ? (
                  <div className="border-t border-line-soft bg-surface-sunken">
                    <RowSteps h={h} steps={steps} phase={phaseNo} onAll={() => h.portal.drill(timelineDrill(h.model, tab))} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </SCard>
  );
}

/* ---------------------------------------------------------- what is next */

function nextDrill(h: HomeData): DrillConfig {
  const open = h.filings.filter((f) => bucketOf(f, h.today) !== 'filed');
  const over = open.filter((f) => bucketOf(f, h.today) === 'overdue');
  const n15 = open.filter((f) => f.dueDate >= h.today && days(h.today, f.dueDate) <= 15);
  const n30 = open.filter((f) => days(h.today, f.dueDate) > 15 && days(h.today, f.dueDate) <= 30);
  const r = (f: HomeFiling) => ({ ...filingRow(f, h.today), href: portalHref('compliances') });
  return {
    title: 'What is next',
    tabs: [
      { label: 'All', rows: [...over, ...n15, ...n30].map(r) },
      { label: 'Overdue', rows: over.map(r) },
      { label: 'Next 15 days', rows: n15.map(r) },
      { label: '16–30 days', rows: n30.map(r) },
    ],
    link: { lead: 'These items live in Compliances', text: 'Open Compliances →', href: portalHref('compliances'), where: 'Compliances' },
  };
}

export function NextCard({ h, className }: { h: HomeData; className?: string }) {
  const [tab, setTab] = useState('15');
  const open = h.filings.filter((f) => bucketOf(f, h.today) !== 'filed');
  const lead = open.find((f) => bucketOf(f, h.today) === 'overdue');
  const upcoming = open.filter((f) => f !== lead && f.dueDate >= h.today);
  const win = tab === '15' ? 15 : 30;
  const rows = upcoming.filter((f) => days(h.today, f.dueDate) <= win);
  const c15 = upcoming.filter((f) => days(h.today, f.dueDate) <= 15).length + (lead ? 1 : 0);
  const c30 = upcoming.filter((f) => days(h.today, f.dueDate) <= 30).length + (lead ? 1 : 0);
  const drill = (active: number) => h.portal.drill({ ...nextDrill(h), active });
  const ownerWord = (f: HomeFiling) => (f.owner === 'client' ? `Waiting on ${h.company}` : f.owner === 'firm' ? 'With SBC' : '');
  return (
    <SCard
      title="What is next"
      flush
      className={className}
      right={
        <SpectrumTabs
          label="What is next window"
          items={[
            { key: '15', label: '15 days', count: c15 },
            { key: '30', label: '30 days', count: c30 },
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {!lead && rows.length === 0 ? <Empty /> : null}
      {lead ? (
        <ListRow className="bg-surface-sunken">
          <span title={exactDate(lead.dueDate)} className="flex-none">
            <DateTile iso={lead.dueDate} tint="bad" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{filingName(lead)}</span>
            <span className="block truncate text-[12.5px] text-ink-muted">
              {/* E-11: relative due words first, the exact date in the tooltip. */}
              <DueWords iso={lead.dueDate} today={h.today} />
              {ownerWord(lead) ? ` · ${ownerWord(lead)}` : ''}
              {lead.needTitle ? ` · ${lead.needTitle}${lead.needAskedBy ? ` · asked by ${lead.needAskedBy}` : ''}` : ''}
            </span>
          </span>
          <Button size="sm" onClick={() => h.portal.go('compliances')}>
            {lead.owner === 'client' ? 'Fill details' : 'Open'}
          </Button>
        </ListRow>
      ) : null}
      {rows.map((f) => {
        const n = days(h.today, f.dueDate);
        const tint = n <= 7 ? 'warn' : 'prog';
        const portal = filingPortal(f);
        return (
          <ListRow key={f.id}>
            <button type="button" onClick={() => drill(n <= 15 ? 2 : 3)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${f.title} · open the list`}>
              <span title={exactDate(f.dueDate)} className="flex-none">
                <DateTile iso={f.dueDate} tint={tint} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{filingName(f)}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">
                  <DueWords iso={f.dueDate} today={h.today} /> · {AREA_NAME[groupOf(f)]}
                  {f.windowTo ? ` · SBC prepares by ${dShort(f.windowTo)}` : ''}
                </span>
              </span>
            </button>
            <Chip tone={tint === 'warn' ? 'warn' : 'prog'} fixed className="hidden sm:inline-flex">
              {n === 0 ? 'Today' : `In ${plural(n, 'day')}`}
            </Chip>
            {portal ? (
              <a
                href={portal[0]}
                target="_blank"
                rel="noreferrer"
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md !text-ink-muted hover:bg-surface-sunken hover:!text-ink"
                aria-label={`Open the ${portal[1]}`}
              >
                <ExternalLink size={15} strokeWidth={1.6} aria-hidden />
              </a>
            ) : null}
          </ListRow>
        );
      })}
    </SCard>
  );
}

/* -------------------------------------------------------- compliance status */

/** R-25: the total and one stacked bar with a legend. Each part opens its list. */
export function CompCard({ h, onOpen, className }: { h: HomeData; onOpen: (tab: number) => void; className?: string }) {
  const total = h.filings.length;
  const segs = BUCKETS.map((k) => ({ label: BUCKET_LABEL[k], value: h.buckets[k], tone: BUCKET_BAR[k] }));
  const pct = (n: number) => `${n} (${total ? Math.round((n / total) * 100) : 0}%)`;
  return (
    <SCard
      title="Compliance status"
      meta={h.home?.filings.fyLabel}
      className={className}
      right={
        <Button size="sm" variant="ghost" onClick={() => onOpen(0)}>
          List
        </Button>
      }
    >
      <div className="grid gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-ink-muted">This FY</span>
          <span className="ml-auto text-[26px] font-medium leading-none text-ink">{total}</span>
        </div>
        <StackedBar segments={segs} format={pct} onSegment={(i) => onOpen(i + 1)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {segs.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onOpen(i + 1)}
            className="inline-flex h-7 items-center rounded-md border-1.5 border-line-strong px-2.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-sunken"
          >
            {s.label}
          </button>
        ))}
      </div>
    </SCard>
  );
}

/* ------------------------------------------------------------ company IDs */

const ID_PORTAL: Record<string, [string, string]> = {
  CIN: ['https://www.mca.gov.in', 'MCA portal'],
  PAN: ['https://www.incometax.gov.in', 'Income-tax portal'],
  TAN: ['https://www.tin-nsdl.com', 'TIN-NSDL portal'],
  GSTIN: ['https://www.gst.gov.in', 'GST portal'],
  DIN: ['https://www.mca.gov.in', 'MCA portal'],
};

export function IdsCard({ h, onReveal, onCoi, className }: { h: HomeData; onReveal: (f: 'pan' | 'tan') => void; onCoi?: () => void; className?: string }) {
  const ids = h.home?.identifiers ?? {};
  const shown = { pan: useRevealedIdentifier('pan'), tan: useRevealedIdentifier('tan') };
  const rows: { k: string; v?: string; secret?: 'pan' | 'tan'; portal?: string; who?: string }[] = [
    { k: 'CIN', v: ids.cin },
    { k: 'PAN', v: ids.panMasked, secret: 'pan' },
    { k: 'TAN', v: ids.tanMasked, secret: 'tan' },
    { k: 'GSTIN', v: ids.gstin },
    // G-07: one row per director with a DIN on file
    ...(ids.dins ?? []).map((d) => ({ k: 'DIN', v: d.din, portal: 'DIN', who: d.name })),
  ];
  const iconBtn = 'grid h-[30px] w-[30px] flex-none place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink';
  return (
    <SCard
      title="Company IDs"
      flush
      className={className}
      right={
        onCoi ? (
          <HeadLink onClick={onCoi}>
            <Download size={14} strokeWidth={1.6} aria-hidden /> COI
          </HeadLink>
        ) : undefined
      }
    >
      {rows.map((r) => {
        const clear = r.secret ? shown[r.secret] : null;
        const value = clear ?? r.v;
        const portal = ID_PORTAL[r.portal ?? r.k]!;
        return (
          <ListRow key={`${r.k}:${r.v ?? ''}`}>
            <span className="w-14 flex-none text-[12.5px] font-medium text-ink-muted">{r.k}</span>
            {/* C-077: a director's name sits inline after the DIN. */}
            <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
              <span className={cn('flex-none font-mono text-[13px]', clear ? 'text-positive' : r.v ? 'text-ink' : 'text-ink-faint')}>{value ?? '-'}</span>
              {r.who ? <span className="min-w-0 truncate text-[12.5px] text-ink-muted">{r.who}</span> : null}
            </span>
            {r.secret && clear ? (
              <Chip tone="ok" dot={false}>
                <RevealCountdown field={r.secret} className="font-mono" />
              </Chip>
            ) : null}
            {r.secret && r.v && !clear ? (
              <Chip tone="idle" dot={false}>
                Private
              </Chip>
            ) : null}
            {r.secret && r.v && !clear ? (
              <button type="button" onClick={() => onReveal(r.secret!)} className={iconBtn} aria-label={`Show ${r.k}`}>
                <Eye size={15} strokeWidth={1.6} aria-hidden />
              </button>
            ) : value ? (
              <button
                type="button"
                onClick={() => void copyText(value).then((ok) => h.portal.toast(ok ? `Copied · ${value}` : 'Copy blocked by this browser'))}
                className={iconBtn}
                aria-label={`Copy ${r.k}${r.who ? ` of ${r.who}` : ''}`}
              >
                <Copy size={15} strokeWidth={1.6} aria-hidden />
              </button>
            ) : (
              <span className="w-[30px] flex-none" />
            )}
            <a href={portal[0]} target="_blank" rel="noreferrer" className={cn(iconBtn, 'hidden !text-ink-muted hover:!text-ink sm:grid')} aria-label={`Open the ${portal[1]}`}>
              <ExternalLink size={15} strokeWidth={1.6} aria-hidden />
            </a>
          </ListRow>
        );
      })}
    </SCard>
  );
}

/* ------------------------------------------------------ compliance by area */

function areaDrill(h: HomeData, area: (typeof AREA_ORDER)[number], active: number): DrillConfig {
  const list = h.filings.filter((f) => groupOf(f) === area);
  const by = (b: FilingBucket) => list.filter((f) => bucketOf(f, h.today) === b).map((f) => filingRow(f, h.today));
  return {
    title: `${AREA_NAME[area]} · filings`,
    active,
    tabs: [
      { label: 'All', rows: list.map((f) => filingRow(f, h.today)) },
      { label: 'Filed', rows: by('filed') },
      { label: 'Due soon', rows: by('dueSoon') },
      { label: 'Overdue', rows: by('overdue') },
      { label: 'Upcoming', rows: by('upcoming') },
    ],
    link: { lead: 'These items live in Filings', text: 'Open Filings →', href: portalHref('filings'), where: 'Filings' },
  };
}

export function AreaCard({ h, className }: { h: HomeData; className?: string }) {
  const areas = AREA_ORDER.filter((a) => a !== 'Other' || h.filings.some((f) => groupOf(f) === 'Other'));
  const stat = (a: (typeof AREA_ORDER)[number]) => {
    const list = h.filings.filter((f) => groupOf(f) === a);
    const c = { filed: 0, dueSoon: 0, overdue: 0, upcoming: 0 };
    for (const f of list) c[bucketOf(f, h.today)] += 1;
    const status = c.overdue ? 'Overdue' : c.dueSoon ? 'Due soon' : c.filed ? 'On track' : 'Upcoming';
    return { c, total: list.length, status };
  };
  const all = h.buckets;
  return (
    <SCard title="Compliance by area" meta={`${h.home?.filings.fyLabel ?? ''} · as of ${dShort(h.today)}`} flush className={className}>
      <div className="overflow-x-auto">
        <table className="grid-table min-w-[640px]">
          <thead>
            <tr>
              <th>Area</th>
              <th className="num" style={{ width: 64 }}>Total</th>
              <th className="num" style={{ width: 64 }}>Filed</th>
              <th className="num" style={{ width: 92 }}>Due soon</th>
              <th className="num" style={{ width: 88 }}>Overdue</th>
              <th style={{ width: 120 }}>Mix</th>
              <th style={{ width: 124 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => {
              const s = stat(a);
              return (
                <tr key={a} className="cursor-pointer" onClick={() => h.portal.drill(areaDrill(h, a, 0))}>
                  <td>
                    <AreaPill area={AREA_NAME[a]} reg={regOf(a)} />
                  </td>
                  <td className="num tabular-nums">{s.total}</td>
                  <td className="num tabular-nums">{s.c.filed}</td>
                  <td className="num tabular-nums">{s.c.dueSoon}</td>
                  <td className={cn('num tabular-nums', s.c.overdue > 0 && '!font-medium !text-danger')}>{s.c.overdue}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <StackedBar
                      height={6}
                      legend={false}
                      segments={BUCKETS.map((b) => ({ label: BUCKET_LABEL[b], value: s.c[b], tone: BUCKET_BAR[b] }))}
                      onSegment={(i) => h.portal.drill(areaDrill(h, a, i + 1))}
                    />
                  </td>
                  <td>
                    <Chip fixed>{s.status}</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-muted md:px-5">
        {`1–${areas.length} of ${areas.length}`} · Total {h.filings.length} · filed {all.filed} · due soon {all.dueSoon} · overdue {all.overdue}
      </div>
    </SCard>
  );
}

/* ---------------------------------------------------------- registrations */

const REG_TONE: Record<RegRow['status'], ChipTone> = { Registered: 'ok', 'In progress': 'prog', Upcoming: 'idle' };
const CAT_REG: Partial<Record<RegRow['cat'], Regulator>> = { Labour: 'labour', FEMA: 'fema' };
const PAGE = 8;

export function RegCard({ h, onProof, className }: { h: HomeData; onProof: (r: RegRow) => void; className?: string }) {
  const [cat, setCat] = useState('All');
  const [page, setPage] = useState(0);
  const rows = h.regs.filter((r) => cat === 'All' || r.cat === cat);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const done = h.regs.filter((r) => r.status === 'Registered').length;
  return (
    <SCard
      title="Registrations"
      meta={`${done} of ${h.regs.length} registered`}
      flush
      className={className}
      right={
        <SpectrumTabs
          label="Registration category"
          items={[{ key: 'All', label: 'All', count: h.regs.length }, ...REG_CATS.map((c) => ({ key: c, label: c, count: h.regs.filter((r) => r.cat === c).length }))]}
          value={cat}
          onChange={(k) => {
            setCat(k);
            setPage(0);
          }}
        />
      }
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto">
          <table className="grid-table min-w-[820px]">
            <thead>
              <tr>
                <th>Registration</th>
                <th style={{ width: 124 }}>Category</th>
                <th style={{ width: 150 }}>Authority</th>
                <th>Number</th>
                <th style={{ width: 130 }}>Date</th>
                <th style={{ width: 124 }}>Status</th>
                <th style={{ width: 120 }}>
                  <span className="sr-only">Proof and portal</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.step.id}>
                  <td>
                    <button type="button" onClick={() => h.portal.go(stepHref(r.step.id))} className="text-left font-medium text-ink hover:underline">
                      {r.name}
                    </button>
                  </td>
                  <td>
                    <AreaPill area={r.cat} reg={CAT_REG[r.cat] ?? regOf(r.authority)} />
                  </td>
                  <td className="!text-ink-muted">{r.authority}</td>
                  <td className="font-mono">{r.number ?? <span className="text-ink-faint">-</span>}</td>
                  <td className="whitespace-nowrap">{r.dateLabel}</td>
                  <td>
                    <Chip tone={REG_TONE[r.status]} fixed>
                      {r.status}
                    </Chip>
                  </td>
                  <td>
                    <span className="flex items-center justify-end gap-1">
                      {r.status === 'Registered' ? (
                        r.certPath ? (
                          <button
                            type="button"
                            onClick={() => onProof(r)}
                            className="inline-flex h-[26px] items-center gap-1 rounded-md px-1.5 text-[12.5px] font-medium text-brand-text hover:bg-surface-sunken"
                            aria-label={`Open proof for ${r.name}`}
                          >
                            <Paperclip size={13} strokeWidth={1.6} aria-hidden /> Proof
                          </button>
                        ) : (
                          <Chip tone="warn">Proof pending</Chip>
                        )
                      ) : null}
                      {r.portal ? (
                        <a
                          href={r.portal}
                          target="_blank"
                          rel="noreferrer"
                          className="grid h-[26px] w-[26px] place-items-center rounded-md !text-ink-muted hover:bg-surface-sunken hover:!text-ink"
                          aria-label={`Open the ${r.authority} portal`}
                        >
                          <ExternalLink size={14} strokeWidth={1.6} aria-hidden />
                        </a>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        // C-082: "1–8 of N", previous and next arrows, the page buttons; the current page solid blurple.
        <nav className="flex items-center gap-1 border-t border-line-soft px-4 py-2 text-[12.5px] md:px-5" aria-label="Pages">
          <span className="mr-auto text-ink-muted">{`${cur * PAGE + 1}–${cur * PAGE + shown.length} of ${rows.length}`}</span>
          {pages > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setPage(cur - 1)}
                disabled={cur === 0}
                aria-label="Previous page"
                className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={16} strokeWidth={1.6} aria-hidden />
              </button>
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-current={i === cur ? 'page' : undefined}
                  className={cn('grid h-7 min-w-7 place-items-center rounded-md px-2 font-medium', i === cur ? 'bg-brand text-on-brand' : 'text-ink-2 hover:bg-surface-sunken')}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage(cur + 1)}
                disabled={cur >= pages - 1}
                aria-label="Next page"
                className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight size={16} strokeWidth={1.6} aria-hidden />
              </button>
            </>
          ) : null}
        </nav>
      ) : null}
    </SCard>
  );
}

/* ------------------------------------------------------------- post-inc */

export function PostIncCard({ h, className }: { h: HomeData; className?: string }) {
  const { open, done, dayN } = h.post;
  const drill = (a: number) => h.portal.drill(postIncDrill(open, done, a));
  const meta = [dayN != null ? `Day ${dayN} since COI` : '', `${open.length} open`].filter(Boolean).join(' · ');
  return (
    <SCard title="Post-incorporation setup" meta={meta} flush className={className}>
      {open.map((p) => (
        <ListRow key={p.step.id} onClick={() => drill(1)} className="items-start" label={`${p.step.title} · open the list`}>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.step.title}</span>
              <span className={cn('hidden text-[12.5px] sm:inline', p.overDays ? 'text-danger' : 'text-ink-muted')}>{p.dueDate ? dLong(p.dueDate) : '-'}</span>
            </span>
            <span className="block truncate text-[12.5px] text-ink-muted">{p.info}</span>
            <span className="mt-2 flex items-center gap-3">
              <Bar pct={p.usedPct} tone={p.overDays ? 'bad' : p.owner === 'client' ? 'warn' : 'prog'} className="flex-1" />
              <span className={cn('w-28 flex-none text-right text-[12.5px]', p.overDays ? 'font-medium text-danger' : 'text-ink-muted')}>
                {p.overDays ? `overdue ${plural(p.overDays, 'day')}` : p.limitDays && p.day != null ? `day ${p.day} of ${p.limitDays}` : 'no time limit'}
              </span>
            </span>
          </span>
          <OwnerChip owner={p.owner === 'client' ? 'client' : 'sbc'} label={p.owner === 'client' ? h.company : undefined} className="mt-0.5 hidden sm:inline-flex" />
        </ListRow>
      ))}
      {open.length === 0 && done.length === 0 ? <Empty /> : null}
      {done.length ? (
        <ListRow onClick={() => drill(2)} label={`${done.length} completed · open the list`}>
          <Chip tone="ok">{`${done.length} completed`}</Chip>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{done.map((s) => s.title).join(' · ')}</span>
          <ChevronRight size={16} strokeWidth={1.6} className="flex-none text-ink-faint" aria-hidden />
        </ListRow>
      ) : null}
    </SCard>
  );
}
