'use client';

/**
 * The journey as an expandable tree, left to right, on a light canvas with no dependency: the
 * edges are one SVG, the nodes are HTML cards on top, and both sit in one transformed layer
 * (the way canvas libraries do it, and it avoids Safari's foreignObject bugs).
 *
 * - Click a card to open its panel; the ▸/▾ toggle opens or closes its branch. The current path
 *   starts open.
 * - Drag a card to move it; drag the background to pan; the wheel zooms around the pointer.
 *   Moved positions are kept in localStorage per engagement and root ("Reset layout" clears them).
 * - Below 640px the same tree is an accordion list, because dragging is hard on phones.
 *
 * Loaded with `next/dynamic` (`ssr: false`), so `window` is always there.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { StepMark } from '@/components/ui/step-track';
import { Bar } from '../../incorporation/spectrum';
import type { JNode } from './journey-model';
import { NODE_H, NODE_W, layoutTree } from './layout';
import { STATUS_BAR, STATUS_WORD, markOf, pctOf, readStore, writeStore } from './status';

type Pt = { x: number; y: number };
type View = { x: number; y: number; k: number };
type Drag =
  | { kind: 'node'; id: string; start: Pt; from: Pt; moved: boolean; last?: Pt }
  | { kind: 'pan'; start: Pt; from: View; moved: boolean };

const MIN_K = 0.35;
const MAX_K = 1.75;
const PAD = 24;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

function loadMoved(key: string): Record<string, Pt> {
  const raw = readStore(key);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, Pt>) : {};
  } catch {
    return {};
  }
}

/** True below 640px; follows the viewport. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** A smoothstep edge: out of the parent's right side, one vertical run, into the child's left side. */
function edgePath(a: Pt, b: Pt): string {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return `M${x1},${y1} L${x2},${y2}`;
  const mx = x1 + (x2 - x1) / 2;
  const sx = Math.sign(x2 - x1) || 1;
  const sy = Math.sign(dy);
  const r = Math.min(8, Math.abs(dy) / 2, Math.abs(x2 - x1) / 2);
  return [
    `M${x1},${y1}`,
    `H${mx - sx * r}`,
    `Q${mx},${y1} ${mx},${y1 + sy * r}`,
    `V${y2 - sy * r}`,
    `Q${mx},${y2} ${mx + sx * r},${y2}`,
    `H${x2}`,
  ].join(' ');
}

function Toggle({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? 'Close' : 'Open'} ${label}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="grid h-6 w-6 flex-none place-items-center rounded-[4px] text-[12px] text-ink-muted hover:bg-surface-sunken hover:text-ink"
    >
      {open ? '▾' : '▸'}
    </button>
  );
}

function NodeCard({
  node,
  open,
  onPath,
  onToggle,
  onSelect,
}: {
  node: JNode;
  open: boolean;
  onPath: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const mark = markOf(node.status);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${node.label}: ${node.done} of ${node.total}, ${STATUS_WORD[node.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'flex h-full w-full cursor-grab select-none items-center gap-2.5 rounded-md border-1.5 bg-surface-raised px-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing',
        onPath ? 'border-brand-line' : 'border-line',
      )}
    >
      <StepMark state={mark.state} tone={mark.tone} size={20} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span className="truncate text-[13px] font-medium leading-tight text-ink" title={node.label}>
          {node.label}
        </span>
        <span className="flex items-center gap-2">
          <Bar pct={pctOf(node)} tone={STATUS_BAR[node.status]} height={4} className="flex-1" />
          <span className="text-[11.5px] tabular-nums text-ink-muted">
            {node.done}/{node.total}
          </span>
        </span>
      </div>
      {node.children.length ? <Toggle open={open} label={node.label} onToggle={onToggle} /> : null}
    </div>
  );
}

