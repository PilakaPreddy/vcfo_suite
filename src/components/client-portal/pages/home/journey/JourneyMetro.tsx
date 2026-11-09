'use client';

/**
 * The journey as a metro map in plain SVG. Each stage under the selected stop is one coloured
 * line (Incorporation: Part A and Part B; Post-incorporation: its steps; Registration: one line
 * per kind; Compliance: one line per area) and its leaves are the stations. Done stations are
 * filled; the others are hollow. A train sits on the current station and rocks gently. The map
 * scrolls sideways in its own box on phones.
 */
import { m } from 'framer-motion';
import type { JNode } from './journey-model';
import { leavesOf } from './status';

const GAP = 64;
const ROW = 72;
const LEFT = 150;
const TOP = 40;
const LINE_CLS = ['stroke-data-1', 'stroke-data-2', 'stroke-data-3', 'stroke-data-4', 'stroke-data-5', 'stroke-data-6'];
const FILL_CLS = ['fill-data-1', 'fill-data-2', 'fill-data-3', 'fill-data-4', 'fill-data-5', 'fill-data-6'];

interface MetroLine {
  id: string;
  label: string;
  stations: JNode[];
}

/** The lines of a stop's node: one per child group, or one line of the node's own leaves. */
function metroLines(node: JNode): MetroLine[] {
  if (node.children.some((c) => c.children.length)) {
    return node.children.map((c) => ({ id: c.id, label: c.label, stations: leavesOf(c) }));
  }
  return [{ id: node.id, label: node.label, stations: node.children.length ? node.children : [node] }];
}

function short(label: string): string {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

function Train({ reduce }: { reduce: boolean }) {
  return (
    <m.g
      animate={reduce ? undefined : { rotate: [-4, 4, -4] }}
      transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ originX: '50%', originY: '100%' }}
    >
      <rect x={-12} y={-34} width={24} height={16} rx={4} className="fill-brand" />
      <rect x={-8} y={-31} width={7} height={6} rx={1.5} className="fill-surface-raised" />
      <rect x={1} y={-31} width={7} height={6} rx={1.5} className="fill-surface-raised" />
      <circle cx={-6} cy={-17} r={2} className="fill-ink" />
      <circle cx={6} cy={-17} r={2} className="fill-ink" />
    </m.g>
  );
}

export function JourneyMetro({
  node,
  currentPath,
  onSelect,
  reduce = false,
}: {
  /** The selected stop's node. */
  node: JNode;
  currentPath: string[];
  onSelect: (node: JNode) => void;
  reduce?: boolean;
}) {
  const lines = metroLines(node);
  const leafId = currentPath[currentPath.length - 1];
  const longest = Math.max(1, ...lines.map((l) => l.stations.length));
  const width = LEFT + (longest - 1) * GAP + 80;
  const height = TOP + lines.length * ROW;

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface-raised">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${node.label} metro map`} className="block">
        {lines.map((line, li) => {
          const y = TOP + li * ROW + 12;
          const stroke = LINE_CLS[li % LINE_CLS.length];
          const fill = FILL_CLS[li % FILL_CLS.length];
          const x0 = LEFT;
          const x1 = LEFT + Math.max(0, line.stations.length - 1) * GAP;
          return (
            <g key={line.id}>
              <text x={12} y={y + 4} className="fill-ink text-[12.5px] font-medium">
                {short(line.label)}
              </text>
              {line.stations.length > 1 ? <line x1={x0} y1={y} x2={x1} y2={y} strokeWidth={6} strokeLinecap="round" className={stroke} /> : null}
              {line.stations.map((s, si) => {
                const x = LEFT + si * GAP;
                const done = s.status === 'done';
                const here = s.id === leafId;
                return (
                  <g
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.label}${done ? ', done' : ''}`}
                    className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-brand"
                    onClick={() => onSelect(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(s);
                      }
                    }}
                  >
                    <title>{s.label}</title>
                    <circle cx={x} cy={y} r={14} fill="transparent" />
                    <circle cx={x} cy={y} r={here ? 8 : 6.5} strokeWidth={3} className={done ? `${fill} ${stroke}` : `fill-surface-raised ${stroke}`} />
                    {s.status === 'late' ? <circle cx={x} cy={y} r={2.5} className="fill-danger-mid" /> : null}
                    <text x={x} y={y + 26} textAnchor="middle" className={here ? 'fill-brand-text text-[11px] font-medium' : 'fill-ink-muted text-[11px]'}>
                      {s.n != null ? `${s.n}` : short(s.label)}
                    </text>
                    {here ? (
                      <g transform={`translate(${x} ${y})`}>
                        <Train reduce={reduce} />
                      </g>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
