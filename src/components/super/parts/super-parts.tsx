'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CARD_HEAD_ICONS } from '@/components/common/CardHeadTile';
import { cardHeadIcon } from '@/lib/ui/card-head-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import { companyInitials } from '@/components/super/parts/super-text';

/**
 * Small parts the super admin screens share (prototype `src/screens/super/parts.tsx` and the
 * KP1 number strip). They are built only from the shared tokens and the shared primitives, so
 * a filter chip or a number tile here reads the same as anywhere else in the product.
 */

/* ---------- Client tile (R-35) ---------- */

const TILE_TONES = [
  'bg-brand-soft text-brand-text',
  'bg-identity-soft text-identity',
  'bg-waiting-soft text-waiting',
  'bg-warning-soft text-warning',
  'bg-positive-soft text-positive',
  'bg-surface-sunken text-ink-2',
];

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 26px initials tile in a steady identity colour chosen from the engagement id. */
export function ClientTile({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-grid h-[26px] w-[26px] flex-none place-items-center rounded-md text-[10.5px] font-medium',
        TILE_TONES[hashOf(id) % TILE_TONES.length],
        className,
      )}
      aria-hidden
    >
      {companyInitials(name)}
    </span>
  );
}

/* ---------- Date tile (R-20) ---------- */

export type SuperUrgency = 'bad' | 'warn' | 'prog' | 'idle';

