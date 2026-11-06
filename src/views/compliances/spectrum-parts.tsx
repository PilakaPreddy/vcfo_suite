'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { DashDonut, DashSection } from '@/components/dash/DashSection';
import { AreaPill, Chip } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import type { FilingStatus } from '@/lib/compliance/filings';
import {
  CHART_STATUSES,
  FILING_SHOWN, FILING_WORD,
  SIX_TONE,
  STATUS_FILL,
  STATUS_STROKE,
  STATUS_TILE,
  tileParts,
  type SixWord,
} from '@/lib/compliance/spectrum-status';
import { exactDate } from '@/lib/relative-due';

/**
 * Small Spectrum pieces shared by the staff compliance screens (Calendar,
 * Filings, Obligations, Registrations). They are compositions of the shared
 * parts (`Chip`, `DashSection`, `DashDonut`), not new primitives: a status
 * chip that speaks the six words, the 44px date tile, the status donut card,
 * the number strip that filters a table, and the rail list and flow cards.
 */

/** R-13 status chip with one of the six words. */
export function WordChip({ word, fixed = true, className, filing }: { word: SixWord; /** Say Filed and Upcoming. */ filing?: boolean; fixed?: boolean; className?: string }) {
  return (
    <Chip tone={SIX_TONE[word]} fixed={fixed} className={className}>
      {filing ? FILING_SHOWN[word] : word}
    </Chip>
  );
}

/** A compact status chip for rails and calendar days: the dot and the word, no fixed width. */
export function CompactChip({ word }: { word: SixWord }) {
  return (
    <Chip tone={SIX_TONE[word]} className="h-5 min-w-0 gap-1.5 px-1.5 text-[11.5px]">
      {word}
    </Chip>
  );
}

/** 44px date tile: the day over the short month, in the status colour. */
export function DateTile({
  iso,
  status,
  accent = false,
  className,
}: {
  iso: string;
  status: FilingStatus;
  /** Filings and Obligations bands (B-06): a later filing takes the soft blurple tile, not the grey one. */
  accent?: boolean;
  className?: string;
}) {
  const { day, month } = tileParts(iso);
  return (
    <span
      className={cn(
        'inline-flex h-11 w-11 flex-none flex-col items-center justify-center rounded-md leading-none',
        accent && status === 'upcoming' ? BAND_UPCOMING_TILE : STATUS_TILE[status],
        className,
      )}
      aria-label={`Due ${day} ${month}`}
      title={exactDate(iso)}
    >
      <b className="text-[16px] font-medium">{day}</b>
      <span className="mt-[3px] text-[10.5px] font-medium uppercase tracking-[.06em]">{month}</span>
    </span>
  );
}

/** The soft blurple tile of a later filing on a register band (prototype `DateTone` "accent"). */
const BAND_UPCOMING_TILE = 'bg-brand-soft text-brand-text';

