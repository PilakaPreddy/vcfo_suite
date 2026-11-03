'use client';

/**
 * VCFO Spectrum parts for the client portal Home and Incorporation pages (prototype
 * src/screens/client/st5.tsx, src/components/cards/*). They render inside a `.cp-tw` island:
 * the portal reverts Tailwind everywhere else (css-src/00-tokens.css), so every part here
 * wraps itself or is placed inside `<Island>`.
 *
 * The portal's own `a` rule (css-src/10-base.css) colours every anchor and outranks a single
 * Tailwind class, so the parts give each text span its own colour and weight, and actions
 * that look like buttons are `<button>` elements that call `portal.go`.
 */
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ListChecks, RefreshCw, Upload } from 'lucide-react';
import { useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { PhaseBar, StepLink, StepMark, type StepTone } from '@/components/ui/step-track';
import { DashSection } from '@/components/dash/DashSection';
import { usePortal } from '@/components/client-portal/PortalProvider';
import { stepHref } from '@/components/client-portal/routes';
import type { PortalIncorporationModel, PortalStep } from '@/lib/client-portal/step-model';
import { exactDate } from '@/lib/relative-due';

/* ------------------------------------------------------------------ island */

/** A Tailwind island inside the client portal. */
export function Island({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('cp-tw min-w-0', className)}>{children}</div>;
}

/**
 * Card (R-15, R-16) on the shared DashSection. The meta sits right after the title: 13px muted
 * text, or a grey pill when it is a count ("n of 25", C-038, C-107, C-112). `right` sits at the
 * far right of the head; `flush` drops the body padding; `loading` covers the body with grey
 * shapes (L1, C-108).
 */
export function SCard({
  title,
  meta,
  pill,
  right,
  flush,
  loading,
  headIcon,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  meta?: ReactNode;
  /** Draw the meta as a grey count pill. Numbers are always drawn as a pill. */
  pill?: boolean;
  right?: ReactNode;
  flush?: boolean;
  loading?: boolean;
  headIcon?: ComponentProps<typeof DashSection>['headIcon'];
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const asPill = pill || typeof meta === 'number';
  const head =
    meta == null || meta === '' ? undefined : asPill ? (
      <span className="inline-flex h-5 items-center rounded-[4px] bg-surface-sunken px-[7px] text-[12px] font-medium tabular-nums text-ink-2">{meta}</span>
    ) : (
      meta
    );
  return (
    <DashSection
      title={title}
      meta={head}
      right={right}
      headIcon={headIcon}
      loading={loading}
      className={className}
      bodyClassName={cn(flush ? 'p-0' : 'px-4 py-4 md:px-5', bodyClassName)}
    >
      {children}
    </DashSection>
  );
}

/** Small link in a card head ("All steps →"). A button, so the portal's anchor colour does not apply. */
export function HeadLink({ onClick, children, label }: { onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline">
      {children}
    </button>
  );
}

/** A portal route as an anchor that navigates in place (keeps middle-click and copy link). */
export function useGo() {
  const portal = usePortal();
  return (href: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    portal.go(href);
  };
}

/** Full-width list row with a hairline between rows (R-19). */
export function ListRow({ children, className, onClick, label }: { children: ReactNode; className?: string; onClick?: () => void; label?: string }) {
  const base = cn('flex items-center gap-3 border-t border-line-soft px-4 py-3 text-[14px] text-ink first:border-t-0 md:px-5', onClick && 'hover:bg-surface-sunken', className);
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-label={label} className={cn(base, 'w-full text-left')}>
        {children}
      </button>
    );
  return <div className={base}>{children}</div>;
}

/** Empty list body (R-05, R-48): a dashed area with the action. */
export function Empty({ children = 'None', action }: { children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m-4 flex flex-col items-center gap-2.5 rounded-md border-dash-fine px-4 py-6 text-center text-[13px] text-ink-muted md:mx-5">
      <span>{children}</span>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------- people */

const AVATAR = [
  'bg-brand-soft text-brand-text',
  'bg-info-soft text-info',
  'bg-identity-soft text-identity',
  'bg-waiting-soft text-waiting',
  'bg-warning-soft text-warning',
  'bg-positive-soft text-positive',
  'bg-upcoming-soft text-upcoming',
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** R-44: people avatars are circles. */
export function Avatar({ name, size = 24, className }: { name: string; size?: 24 | 30 | 36; className?: string }) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length;
  return (
    <span
      className={cn('inline-grid flex-none place-items-center rounded-full font-medium', size === 24 ? 'text-[10px]' : 'text-[11.5px]', AVATAR[idx], className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** R-44: a company is a 6px square. */
function CompanySquare({ name, size = 52 }: { name: string; size?: number }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-md bg-brand-soft text-[18px] font-medium text-brand-text shadow-tile"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(name) || '·'}
    </span>
  );
}

/* --------------------------------------------------------------- dates */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9 Oct" from yyyy-mm-dd. */
function fmtDay(iso?: string): string {
  if (!iso) return '-';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MON[(m ?? 1) - 1]}`;
}

export type Urgency = 'bad' | 'warn' | 'prog' | 'idle';

const TILE: Record<Urgency, string> = {
  bad: 'border-transparent bg-danger-soft text-danger',
  warn: 'border-transparent bg-warning-soft text-warning',
  prog: 'border-brand-line bg-brand-soft text-brand-text',
  idle: 'border-line bg-surface-raised text-ink',
};

/** Urgency of a date: overdue red, within 7 days amber, within 30 days blurple, later plain. */
export function urgencyOf(today: string, iso: string): Urgency {
  const n = Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (n < 0) return 'bad';
  if (n <= 7) return 'warn';
  if (n <= 30) return 'prog';
  return 'idle';
}

/** R-20: 44px date tile tinted by urgency. */
export function DateTile({ iso, tint, className }: { iso: string; tint: Urgency; className?: string }) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return (
    <span className={cn('grid w-11 flex-none place-items-center rounded-md border-1.5 py-1 leading-none', TILE[tint], className)} title={exactDate(iso)} aria-hidden>
      <b className="text-[16px] font-medium">{d}</b>
      <span className={cn('text-[10.5px] font-medium uppercase tracking-wider', tint === 'idle' ? 'text-ink-muted' : 'opacity-80')}>{MON[(m ?? 1) - 1]}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- bars */

export type BarTone = 'ok' | 'warn' | 'bad' | 'prog' | 'idle' | 'teal' | 'violet';
export const BAR_FILL: Record<BarTone, string> = {
  ok: 'bg-positive-mid',
  warn: 'bg-warning-mid',
  bad: 'bg-danger-mid',
  prog: 'bg-brand',
  idle: 'bg-upcoming-mid',
  teal: 'bg-waiting-mid',
  violet: 'bg-identity',
};

/** A thin progress bar (3px corners, R-44). */
export function Bar({ pct, tone = 'prog', className, height = 6 }: { pct: number; tone?: BarTone; className?: string; height?: number }) {
  return (
    <span className={cn('block overflow-hidden rounded-bar bg-surface-sunken', className)} style={{ height }} aria-hidden>
      <i className={cn('block h-full rounded-bar', BAR_FILL[tone])} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

/** R-25 (C2): a split as one stacked bar. Each segment and legend row can open its list. */
export function StackedBar({
  segments,
  onSegment,
  height = 8,
  format = (n) => String(n),
  legend = true,
}: {
  segments: { label: string; value: number; tone: BarTone }[];
  onSegment?: (i: number) => void;
  height?: number;
  format?: (n: number) => string;
  legend?: boolean;
}) {
  const raw = segments.reduce((a, s) => a + s.value, 0);
  const sum = raw || 1;
  return (
    <div className="grid gap-2.5">
      {/* C-200: no track colour; an empty bar keeps a grey track so it still shows. */}
      <span className={cn('flex w-full gap-0.5 overflow-hidden rounded-bar', raw === 0 && 'bg-surface-sunken')} style={{ height }} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {segments.map((s, i) =>
          s.value > 0 ? (
            onSegment ? (
              <button
                key={s.label}
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => onSegment(i)}
                className={cn('block h-full rounded-[2px]', BAR_FILL[s.tone])}
                style={{ width: `${(s.value / sum) * 100}%` }}
              />
            ) : (
              <i key={s.label} className={cn('block h-full rounded-[2px]', BAR_FILL[s.tone])} style={{ width: `${(s.value / sum) * 100}%` }} />
            )
          ) : null,
        )}
      </span>
      {legend ? (
        <ul className="grid gap-1">
          {segments.map((s, i) => {
            const body = (
              <>
                <i className={cn('h-2 w-2 flex-none rounded-[2px]', BAR_FILL[s.tone])} aria-hidden />
                <span className="text-ink-2">{s.label}</span>
                <b className="ml-auto font-medium tabular-nums text-ink">{format(s.value)}</b>
              </>
            );
            return (
              <li key={s.label}>
                {onSegment ? (
                  <button type="button" onClick={() => onSegment(i)} className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-mark px-1.5 py-0.5 text-left text-[13px] hover:bg-surface-sunken">
                    {body}
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-[13px]">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ ST5 */

const isLive = (s: PortalStep) => s.kind === 'you' || s.kind === 'prog' || s.kind === 'with';
const isUp = (s: PortalStep) => s.kind === 'up' || s.kind === 'next';

/** Who holds a live step now: the company for the client's move, else SBC or MCA. */
export function holderOf(s: PortalStep, company: string): string {
  if (s.kind === 'you' || s.kind === 'prog') return company;
  return s.owner === 'mca' ? 'MCA' : 'SBC';
}

export function markState(s: PortalStep): 'done' | 'now' | 'next' {
  return s.kind === 'done' ? 'done' : isLive(s) ? 'now' : 'next';
}

export function markTone(s: PortalStep): StepTone {
  if (s.late && s.kind !== 'done') return 'bad';
  if (s.kind === 'you') return 'teal';
  return 'prog';
}

/** The six status words (R-13) for a step. */
export function stepChip(s: PortalStep): { tone: ChipTone; label: string } {
  if (s.kind === 'done') return { tone: 'ok', label: 'Done' };
  if (isUp(s)) return { tone: 'idle', label: 'Not started' };
  if (s.late) return { tone: 'bad', label: 'Overdue' };
  if (s.kind === 'you') return { tone: 'teal', label: 'Waiting' };
  return { tone: 'prog', label: 'In progress' };
}

/** Line under a step title: "Done 26 Sep", "With Northwind · due 9 Oct", "Starts after step 10". */
export function stepSub(s: PortalStep, prev: PortalStep | undefined, company: string): { text: string; cls: string } {
  if (s.kind === 'done') return { text: s.doneOn ? `Done ${fmtDay(s.doneOn)}` : 'Done', cls: 'text-ink-muted' };
  if (isUp(s)) return { text: prev ? `Starts after step ${prev.n}` : 'Opens later', cls: 'text-ink-muted' };
  const due = s.due ? ` · due ${fmtDay(s.due)}` : '';
  const cls = s.late ? 'text-danger' : s.kind === 'you' ? 'text-waiting' : 'text-brand-text';
  return { text: `With ${holderOf(s, company)}${due}`, cls };
}

/** The phase the client is in: the first with an open step, else the last. */
export function currentPhaseNo(model: PortalIncorporationModel): number {
  return (model.phases.find((p) => p.steps.some((s) => s.kind !== 'done')) ?? model.phases[model.phases.length - 1])?.no ?? 1;
}

/** ST5 phase track: one column per phase, flex sized by step count. */
function PhaseTrack({ model, current, className, onPhase }: { model: PortalIncorporationModel; current: number; className?: string; onPhase?: (no: number) => void }) {
  return (
    <div className={cn('flex gap-2', className)} role="list" aria-label="Phases">
      {model.phases.map((p) => {
        const total = p.steps.length;
        const done = p.steps.filter((s) => s.kind === 'done').length;
        const all = total > 0 && done === total;
        const cur = p.no === current && !all;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const first = p.steps[0]?.n;
        const last = p.steps[total - 1]?.n;
        const body = (
          <>
            <span className={cn('truncate text-[13px] font-medium', all || cur ? 'text-ink' : 'text-ink-muted')}>{p.name}</span>
            <span className={cn('relative block h-2.5 overflow-hidden rounded-bar bg-surface-sunken', cur && 'ring-[1.5px] ring-brand-line')} aria-hidden>
              <i className={cn('block h-full rounded-bar', all ? 'bg-positive-mid' : 'bg-brand')} style={{ width: pct > 0 ? `max(${pct}%, 6px)` : 0 }} />
            </span>
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className={cn('text-[12px] font-medium', all ? 'text-positive' : cur ? 'text-brand-text' : 'text-ink-muted')}>
                {done}/{total}
              </span>
              {first != null ? (
                <span className={cn('truncate font-mono text-[11.5px] font-normal', cur || all ? 'text-ink-muted' : 'text-ink-faint')}>
                  Step {first}–{last}
                </span>
              ) : null}
            </span>
          </>
        );
        return (
          <div key={p.id} role="listitem" className="flex min-w-0" style={{ flex: `${Math.max(1, total)} 1 0` }}>
            {onPhase ? (
              <button type="button" onClick={() => onPhase(p.no)} aria-label={`Phase ${p.no} · ${p.name} · ${done} of ${total}`} className="flex min-w-0 flex-1 flex-col gap-[7px] text-left">
                {body}
              </button>
            ) : (
              <span className="flex min-w-0 flex-1 flex-col gap-[7px]">{body}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One row of the ST5 step list. `focus` tints the row (the step the page is about); `below` sits under the row text. */
export function StepRow({
  s,
  prev,
  company,
  lead,
  lastRow,
  above,
  focus,
  below,
  compact,
  onStep,
}: {
  s: PortalStep;
  prev?: PortalStep;
  company: string;
  lead?: string;
  lastRow: boolean;
  /** The row above in this list (R-58: the line joins its mark to this one). Unset on the first row. */
  above?: PortalStep;
  focus?: boolean;
  below?: ReactNode;
  compact?: boolean;
  /** When set, a plain click on the row calls it instead of opening the step page. */
  onStep?: (s: PortalStep) => void;
}) {
  const go = useGo();
  const live = isLive(s);
  const tint = focus ?? live;
  const sub = stepSub(s, prev, company);
  const chip = stepChip(s);
  const href = stepHref(s.id);
  return (
    <li className={cn('relative', focus === undefined && !live && 'max-sm:hidden')}>
      <StepLink x={11} up={above && (above.kind === 'done' ? 'done' : 'todo')} down={!lastRow && (s.kind === 'done' ? 'done' : 'todo')} className="max-sm:hidden" />
      <a
        href={href}
        onClick={
          onStep
            ? (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                e.preventDefault();
                onStep(s);
              }
            : go(href)
        }
        aria-current={focus ? 'step' : undefined}
        className={cn('relative -mx-2.5 flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-surface-sunken', tint && 'bg-surface-sunken')}
      >
        <StepMark state={markState(s)} tone={markTone(s)} className="relative z-[1]" label={chip.label} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="flex-none font-mono text-[12px] font-normal text-ink-muted">Step {s.n}</span>
            <span className={cn('truncate text-[14px] text-ink', live ? 'font-medium' : 'font-normal')}>{s.title}</span>
          </span>
          <span className={cn('truncate text-[12.5px] font-normal', sub.cls)}>{sub.text}</span>
          {below}
        </span>
        {live && !compact && lead ? (
          <span className="hidden flex-none items-center gap-1.5 text-[12.5px] font-normal text-ink-muted md:inline-flex">
            <Avatar name={lead} size={24} />
            {lead}
          </span>
        ) : null}
        {!compact && (live || s.kind === 'done') ? (
          <Chip tone={chip.tone} fixed className="hidden sm:inline-flex">
            {chip.label}
          </Chip>
        ) : null}
      </a>
    </li>
  );
}

/**
 * The ST5 card (R-22): the phase track, then the step list of the current phase. It shows the
 * last done step, every live step and the next two upcoming steps; the rest fold under
 * "n more in this phase". Phones show the four bars, the phase line and the live steps only.
 */
export function St5Card({
  model,
  company,
  lead,
  link,
  className,
  title = 'Incorporation',
  onPhase,
  onStep,
}: {
  model: PortalIncorporationModel;
  company: string;
  lead?: string;
  link?: { label: string; onClick: () => void };
  className?: string;
  title?: string;
  onPhase?: (no: number) => void;
  /** Passed to every StepRow: a plain click opens this instead of the step page. */
  onStep?: (s: PortalStep) => void;
}) {
  const [all, setAll] = useState(false);
  const steps = model.steps;
  const done = steps.filter((s) => s.kind === 'done').length;
  const current = currentPhaseNo(model);
  const phase = model.phases.find((p) => p.no === current);
  const list = phase?.steps ?? [];
  const lastDone = [...list].reverse().find((s) => s.kind === 'done');
  const upcoming = list.filter(isUp);
  const keep = (s: PortalStep) => isLive(s) || s === lastDone || (upcoming.indexOf(s) > -1 && upcoming.indexOf(s) < 2);
  const shown = all ? list : list.filter(keep);
  const hidden = list.filter((s) => !shown.includes(s));
  const phaseDone = list.filter((s) => s.kind === 'done').length;
  const prevOf = (s: PortalStep) => steps[steps.indexOf(s) - 1];
  const contiguous = hidden.length > 0 && hidden[hidden.length - 1]!.n - hidden[0]!.n === hidden.length - 1;
  return (
    <SCard
      title={title}
      meta={`${done} of ${steps.length}`}
      pill
      headIcon={{ icon: ListChecks, tone: 'blue' }}
      className={className}
      right={
        link ? (
          <HeadLink onClick={link.onClick}>
            {link.label} <ArrowRight size={14} strokeWidth={1.6} aria-hidden />
          </HeadLink>
        ) : undefined
      }
    >
      <PhaseTrack model={model} current={current} className="max-sm:hidden" onPhase={onPhase} />
      <div className="sm:hidden">
        <PhaseBar
          done={model.phases.map((p) => p.steps.filter((s) => s.kind === 'done').length)}
          totals={model.phases.map((p) => p.steps.length)}
          names={model.phases.map((p) => p.name)}
          className="w-full"
        />
        <div className="mt-3 flex items-baseline gap-1 text-[12.5px] text-ink-muted">
          Phase {current} of {model.phases.length} · <b className="font-medium text-ink">{phase?.name}</b>
          <span className="ml-auto">
            {phaseDone}/{list.length}
          </span>
        </div>
      </div>
      <ol className="mt-5 flex flex-col border-t border-line-soft pt-3 max-sm:mt-3">
        {shown.map((s, i) => (
          <StepRow key={s.id} s={s} prev={prevOf(s)} company={company} lead={lead} lastRow={i === shown.length - 1} above={shown[i - 1]} onStep={onStep} />
        ))}
      </ol>
      {hidden.length > 0 ? (
        <button type="button" onClick={() => setAll(true)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-text hover:underline max-sm:hidden">
          <ChevronDown size={14} strokeWidth={1.6} aria-hidden />
          {hidden.length} more in this phase
          {contiguous ? ` · Step ${hidden[0]!.n} to Step ${hidden[hidden.length - 1]!.n}` : ''}
        </button>
      ) : null}
    </SCard>
  );
}

/* ---------------------------------------------------------- page parts */

export interface PageHeadLink {
  href: string;
  label: string;
  dir: 'prev' | 'next';
}

/** Plain page head (R-02): a 28px title, a muted meta line, actions on the right. No navy band, no card. */
export function PageHead({
  title,
  meta,
  chips,
  actions,
  links,
  label,
}: {
  title: ReactNode;
  meta?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  links?: PageHeadLink[];
  label: string;
}) {
  const go = useGo();
  return (
    <section className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3" aria-label={label}>
      <div className="min-w-0 flex-[1_1_320px]">
        <h1 className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[22px] font-medium tracking-[-0.01em] text-ink md:text-[28px]">
          <span className="min-w-0">{title}</span>
          {chips}
        </h1>
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-muted">{meta}</div> : null}
      </div>
      {links?.length || actions ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {links?.map((l) => (
            <a
              key={l.href + l.label}
              href={l.href}
              onClick={go(l.href)}
              aria-label={`${l.dir === 'prev' ? 'Previous' : 'Next'} · ${l.label}`}
              className="inline-flex h-control-sm min-w-0 max-w-full items-center gap-[7px] rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[13px] font-medium text-ink hover:bg-surface-sunken"
            >
              {l.dir === 'prev' ? <ChevronLeft size={15} strokeWidth={1.6} aria-hidden /> : null}
              <span className="truncate text-ink">{l.label}</span>
              {l.dir === 'next' ? <ChevronRight size={15} strokeWidth={1.6} aria-hidden /> : null}
            </a>
          ))}
          {actions}
        </div>
      ) : null}
    </section>
  );
}

/** Dot between meta items. */
export function Dot() {
  return (
    <span className="text-ink-faint" aria-hidden>
      ·
    </span>
  );
}

/** R-24: a plain chevron. No box. Rotates when open. */
export function Chevron({ open, className }: { open?: boolean; className?: string }) {
  return <ChevronRight size={16} strokeWidth={1.6} aria-hidden className={cn('flex-none text-ink-faint transition-transform', open && 'rotate-90', className)} />;
}

/** Prev and next pager under a record page. */
export function Pager({ prev, next }: { prev?: { href: string; label: string }; next?: { href: string; label: string } }) {
  const go = useGo();
  const cls = 'inline-flex h-control-md min-w-0 max-w-full items-center gap-[7px] rounded-md border-1.5 border-line-strong bg-surface-raised px-3.5 text-[14px] font-medium text-ink hover:bg-surface-sunken';
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Pages">
      {prev ? (
        <a href={prev.href} onClick={go(prev.href)} className={cls}>
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden />
          <span className="truncate text-ink">{prev.label}</span>
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a href={next.href} onClick={go(next.href)} className={cls}>
          <span className="truncate text-ink">{next.label}</span>
          <ChevronRight size={16} strokeWidth={1.6} aria-hidden />
        </a>
      ) : null}
    </nav>
  );
}

/**
 * Drop zone for one requested file. "warn" is the amber zone of a file the client owes;
 * "accent" is the blurple zone that replaces a file.
 */
export function DropZone({
  label,
  hint,
  chip,
  onFile,
  accept,
  tone = 'warn',
  busy,
  busyText = 'Uploading…',
  browseText = 'Drop a file here or',
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  chip?: ReactNode;
  onFile: (file: File) => void;
  accept: string;
  tone?: 'warn' | 'accent';
  busy?: boolean;
  busyText?: string;
  browseText?: string;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const warn = tone === 'warn';
  const name = typeof label === 'string' ? label : 'the file';
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        'drop-zone flex items-center gap-3 rounded-md border-dash-fine bg-surface-raised px-4 py-3.5',
        over && 'bg-brand-soft [--dash-color:oklch(var(--brand))]',
        busy && 'opacity-70',
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Upload ${name}`}
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={cn('grid h-10 w-10 flex-none place-items-center rounded-md', warn ? 'bg-warning-soft text-warning' : 'bg-brand-soft text-brand-text')}
      >
        {warn ? <Upload size={16} strokeWidth={1.8} aria-hidden /> : <RefreshCw size={16} strokeWidth={1.8} aria-hidden />}
      </button>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-medium text-ink">{label}</b>
        <span className="block text-[12.5px] text-ink-muted">
          {busy ? (
            busyText
          ) : (
            <>
              {browseText}{' '}
              <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => ref.current?.click()}>
                browse
              </button>
            </>
          )}
        </span>
      </span>
      {hint ? <span className="hidden flex-none text-[12px] text-ink-muted sm:inline">{hint}</span> : null}
      {chip}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-label={`Choose ${name}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

/** Two-column grid (main plus a 360px side column) that stacks under 1024px. */
export function Cols({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]', className)}>{children}</div>;
}

/** A column of cards. */
export function Col({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid min-w-0 grid-cols-1 gap-5', className)}>{children}</div>;
}

/** Equal columns (two from 768px). */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2', className)}>{children}</div>;
}
