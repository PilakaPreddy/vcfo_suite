'use client';

import Link from 'next/link';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  Award,
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Gauge,
  KeyRound,
  ListChecks,
  MessageSquareWarning,
  Rocket,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClientLocaleNowLabel } from '@/hooks/use-client-locale-date';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import { surfaceCssVars } from '@/lib/shell/shell-appearance';
import { CARD_HEAD_ICONS } from '@/components/common/CardHeadTile';
import { tileIconName, type TileIconName } from '@/lib/ui/card-head-icon';

/**
 * THE home card (VCFO Spectrum "H3 tight", rules R-17 and R-18, owner decision D-17). One
 * component, one look, every dashboard: lead, manager, firm admin, super admin, developer and
 * client all render this. About 160px tall on the colour wash, in two rows:
 *   1. The greeting at 22px with the live date on the same line (staff), or the 36px company
 *      tile, the name, the stage tag and the step count (client, through `lead`, `stage` and
 *      `steps`). The scope switch (`scope`) and the actions (children) sit on the right. The
 *      card has no settings button (the prototype has none): the skin, sidebar and motion
 *      settings live in Profile > Appearance, and the card reads the skin from there. On a phone the client name
 *      takes the first line and the rest share the second (M-30).
 *   2. The number tiles (KP1 on the wash): a 14px icon and 12.5px label, the number at 22px, a
 *      12px note, and a 64 x 26 trend line beside the number when `trend` is given (48 x 22 on
 *      phones). Tiles sit in a grid with a 170px minimum; on a phone they go two in a row and an
 *      odd last tile spans both columns as one short line. A tile with `href` is a link to the
 *      list behind it (E-05), `onClick` opens a drill instead, and `how` shows a white "How is
 *      this counted?" card on hover and focus (E-04).
 *
 * The headline numbers belong in those tiles. Do not add a band of metric cards under the
 * card: it prints the same numbers twice. The old progress ring is shown as one more tile,
 * so callers that pass `ring` keep the information without the decoration.
 */

export type DashHeroStat = {
  label: string;
  value: number | string;
  /** The 14px glyph before the label. By default it comes from the label (`tileIconName`). */
  icon?: LucideIcon;
  /** Small text right after the number: "/ 6", "+2", "−3", "+4 pts". */
  of?: string;
  href?: string;
  /** Opens a drill or panel instead of a page (client home). Ignored when `href` is set. */
  onClick?: () => void;
  /** Paint the value in the danger colour when it demands attention. */
  hot?: boolean;
  /** Paint the value in the done colour (R-18). */
  good?: boolean;
  /** Short line under the number ("3 new today", "2 clients"). `note` wins when both are given. */
  sub?: string;
  /** Short line under the number. */
  note?: string;
  /** Trend line points, oldest first, the last one the live count. Drawn only with two or more points. */
  trend?: number[];
  /**
   * The tile has a trend line but no past values yet: a flat muted line with this short label
   * ("No history yet") is drawn instead, so every tile of a row keeps the same shape.
   */
  trendEmpty?: string;
  /** Trend colour; by default red for `hot`, green for `good`, blurple otherwise. */
  trendTone?: 'bad' | 'ok' | 'teal' | 'warn' | 'accent';
  /** A small share bar under the number, in percent. */
  bar?: number;
  /** E-04: one sentence on how the number is counted, shown in a white card on hover and focus. */
  how?: string;
};

const TREND: Record<NonNullable<DashHeroStat['trendTone']>, string> = {
  bad: 'text-danger-mid',
  ok: 'text-positive-mid',
  teal: 'text-waiting-mid',
  warn: 'text-warning-mid',
  accent: 'text-brand',
};