/** "3 of 5 filed" with an 8px green bar (G1). The track is white because the band under it is grey. */
export function FiledBar({ filed, total, className }: { filed: number; total: number; className?: string }) {
  const pct = total ? Math.round((filed / total) * 100) : 0;
  return (
    <span className={cn('flex w-[190px] items-center gap-2.5', className)}>
      <span className="whitespace-nowrap text-[12.5px] text-ink-muted">
        {filed} of {total} filed
      </span>
      <span
        className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-bar bg-surface-raised"
        role="progressbar"
        aria-label={`${filed} of ${total} filed`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i className="absolute inset-y-0 left-0 rounded-bar bg-positive-mid" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/**
 * The band over one filing's client rows (prototype `FilingBand`): the date tile, the name and
 * its due line, the area pill and the "x of y filed" bar. Shared by the staff Filings and
 * Obligations lists so both bands look the same. It wraps on a phone.
 */
export function FilingBand({
  iso,
  status,
  name,
  sub,
  area,
  filed,
  total,
}: {
  iso: string;
  status: FilingStatus;
  name: ReactNode;
  sub: ReactNode;
  area: string;
  filed: number;
  total: number;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-2">
      <DateTile iso={iso} status={status} accent />
      <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
        <span className="truncate text-[14.5px] font-medium text-ink">{name}</span>
        <span className="text-[12.5px] text-ink-muted">{sub}</span>
      </span>
      <AreaPill area={area} />
      <FiledBar filed={filed} total={total} />
    </span>
  );
}

/** The 8px square swatch before a legend word. */
export function Swatch({ className }: { className: string }) {
  return <i className={cn('h-2 w-2 flex-none rounded-[2px]', className)} aria-hidden />;
}

/** Status donut (R-25 C1): the four register statuses with a legend. */
export function StatusDonutCard({
  counts,
  caption,
  label,
}: {
  counts: Record<FilingStatus, number>;
  caption: string;
  label: string;
}) {
  const total = CHART_STATUSES.reduce((n, s) => n + counts[s], 0);
  return (
    <section className="surface flex items-center gap-4 px-4 py-3" aria-label={label}>
      <DashDonut
        size={88}
        centerLabel={total}
        centerCaption={caption}
        segments={
          total
            ? CHART_STATUSES.map((s) => ({ n: counts[s], color: STATUS_STROKE[s] }))
            : [{ n: 1, color: 'oklch(var(--line-soft))' }]
        }
      />
      <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
        {CHART_STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
            <Swatch className={STATUS_FILL[s]} />
            <span className="flex-1">{FILING_SHOWN[FILING_WORD[s]]}</span>
            <b className="font-medium tabular-nums text-ink">{counts[s]}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface StripItem {
  key: string;
  label: string;
  value: number;
  Icon: LucideIcon;
  /** Text colour of the number when it is above zero. */
  valueClass?: string;
  /** A muted line under the number ("3 filings · 2 clients", "by Thu 15 Oct"). */
  sub?: string;
}

/**
 * R-18 number tiles that filter the table below. A click sets the filter, a
 * second click clears it; the picked tile has a blurple edge.
 */
export function FilterStrip({ items, value, onChange }: { items: StripItem[]; value: string; onChange: (key: string) => void }) {
  return (
    <div role="group" aria-label="Filter by state" className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {items.map((s, i) => {
        const on = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? '' : s.key)}
            className={cn(
              'flex min-w-0 flex-col gap-1.5 rounded-md border-1.5 bg-surface-raised px-4 pb-3.5 pt-4 text-left transition-colors',
              on ? 'border-brand shadow-[0_0_0_3px_oklch(var(--brand-soft))]' : 'border-line hover:border-line-strong',
              i === items.length - 1 && items.length % 2 === 1 && 'col-span-2 md:col-span-1',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-ink-2">
              <s.Icon className="h-[15px] w-[15px] flex-none text-ink-muted" strokeWidth={1.6} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className={cn('text-[26px] font-medium leading-none tracking-[-0.01em] tabular-nums text-ink', s.value > 0 && s.valueClass)}>
              {s.value}
            </span>
            {s.sub ? <span className="truncate text-[12.5px] text-ink-muted" title={s.sub}>{s.sub}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The count badge after a card title. */
export function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 items-center rounded-sm bg-brand-soft px-1.5 text-[12px] font-medium text-brand-text">{n}</span>
  );
}

export interface RailItem {
  key: string;
  title: string;
  sub: string;
  right?: ReactNode;
  rightClass?: string;
  href?: string;
}

/** Rail card: full-width rows with a title, a client line and a date or chip on the right. */
export function RailCard({ title, items, empty = 'None' }: { title: string; items: RailItem[]; empty?: string }) {
  return (
    <DashSection title={title} meta={<CountBadge n={items.length} />} bodyClassName="p-0">
      {items.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-ink-faint">{empty}</p>
      ) : (
        <ul>
          {items.map((x) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-medium text-ink">{x.title}</b>
                  <span className="block truncate text-[12px] text-ink-muted">{x.sub}</span>
                </span>
                {x.right ? <span className={cn('flex-none whitespace-nowrap text-[13px]', x.rightClass ?? 'text-ink-2')}>{x.right}</span> : null}
              </>
            );
            return (
              <li key={x.key} className="border-t border-line-soft first:border-t-0">
                {x.href ? (
                  <Link href={x.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-sunken/60">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashSection>
  );
}

/** Boxes with a chevron between: the progress flow of the work in view. */
export function FlowCard({ title, steps }: { title: string; steps: Array<{ label: string; value: number }> }) {
  return (
    <DashSection title={title} bodyClassName="px-3 py-4">
      <div className="flex items-stretch">
        {steps.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 ? <ChevronRight className="h-2.5 w-2.5 flex-none self-center text-ink-faint" strokeWidth={1.6} aria-hidden /> : null}
            <div className="grid min-w-0 flex-1 place-items-center content-center gap-0.5 rounded-md bg-surface-sunken px-0.5 py-2.5 text-center">
              <b className="text-[18px] font-medium tabular-nums text-ink">{s.value}</b>
              <span className="text-[11px] leading-tight text-ink-muted">{s.label}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </DashSection>
  );
}

/** A labelled fact for a record head: a muted key over a 15px value. */
export function Fact({ k, children, className }: { k: string; children: ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <em className="block text-[12.5px] not-italic text-ink-muted">{k}</em>
      <b className={cn('block whitespace-nowrap text-[15px] font-medium text-ink', className)}>{children}</b>
    </div>
  );
}

/** A short text card of the record rail: About, Why it applies, If filed late, Renewal. */
export function TextCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DashSection title={title}>
      <div className="grid gap-2 text-[13.5px] leading-relaxed text-ink-2">{children}</div>
    </DashSection>
  );
}

/**
 * The 52 px head ring of a record (prototype `RecordHead` ring): the share done in the status
 * colour, with "✓" when everything is done, "-3d" when it is late, or "n/m" otherwise.
 */
export function HeadRing({ done, total, lateDays = 0, label }: { done: number; total: number; lateDays?: number; label: string }) {
  const size = 52;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;
  const late = !complete && lateDays > 0;
  const tone = complete ? 'text-positive' : late ? 'text-danger' : 'text-brand-text';
  const center = complete ? '✓' : late ? `-${lateDays}d` : `${done}/${total}`;
  return (
    <span role="img" aria-label={label} className={cn('relative inline-grid flex-none place-items-center', tone)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.16} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - share * c}
        />
      </svg>
      <span className="absolute text-[13px] font-medium tabular-nums" aria-hidden>
        {center}
      </span>
    </span>
  );
}
