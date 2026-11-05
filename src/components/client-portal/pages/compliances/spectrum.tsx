'use client';

/**
 * VCFO Spectrum parts for the client portal Compliances and Registrations pages (prototype
 * src/screens/client/comp-parts.tsx, item-parts.tsx and src/components/cards/*).
 *
 * The portal reverts Tailwind everywhere outside a `.cp-tw` island (css-src/00-tokens.css), so
 * every part here either wraps itself in an island or is placed inside `<Island>`. The page
 * rules in css-src/compliances-board.css skip `.cp-tw` islands, so the shared Spectrum parts
 * (chips, tabs, the T1 grid) draw exactly as on the staff portals.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronDown, ExternalLink, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AreaPill, Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { regOf, type Regulator } from '@/lib/ui/regulator';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { StepLink, StepMark } from '@/components/ui/step-track';
import {
  AREA_FULL,
  AREA_LABEL,
  MON,
  byComp,
  daysBetween,
  dow,
  portalFor,
  type AreaCode,
  type CompStatus,
  type PortalFiling,
} from '@/lib/client-portal/compliances';
import { usePortal } from '../../PortalProvider';
import { portalHref } from '../../routes';
import { useDismiss } from './bits';
import { exactDate } from '@/lib/relative-due';
import { FILING_WORD, SIX_TONE, STATUS_FILL, STATUS_STROKE, STATUS_TILE, type SixWord } from '@/lib/compliance/spectrum-status';

/* ------------------------------------------------------------------ island */

/** A Tailwind island inside the client portal. `inline` draws a span for use inside text. */
export function Island({ className, inline, children }: { className?: string; inline?: boolean; children: ReactNode }) {
  if (inline) return <span className={cn('cp-tw inline-flex min-w-0 align-middle', className)}>{children}</span>;
  return <div className={cn('cp-tw min-w-0', className)}>{children}</div>;
}

/* ------------------------------------------------------------ status words */

/**
 * R-13: the four register buckets in the six status words, with their colours, from the staff
 * maps in `src/lib/compliance/spectrum-status.ts` re-keyed by the portal's short keys. A filed
 * row is Done; an upcoming row that is not yet in its due-soon window is Not started.
 */
export const WORD: Record<CompStatus, SixWord> = byComp(FILING_WORD);
const TONE = (s: CompStatus): ChipTone => SIX_TONE[WORD[s]];
/** Solid marks for bars, legend squares and dots (R-25: status colours only in charts). */
export const FILL: Record<CompStatus, string> = byComp(STATUS_FILL);
/** SVG stroke colours for the donut, from the same tokens. */
export const STROKE: Record<CompStatus, string> = byComp(STATUS_STROKE);
/** Soft tint for a date tile or a day number. */
export const TINT: Record<CompStatus, string> = byComp(STATUS_TILE);
/** Legend and drill order: worst first, then the rest. */
export const STATUS_ORDER: CompStatus[] = ['over', 'due', 'up', 'ok'];

/** R-13 status chip, 104px. `compact` keeps only the square dot for narrow rails (the word stays for screen readers). */
export function StatusChip({ s, compact, className }: { s: CompStatus; compact?: boolean; className?: string }) {
  if (compact)
    return (
      <span title={WORD[s]} className={cn('inline-flex h-6 w-6 flex-none items-center justify-center rounded-md', TINT[s], className)}>
        <i className={cn('h-[7px] w-[7px] rounded-[2px]', FILL[s])} aria-hidden />
        <span className="sr-only">{WORD[s]}</span>
      </span>
    );
  return (
    <Chip tone={TONE(s)} fixed className={className}>
      {WORD[s]}
    </Chip>
  );
}

const REG_OF_AREA: Record<AreaCode, Regulator> = { MCA: 'mca', GST: 'gst', IT: 'it', PAY: 'payroll', FEMA: 'fema' };
const REG_DOT: Record<Regulator, string> = {
  mca: 'bg-reg-mca',
  gst: 'bg-reg-gst',
  it: 'bg-reg-it',
  payroll: 'bg-reg-payroll',
  fema: 'bg-reg-fema',
  labour: 'bg-reg-labour',
};

