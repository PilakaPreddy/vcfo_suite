'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LR_TONES, type LrTone, lr, statusTone } from './theme';

/**
 * The parts the reference design is built out of.
 *
 * These are a deliberate fork of `DashHero`, `DashSection` and `Chip`, and the house rule says
 * never to fork a primitive — so here is the reason. The reference the owner supplied is a
 * different design system from Spectrum, not a variation on it: different action colour, card
 * radius, border weight, control height, chip sizing and font stack. A `variant` prop on the
 * shared components would carry all of that into every other screen's props and tempt the next
 * change into applying it there. Keeping the fork inside this folder confines it: nothing
 * outside `labour-registers/` imports any of it, and if the product ever moves to these values
 * wholesale, this file is deleted rather than untangled.
 *
 * Every colour comes from `theme.ts` through a custom property, so the fork is in the shapes
 * only — a decision to repaint happens in one place.
 */

type Icon = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;

/** The card: 12px radius, a single hairline, no shadow. */
export function LrCard({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  /** Tints the whole card, for the notices that are a card rather than a strip. */
  tone?: LrTone;
}) {
  return (
    <section
      className={cn(lr.card, className)}
      style={tone ? { background: LR_TONES[tone].soft } : undefined}
    >
      {children}
    </section>
  );
}

/** A card's header strip: tinted icon square, uppercase label, and whatever sits at the right. */
export function LrCardHead({
  icon: IconCmp,
  tone = 'blue',
  label,
  right,
  className,
}: {
  icon?: Icon;
  tone?: LrTone;
  label: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(lr.cardHead, className)}>
      {IconCmp ? (
        <span
          aria-hidden="true"
          className="flex size-7 flex-none items-center justify-center rounded-[var(--lr-radius-chip)]"
          style={{ background: LR_TONES[tone].soft, color: LR_TONES[tone].ink }}
        >
          <IconCmp className="size-4" strokeWidth={1.8} aria-hidden={true} />
        </span>
      ) : null}
      <h2 className={cn(lr.headLabel, 'm-0 min-w-0')}>{label}</h2>
      {right ? (
        <>
          <div className="flex-grow" />
          {right}
        </>
      ) : null}
    </div>
  );
}

/** A status chip. Content width, not the fixed 104 the shared one uses. */
export function LrChip({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  /** Left out, the tone is read from the word itself. */
  tone?: LrTone;
  className?: string;
}) {
  const t = tone ?? statusTone(typeof children === 'string' ? children : '');
  return (
    <span
      className={cn(lr.chip, 'flex-none whitespace-nowrap', className)}
      style={{ background: LR_TONES[t].soft, color: LR_TONES[t].ink }}
    >
      {children}
    </span>
  );
}

export interface LrStat {
  label: string;
  value: ReactNode;
  tone?: LrTone;
}

/** One figure in a tinted tile. The hero's row of them, and the batch screen's cache figures. */
export function LrStatTile({ label, value, tone = 'neutral' }: LrStat) {
  const t = LR_TONES[tone];
  return (
    <div
      className="min-w-[100px] rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] px-3.5 py-2"
      style={{ background: t.soft }}
    >
      <div className="text-[12px] font-medium leading-4" style={{ color: t.ink }}>
        {label}
      </div>
      <div
        className="text-[26px] font-bold leading-[34px] tabular-nums"
        style={{ color: tone === 'neutral' ? 'var(--lr-ink)' : t.ink }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The page's opening card: mono eyebrow, title, a line of explanation, then the figures.
 *
 * `action` sits beside the title on the batch screen and `stats` wraps below; on the picker the
 * figures sit beside the title. Both are the same card — the difference is only whether the
 * figures are given room, which `statsBeside` decides.
 */
export function LrHero({
  eyebrow,
  title,
  blurb,
  stats = [],
  action,
  statsBeside = true,
  className,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  stats?: LrStat[];
  action?: ReactNode;
  statsBeside?: boolean;
  className?: string;
}) {
  return (
    <LrCard className={cn('px-5 py-4', className)}>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
        <div className="min-w-0 flex-[999_1_340px]">
          {eyebrow ? <div className={lr.eyebrow}>{eyebrow}</div> : null}
          <h1 className={cn(lr.title, 'm-0 mt-1.5')}>{title}</h1>
          {blurb ? <p className="m-0 mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-[var(--lr-muted)]">{blurb}</p> : null}
        </div>
        {action ?? null}
        {statsBeside && stats.length ? (
          <div className="flex flex-wrap gap-2.5">
            {stats.map((s) => (
              <LrStatTile key={s.label} {...s} />
            ))}
          </div>
        ) : null}
      </div>
      {!statsBeside && stats.length ? (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {stats.map((s) => (
            <LrStatTile key={s.label} {...s} />
          ))}
        </div>
      ) : null}
    </LrCard>
  );
}

/**
 * A tinted strip of prose, with an icon.
 *
 * `inset` is for the strips that live inside a card and need its hairline above them; left out,
 * it is a card of its own, as the hybrid-regime notice is on the catalogue screen.
 */
export function LrBanner({
  icon: IconCmp,
  tone,
  children,
  inset = false,
  className,
}: {
  icon?: Icon;
  tone: LrTone;
  children: ReactNode;
  inset?: boolean;
  className?: string;
}) {
  const t = LR_TONES[tone];
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 px-5 py-3',
        inset
          ? 'border-t border-[var(--lr-raised)]'
          : 'rounded-[var(--lr-radius-card)] border border-[var(--lr-line)]',
        className,
      )}
      /* The colour sits on the wrapper so the icon's `currentColor` picks it up too. */
      style={{ background: t.soft, color: t.ink }}
    >
      {IconCmp ? (
        <IconCmp className="mt-0.5 size-4 flex-none" strokeWidth={1.8} aria-hidden={true} />
      ) : null}
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