/** Phones: the same tree as a nested accordion list. */
function Accordion({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
}: {
  node: JNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (n: JNode) => void;
}) {
  const open = expanded.has(node.id);
  const mark = markOf(node.status);
  return (
    <li>
      <div className="flex items-center gap-2 border-t border-line-soft py-2 pr-2" style={{ paddingLeft: 8 + depth * 16 }}>
        {node.children.length ? <Toggle open={open} label={node.label} onToggle={() => onToggle(node.id)} /> : <span className="w-6 flex-none" />}
        <StepMark state={mark.state} tone={mark.tone} size={18} />
        <button type="button" onClick={() => onSelect(node)} className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium text-ink">
          {node.label}
        </button>
        <span className="text-[12px] tabular-nums text-ink-muted">
          {node.done}/{node.total}
        </span>
      </div>
      {open && node.children.length ? (
        <ul>
          {node.children.map((c) => (
            <Accordion key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

const CTRL = 'grid h-7 min-w-7 place-items-center rounded-[4px] border border-line bg-surface-raised px-2 text-[12.5px] font-medium text-ink hover:bg-surface-sunken';

export function JourneyTree({
  root,
  currentPath,
  open = [],
  storageKey,
  onSelect,
  reduce = false,
}: {
  root: JNode;
  /** Ids from the root to the current leaf: they start open and their edges are drawn live. */
  currentPath: string[];
  /** More ids to start open (the selected stop). */
  open?: string[];
  /** localStorage key for moved positions, one per engagement and root. */
  storageKey: string;
  onSelect: (node: JNode) => void;
  reduce?: boolean;
}) {
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState(() => new Set([root.id, ...currentPath, ...open]));
  const [moved, setMoved] = useState<Record<string, Pt>>(() => loadMoved(storageKey));
  const [view, setView] = useState<View>({ x: PAD, y: PAD, k: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const onPath = useMemo(() => new Set(currentPath), [currentPath]);

  const base = useMemo(() => layoutTree(root, expanded), [root, expanded]);
  const pos = useCallback((id: string, fallback: Pt): Pt => moved[id] ?? fallback, [moved]);
  const placed = useMemo(() => base.nodes.map((n) => ({ ...n, ...pos(n.id, n) })), [base, pos]);
  const at = useMemo(() => Object.fromEntries(placed.map((n) => [n.id, n])), [placed]);

  const toggle = useCallback(
    (id: string) =>
      setExpanded((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const fitTo = useCallback((nodes: Pt[]) => {
    const el = box.current;
    if (!el || !nodes.length) return;
    const { width, height } = el.getBoundingClientRect();
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const w = Math.max(...nodes.map((n) => n.x)) + NODE_W - minX;
    const h = Math.max(...nodes.map((n) => n.y)) + NODE_H - minY;
    const k = clampK(Math.min(1, (width - PAD * 2) / w, (height - PAD * 2) / h));
    setView({ k, x: (width - w * k) / 2 - minX * k, y: (height - h * k) / 2 - minY * k });
  }, []);
  const fit = () => fitTo(placed);

  // Fit once the canvas is on screen (and again when the phone accordion gives way to it).
  const placedRef = useRef(placed);
  useEffect(() => {
    placedRef.current = placed;
  });
  useEffect(() => {
    if (!narrow) fitTo(placedRef.current);
  }, [narrow, fitTo]);

  // The wheel zooms around the pointer; a non-passive listener so the page does not scroll.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.0015));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [narrow]);

  const zoom = (f: number) => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setView((v) => {
      const k = clampK(v.k * f);
      return { k, x: width / 2 - ((width / 2 - v.x) * k) / v.k, y: height / 2 - ((height / 2 - v.y) * k) / v.k };
    });
  };

  const reset = () => {
    setMoved({});
    writeStore(storageKey, null);
    fitTo(base.nodes);
  };

  const down = (e: RPointerEvent, id?: string) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    drag.current = id ? { kind: 'node', id, start, from: at[id] ?? { x: 0, y: 0 }, moved: false } : { kind: 'pan', start, from: view, moved: false };
    if (id) e.stopPropagation();
    box.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.start.x;
    const dy = e.clientY - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    if (d.kind === 'pan') setView({ ...d.from, x: d.from.x + dx, y: d.from.y + dy });
    else {
      const p = { x: d.from.x + dx / view.k, y: d.from.y + dy / view.k };
      d.last = p;
      setMoved((m) => ({ ...m, [d.id]: p }));
    }
  };
  const up = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (box.current?.hasPointerCapture(e.pointerId)) box.current.releasePointerCapture(e.pointerId);
    if (!d || d.kind !== 'node') return;
    if (d.moved) {
      if (d.last) writeStore(storageKey, JSON.stringify({ ...moved, [d.id]: d.last }));
    } else {
      const n = at[d.id];
      if (n) onSelect(n.node);
    }
  };

  if (narrow) {
    return (
      <ul className="overflow-hidden rounded-md border border-line bg-surface-raised [&>li:first-child>div]:border-t-0">
        <Accordion node={root} depth={0} expanded={expanded} onToggle={toggle} onSelect={onSelect} />
      </ul>
    );
  }

  return (
    <div
      ref={box}
      className="relative h-[380px] cursor-grab touch-none overflow-hidden rounded-md border border-line bg-surface-sunken active:cursor-grabbing"
      style={{ backgroundImage: 'radial-gradient(oklch(var(--line)) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
      onPointerDown={(e) => down(e)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute left-0 top-0" width={1} height={1} style={{ overflow: 'visible' }} aria-hidden>
          {base.edges.map((e) => {
            const a = at[e.from];
            const b = at[e.to];
            if (!a || !b) return null;
            const live = onPath.has(e.from) && onPath.has(e.to);
            return (
              <path
                key={`${e.from}>${e.to}`}
                d={edgePath(a, b)}
                fill="none"
                className={live ? 'stroke-brand' : 'stroke-line-strong'}
                strokeWidth={live ? 2 : 1.5}
                strokeDasharray={live && !reduce ? '6 4' : undefined}
              >
                {live && !reduce ? <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" /> : null}
              </path>
            );
          })}
        </svg>
        {placed.map((n) => (
          <div
            key={n.id}
            className="absolute"
            style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
            onPointerDown={(e) => down(e, n.id)}
          >
            <NodeCard node={n.node} open={expanded.has(n.id)} onPath={onPath.has(n.id)} onToggle={() => toggle(n.id)} onSelect={() => onSelect(n.node)} />
          </div>
        ))}
      </div>
      <div className="absolute right-2 top-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className={CTRL} onClick={() => zoom(1.2)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className={CTRL} onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className={CTRL} onClick={fit}>
          Fit
        </button>
        <button type="button" className={CTRL} onClick={reset}>
          Reset layout
        </button>
      </div>
      <span className="pointer-events-none absolute bottom-2 left-3 text-[11.5px] text-ink-muted">Drag to move · scroll to zoom</span>
    </div>
  );
}
