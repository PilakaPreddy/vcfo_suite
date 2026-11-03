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

/*
 * The fills read from the feature's own tokens, so the map and the chips beside it cannot drift
 * apart. A configured state with nothing wrong is the register-green; a selected one is the
 * solid action blue; everything else is the canvas with a hairline, plus a hatch so the
 * distinction survives without colour.
 */
function fillFor(state: MapState, isSelected: boolean, dimmed: boolean): string {
  if (isSelected) return 'var(--lr-primary)';
  if (dimmed || !state.configured) return 'var(--lr-canvas)';
  if (state.status === 'Overdue') return 'var(--lr-bad-soft)';
  if (state.status === 'Due soon') return 'var(--lr-warn-soft)';
  return 'var(--lr-reg-soft)';
}

function strokeFor(state: MapState, isSelected: boolean, dimmed: boolean): string {
  if (isSelected) return 'var(--lr-primary-deep)';
  if (dimmed || !state.configured) return 'var(--lr-line)';
  if (state.status === 'Overdue') return 'var(--lr-bad)';
  if (state.status === 'Due soon') return 'var(--lr-warn)';
  return 'var(--lr-reg)';
}

export function IndiaMap({ states, selected, href, focusRelevant = false, className }: IndiaMapProps) {
  const byCode = new Map(states.map((s) => [s.code, s]));

  return (
    <div className={cn('relative w-full', className)}>
      <svg viewBox={OUTLINE_VIEWBOX} className="block h-auto w-full" aria-hidden="true" focusable="false">
        <defs>
          {/* A hatch, so "not configured" is readable without colour. It is kept faint on
              purpose: at the weight it first shipped at, the twenty-odd unconfigured states
              read as the subject of the drawing and the four live ones disappeared. */}
          <pattern id="lr-map-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--lr-line-2)" strokeWidth="1" opacity="0.5" />
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
                  strokeWidth={isSelected ? 2 : state.configured && !dimmed ? 1 : 0.8}
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
              fill={selected === code ? 'var(--lr-primary)' : 'var(--lr-surface)'}
              stroke={selected === code ? 'var(--lr-primary-deep)' : 'var(--lr-reg)'}
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
                className="block size-11 rounded-[var(--lr-radius-chip)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--lr-primary)]"
              >
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--lr-muted)]">
        Map geometry:{' '}
        <a href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/india" className="text-[var(--lr-primary)] underline">
          svg-maps/india
        </a>{' '}
        by Victor Cazanave,{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" className="text-[var(--lr-primary)] underline">
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
  const items: Array<{ label: string; fill: string; stroke: string }> = [
    { label: 'Selected', fill: 'var(--lr-primary)', stroke: 'var(--lr-primary-deep)' },
    { label: 'Registers due', fill: 'var(--lr-reg-soft)', stroke: 'var(--lr-reg)' },
    { label: 'Overdue', fill: 'var(--lr-bad-soft)', stroke: 'var(--lr-bad)' },
    { label: 'Not configured', fill: 'var(--lr-canvas)', stroke: 'var(--lr-line)' },
  ];
  return (
    <ul className={cn('flex list-none flex-wrap gap-x-3 gap-y-1.5', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[12px] text-[var(--lr-muted)]">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px] border-[1.5px]"
            style={{ background: i.fill, borderColor: i.stroke }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