/** The tile glyphs beyond the card-head set (prototype home tiles). */
const TILE_ICONS: Record<Exclude<TileIconName, keyof typeof CARD_HEAD_ICONS>, LucideIcon> = {
  building: Building2,
  rocket: Rocket,
  'list-checks': ListChecks,
  'calendar-days': CalendarDays,
  'calendar-check': CalendarCheck,
  'check-check': CheckCheck,
  'check-circle': CheckCircle2,
  'circle-alert': CircleAlert,
  'message-warning': MessageSquareWarning,
  award: Award,
  key: KeyRound,
  gauge: Gauge,
  'trending-up': TrendingUp,
  trophy: Trophy,
  'circle-dashed': CircleDashed,
};

function tileIcon(label: string): LucideIcon {
  const name = tileIconName(label);
  return name in CARD_HEAD_ICONS
    ? CARD_HEAD_ICONS[name as keyof typeof CARD_HEAD_ICONS]
    : TILE_ICONS[name as keyof typeof TILE_ICONS];
}

export function DashHero({
  title,
  meta,
  subtitle,
  stats,
  ring,
  lead,
  stage,
  steps,
  scope,
  children,
}: {
  /** The big line: a greeting, or the company's name on the client home. */
  title: string;
  /** Extra chips after the date on the first row. */
  meta?: ReactNode;
  /** Small text after the title row's date (scope, state, who owns it). */
  subtitle?: ReactNode;
  stats?: DashHeroStat[];
  /** Shown as one more number tile (no ring is drawn). */
  ring?: { value: number; total?: number; caption: string; display?: string };
  /** Client home: the company tile before the name (see `DashHeroCompanyTile`). The date is not shown then. */
  lead?: ReactNode;
  /** Client home: the stage chip after the name. */
  stage?: ReactNode;
  /** Client home: the step count after the stage chip ("6 of 25 steps"). */
  steps?: ReactNode;
  /** The scope switch (All / Incorporating / Compliance), on the right of the first row (D-17). */
  scope?: ReactNode;
  /** The main action, on the right of the first row. */
  children?: ReactNode;
  /**
   * Kept so older callers still compile. The card no longer shows a settings button (the
   * prototype has none); every setting it held is in Profile > Appearance.
   * @deprecated
   */
  settings?: boolean;
}) {
  /* The old ring becomes the last number, unless a stat already shows it. A "% complete"
     caption reads "Complete" with the value as a percentage. */
  const ringStat: DashHeroStat | null = ring
    ? ring.caption.trim().startsWith('%')
      ? { label: sentence(ring.caption.replace('%', '')), value: `${ring.display ?? ring.value}%`, good: true }
      : { label: sentence(ring.caption), value: ring.display ?? ring.value, good: true }
    : null;
  const repeats = ringStat && (stats ?? []).some((st) => st.label.trim().toLowerCase() === ringStat.label.toLowerCase());
  const strip: DashHeroStat[] = [...(stats ?? []), ...(ringStat && !repeats ? [ringStat] : [])];
  /* The skin from Profile > Appearance: the colour wash by default, or a photo under a veil. */
  const { hero } = useShellAppearance();
  const skin = hero.image ? (surfaceCssVars(hero, 'hero') as CSSProperties) : undefined;
  const actions =
    scope || children ? (
      <div className={cn('flex flex-wrap items-center gap-2 sm:gap-2.5', lead && 'ml-auto')}>
        {scope}
        {children}
      </div>
    ) : null;

  return (
    <section style={skin} data-hero-image={hero.image ? 'true' : undefined} className="bg-wash flex flex-col gap-3 rounded-md border border-line px-4 pb-4 pt-3.5 md:px-5" aria-label="Summary">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {lead ? (
          // M-30: on a phone the name takes the first line; the chip, step count and actions share the second.
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-2 sm:gap-x-3">
            <span className="flex min-w-0 max-w-full items-center gap-3 max-sm:basis-full">
              {lead}
              <h1 className="min-w-0 truncate text-[22px] font-medium leading-7 tracking-[-0.01em] text-ink">{title}</h1>
            </span>
            {stage}
            {steps ? <span className="whitespace-nowrap text-[12.5px] text-wash-ink-2">{steps}</span> : null}
            {meta ? <span className="flex items-center gap-2 text-[12.5px] text-wash-ink-2">{meta}</span> : null}
            {subtitle ? <span className="flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-wash-ink-2">{subtitle}</span> : null}
            {actions}
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-[1_1_300px] flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="min-w-0 truncate whitespace-nowrap text-[22px] font-medium leading-7 tracking-[-0.01em] text-ink">{title}</h1>
              <span className="whitespace-nowrap text-[12.5px] text-wash-ink-2">
                <ClientLocaleNowLabel />
              </span>
              {meta ? <span className="flex items-center gap-2 self-center text-[12.5px] text-wash-ink-2">{meta}</span> : null}
              {subtitle ? <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-wash-ink-2">{subtitle}</span> : null}
            </div>
            {actions}
          </>
        )}
      </div>

      {strip.length > 0 ? (
        <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={200}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
            {strip.map((stat, i) => (
              <WashTile key={stat.label} stat={stat} strip={strip.length % 2 === 1 && i === strip.length - 1} />
            ))}
          </div>
        </TooltipPrimitive.Provider>
      ) : null}
    </section>
  );
}

/**
 * R-18 (home card tile): KP1 on the wash. A 14px icon and 12.5px label, the number at 22px, a
 * 12px note, and a 64 x 26 trend line beside the number when given (48 x 22 on phones).
 * `strip` is the odd last tile on a phone: it spans both columns as one short line (M-30).
 */
function WashTile({ stat, strip }: { stat: DashHeroStat; strip?: boolean }) {
  const note = stat.note ?? stat.sub;
  const label = capFirst(stat.label);
  const tone = stat.trendTone ?? (stat.hot ? 'bad' : stat.good ? 'ok' : 'accent');
  const glyph = createElement(stat.icon ?? tileIcon(stat.label), {
    width: 14,
    height: 14,
    strokeWidth: 1.6,
    className: 'flex-none text-ink-muted',
    'aria-hidden': true,
  });
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-ink-2">
        {glyph}
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('flex min-w-0 items-start gap-2 sm:gap-2.5', strip && 'max-sm:flex-none')}>
        <span className={cn('flex min-w-0 flex-1 flex-col gap-1', strip && 'max-sm:flex-row max-sm:items-baseline max-sm:gap-2')}>
          <b
            className={cn(
              'whitespace-nowrap text-[22px] font-medium leading-none tabular-nums',
              strip && 'max-sm:text-[18px]',
              stat.hot ? 'text-danger' : stat.good ? 'text-positive' : 'text-ink',
            )}
          >
            {stat.value}
            {stat.of ? <small className="ml-1 text-[13px] font-medium text-ink-muted">{stat.of}</small> : null}
          </b>
          {stat.bar !== undefined ? (
            <span className="block h-1 w-full max-w-[96px] overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
              <i className="block h-full rounded-bar bg-positive-mid" style={{ width: `${Math.max(0, Math.min(100, stat.bar))}%` }} />
            </span>
          ) : null}
          {note ? <span className="truncate text-[12px] text-ink-muted">{note}</span> : null}
        </span>
        {stat.trend && stat.trend.length > 1 ? (
          // A line that never leaves zero carries no alarm, so it is muted, not red.
          <TrendLine points={stat.trend} className={cn(stat.trend.every((v) => v === 0) ? 'text-ink-faint' : TREND[tone], strip && 'max-sm:hidden')} />
        ) : stat.trendEmpty ? (
          <span className={cn('flex flex-none flex-col items-end gap-0.5 self-end', strip && 'max-sm:hidden')} title={stat.trendEmpty}>
            <svg viewBox="0 0 64 26" className="h-[14px] w-12 text-line-strong sm:w-16" aria-hidden>
              <line x1="2" y1="13" x2="62" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="3 3" />
            </svg>
            <span className="whitespace-nowrap text-[10.5px] leading-none text-ink-faint">{stat.trendEmpty}</span>
          </span>
        ) : null}
      </span>
    </>
  );
  const cls = cn(
    'wash-tile flex min-w-0 flex-col gap-1 px-3 py-2.5 text-left sm:px-3.5',
    strip && 'max-sm:col-span-2 max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:py-2',
    (stat.href || stat.onClick) &&
      'transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25',
  );
  const aria = `${label}: ${stat.value}${stat.of ? ` ${stat.of}` : ''}${note ? `, ${note}` : ''}. Open the list`;
  const tile = stat.href ? (
    <Link href={stat.href} className={cls} aria-label={aria}>
      {inner}
    </Link>
  ) : stat.onClick ? (
    <button type="button" onClick={stat.onClick} className={cls} aria-label={aria}>
      {inner}
    </button>
  ) : (
    // A tile with `how` takes focus so keyboard users can open its info card; it does nothing on activation.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={cls} tabIndex={stat.how ? 0 : undefined}>
      {inner}
    </div>
  );
  if (!stat.how) return tile;
  // E-04 (TP2): a white card says how the number is counted and, for a link, that it opens the list (E-05).
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{tile}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[260px] rounded-md border-1.5 border-line bg-surface-raised px-3 py-2.5 text-[13px] text-ink shadow-float"
        >
          <b className="block text-[12px] font-medium text-ink-muted">How is this counted?</b>
          <span className="mt-0.5 block leading-snug">{stat.how}</span>
          {stat.href || stat.onClick ? (
            <span className="mt-1.5 block text-[12px] font-medium text-brand-text">Click to open the list</span>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** 64 x 26 trend line (48 x 22 on phones) with a soft area and a dot on the last point. */
function TrendLine({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const xy = points.map((p, i) => [2 + (i / (points.length - 1)) * 60, 22 - ((p - min) / (max - min || 1)) * 18] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = xy[xy.length - 1]!;
  return (
    <svg viewBox="0 0 64 26" className={cn('mb-0.5 h-[22px] w-12 flex-none self-end sm:h-[26px] sm:w-16', className)} aria-hidden>
      <path d={`M2,26 L${line.split(' ').join(' L')} L62,26 Z`} fill="currentColor" fillOpacity=".14" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" />
    </svg>
  );
}

/**
 * The client home's 36px company tile (R-17): a 6px square with the company's initials in
 * blurple text on the soft blurple ground (13px, weight 700), or its logo when there is one.
 * Pass it as `lead`.
 */
export function DashHeroCompanyTile({ name, src }: { name: string; src?: string | null }) {
  const initials =
    name
      .replace(/\b(private|pvt|limited|ltd|llp|inc|india)\b\.?/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || name.slice(0, 1).toUpperCase();
  return (
    <span
      className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-md bg-brand-soft text-[13px] font-bold text-brand-text"
      aria-hidden
    >
      {src ? (
        // A company logo from our own storage, not a remote CDN, so <img> is correct.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

const STAGE_TONE = {
  done: 'bg-positive-soft text-positive',
  accent: 'bg-brand-soft text-brand-text',
  warn: 'bg-warning-soft text-warning',
  idle: 'bg-upcoming-soft text-upcoming',
} as const;

/**
 * The client home's stage tag after the name (R-17): a 20px soft tag at 11.5px with no dot.
 * Green "Incorporated" (`tone="done"`) or blurple "Incorporating" (`tone="accent"`). Pass it as `stage`.
 */
export function DashHeroStage({ children, tone = 'accent' }: { children: ReactNode; tone?: keyof typeof STAGE_TONE }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 flex-none items-center whitespace-nowrap rounded-md px-2 text-[11.5px] font-medium',
        STAGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Sentence case for a label that arrives in lower case ("projects" becomes "Projects"). */
function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "DONE TODAY" or "done today" becomes "Done today" for the strip label. */
function sentence(s: string): string {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