/** R-43 area pill (104px). `compact` is the short tag for tight rails: the swatch and the code. */
export function AreaTag({ a, compact, className }: { a: AreaCode; compact?: boolean; className?: string }) {
  if (compact)
    return (
      <span
        title={AREA_FULL[a]}
        className={cn('inline-flex h-5 flex-none items-center gap-1 rounded-sm border-1.5 border-line bg-surface-raised px-1.5 text-[11px] font-medium text-ink-2', className)}
      >
        <i className={cn('h-1.5 w-1.5 flex-none rounded-[2px]', REG_DOT[REG_OF_AREA[a]])} aria-hidden />
        {a}
      </span>
    );
  return <AreaPill area={AREA_LABEL[a]} reg={REG_OF_AREA[a]} className={className} />;
}

/** Area pill for a free word (registrations: GST, Payroll, Labour, IP, FEMA). */
export function WordPill({ word, className }: { word: string; className?: string }) {
  return <AreaPill area={word} reg={regOf(word)} className={className} />;
}

/* -------------------------------------------------------------- date tile */

/** Blurple tint with an edge for a date 8 to 15 days away (prototype attention lists). */
const SOON = 'border-1.5 border-brand-line bg-brand-soft text-brand-text';

/**
 * Date tile tinted by status: the day over the month (or the weekday when `weekday`). 44px, or 36px
 * (`sm`) inside grid rows, where the month is short mixed case ("Oct") as in the prototype grid.
 * `soon` is the blurple tile of a date 8 to 15 days away.
 */
export function DateTile({ iso, s, weekday, size = 'md', className }: { iso: string; s: CompStatus | 'none' | 'soon'; weekday?: boolean; size?: 'sm' | 'md'; className?: string }) {
  const tint = s === 'none' ? 'border-1.5 border-line bg-surface-raised text-ink' : s === 'soon' ? SOON : TINT[s];
  const sub = weekday ? dow(iso) : MON[Number(iso.slice(5, 7)) - 1];
  return (
    <span className={cn('grid flex-none place-content-center rounded-md text-center leading-none', size === 'sm' ? 'h-9 w-9' : 'h-11 w-11', tint, className)} title={exactDate(iso)} aria-hidden>
      <b className={cn('font-medium', size === 'sm' ? 'text-[14px]' : 'text-[16px]')}>{Number(iso.slice(8, 10))}</b>
      {size === 'sm' ? (
        <small className="mt-0.5 text-[11px] font-medium">{sub}</small>
      ) : (
        <small className={cn('mt-0.5 text-[10.5px] font-medium uppercase tracking-wider', s === 'none' ? 'text-ink-muted' : 'opacity-80')}>{sub}</small>
      )}
    </span>
  );
}

/** The tile tint of an attention row (R-20): late red, within 7 days amber, within 15 days blurple, else plain. */
export function urgencyTint(today: string, due: string): CompStatus | 'none' | 'soon' {
  const d = daysBetween(today, due);
  if (d < 0) return 'over';
  if (d <= 7) return 'due';
  if (d <= 15) return 'soon';
  return 'none';
}

/** "In 3 days", "Due tomorrow", "2 days late" with the urgency colour, for the sub line of an attention row. */
export function DueWords({ today, due }: { today: string; due: string }) {
  const d = daysBetween(today, due);
  const words = d < -1 ? `${-d} days late` : d === -1 ? '1 day late' : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `In ${d} days`;
  return (
    <span title={exactDate(due)} className={cn(d < 0 ? 'text-danger' : d <= 3 ? 'text-warning' : undefined)}>
      {words}
    </span>
  );
}

/* ------------------------------------------------------------- people */

/** The people on a record (prototype PeopleStack): 30px circles with a ring, the client, the project lead and the manager. */
export function PeopleStack({ people }: { people: Array<{ name: string; role: string; src?: string | null }> }) {
  const list = people.filter((p) => p.name.trim());
  if (!list.length) return null;
  return <AvatarStack size={30} max={4} people={list.map((p) => ({ name: p.name, src: p.src }))} label={list.map((p) => `${p.name} · ${p.role}`).join(', ')} />;
}

/* ------------------------------------------------------------ step list */

