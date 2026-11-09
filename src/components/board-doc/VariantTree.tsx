'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { NocAnswers } from '@/lib/noc/receive';
import { treePath, type NocNodeId } from './variant-tree';
import styles from './VariantTree.module.css';

/**
 * C8 "Why VCFO chose this template", shared by the client and staff pages (D5: everyone sees the
 * full tree). The path that `resolveNocVariant()` takes lights up in the brand colour, with
 * numbered badges on the decisions and "CHOSEN" under the result. Other branches stay grey;
 * "Not chosen yet" and "No NOC yet" are grey and outlined, never amber (P4). The page owns the
 * Replay button and bumps `replayKey`: the path lights again in about one second, at once with
 * reduced motion. The evidence rows sit under it in the shared `EvidenceTable`.
 */

interface TreeNode {
  id: NocNodeId;
  x: number;
  y: number;
  t: string[];
  w?: number;
  h?: number;
  kind?: 'root' | 'end' | 'dash';
}

const W = 132;
const H = 40;
const NODES: TreeNode[] = [
  { id: 'own', x: 590, y: 40, t: ['Ownership'], kind: 'root', w: 170 },
  { id: 'standalone', x: 230, y: 135, t: ['Standalone'] },
  { id: 'subsidiary', x: 830, y: 135, t: ['Subsidiary'] },
  { id: 'no-noc', x: 230, y: 240, t: ['No NOC'], kind: 'end' },
  { id: 'foreign', x: 640, y: 240, t: ['Foreign subsidiary'], w: 176 },
  { id: 'indian', x: 990, y: 240, t: ['Indian subsidiary'], w: 166 },
  { id: 'noc-foreign', x: 640, y: 350, t: ['NOC — Foreign', 'subsidiary'], w: 176, h: 50, kind: 'end' },
  { id: 'name-use', x: 845, y: 350, t: ['Name use only'] },
  { id: 'investing', x: 990, y: 350, t: ['Investing'] },
  { id: 'not-chosen', x: 1130, y: 350, t: ['Not chosen yet'], kind: 'dash' },
  { id: 'noc-name-use', x: 845, y: 450, t: ['NOC — Indian', '(name use)'], h: 50, kind: 'end' },
  { id: 'noc-investing', x: 990, y: 450, t: ['NOC — Indian', '(investing)'], h: 50, kind: 'end' },
  { id: 'no-noc-yet', x: 1130, y: 450, t: ['No NOC yet'], kind: 'dash' },
];
const EDGES: Array<[NocNodeId, NocNodeId]> = [
  ['own', 'standalone'],
  ['own', 'subsidiary'],
  ['standalone', 'no-noc'],
  ['subsidiary', 'foreign'],
  ['subsidiary', 'indian'],
  ['foreign', 'noc-foreign'],
  ['indian', 'name-use'],
  ['indian', 'investing'],
  ['indian', 'not-chosen'],
  ['name-use', 'noc-name-use'],
  ['investing', 'noc-investing'],
  ['not-chosen', 'no-noc-yet'],
];
const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NocNodeId, TreeNode>;
const nw = (n: TreeNode) => n.w ?? W;
const nh = (n: TreeNode) => n.h ?? H;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function VariantTree({ answers, replayKey = 0, className }: { answers: NocAnswers; replayKey?: number; className?: string }) {
  const path = treePath(answers);
  const full = path.nodes.length;
  const [lit, setLit] = useState(full);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    if (!replayKey) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (reducedMotion()) {
      setLit(full);
      return;
    }
    setLit(1);
    // About one second from the root to the result.
    const step = Math.round(1000 / Math.max(1, full - 1));
    for (let k = 2; k <= full; k++) timers.current.push(window.setTimeout(() => setLit(k), (k - 1) * step));
  }, [replayKey, full]);

  const litNodes = new Set(path.nodes.slice(0, lit));
  const onEdge = (a: NocNodeId, b: NocNodeId) => {
    const i = path.nodes.indexOf(a);
    return i >= 0 && path.nodes[i + 1] === b && litNodes.has(b);
  };
  const rows = path.ev.rows;
  const resultLabel = path.result ? BY_ID[path.result].t.join(' ') : 'not decided yet';
  const summary = `Decision tree. ${rows.map((r) => `${r.asked.replace('Project setup · ', '')}: ${r.answer}`).join('. ')}. Result: ${resultLabel}.`;
  const s = styles;

  return (
    <div className={cn(s.box, className)}>
      <svg viewBox="0 0 1260 500" role="img" aria-label={summary} data-testid="noc-tree">
        {EDGES.map(([a, b]) => {
          const A = BY_ID[a];
          const B = BY_ID[b];
          const y1 = A.y + nh(A) / 2;
          const y2 = B.y - nh(B) / 2;
          const my = (y1 + y2) / 2;
          return <path key={`${a}-${b}`} className={cn(s.te, onEdge(a, b) && s.on)} d={`M${A.x} ${y1} V${my} H${B.x} V${y2}`} />;
        })}
        <text className={cn(s.tlbl, (litNodes.has('foreign') || litNodes.has('indian')) && s.on)} x={830} y={180} textAnchor="middle">
          SUBSIDIARY TYPE
        </text>
        <text className={cn(s.tlbl, (litNodes.has('name-use') || litNodes.has('investing') || litNodes.has('not-chosen')) && s.on)} x={990} y={290} textAnchor="middle">
          PARENT’S ROLE
        </text>
        {NODES.map((n) => {
          const on = litNodes.has(n.id);
          const w = nw(n);
          const h = nh(n);
          const badge = path.badges.indexOf(n.id);
          const chosen = n.id === path.result && on;
          return (
            <g key={n.id} data-node={n.id} data-on={on ? '1' : '0'} className={cn(s.tn, n.kind && s[n.kind], on && s.on)}>
              <rect x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={6} />
              {n.t.map((t, i) => (
                <text key={t} x={n.x} y={n.y + 5 + (i - (n.t.length - 1) / 2) * 16} textAnchor="middle">
                  {t}
                </text>
              ))}
              {badge >= 0 && on ? (
                <g className={s.badge}>
                  <circle cx={n.x - w / 2 - 14} cy={n.y} r={10} />
                  <text x={n.x - w / 2 - 14} y={n.y + 4} textAnchor="middle">
                    {badge + 1}
                  </text>
                </g>
              ) : null}
              {chosen ? (
                <g className={s.chosen} data-testid="noc-chosen">
                  <rect x={n.x - 36} y={n.y + h / 2 + 6} width={72} height={18} rx={4} />
                  <text x={n.x} y={n.y + h / 2 + 19} textAnchor="middle">
                    CHOSEN
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className={s.hint}>Swipe sideways to see the whole tree.</p>
    </div>
  );
}
