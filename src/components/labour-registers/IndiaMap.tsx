'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { INDIA_OUTLINE, OUTLINE_VIEWBOX } from '@/data/labour-registers/india-outline';

/**
 * The jurisdiction picker, drawn as a map of India.
 *
 * The geometry, its licence and what it does and does not depict are documented in
 * `src/data/labour-registers/india-outline.ts`. Read that before changing anything here: the
 * external boundary is the part with legal weight, and it is correct in the source.
 *
 * Accessibility is why this is a list of links over the paths rather than a bare `<svg>` full
 * of click handlers. Small states cannot be hit reliably with a pointer — Delhi, Goa, Sikkim,
 * Puducherry and the islands are a few pixels across at any sane page size — so each one also
 * gets a marker, and the caller renders a plain list of the same states beside the map. Both
 * read the same rows, so they cannot disagree. The `<svg>` itself is `aria-hidden`; the links
 * carry the labels.
 */

export interface MapState {
  code: string;
  /** Registers due in the chosen period. */
  count?: number;
  /** Whether the firm has a form catalogue for it. */
  configured: boolean;
  /** Whether this client has an establishment there. */
  relevant?: boolean;
  /** One of the six status words. */
  status?: string;
}

export interface IndiaMapProps {
  states: MapState[];
  selected?: string;
  href: (code: string) => string;
  /** Show only the client's own states at full strength. */
  focusRelevant?: boolean;
  className?: string;
}

/** Where to put a marker for a state too small to click. Source viewBox coordinates. */
const SMALL: Record<string, { x: number; y: number }> = {
  DL: { x: 186, y: 210 },
  CH: { x: 170, y: 176 },
  GA: { x: 150, y: 497 },
  SK: { x: 437, y: 236 },
  PY: { x: 226, y: 600 },
  LD: { x: 96, y: 585 },
  AN: { x: 536, y: 600 },
  DH: { x: 122, y: 404 },
  TR: { x: 487, y: 316 },
  ML: { x: 470, y: 290 },
  MN: { x: 516, y: 300 },
  MZ: { x: 497, y: 340 },
  NL: { x: 527, y: 277 },
};

function fillFor(state: MapState, isSelected: boolean, dimmed: boolean): string {
  if (isSelected) return 'oklch(54.6% 0.215 263)';
  if (dimmed || !state.configured) return 'oklch(96.8% 0.006 250)';
  if (state.status === 'Overdue') return 'oklch(96% 0.025 18)';
  if (state.status === 'Due soon') return 'oklch(96.8% 0.04 35)';
  return 'oklch(96.2% 0.04 200)';
}

function strokeFor(state: MapState, isSelected: boolean, dimmed: boolean): string {
  if (isSelected) return 'oklch(48.8% 0.217 264)';
  if (dimmed || !state.configured) return 'oklch(91.5% 0.012 255)';
  if (state.status === 'Overdue') return 'oklch(59% 0.19 18)';
  if (state.status === 'Due soon') return 'oklch(70% 0.16 35)';
  return 'oklch(50% 0.14 200)';
}

export function IndiaMap({ states, selected, href, focusRelevant = false, className }: IndiaMapProps) {
  const byCode = new Map(states.map((s) => [s.code, s]));

  return (
    <div className={cn('relative w-full', className)}>
      <svg viewBox={OUTLINE_VIEWBOX} className="block h-auto w-full" aria-hidden="true" focusable="false">
        <defs>
          {/* A hatch, so "not configured" is readable without colour. */}
          <pattern id="lr-map-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="oklch(55% 0.022 255)" strokeWidth="1.2" opacity="0.3" />
          </pattern>
        </defs>

        {INDIA_OUTLINE.map((region) => {
          const state = byCode.get(region.code) ?? { code: region.code, configured: false };
          const isSelected = selected === region.code;
          const dimmed = focusRelevant && !state.relevant;
          return (
            <g key={region.code}>
              {region.paths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={fillFor(state, isSelected, dimmed)}
                  stroke={strokeFor(state, isSelected, dimmed)}
                  strokeWidth={isSelected ? 2.2 : 0.9}
                  opacity={dimmed ? 0.5 : 1}
                />
              ))}
              {!state.configured || dimmed
                ? region.paths.map((d, i) => <path key={`h${i}`} d={d} fill="url(#lr-map-hatch)" stroke="none" />)
                : null}
            </g>
          );
        })}

        {/* A marker for each state too small to aim at. */}
        {Object.entries(SMALL).map(([code, at]) => {
          const state = byCode.get(code);
          if (!state?.configured) return null;
          const dimmed = focusRelevant && !state.relevant;
          if (dimmed) return null;
          return (
            <circle
              key={code}
              cx={at.x}
              cy={at.y}
              r={7}
              fill={selected === code ? 'oklch(54.6% 0.215 263)' : 'oklch(100% 0 0)'}
              stroke={selected === code ? 'oklch(48.8% 0.217 264)' : 'oklch(50% 0.14 200)'}
              strokeWidth={1.8}
            />
          );
        })}
      </svg>

      {/* The reachable layer: one link per state, over the drawing. */}
      <ul className="absolute inset-0 m-0 list-none p-0">
        {INDIA_OUTLINE.map((region) => {
          const state = byCode.get(region.code);
          if (!state?.configured) return null;
          const dimmed = focusRelevant && !state.relevant;
          if (dimmed) return null;
          const at = SMALL[region.code];
          const label = [
            region.name,
            state.count !== undefined ? `${state.count} registers` : null,
            state.status ?? null,
          ]
            .filter(Boolean)
            .join(', ');

          /* Small states get a positioned hit area of their own; the rest are reached through
             the list the caller renders beside the map, which is also the keyboard path. */
          if (!at) return null;
          return (
            <li
              key={region.code}
              className="absolute"
              style={{ left: `${(at.x / 612) * 100}%`, top: `${(at.y / 696) * 100}%`, transform: 'translate(-50%, -50%)' }}
            >
              <Link
                href={href(region.code)}
                aria-label={label}
                title={label}
                aria-current={selected === region.code ? 'page' : undefined}
                className="block size-11 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              >
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Map geometry:{' '}
        <a href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/india" className="underline">
          svg-maps/india
        </a>{' '}
        by Victor Cazanave,{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" className="underline">
          CC BY 4.0
        </a>
        . Modified: the two Daman and Diu shapes are served as one union territory, and the states are recoloured. The
        2019 division of Jammu and Kashmir and Ladakh is not in the source, so that region is offered as both.
      </p>
    </div>
  );
}

/** The legend. Colour is never the only explanation. */
export function IndiaMapLegend({ className }: { className?: string }) {
  const items = [
    { label: 'Selected', style: 'bg-brand border-brand' },
    { label: 'Registers due', style: 'bg-reg-labour/10 border-reg-labour/40' },
    { label: 'Overdue', style: 'bg-danger-soft border-danger-mid' },
    { label: 'Not configured', style: 'bg-surface-raised border-line' },
  ];
  return (
    <ul className={cn('flex list-none flex-wrap gap-x-3 gap-y-1.5', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span aria-hidden="true" className={cn('size-2.5 rounded-bar border-[1.5px]', i.style)} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
