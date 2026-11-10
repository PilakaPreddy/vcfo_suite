/**
 * A small tidy-tree layout for the journey tree, left to right, with no dependency. Each visible
 * leaf takes the next row; a parent sits halfway between its first and last visible child. A node
 * shows its children only when its id is in `expanded`.
 */
import type { JNode } from './journey-model';

export interface LayoutOpts {
  /** Card width and height in px. */
  nodeW?: number;
  nodeH?: number;
  /** Space between columns and between rows in px. */
  colGap?: number;
  rowGap?: number;
}

export interface LaidNode {
  id: string;
  x: number;
  y: number;
  depth: number;
  node: JNode;
}

export interface TreeLayout {
  nodes: LaidNode[];
  edges: { from: string; to: string }[];
}

/** Card size in px. The height holds a two-line title (line-clamp 2) above the progress bar. */
export const NODE_W = 236;
export const NODE_H = 76;

export function layoutTree(root: JNode, expanded: Set<string>, opts: LayoutOpts = {}): TreeLayout {
  const nodeW = opts.nodeW ?? NODE_W;
  const nodeH = opts.nodeH ?? NODE_H;
  const colStep = nodeW + (opts.colGap ?? 56);
  const rowStep = nodeH + (opts.rowGap ?? 16);
  const nodes: LaidNode[] = [];
  const edges: TreeLayout['edges'] = [];
  let row = 0;

  const place = (node: JNode, depth: number): number => {
    const kids = expanded.has(node.id) ? node.children : [];
    let y: number;
    if (!kids.length) {
      y = row * rowStep;
      row += 1;
    } else {
      const ys = kids.map((c) => {
        edges.push({ from: node.id, to: c.id });
        return place(c, depth + 1);
      });
      y = (ys[0]! + ys[ys.length - 1]!) / 2;
    }
    nodes.push({ id: node.id, x: depth * colStep, y, depth, node });
    return y;
  };
  place(root, 0);
  // Parents are pushed after their children; put them back in tree order (root first).
  nodes.reverse();
  return { nodes, edges };
}