export interface ThreadStep {
  key: string;
  title: string;
  state: 'done' | 'now' | 'next';
  /** The client holds the live step (teal). */
  client?: boolean;
  /** "With Northwind", "With SBC", "With MCA" for the live step. */
  holder?: string;
  /** A note after the holder on the live step, or who did a done step. */
  note?: string;
  /** Done date (yyyy-mm-dd). */
  date?: string;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Steps of a record as ST5 (R-22, prototype SideThread): done steps a green square with a tick and
 * their date, the live step a ring on a tinted row with who holds it and "Today", later steps a
 * plain empty square without dates (R-23). A 1.5px line joins the mark centres (R-58), green under done steps.
 */
export function StepList({ steps, today }: { steps: ThreadStep[]; today: string }) {
  return (
    <ol className="-mx-4 md:-mx-5">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const done = s.state === 'done';
        const now = s.state === 'now';
        return (
          <li key={s.key} className={cn('relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 [--step-x:27px] md:px-5 md:[--step-x:31px]', now && 'bg-surface-sunken')}>
            <StepLink x="var(--step-x)" y={21} up={i > 0 && (steps[i - 1].state === 'done' ? 'done' : 'todo')} down={!last && (done ? 'done' : 'todo')} />
            <StepMark state={s.state} tone={now && s.client ? 'teal' : 'prog'} label={done ? 'Done' : now ? 'Now' : 'Upcoming'} className="relative" />
            <span className="min-w-0">
              <b className={cn('block truncate text-[14px] font-medium text-ink', s.state === 'next' && 'font-normal text-ink-muted')}>{s.title}</b>
              {now ? (
                <small className={cn('block truncate text-[12.5px]', s.client ? 'text-waiting' : 'text-brand-text')}>
                  {s.holder}
                  {s.note ? <span className="text-ink-muted"> · {s.note}</span> : null}
                </small>
              ) : done && s.note ? (
                <small className="block truncate text-[12.5px] text-ink-muted">{s.note}</small>
              ) : null}
            </span>
            <span className="pt-0.5 text-right text-[12.5px] text-ink-muted">
              {done && s.date ? `${WD[new Date(`${s.date}T00:00:00Z`).getUTCDay()]} ${Number(s.date.slice(8, 10))} ${MON[Number(s.date.slice(5, 7)) - 1]}` : now ? <span className="font-medium text-brand-text">{WD[new Date(`${today}T00:00:00Z`).getUTCDay()]} · Today</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------------------------------------- portal ↗ */

/** Rule 15: a small link to the government portal next to a filing name. */
export function PortalLink({ f, className }: { f: Pick<PortalFiling, 'area' | 'name'>; className?: string }) {
  const [label, url] = portalFor(f);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title={`Open ${label}`}
      aria-label={`Open ${label}`}
      className={cn('inline-grid h-6 w-6 flex-none place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken hover:text-brand-text', className)}
    >
      <ExternalLink size={13} strokeWidth={1.6} aria-hidden />
    </a>
  );
}

/* ------------------------------------------------------------- navigation */

/** A portal route as an anchor that navigates in place (keeps middle-click and copy link). */
export function GoLink({ href, className, label, children }: { href: string; className?: string; label?: string; children: ReactNode }) {
  const portal = usePortal();
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    portal.go(href);
  };
  return (
    <a href={href} onClick={onClick} aria-label={label} className={className}>
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ cards */

/**
 * Card (R-15, R-16; prototype SectionCard): white, a 1.5px line, 6px corners, a 52px head with the
 * 28px icon tile from the title, the 15px title, then the meta as plain muted text and `right` at the
 * far right. The head and body pad 16px, and 20px from 768px. `flush` drops the body padding.
 */
export function SCard({
  title,
  meta,
  right,
  flush,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-md border-1.5 border-line bg-surface-raised', className)} aria-label={title}>
      <header className="flex min-h-[52px] min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title={title} />
        <h2 className="min-w-0 truncate text-[15px] font-medium text-ink">{title}</h2>
        {meta !== undefined && meta !== null && meta !== '' ? <span className="hidden truncate text-[13px] tabular-nums text-ink-muted sm:inline">{meta}</span> : null}
        {right ? <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{right}</div> : null}
      </header>
      <div className={cn(!flush && 'px-4 py-4 md:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Text card (prototype TextCard): a paragraph, with the "Read the SBC SOP" link when `sop` is set. */
export function TextCard({ title, sop, children }: { title: string; sop?: boolean; children: ReactNode }) {
  return (
    <SCard title={title}>
      <div className="grid gap-2 text-[13.5px] leading-relaxed text-ink-2">{children}</div>
      {sop ? (
        <GoLink href={portalHref('knowledge-bank')} className="mt-3 inline-block text-[13px] font-medium text-brand-text hover:underline">
          Read the SBC SOP
        </GoLink>
      ) : null}
    </SCard>
  );
}

/** Empty body (R-48): a dashed area with the action. */
export function Empty({ children = 'None', action, className }: { children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('m-4 flex flex-col items-center gap-2.5 rounded-md border-dash-fine px-4 py-6 text-center text-[13px] text-ink-muted md:mx-5', className)}>
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Full-width list row with a hairline between rows (R-19). */
export function ListRow({ children, className, onClick, label }: { children: ReactNode; className?: string; onClick?: () => void; label?: string }) {
  const base = cn('flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 text-[14px] text-ink first:border-t-0 md:px-5', onClick && 'hover:bg-surface-sunken', className);
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-label={label} className={cn(base, 'w-full text-left')}>
        {children}
      </button>
    );
  return <div className={base}>{children}</div>;
}

/* ------------------------------------------------------------- stacked bar */

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  /** A solid token fill class (FILL above, or a step colour). */
  fill: string;
}

/** R-25 (C2): one stacked bar with its legend, in status colours. Legend rows drill down when `onPick` is set. */
export function StackedBar({ segments, onPick, height = 8, className }: { segments: BarSegment[]; onPick?: (key: string) => void; height?: 6 | 8 | 10; className?: string }) {
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className={cn('grid gap-2.5', className)}>
      <span className="flex w-full gap-0.5 overflow-hidden rounded-bar" style={{ height }} aria-hidden>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <i key={s.key} className={cn('block h-full rounded-[2px]', s.fill)} style={{ width: `${(s.value / sum) * 100}%` }} />
          ))}
      </span>
      <ul className="grid gap-1">
        {segments.map((s) => {
          const inner = (
            <>
              <i className={cn('h-2 w-2 flex-none rounded-[2px]', s.fill)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <b className="pl-3 font-medium tabular-nums text-ink">{s.value}</b>
            </>
          );
          return (
            <li key={s.key}>
              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(s.key)}
                  aria-label={`${s.label} · ${s.value} · show the list`}
                  className="flex w-full items-center gap-2 rounded-sm text-left text-[13px] text-ink-2 hover:text-brand-text"
                >
                  {inner}
                </button>
              ) : (
                <span className="flex w-full items-center gap-2 text-[13px] text-ink-2">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ head filters */

/**
 * R-10 filter chip for a table head bar. Set: a soft blurple fill with the value and an ×.
 * Not set: a "+ Area" chip with a plain edge (R-56) that opens a small menu (inside the portal, so it follows
 * the portal's theme).
 */
export function FilterMenu<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  /** null when the filter is not set. */
  value: V | null;
  options: Array<{ value: V; label: string; count?: number }>;
  onChange: (v: V | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useDismiss(open, box, () => setOpen(false));
  const cur = options.find((o) => o.value === value);
  const chip = 'inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium';
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  return (
    <span ref={box} className="relative inline-flex">
      {cur ? (
        <span className={cn(chip, 'border-1.5 border-brand-line bg-brand-soft pr-1 text-brand-text')}>
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={`${label}: ${cur.label}. Change`}>
            <span className="font-normal opacity-80">{label}</span> {cur.label}
          </button>
          <button type="button" onClick={() => onChange(null)} className="grid h-5 w-5 place-items-center rounded-sm hover:bg-surface-raised" aria-label={`Clear ${label}`}>
            <X size={13} strokeWidth={1.8} aria-hidden />
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(chip, 'border-1.5 border-line-strong text-ink-2 hover:bg-surface-sunken hover:text-ink')}
        >
          <Plus size={14} strokeWidth={1.8} aria-hidden /> {label}
        </button>
      )}
      {open ? (
        <div
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={onKey}
          className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[180px] overflow-hidden rounded-md border border-line bg-surface-raised p-1 text-[14px] text-ink shadow-float"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex h-[34px] w-full items-center gap-3 rounded-sm px-2.5 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.count !== undefined ? <span className="text-[12px] tabular-nums text-ink-muted">{o.count}</span> : null}
              {o.value === value ? <Check size={14} strokeWidth={1.8} className="text-brand-text" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** Compact search box for a card head (R-47 input, 160px; hidden below 640px). "/" focuses it, Enter opens the first match, Esc clears. */
export function HeadSearch({ value, onChange, onEnter, label }: { value: string; onChange: (v: string) => void; onEnter?: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
      const box = ref.current;
      if (!box || box.offsetParent === null) return;
      e.preventDefault();
      e.stopPropagation();
      box.focus();
    };
    // capture, so the page search wins over the portal's own "/" (Ask VCFO) while this box is shown
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <span className="relative hidden sm:inline-flex">
      <Search size={14} strokeWidth={1.6} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
          if (e.key === 'Escape') onChange('');
        }}
        placeholder="Search"
        aria-label={label}
        className="h-[30px] w-[160px] rounded-md border-1.5 border-line-strong bg-surface-raised pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:shadow-[0_0_0_4px_oklch(var(--focus-ring)/.24)] focus:outline-none"
      />
    </span>
  );
}

/** A group head that folds its rows (R-24): a plain chevron, the label in capitals and the count. */
export function GroupHead({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 border-t border-line-soft bg-surface-sunken px-4 py-1.5 text-left text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted first:border-t-0 hover:text-ink md:px-5"
    >
      <ChevronDown size={14} strokeWidth={1.8} className={cn('transition-transform', !open && '-rotate-90')} aria-hidden />
      {label}
      <span className="text-ink-faint">{count}</span>
    </button>
  );
}

/** Label and value rows of a record (R-28: identifiers in mono). */
export function FactRows({ rows }: { rows: Array<{ k: string; v: ReactNode; mono?: boolean; empty?: boolean }> }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.k} className="grid min-h-[44px] grid-cols-[150px_minmax(0,1fr)] items-center gap-4 border-t border-line-soft px-4 py-2 first:border-t-0 sm:grid-cols-[190px_minmax(0,1fr)] md:px-5">
          <dt className="text-[13px] text-ink-muted">{r.k}</dt>
          <dd className={cn('min-w-0 break-words text-[14px] font-medium text-ink', r.mono && 'font-mono text-[13.5px]', r.empty && 'font-normal text-ink-faint')}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------ record head */

export interface HeadFact {
  k: string;
  v: ReactNode;
  tone?: 'bad';
}

/**
 * Plain record head (R-02): the title, a muted meta line, the status chips and the key facts
 * in one row, with the people on it and the record's main actions on the right.
 */
export function RecordHead({
  title,
  sub,
  chips,
  facts,
  people,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  chips?: ReactNode;
  facts: HeadFact[];
  /** The people stack (client, lead, manager), drawn before the actions. */
  people?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-4" aria-label={title}>
      <div className="min-w-0 flex-[1_1_320px]">
        <h1 className="text-[24px] font-medium leading-tight tracking-[-0.01em] text-ink md:text-[28px]">{title}</h1>
        {sub ? <p className="mt-1 text-[14px] text-ink-muted">{sub}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {chips}
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px]">
            {facts.map((f) => (
              <div key={f.k} className="flex items-baseline gap-1.5">
                <dt className="text-ink-muted">{f.k}</dt>
                <dd className={cn('font-medium text-ink', f.tone === 'bad' && 'text-danger')}>{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {people || actions ? (
        <div className="flex flex-none flex-wrap items-center gap-3">
          {people}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/** "In 3 days", "Due today", "2 days late": the relative due word and its chip tone. */
export function relativeDue(today: string, due: string): { label: string; tone: ChipTone } {
  const d = daysBetween(today, due);
  if (d < 0) return { label: `${-d} ${d === -1 ? 'day' : 'days'} late`, tone: 'bad' };
  if (d === 0) return { label: 'Due today', tone: 'warn' };
  return { label: `In ${d} ${d === 1 ? 'day' : 'days'}`, tone: d <= 7 ? 'warn' : 'idle' };
}
