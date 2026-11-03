'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { STATE_TILES, TILE_COLS, TILE_ROWS } from '@/data/labour-registers/tile-grid';

/**
 * The state picker, drawn as a tile grid.
 *
 * Why tiles rather than an outline of India is argued in `src/data/labour-registers/tile-grid.ts`
 * and in `docs/context/notes/labour-registers.md`. The short of it: no boundary is depicted, so
 * there is nothing to draw wrongly, and every state is the same size, so the small ones are
 * reachable.
 *
 * Accessibility. The grid is a list of links, so it is already keyboard reachable and reads in
 * document order; it does not take `role="application"`, which would take the virtual cursor
 * away from a screen reader. State is carried three ways — fill, a hatch pattern and the text
 * in the tile's label — so nothing depends on colour alone. The caller is expected to render a
 * plain list of the same states beside it; the two stay in step because both read this data.
 */

/** What a tile says about its state. */
export interface TileState {
  code: string;
  /** How many registers are due in the chosen period. */
  count?: number;
  /** Whether the firm has a form catalogue for it yet. */
  configured: boolean;
  /** Whether this client actually has an establishment there. */
  relevant?: boolean;
  /** One of the six status words, when the state has work in it. */
  status?: string;
}

export interface StateTileGridProps {
  states: TileState[];
  /** The state currently chosen. */
  selected?: string;
  /** Builds the link for a tile. */
  href: (code: string) => string;
  /**
   * Show only the states this client has an establishment in, at full strength, and fade the
   * rest to a ground. A client with one establishment should not hunt through thirty-six tiles.
   */
  focusRelevant?: boolean;
  className?: string;
}

function toneFor(tile: TileState, isSelected: boolean): string {
  if (isSelected) return 'bg-brand text-white border-brand';
  if (!tile.configured) return 'bg-surface-raised text-ink-faint border-line';
  if (tile.status === 'Overdue') return 'bg-danger-soft text-danger border-danger-mid';
  if (tile.status === 'Due soon') return 'bg-warning-soft text-warning border-warning-mid';
  if (tile.status === 'Done') return 'bg-positive-soft text-positive border-positive-mid';
  return 'bg-reg-labour/10 text-ink border-reg-labour/40';
}

export function StateTileGrid({ states, selected, href, focusRelevant = false, className }: StateTileGridProps) {
  const byCode = new Map(states.map((s) => [s.code, s]));

  return (
    <div className={cn('w-full', className)}>
      {/* A hatch for "not configured", so the state is readable without colour. */}
      <svg aria-hidden="true" className="absolute size-0" focusable="false">
        <defs>
          <pattern id="lr-tile-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.5" opacity="0.22" />
          </pattern>
        </defs>
      </svg>

      <ul
        className="grid list-none gap-1"
        style={{
          gridTemplateColumns: `repeat(${TILE_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${TILE_ROWS}, minmax(0, 1fr))`,
        }}
      >
        {STATE_TILES.map((tile) => {
          const state = byCode.get(tile.code) ?? { code: tile.code, configured: false };
          const isSelected = selected === tile.code;
          const dimmed = focusRelevant && !state.relevant;
          const reachable = state.configured && !dimmed;

          const label = [
            tile.name,
            state.configured ? null : 'not configured',
            dimmed ? 'no establishment here' : null,
            state.count !== undefined && reachable ? `${state.count} registers` : null,
            state.status && reachable ? state.status : null,
          ]
            .filter(Boolean)
            .join(', ');

          const body = (
            <>
              <span className="font-mono text-[10px] font-medium leading-none">{tile.short}</span>
              {state.count !== undefined && reachable ? (
                <span className="mt-0.5 text-[11px] font-medium leading-none tabular-nums">{state.count}</span>
              ) : null}
              {!state.configured ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-bar text-ink"
                  style={{ background: 'url(#lr-tile-hatch)' }}
                />
              ) : null}
            </>
          );

          const shell = cn(
            'relative flex aspect-square flex-col items-center justify-center rounded-bar border-[1.5px] transition-colors',
            toneFor(state, isSelected),
            dimmed && 'opacity-40',
          );

          return (
            <li key={tile.code} style={{ gridRow: tile.row, gridColumn: tile.col }}>
              {reachable ? (
                <Link
                  href={href(tile.code)}
                  aria-label={label}
                  aria-current={isSelected ? 'page' : undefined}
                  title={label}
                  className={cn(shell, 'hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand')}
                >
                  {body}
                </Link>
              ) : (
                <span className={shell} aria-label={label} title={label} role="img">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The legend, kept beside the grid so the colours are never the only explanation. */
export function StateTileLegend({ className }: { className?: string }) {
  const items: Array<{ label: string; className: string }> = [
    { label: 'Selected', className: 'bg-brand border-brand' },
    { label: 'Registers due', className: 'bg-reg-labour/10 border-reg-labour/40' },
    { label: 'Overdue', className: 'bg-danger-soft border-danger-mid' },
    { label: 'Not configured', className: 'bg-surface-raised border-line' },
  ];
  return (
    <ul className={cn('flex list-none flex-wrap gap-x-3 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span aria-hidden="true" className={cn('size-2.5 rounded-bar border-[1.5px]', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
