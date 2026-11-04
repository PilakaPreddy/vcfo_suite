'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type IconChipTone } from '@/components/common/IconChip';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { CardLoadBody } from '@/components/ui/card-load';
import { TAB_SWITCH_EVENT } from '@/components/ui/spectrum-tabs';
import { DonutRing } from '@/components/dash/charts';
import type { CardHeadTone } from '@/lib/ui/card-head-icon';

/**
 * Shared dashboard section card, every role (K-06, rules R-15 and R-16; prototype SectionCard): a
 * surface panel with a 52px head, a hairline under it, a 28px tinted icon tile that comes from the
 * title, a 15px/500 sentence-case title, 13px muted meta right after the title, and a `right`
 * slot (tabs, one button or a link) at the right end. The body has 16px padding (20px at the
 * sides from 768px); `flush` removes it for lists and tables. The `icon`, `tone` and `size` props
 * are still accepted so callers compile, but the tile follows the title so one kind of card
 * looks the same on every portal; `headIcon` overrides it on purpose.
 *
 * L1 (R-48): grey shapes cover the body while `loading` is true, and for 300ms after a
 * `SpectrumTabs` switch anywhere inside the card when `tabSkeleton` is on. It is off by default:
 * the shapes hide the content for 300ms, which no real load needs, so a card opts in.
 */
export function DashSection({
  title,
  meta,
  right,
  href,
  hrefLabel,
  headIcon,
  titleLead,
  flush,
  id,
  className,
  bodyClassName,
  loading,
  loadingVariant = 'rows',
  tabSkeleton = false,
  children,
}: {
  /** Kept for callers; the tile icon comes from the title. Use `headIcon` to override it. */
  icon?: LucideIcon;
  /** Kept for callers; the tile tone comes from the title. */
  size?: 'md' | 'lg';
  /** Kept for callers; the tile tone comes from the title. */
  tone?: IconChipTone;
  title: string;
  /** Small muted text right after the title (counts, scope). */
  meta?: ReactNode;
  /** The right end of the head: tabs, one button or a link. */
  right?: ReactNode;
  /** Head link ("Open ›"), at the right end after `right`. */
  href?: string;
  hrefLabel?: string;
  /** A different icon and tone for the head tile than the title gives. */
  headIcon?: { icon: LucideIcon; tone: CardHeadTone };
  /** A small element between the tile and the title: a client colour dot (R-35). */
  titleLead?: ReactNode;
  /** No body padding, for lists, grids and tables. */
  flush?: boolean;
  id?: string;
  className?: string;
  bodyClassName?: string;
  /** L1 (B-19): grey shapes cover the body while the card's data loads. Pass the real loading flag. */
  loading?: boolean;
  /** The shapes: list rows (default) or a summary block. */
  loadingVariant?: 'rows' | 'block';
  /** Show the shapes for 300ms after a tab switch inside the card (prototype L1). Off by default. */
  tabSkeleton?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !tabSkeleton) return;
    let timer: number | undefined;
    const onSwitch = () => {
      setSwitching(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSwitching(false), 300);
    };
    el.addEventListener(TAB_SWITCH_EVENT, onSwitch);
    return () => {
      el.removeEventListener(TAB_SWITCH_EVENT, onSwitch);
      window.clearTimeout(timer);
    };
  }, [tabSkeleton]);

  return (
    <section ref={ref} id={id} aria-label={title} className={cn('surface min-w-0 overflow-hidden', className)}>
      <div className="flex min-h-head min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title={title} icon={headIcon?.icon} tone={headIcon?.tone} />
        {titleLead}
        <h2 className="min-w-0 truncate text-[15px] font-medium text-ink">{title}</h2>
        {meta ? <span className="min-w-0 max-w-full truncate text-[13px] text-ink-muted">{meta}</span> : null}
        {right || href ? (
          <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
            {right}
            {href ? <HeadLink href={href}>{hrefLabel ?? 'Open'}</HeadLink> : null}
          </div>
        ) : null}
      </div>
      <CardLoadBody
        loading={loading || switching}
        variant={loadingVariant}
        className={cn(!flush && 'px-4 py-4 md:px-5', bodyClassName)}
      >
        {children}
      </CardLoadBody>
    </section>
  );
}

/** Small link in a card head: "Open ›" (13px, blurple). */
function HeadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline"
    >
      {children}
      <span aria-hidden>›</span>
    </Link>
  );
}

/**
 * Donut for small distributions (R-25 C1). The ring is 12px thick at 84px (scaled for other
 * sizes) with a 2° gap between parts; the total sits in the centre at 22px with the unit word
 * under it at 12px. For a donut with its legend built in, use `Donut` from `./charts`.
 */
export function DashDonut({
  segments,
  centerLabel,
  centerCaption,
  size = 84,
}: {
  segments: Array<{ n: number; className?: string; color?: string; onClick?: () => void }>;
  centerLabel: string | number;
  centerCaption: string;
  size?: number;
}) {
  return (
    <DonutRing
      size={size}
      thickness={Math.round((size * 12) / 84)}
      parts={segments.map((seg) => ({ value: seg.n, stroke: seg.color, className: seg.className, onClick: seg.onClick }))}
    >
      <b className={cn('font-medium leading-none text-ink', size >= 110 ? 'text-[26px]' : 'text-[22px]')}>{centerLabel}</b>
      <span className="mt-1 text-[12px] text-ink-muted">{centerCaption}</span>
    </DonutRing>
  );
}

/** Legend row next to a donut: 8px swatch, the label, the count right-aligned (13px ink-2). */
export function DashLegendRow({
  swatchClassName,
  label,
  count,
}: {
  swatchClassName: string;
  label: string;
  count: number;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
      <i className={cn('inline-block h-2 w-2 shrink-0 rounded-[2px]', swatchClassName)} aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
      <b className="ml-auto pl-3 font-medium tabular-nums text-ink">{count}</b>
    </span>
  );
}