const URGENCY_TILE: Record<SuperUrgency, string> = {
  bad: 'border-transparent bg-danger-soft text-danger',
  warn: 'border-transparent bg-warning-soft text-warning',
  prog: 'border-brand-line bg-brand-soft text-brand-text',
  idle: 'border-line bg-surface-raised text-ink',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayOfYmd(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00`);
}

/** Overdue red, within 7 days amber, within 15 blurple, later grey (prototype `urgency`). */
function urgencyOf(ymd: string, now: Date = new Date()): SuperUrgency {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((dayOfYmd(ymd).getTime() - today.getTime()) / 86_400_000);
  if (n < 0) return 'bad';
  if (n <= 7) return 'warn';
  if (n <= 15) return 'prog';
  return 'idle';
}

/** 44px date tile tinted by urgency; the full date ("Mon 19 Oct 2026") is the tooltip. */
export function DateTile({ ymd, tint, className }: { ymd: string; tint?: SuperUrgency; className?: string }) {
  const d = dayOfYmd(ymd);
  const u = tint ?? urgencyOf(ymd);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()]!;
  return (
    <span
      title={`${WEEKDAYS[d.getDay()]} ${day} ${mon} ${d.getFullYear()}`}
      className={cn(
        'grid w-11 flex-none place-items-center rounded-md border-1.5 py-1 leading-none',
        URGENCY_TILE[u],
        className,
      )}
    >
      <b className="text-[16px] font-medium">{day}</b>
      <span className={cn('text-[10.5px] font-medium uppercase tracking-wider', u === 'idle' ? 'text-ink-muted' : 'opacity-80')}>
        {mon}
      </span>
    </span>
  );
}

/** Person initials in a circle (R-44: people avatars are circles). */
export function PersonAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = (parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
  return (
    <span
      className="inline-grid flex-none place-items-center rounded-full bg-surface-sunken text-[10px] font-medium text-ink-2"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

/** Name with a muted line under it, for grid cells. */
export function NameCell({ title, sub, lead }: { title: ReactNode; sub?: ReactNode; lead?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {lead}
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{title}</span>
        {sub ? <span className="block truncate text-[12px] text-ink-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

/* ---------- R-10 filter chips ---------- */

export interface SuperFilterDef {
  key: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function FilterMenu({ filter, trigger }: { filter: SuperFilterDef; trigger: ReactNode }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] min-w-[180px] overflow-y-auto">
        {filter.options.length === 0 ? (
          <DropdownMenuItem disabled>None</DropdownMenuItem>
        ) : (
          filter.options.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => filter.onChange(option)}
              className={cn(option === filter.value && 'font-medium text-brand-text')}
            >
              <span className="min-w-0 flex-1 truncate">{option}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** R-10: a set filter is a soft blurple chip with an ×; an unset one is a "+ Label" chip with a plain edge (R-56). */
export function SuperFilterChips({
  filters,
  onClear,
  className,
}: {
  filters: SuperFilterDef[];
  onClear?: () => void;
  className?: string;
}) {
  const any = filters.some((filter) => filter.value);
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {filters.map((filter) =>
        filter.value ? (
          <span
            key={filter.key}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border-1.5 border-brand-line bg-brand-soft pl-2.5 pr-1.5 text-[13px] text-brand-text"
          >
            <FilterMenu
              filter={filter}
              trigger={
                <button type="button" className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                  <span className="text-ink-2">{filter.label}</span>
                  <b className="max-w-[160px] truncate font-medium">{filter.value}</b>
                </button>
              }
            />
            <button
              type="button"
              aria-label={`Remove ${filter.label} filter`}
              onClick={() => filter.onChange('')}
              className="grid h-[18px] w-[18px] place-items-center rounded-sm hover:bg-surface-raised"
            >
              <X size={13} strokeWidth={1.6} aria-hidden />
            </button>
          </span>
        ) : (
          <FilterMenu
            key={filter.key}
            filter={filter}
            trigger={
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border-1.5 border-dashed border-line-strong px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-sunken"
              >
                <Plus size={13} strokeWidth={1.6} aria-hidden />
                {filter.label}
              </button>
            }
          />
        ),
      )}
      {any && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-7 items-center whitespace-nowrap rounded-md border-1.5 border-line bg-surface-raised px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-sunken"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

/* ---------- KP1 number strip (R-18) ---------- */

export interface SuperStat {
  label: string;
  value: number | string;
  /** Small muted text after the number, for example "/ 30". */
  of?: string;
  sub?: string;
  href?: string;
  /** Overdue number: red. */
  bad?: boolean;
  /** Done number: green. */
  good?: boolean;
  /** A word-specific glyph; by default the label picks one. */
  icon?: LucideIcon;
}

/** KP1 tiles on a plain page: 13px label with a 15px icon from the label, a 26px number. */
export function SuperNumberStrip({ items }: { items: SuperStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      {items.map((stat) => {
        const Icon = stat.icon ?? CARD_HEAD_ICONS[cardHeadIcon(stat.label).icon];
        const body = (
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-start gap-1.5 text-[13px] font-medium leading-[18px] text-ink-2">
              <Icon width={15} height={15} strokeWidth={1.6} className="mt-px flex-none text-ink-muted" aria-hidden />
              <span className="min-w-0">{stat.label}</span>
            </span>
            <span className="flex items-baseline gap-1">
              <span
                className={cn(
                  'text-[26px] font-medium leading-none tabular-nums',
                  stat.bad ? 'text-danger' : stat.good ? 'text-positive' : 'text-ink',
                )}
              >
                {stat.value}
              </span>
              {stat.of ? <span className="text-[13px] text-ink-muted">{stat.of}</span> : null}
            </span>
            {stat.sub ? <span className="truncate text-[12.5px] text-ink-muted">{stat.sub}</span> : null}
          </span>
        );
        const cls = cn('surface flex min-w-0 px-4 py-3.5', stat.href && 'transition-colors hover:border-line-strong');
        return stat.href ? (
          <Link key={stat.label} href={stat.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={stat.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Bars (R-25: status colours only) ---------- */

const FILL: Record<ChipTone, string> = {
  ok: 'bg-positive-mid',
  warn: 'bg-warning-mid',
  bad: 'bg-danger-mid',
  prog: 'bg-brand',
  idle: 'bg-upcoming-mid',
  violet: 'bg-identity',
  teal: 'bg-waiting-mid',
};

/** A single progress bar in a status colour. */
export function ToneBar({
  pct,
  tone = 'prog',
  height = 6,
  className,
  label,
}: {
  pct: number;
  tone?: ChipTone;
  height?: number;
  className?: string;
  label?: string;
}) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span
      className={cn('relative block overflow-hidden rounded-bar bg-surface-sunken', className)}
      style={{ height }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i className={cn('absolute inset-y-0 left-0 rounded-bar', FILL[tone])} style={{ width: w > 0 ? `max(${w}%, 4px)` : 0 }} />
    </span>
  );
}

export interface SuperSegment {
  label: string;
  value: number;
  tone: ChipTone;
}

/**
 * One stacked bar with its legend (C1 in a line). `total` prints a 26px figure at the right above
 * the bar and `rows` stacks the legend, one part a line with its count at the right (prototype
 * `StackedBar`).
 */
export function StackedBar({
  segments,
  height = 10,
  legend = true,
  total: figure,
  rows = false,
  className,
}: {
  segments: SuperSegment[];
  height?: number;
  legend?: boolean;
  total?: ReactNode;
  rows?: boolean;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className={cn('min-w-0', className)}>
      {figure !== undefined ? <b className="mb-2.5 block text-right text-[26px] font-medium leading-none tabular-nums text-ink">{figure}</b> : null}
      <span
        className="flex w-full gap-0.5 overflow-hidden rounded-bar bg-surface-sunken"
        style={{ height }}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}
      >
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <i key={s.label} className={cn('block h-full', FILL[s.tone])} style={{ flex: s.value }} title={`${s.label} · ${s.value}`} />
              ))
          : null}
      </span>
      {legend && rows ? (
        <ul className="mt-2.5 grid gap-1">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-[13px] text-ink-2">
              <i className={cn('h-2 w-2 flex-none rounded-[2px]', FILL[s.tone])} aria-hidden />
              {s.label}
              <b className="ml-auto font-medium tabular-nums text-ink">{s.value}</b>
            </li>
          ))}
        </ul>
      ) : legend ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-ink-2">
          {segments.map((s) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <i className={cn('h-2 w-2 rounded-[2px]', FILL[s.tone])} aria-hidden />
              {s.label}
              <b className="font-medium tabular-nums text-ink">{s.value}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- Admin feed ---------- */

/** "Today 11:20", "Yesterday", "Wed 14 Oct" (prototype `when`). */
export function feedWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const gap = Math.round((day(now) - day(at)) / 86_400_000);
  if (gap === 0) return `Today ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (gap === 1) return 'Yesterday';
  return `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/** "What admins did": the person, the full sentence, and when. */
export function AdminFeedList({
  rows,
}: {
  rows: Array<{ id: string; at: string; actor: string | null; label: string; href: string | null }>;
}) {
  return (
    <ul>
      {rows.map((f) => {
        const body = (
          <>
            <span className="mt-0.5 flex-none">
              <PersonAvatar name={f.actor ?? 'System'} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] leading-snug text-ink">{f.label}</span>
              <span className="block text-[12.5px] text-ink-muted">
                {f.actor ?? 'System'} · {feedWhen(f.at)}
              </span>
            </span>
          </>
        );
        const cls = 'flex items-start gap-3 border-t border-line-soft px-4 py-3 md:px-5';
        return (
          <li key={f.id} className="[&:first-child>*]:border-t-0">
            {f.href ? (
              <Link href={f.href} className={cn(cls, 'transition-colors hover:bg-hover')}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Page states ---------- */

/** Loading shapes for a super admin page (R-48). */
export function SuperPageSkeleton({ label }: { label: string }) {
  // Each card keeps its shape (a head and grey rows), so the page does not jump when it lands.
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label={label}>
      {[6, 3].map((rows, i) => (
        <div key={i} className="surface overflow-hidden" aria-hidden>
          <div className="flex h-[52px] items-center gap-2.5 border-b border-line-soft px-4">
            <span className="block h-7 w-7 animate-pulse rounded-md bg-surface-sunken" />
            <span className="block h-3.5 w-40 animate-pulse rounded bg-surface-sunken" />
          </div>
          <SkeletonRows rows={rows} className="p-3" />
        </div>
      ))}
    </div>
  );
}

/** A failed read, with the retry. */
export function SuperPageError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <EmptyState
      title={
        <span className="flex flex-col gap-1">
          <span className="font-medium text-ink">{title}</span>
          <span className="text-[13px]">{error instanceof Error ? error.message : 'Something went wrong.'}</span>
        </span>
      }
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/** The page head (R-09): a screen-reader heading and, when the page has them, its actions. */
export function SuperPageHead({ title, meta, children }: { title: string; meta?: ReactNode; children?: ReactNode }) {
  // R-09: no visible page title; the top bar crumb names the page. The heading stays for screen
  // readers, and the page's own actions keep their row on the right.
  return (
    <>
      <h1 className="sr-only">
        {title}
        {typeof meta === 'string' ? ` · ${meta}` : null}
      </h1>
      {children ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div> : null}
    </>
  );
}
